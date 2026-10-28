import {parentPort,workerData} from 'node:worker_threads';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {existsSync} from 'node:fs';
import {CaptionDecoder} from './decoder.mjs';

let decoder;
try {
  const modelDir=workerData.modelDir;
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
  parentPort.postMessage({type:'ready'});
} catch(error) {
  parentPort.postMessage({type:'error',message:String(error.message)});
  parentPort.close();
}
if(decoder){
  parentPort.on('message',message=>{
    try{
      if(message.type==='audio')parentPort.postMessage({type:'decoded',...decoder.accept(message.samples)});
    }catch(error){parentPort.postMessage({type:'error',message:String(error.message)});}
  });
  parentPort.on('close',()=>decoder.close());
}
