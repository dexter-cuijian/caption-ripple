import {createRequire} from 'node:module';
import {join} from 'node:path';
import {existsSync} from 'node:fs';
import {CaptionDecoder} from './decoder.mjs';

// The addon is loaded only in this disposable OS process. Isolate teardown inside
// worker_threads can take down Node when a native N-API exception escapes.
const send=message=>{if(process.connected)process.send(message,()=>{});};
let decoder;
try {
  const modelDir=process.env.CAPTION_NATIVE_MODEL_DIR;
  for(const name of ['encoder.int8.onnx','decoder.int8.onnx','tokens.txt']){
    if(!existsSync(join(modelDir,name)))throw new Error(`Model file missing: ${join(modelDir,name)}. Run npm run setup:model.`);
  }
  const require=createRequire(import.meta.url);
  const sherpa=require('sherpa-onnx-node');
  const recognizer=new sherpa.OnlineRecognizer({
    featConfig:{sampleRate:16000,featureDim:80},
    modelConfig:{paraformer:{encoder:join(modelDir,'encoder.int8.onnx'),decoder:join(modelDir,'decoder.int8.onnx')},tokens:join(modelDir,'tokens.txt'),numThreads:2,provider:'cpu',debug:0},
    decodingMethod:'greedy_search',enableEndpoint:false,
  });
  decoder=new CaptionDecoder(recognizer);
  send({type:'ready'});
} catch(error) {
  send({type:'error',message:String(error.message)});
  if(process.connected)process.disconnect();
}
if(decoder){
  process.on('message',message=>{
    try{
      if(message.type==='audio')send({type:'decoded',...decoder.accept(message.samples)});
      else if(message.type==='reset'){decoder.reset();send({type:'ready'});}
      else if(message.type==='shutdown'){decoder.close();process.exit(0);}
    }catch(error){send({type:'error',message:String(error.message)});}
  });
  process.on('disconnect',()=>process.exit(0));
}
