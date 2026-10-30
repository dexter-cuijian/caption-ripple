import {join} from 'node:path';

export function profileConfig(id='paraformer',modelDir){
  if(!['paraformer','zipformer-zh','zipformer-en'].includes(id))throw new Error(`Unknown ASR profile: ${id}`);
  const zip=id!=='paraformer',english=id==='zipformer-en';
  const suffix='epoch-99-avg-1-chunk-16-left-128.int8.onnx';
  const files=english?[`encoder-${suffix}`,`decoder-${suffix}`,`joiner-${suffix}`,'tokens.txt']:zip?['encoder.int8.onnx','decoder.onnx','joiner.int8.onnx','tokens.txt']:['encoder.int8.onnx','decoder.int8.onnx','tokens.txt'];
  const acoustic=zip?{transducer:{encoder:join(modelDir,files[0]),decoder:join(modelDir,files[1]),joiner:join(modelDir,files[2])},...(english?{}:{modelType:'zipformer2'})}:{paraformer:{encoder:join(modelDir,files[0]),decoder:join(modelDir,files[1])}};
  return {id,engine:`sherpa-onnx/${id}`,files,languages:english?['auto','en']:zip?['auto','zh']:['auto','zh','en'],nativeTokenTimestamps:zip,recognizer:{featConfig:{sampleRate:16000,featureDim:80},modelConfig:{...acoustic,tokens:join(modelDir,'tokens.txt'),numThreads:2,provider:'cpu',debug:0},decodingMethod:'greedy_search',enableEndpoint:false}};
}

export function decoderOptions(profile,environment=process.env){
  const threshold=Number(environment.CAPTION_ASR_RMS_THRESHOLD??.008);
  if(!Number.isFinite(threshold)||threshold<=0||threshold>1)throw new Error('Invalid RMS threshold; expected a finite number >0 and <=1');
  return {threshold,agc:environment.CAPTION_ASR_AGC==='1',maxSegmentSeconds:Infinity,maxTextLength:Infinity,maxLatinTextLength:Infinity,tailPaddingSamples:profile==='zipformer-zh'?12800:6400};
}
