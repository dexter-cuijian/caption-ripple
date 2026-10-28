import {createRequire} from 'node:module';
import {join} from 'node:path';
import {existsSync} from 'node:fs';
import {CaptionDecoder} from './decoder.mjs';
import {profileConfig,decoderOptions} from './profiles.mjs';

// The addon is loaded only in this disposable OS process. Isolate teardown inside
// worker_threads can take down Node when a native N-API exception escapes.
const send=message=>{if(process.connected)process.send(message,()=>{});};
let decoder;
try {
  const modelDir=process.env.CAPTION_NATIVE_MODEL_DIR;
  const profile=profileConfig(process.env.CAPTION_NATIVE_PROFILE??'paraformer',modelDir);
  for(const name of profile.files){
    if(!existsSync(join(modelDir,name)))throw new Error(`Model file missing: ${join(modelDir,name)}. Run npm run setup:model.`);
  }
  const require=createRequire(import.meta.url);
  const sherpa=require('sherpa-onnx-node');
  const recognizer=new sherpa.OnlineRecognizer(profile.recognizer);
  decoder=new CaptionDecoder(recognizer,decoderOptions(profile.id));
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
