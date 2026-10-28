import {join} from 'node:path';

export function profileConfig(id='paraformer',modelDir){
  if(!['paraformer','zipformer-zh'].includes(id))throw new Error(`Unknown ASR profile: ${id}`);
  const zip=id==='zipformer-zh';
  const files=zip?['encoder.int8.onnx','decoder.onnx','joiner.int8.onnx','tokens.txt']:['encoder.int8.onnx','decoder.int8.onnx','tokens.txt'];
  const acoustic=zip?{transducer:{encoder:join(modelDir,files[0]),decoder:join(modelDir,files[1]),joiner:join(modelDir,files[2])},modelType:'zipformer2'}:{paraformer:{encoder:join(modelDir,files[0]),decoder:join(modelDir,files[1])}};
  return {id,engine:`sherpa-onnx/${id}`,files,languages:zip?['auto','zh']:['auto','zh','en'],nativeTokenTimestamps:zip,recognizer:{featConfig:{sampleRate:16000,featureDim:80},modelConfig:{...acoustic,tokens:join(modelDir,'tokens.txt'),numThreads:2,provider:'cpu',debug:0},decodingMethod:'greedy_search',enableEndpoint:false}};
}

export function decoderOptions(profile,environment=process.env){
  const threshold=Number(environment.CAPTION_ASR_RMS_THRESHOLD??.008);
  if(!Number.isFinite(threshold)||threshold<=0||threshold>1)throw new Error('Invalid RMS threshold; expected a finite number >0 and <=1');
  return {threshold,maxSegmentSeconds:Infinity,maxTextLength:Infinity,maxLatinTextLength:Infinity,tailPaddingSamples:profile==='zipformer-zh'?12800:6400};
}
