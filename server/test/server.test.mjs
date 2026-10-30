import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EventEmitter,once} from 'node:events';
import WebSocket from 'ws';
import http from 'node:http';
import {createServer} from '../index.mjs';
import {DecoderProcess} from '../process.mjs';

class WorkerStub extends EventEmitter{
  constructor(){super();setTimeout(()=>this.emit('message',{type:'ready'}),5);}
  postMessage(message){if(message.type==='audio')setTimeout(()=>this.emit('message',{type:'decoded',text:'测试',final:true,speechStarted:true,decodeMs:1}),1);}
  terminate(){this.terminated=true;return Promise.resolve();}
}
async function fixture(t,extra={}){
  const dir=await mkdtemp(join(tmpdir(),'lct-server-'));
  const server=createServer({runtimeDir:dir,workerFactory:()=>new WorkerStub(),...extra});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port;
  const token=(await readFile(join(dir,'token'),'utf8')).trim();
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});});
  return {server,dir,token,url:`http://127.0.0.1:${port}`,ws:`ws://127.0.0.1:${port}/ws/v1/session`};
}
const first=ws=>new Promise((resolve,reject)=>{ws.once('message',data=>resolve(JSON.parse(data)));ws.once('error',reject);});
const hello=token=>({type:'hello',protocolVersion:1,token,sessionId:'s',epoch:0,sourceLanguage:'zh',targetLanguage:'en',video:{currentTime:0}});

test('health/capabilities auth, host/origin restrictions and private token',async t=>{
 const f=await fixture(t);
 assert.equal((await stat(join(f.dir,'token'))).mode&0o777,0o600);
 assert.equal((await fetch(f.url+'/health')).status,200);
 assert.equal((await fetch(f.url+'/capabilities')).status,401);
 const auth={Authorization:`Bearer ${f.token}`};
 assert.equal((await fetch(f.url+'/capabilities',{headers:auth})).status,200);
 assert.equal((await fetch(f.url+'/health',{headers:{Origin:'https://evil.test'}})).status,403);
 const badHost=await new Promise((resolve,reject)=>{http.get(f.url+'/health',{headers:{Host:'evil.test'}},response=>{response.resume();resolve(response.statusCode);}).on('error',reject);});
 assert.equal(badHost,403);
 const good=await fetch(f.url+'/health',{headers:{Origin:'chrome-extension://'+'a'.repeat(32)}});
 assert.equal(good.headers.get('access-control-allow-origin'),'chrome-extension://'+'a'.repeat(32));
});

test('false hello token closes without native worker, unknown hello protocol rejected',async t=>{
 let workers=0;const f=await fixture(t,{workerFactory:()=>{workers++;return new WorkerStub();}});
 for(const msg of [{...hello('wrong')},{...hello(f.token),protocolVersion:2},{...hello(f.token),type:'unknown'}]){
   const ws=new WebSocket(f.ws);await once(ws,'open');ws.send(JSON.stringify(msg));const [code]=await once(ws,'close');assert.ok([4400,4401].includes(code));
 }
 assert.equal(workers,0);
});

test('authenticated PCM gives subtitle, rendered diagnostics exclude token, reset starts fresh epoch',async t=>{
 const f=await fixture(t);const ws=new WebSocket(f.ws);await once(ws,'open');
 let event=first(ws);ws.send(JSON.stringify(hello(f.token)));assert.equal((await event).type,'ready');
 event=first(ws);ws.send(JSON.stringify({type:'clock',sessionId:'s',epoch:0,seq:0,sampleStart:0,capturedAt:Date.now(),mediaTime:0,playbackRate:1,paused:false}));ws.send(Buffer.alloc(3200));
 const subtitle=await event;assert.equal(subtitle.sourceText,'测试');assert.equal(subtitle.phase,'final');
 ws.send(JSON.stringify({type:'rendered',sessionId:'s',epoch:0,segmentId:subtitle.segmentId,revision:subtitle.revision,renderedAt:Date.now(),hasTranslation:false}));
 event=first(ws);ws.send(JSON.stringify({type:'reset',sessionId:'s',epoch:1,mediaTime:30}));assert.equal((await event).type,'reset');
 const diagnostics=await (await fetch(f.url+'/v1/diagnostics',{headers:{Authorization:`Bearer ${f.token}`}})).json();
 assert.equal(diagnostics.sessions[0].history.length,1);
 assert.ok(diagnostics.events.some(e=>e.type==='rendered'));
 assert.ok(!JSON.stringify(diagnostics).includes(f.token));
 ws.close();await once(ws,'close');
});

test('unknown control and unpaired binary fail deterministically',async t=>{
 const f=await fixture(t);const ws=new WebSocket(f.ws);await once(ws,'open');let event=first(ws);ws.send(JSON.stringify(hello(f.token)));await event;
 event=first(ws);ws.send(JSON.stringify({type:'mystery',sessionId:'s',epoch:0}));assert.equal((await event).code,'invalid_message');
 event=first(ws);ws.send(Buffer.alloc(3200));assert.equal((await event).code,'invalid_message');ws.close();await once(ws,'close');
});

test('missing native model reports error instead of ready',async t=>{
 const f=await fixture(t,{workerFactory:undefined,modelDir:'/nonexistent/lct-model'});
 const ws=new WebSocket(f.ws);await once(ws,'open');const event=first(ws);ws.send(JSON.stringify(hello(f.token)));
 const result=await event;assert.equal(result.type,'status');assert.equal(result.code,'asr_unavailable');assert.match(result.message,/Model file missing/);ws.close();await once(ws,'close');
});

