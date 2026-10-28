import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {Session, validOrigin} from '../session.mjs';
import {CaptionDecoder} from '../decoder.mjs';

class ControlledWorker extends EventEmitter {
  sent=[];
  postMessage(message) { this.sent.push(message); }
  async terminate() { this.terminated=true; }
  ready() { this.emit('message',{type:'ready'}); }
  complete(text='你好',final=false) { this.emit('message',{type:'decoded',text,final,decodeMs:12}); }
}
const hello={sessionId:'test',epoch:0,sourceLanguage:'zh',video:{currentTime:10}};
const clock=(seq=0,epoch=0)=>({type:'clock',sessionId:'test',epoch,seq,capturedAt:1000+seq*100,sampleStart:seq*1600,mediaTime:10+seq*.1,playbackRate:1,paused:false});
function setup() {
  const events=[], workers=[];
  const session=new Session(hello,event=>events.push(event),()=>{const w=new ControlledWorker();workers.push(w);return w;},()=>{});
  workers[0].ready();
  return {session,events,workers};
}

test('origin accepts exact extension origins and native requests only',()=>{
  assert.equal(validOrigin(undefined),true);
  assert.equal(validOrigin('chrome-extension://'+'a'.repeat(32)),true);
  for(const origin of ['https://example.com','null','chrome-extension://'+'z'.repeat(32),'chrome-extension://'+'a'.repeat(32)+'/']) assert.equal(validOrigin(origin),false);
});

test('PCM respects Buffer byteOffset and metadata pairing, rejects duplicate sequence',()=>{
  const {session,workers}=setup();
  const backing=Buffer.alloc(4000,255);const data=backing.subarray(100,3300);data.writeInt16LE(-32768,0);data.writeInt16LE(16384,2);
  session.clock(clock());session.audio(data);
  const audio=workers[0].sent.find(m=>m.type==='audio');
  assert.equal(audio.samples.length,1600);assert.equal(audio.samples[0],-1);assert.equal(audio.samples[1],.5);
  assert.throws(()=>session.clock(clock()),/sequence/);
  assert.throws(()=>session.audio(data),/clock/);
  session.close();
});

test('identical interim suppressed, final always emitted, segment rolls over',()=>{
  const {session,events,workers}=setup();
  for(let seq=0;seq<4;seq++){
    session.clock(clock(seq));session.audio(Buffer.alloc(3200));
    workers[0].complete('你好',seq===2);
  }
  const subtitles=events.filter(e=>e.type==='subtitle');
  assert.deepEqual(subtitles.map(e=>[e.segmentId,e.revision,e.phase]),[['0',1,'interim'],['0',2,'final'],['1',1,'interim']]);
  assert.equal(subtitles[0].start,0);assert.equal(subtitles[0].mediaTime,9.9);
  assert.equal(subtitles[0].timestampKind,'capture-estimate');
  session.close();
});

test('reset terminates stale worker, drops queued audio and rejects old epoch events',()=>{
  const {session,events,workers}=setup();
  session.clock(clock());session.audio(Buffer.alloc(3200));
  session.reset({epoch:1,mediaTime:20});
  assert.equal(workers[0].terminated,true);
  workers[0].complete('stale',true);
  workers[1].ready();
  assert.equal(events.some(e=>e.sourceText==='stale'),false);
  assert.equal(events.at(-1).type,'reset');
  assert.equal(events.at(-1).epoch,1);
  session.close();
});

test('bounded queue halts epoch explicitly on overload',()=>{
  const {session,events,workers}=setup();
  for(let i=0;i<23;i++){session.clock(clock(i));session.audio(Buffer.alloc(3200));}
  assert.equal(session.queue.length,0);
  assert.equal(session.paused,true);
  assert.equal(workers[0].terminated,true);
  assert.equal(events.some(e=>e.code==='audio_overload'),true);
  session.close();
});

test('pause clears in flight state and requires newer epoch reset',()=>{
  const {session,events,workers}=setup();
  session.clock(clock());session.audio(Buffer.alloc(3200));session.pause();workers[0].complete('stale');
  assert.equal(events.some(e=>e.sourceText==='stale'),false);
  assert.throws(()=>session.reset({epoch:0,mediaTime:0}),/epoch/);
  session.reset({epoch:1,mediaTime:30});workers[1].ready();
  assert.equal(session.paused,false);session.close();
});

function recognizerStub() {
  let text='',ready=false;
  return {resets:0,createStream(){return {acceptWaveform({samples}){ready=true;if(samples.some(x=>Math.abs(x)>.01))text='真实输入测试';},inputFinished(){},free(){}};},isReady(){return ready;},decode(){ready=false;},getResult(){return {text};},reset(){text='';this.resets++;},free(){}};
}
test('decoder silence gate finalizes only after >=500ms, resets recognizer',()=>{
  const recognizer=recognizerStub(),decoder=new CaptionDecoder(recognizer);
  const speech=new Float32Array(1600).fill(.2),silence=new Float32Array(1600);
  assert.equal(decoder.accept(speech).final,false);
  for(let i=0;i<4;i++) assert.equal(decoder.accept(silence).final,false);
  assert.equal(decoder.accept(silence).final,true);
  assert.equal(recognizer.resets,1);
  assert.equal(decoder.accept(silence).text,'');
});

test('all-silence does not decode hallucinated source and maintenance waits for silence',()=>{
  const recognizer=recognizerStub(),decoder=new CaptionDecoder(recognizer,{maintenanceSamples:1600});
  const result=decoder.accept(new Float32Array(1600));
  assert.equal(result.text,'');assert.equal(result.final,false);
  assert.equal(result.maintenance,true);
});

test('speech media anchor survives subsequent playback rate changes',()=>{
  const {session,events,workers}=setup();
  session.clock(clock());session.audio(Buffer.alloc(3200));
  workers[0].emit('message',{type:'decoded',text:'你',speechStarted:true,decodeMs:1});
  session.clock({...clock(1),playbackRate:2,mediaTime:11});session.audio(Buffer.alloc(3200));workers[0].complete('你好',true);
  assert.equal(events.filter(e=>e.type==='subtitle').at(-1).mediaTime,9.9);session.close();
});

test('render diagnostics identify first source render once per utterance',()=>{
  const workers=[],events=[],logs=[];
  const session=new Session(hello,e=>events.push(e),()=>{const w=new ControlledWorker();workers.push(w);return w;},e=>logs.push(e));
  workers[0].ready();
  session.clock(clock());session.audio(Buffer.alloc(3200));workers[0].emit('message',{type:'decoded',text:'你',speechStarted:true,decodeMs:1});
  session.rendered({sessionId:'test',epoch:0,segmentId:'0',revision:1,renderedAt:1100});
  session.clock(clock(1));session.audio(Buffer.alloc(3200));workers[0].complete('你好',true);
  session.rendered({sessionId:'test',epoch:0,segmentId:'0',revision:2,renderedAt:1200});
  const rendered=logs.filter(e=>e.type==='rendered');
  assert.equal(rendered[0].firstSourceRender,true);assert.equal(rendered[0].onsetToRenderMs,200);
  assert.equal(rendered[1].firstSourceRender,false);session.close();
});
