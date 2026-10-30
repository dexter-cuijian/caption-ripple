import {BrowserAsrSession} from './browser-asr';

declare function importScripts(...urls:string[]):void;
declare function createOnlineRecognizer(module:unknown):any;
const worker=self as any;
let session:BrowserAsrSession|undefined,sessionId='',epoch=0;
const vendor=(name:string)=>new URL(`vendor/${name}`,worker.location.href).href;
worker.Module={
 locateFile:(name:string)=>vendor(name),
 setStatus:(message:string)=>{if(message)worker.postMessage({kind:'loading',message});},
 printErr:(message:string)=>worker.postMessage({kind:'diagnostic',message}),
 onRuntimeInitialized:()=>{
  try{session=new BrowserAsrSession(createOnlineRecognizer(worker.Module));worker.postMessage({kind:'ready'});}
  catch(error){worker.postMessage({kind:'error',message:String(error)});}
 }
};
try{
 importScripts(vendor('sherpa-onnx-asr.js'));
 importScripts(vendor('sherpa-onnx-wasm-main-asr.js'));
}catch(error){worker.postMessage({kind:'error',message:String(error)});}
worker.onmessage=({data}:MessageEvent)=>{
 try{
  if(data.kind==='reset'){sessionId=data.sessionId;epoch=data.epoch;session?.reset();worker.postMessage({kind:'reset-done',sessionId,epoch});return;}
  if(data.kind!=='pcm'||!session||data.sessionId!==sessionId||data.epoch!==epoch)return;
  const events=session.accept(new Int16Array(data.pcm),{capturedAt:data.capturedAt,mediaTime:data.mediaTime});
  for(const event of events)worker.postMessage({kind:'subtitle',event:{...event,type:'subtitle',sessionId,epoch}});
  worker.postMessage({kind:'processed',sessionId,epoch});
 }catch(error){worker.postMessage({kind:'error',message:String(error)});}
};