test('authentication requires literal Bearer scheme and hello deadline',async t=>{
 const f=await fixture(t,{helloTimeoutMs:25});
 assert.equal((await fetch(f.url+'/capabilities',{headers:{Authorization:f.token}})).status,401);
 const ws=new WebSocket(f.ws);await once(ws,'open');const [code]=await once(ws,'close');assert.equal(code,4401);
});

async function connect(f,id){
 const ws=new WebSocket(f.ws);await once(ws,'open');const event=first(ws);ws.send(JSON.stringify({...hello(f.token),sessionId:id}));await event;return ws;
}

test('paused or failed session cannot reset while another session owns decoder',async t=>{
 const workers=[];
 const f=await fixture(t,{workerFactory:()=>{const worker=new WorkerStub();workers.push(worker);return worker;}});
 const a=await connect(f,'a');
 let event=first(a);a.send(JSON.stringify({type:'pause',sessionId:'a',epoch:0}));await event;
 const b=await connect(f,'b');assert.equal(workers.length,2);
 event=first(a);a.send(JSON.stringify({type:'reset',sessionId:'a',epoch:1,mediaTime:0}));
 const rejected=await event;assert.equal(rejected.code,'decoder_busy');assert.equal(workers.length,2);assert.equal(workers[1].terminated,undefined);
 event=first(b);b.send(JSON.stringify({type:'pause',sessionId:'b',epoch:0}));await event;
 event=first(a);a.send(JSON.stringify({type:'reset',sessionId:'a',epoch:1,mediaTime:0}));assert.equal((await event).type,'reset');assert.equal(workers.length,3);
 // A native error must also release ownership before B can resume.
 event=first(a);workers[2].emit('message',{type:'error',message:'native failure'});assert.equal((await event).code,'asr_unavailable');
 event=first(b);b.send(JSON.stringify({type:'reset',sessionId:'b',epoch:1,mediaTime:0}));assert.equal((await event).type,'reset');
 event=first(a);a.send(JSON.stringify({type:'reset',sessionId:'a',epoch:2,mediaTime:0}));assert.equal((await event).code,'decoder_busy');assert.equal(workers.length,4);
 a.close();b.close();await Promise.all([once(a,'close'),once(b,'close')]);
});

test('health readiness follows pause, reset, disconnect and overload worker lifecycle',async t=>{
 const workers=[];
 class SlowWorker extends WorkerStub{postMessage() {}}
 const f=await fixture(t,{workerFactory:()=>{const worker=new SlowWorker();workers.push(worker);return worker;}});
 const health=async()=>(await fetch(f.url+'/health')).json();
 assert.equal((await health()).ready,false);
 const ws=await connect(f,'s');assert.equal((await health()).ready,true);
 let event=first(ws);ws.send(JSON.stringify({type:'pause',sessionId:'s',epoch:0}));await event;
 assert.equal((await health()).ready,false);assert.equal((await health()).modelState,'cold');
 event=first(ws);ws.send(JSON.stringify({type:'reset',sessionId:'s',epoch:1,mediaTime:0}));await event;assert.equal((await health()).ready,true);
 event=first(ws);
 for(let i=0;i<22;i++){
  ws.send(JSON.stringify({type:'clock',sessionId:'s',epoch:1,seq:i,sampleStart:i*1600,capturedAt:Date.now(),mediaTime:0,playbackRate:1,paused:false}));ws.send(Buffer.alloc(3200));
 }
 assert.equal((await event).code,'audio_overload');assert.equal((await health()).ready,false);
 event=first(ws);ws.send(JSON.stringify({type:'reset',sessionId:'s',epoch:2,mediaTime:0}));await event;assert.equal((await health()).ready,true);
 ws.close();await once(ws,'close');assert.equal((await health()).ready,false);assert.equal((await health()).modelState,'cold');
});

test('abrupt native subprocess death preserves HTTP and permits a fresh decoder epoch',async t=>{
 const f=await fixture(t,{workerFactory:()=>new DecoderProcess({entry:new URL('./process-fixture.mjs',import.meta.url)})});
 const ws=await connect(f,'s');let event=first(ws);
 ws.send(JSON.stringify({type:'clock',sessionId:'s',epoch:0,seq:0,sampleStart:0,capturedAt:Date.now(),mediaTime:0,playbackRate:1,paused:false}));ws.send(Buffer.alloc(3200));
 assert.equal((await event).code,'asr_unavailable');
 const health=await(await fetch(f.url+'/health')).json();assert.equal(health.ready,false);assert.equal(health.status,'error');
 event=first(ws);ws.send(JSON.stringify({type:'reset',sessionId:'s',epoch:1,mediaTime:0}));assert.equal((await event).type,'reset');
 assert.equal((await(await fetch(f.url+'/health')).json()).ready,true);ws.close();await once(ws,'close');
});

test('explicit Chinese profile reports actual engine and rejects unsupported language on reset',async t=>{
 const f=await fixture(t,{profile:'zipformer-zh'}),auth={Authorization:`Bearer ${f.token}`};
 const capabilities=await(await fetch(f.url+'/capabilities',{headers:auth})).json();assert.equal(capabilities.languages.includes('en'),false);assert.equal(capabilities.models[0].engine,'sherpa-onnx/zipformer-zh');
 const ws=new WebSocket(f.ws);await once(ws,'open');let event=first(ws);ws.send(JSON.stringify(hello(f.token)));assert.equal((await event).engine,'sherpa-onnx/zipformer-zh');
 event=first(ws);ws.send(JSON.stringify({type:'reset',sessionId:'s',epoch:1,mediaTime:0,sourceLanguage:'en'}));assert.equal((await event).code,'invalid_message');
 event=first(ws);ws.send(JSON.stringify({type:'reset',sessionId:'s',epoch:1,mediaTime:0,sourceLanguage:'zh'}));assert.equal((await event).type,'reset');ws.close();await once(ws,'close');
});
