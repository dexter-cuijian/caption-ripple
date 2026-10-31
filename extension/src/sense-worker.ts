import {SenseVoiceSession} from './sensevoice-session';

const worker=self as any;
let session:SenseVoiceSession|undefined,sessionId='',epoch=0;
const asset=(name:string)=>new URL(`vendor/sensevoice/${name}`,import.meta.url).href;
const status=(kind:string,details:Record<string,unknown>={})=>worker.postMessage({kind,...details});

async function load(){
 const runtime=await import(/* @vite-ignore */ asset('index.js'));
 const module=await runtime.initVADASRModule();status('loading',{message:'正在加载 SenseVoiceSmall 模型'});
 for(const [index,name] of ['model.int8.onnx','tokens.txt','silero_vad_v5.onnx'].entries()){
  const response=await fetch(asset(name));if(!response.ok)throw new Error(`${name}: HTTP ${response.status}`);
  module.FS_createDataFile('/',`model-${index}`,new Uint8Array(await response.arrayBuffer()),true,false,false);
 }
 const recognizer=new runtime.OfflineRecognizer({featConfig:{sampleRate:16000,featureDim:80},modelConfig:{senseVoice:{model:'/model-0',language:'auto',useInverseTextNormalization:1},tokens:'/model-1',numThreads:4,provider:'cpu',debug:0}},module);
 const vad=runtime.createVad(module,{sileroVad:{model:'/model-2',threshold:.5,minSilenceDuration:.5,minSpeechDuration:.2,windowSize:512,maxSpeechDuration:15},sampleRate:16000,numThreads:1,provider:'cpu',bufferSizeInSeconds:30});
 session=new SenseVoiceSession(vad,{decode(samples:Float32Array){const stream=recognizer.createStream();try{stream.acceptWaveform(16000,samples);recognizer.decode(stream);return recognizer.getResult(stream).text;}finally{stream.free();}},free(){recognizer.free();}});
 status('ready');
}
worker.onmessage=({data}:MessageEvent)=>{
 try{
  if(data.kind==='reset'){sessionId=data.sessionId;epoch=data.epoch;session?.reset(data.sourceLanguage??'auto');status('reset-done',{sessionId,epoch});return;}
  if(data.kind==='flush'&&session&&data.sessionId===sessionId&&data.epoch===epoch){
   for(const event of session.flush({capturedAt:data.capturedAt,mediaTime:data.mediaTime}))status('subtitle',{event:{...event,type:'subtitle',sessionId,epoch}});
   status('flushed',{sessionId,epoch});return;
  }
  if(data.kind!=='pcm'||!session||data.sessionId!==sessionId||data.epoch!==epoch)return;
  const events=session.accept(new Int16Array(data.pcm),{capturedAt:data.capturedAt,mediaTime:data.mediaTime});
  for(const event of events)status('subtitle',{event:{...event,type:'subtitle',sessionId,epoch}});
  status('processed',{sessionId,epoch});
 }catch(error){status('error',{message:String(error)});}
};
void load().catch(error=>status('error',{message:String(error)}));
