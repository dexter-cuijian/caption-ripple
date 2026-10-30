/** Explicit native regression, run manually; requires actual paraformer files. */
import {defaultWorkerFactory} from '../session.mjs';
import {resolve} from 'node:path';
import {readFile} from 'node:fs/promises';

const rounds=Number(process.env.NATIVE_ROUNDS??20);
const mode=process.env.NATIVE_MODE??'startstop';
const modelDir=resolve('.models/paraformer');
const factory=defaultWorkerFactory;
const wav=await readFile(resolve(process.env.NATIVE_WAV??'.work/fixtures/paraformer-zh.wav'));
let offset=12,audio;
while(offset+8<=wav.length){const size=wav.readUInt32LE(offset+4);if(wav.toString('ascii',offset,offset+4)==='data'){audio=wav.subarray(offset+8,offset+8+size);break;}offset+=8+size+(size%2);}
if(!audio)throw new Error('Missing WAV data');
const samples=new Float32Array(Math.min(audio.length/2,32000));
for(let i=0;i<samples.length;i++)samples[i]=audio.readInt16LE(i*2)/32768;
const wait=(worker,type=null)=>new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>{cleanup();reject(new Error('Native response timeout'));},15000);
 const onMessage=message=>{if(message.type==='error'){cleanup();reject(new Error(message.message));return;}if(type&&message.type!==type)return;cleanup();resolve(message);};
 const onError=error=>{cleanup();reject(error);};
 const onExit=(code,signal)=>{cleanup();reject(new Error(`Native exited ${code} ${signal}`));};
 const cleanup=()=>{clearTimeout(timer);worker.off('message',onMessage);worker.off('error',onError);worker.off('exit',onExit);};
 worker.on('message',onMessage);worker.on('error',onError);worker.on('exit',onExit);
});
let worker,lastText='';
for(let round=0;round<rounds;round++){
 if(!worker){worker=factory({modelDir});const result=await wait(worker);if(result.type!=='ready')throw new Error('Not ready');}
 for(let offset=0;offset<samples.length;offset+=1600){const resultPromise=wait(worker);worker.postMessage({type:'audio',samples:samples.subarray(offset,offset+1600)});const result=await resultPromise;if(result.type!=='decoded')throw new Error('No decode');if(result.text)lastText=result.text;}
 if(mode.startsWith('reset')&&worker.supportsReset){if(mode==='reset-inflight')worker.postMessage({type:'audio',samples});const resultPromise=wait(worker,'ready');worker.postMessage({type:'reset'});const result=await resultPromise;if(result.type!=='ready')throw new Error('No reset acknowledgement');}
 else if(mode==='race'){worker.postMessage({type:'audio',samples});await new Promise(r=>setTimeout(r,10));worker.terminate();worker=null;}
 else {await worker.terminate();worker=null;}
 console.log(JSON.stringify({round:round+1,mode,pid:worker?.pid??null,status:'ok',lastText}));
}
await worker?.terminate();
