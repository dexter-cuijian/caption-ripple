// Real-model smoke test; deliberately NOT a replacement for Chrome acceptance.
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {WebSocket} from 'ws';
const sherpa=createRequire(import.meta.url)('sherpa-onnx-node');
const file=process.argv[2]||'.work/fixtures/paraformer-zh.wav';
const wave=sherpa.readWave(file);
if(wave.sampleRate!==16000)throw Error('The smoke test expects 16kHz audio.');
const token=(await readFile('.runtime/token','utf8')).trim();
const sessionId=`native-smoke-${Date.now()}`,epoch=0;
const ws=new WebSocket('ws://127.0.0.1:9876/ws/v1/session');
const results=[];let readyResolve,closedResolve;
const ready=new Promise(r=>readyResolve=r),closed=new Promise(r=>closedResolve=r);
ws.on('error',error=>{console.error(error.message);process.exitCode=1;readyResolve(false);closedResolve();});
ws.on('close',()=>closedResolve());
ws.on('open',()=>ws.send(JSON.stringify({type:'hello',protocolVersion:1,token,sessionId,epoch,sourceLanguage:'auto',targetLanguage:'zh',mode:'fast',video:{id:'real-upstream-fixture',url:'local-test',title:'Real upstream human sample',currentTime:0,live:false,playbackRate:1}})));
ws.on('message',bytes=>{const event=JSON.parse(bytes);results.push(event);if(event.type==='ready')readyResolve(true);if(event.type==='subtitle')console.log(event.phase,event.sourceText,JSON.stringify(event.metrics));if(event.level==='error'){console.error(event.code,event.message);readyResolve(false);}});
const timeout=setTimeout(()=>{readyResolve(false);ws.close();},30000);
if(!await ready){clearTimeout(timeout);throw Error('ASR did not become ready');}
clearTimeout(timeout);
const audio=new Float32Array(wave.samples.length+16000);audio.set(wave.samples);
const anchor=Date.now();let seq=0;
for(let offset=0;offset<audio.length;offset+=1600){
  const length=Math.min(1600,audio.length-offset),pcm=Buffer.alloc(length*2);
  for(let i=0;i<length;i++){const x=Math.max(-1,Math.min(1,audio[offset+i]));pcm.writeInt16LE(Math.round(x<0?x*32768:x*32767),i*2);}
  const due=anchor+(offset+length)/16;await delay(Math.max(0,due-Date.now()));
  if(ws.readyState!==WebSocket.OPEN)throw Error('Connection closed before audio finished');
  ws.send(JSON.stringify({type:'clock',sessionId,epoch,seq:seq++,sampleStart:offset,capturedAt:due,mediaTime:(offset+length)/16000,playbackRate:1,paused:false}));ws.send(pcm);
}
await delay(1000);ws.send(JSON.stringify({type:'stop',sessionId,epoch}));await closed;
const report={kind:'native-file-smoke-not-browser',file,sessionId,results};
await writeFile('.work/native-smoke.json',JSON.stringify(report,null,2));
if(!results.some(e=>e.type==='subtitle'&&e.phase==='final'&&e.sourceText))throw Error('No real final transcript');
console.log('Real native model produced final text. Chrome tabCapture acceptance is still required.');
