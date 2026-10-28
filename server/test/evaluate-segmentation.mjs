/** Explicit offline native reference comparison. Never a Chrome acceptance test. */
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {errorRate} from '../../scripts/metrics.mjs';
const [directory='.work/fixtures/cmn_hans_cn',thresholdArg='.008',durationArg='4',moduleArg='server/decoder.mjs',tag='candidate']=process.argv.slice(2);
const {CaptionDecoder}=await import(pathToFileURL(path.resolve(moduleArg)));
const threshold=Number(thresholdArg),maxSegmentSeconds=Number(durationArg);
const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json')));
const sherpa=createRequire(import.meta.url)('sherpa-onnx-node');
const profile=process.env.ASR_EVAL_PROFILE??'paraformer';
const model=profile==='zipformer-zh'?'.models/zipformer-zh':'.models/paraformer';
const modelConfig=profile==='zipformer-zh'?{transducer:{encoder:`${model}/encoder.int8.onnx`,decoder:`${model}/decoder.onnx`,joiner:`${model}/joiner.int8.onnx`},modelType:'zipformer2'}:{paraformer:{encoder:`${model}/encoder.int8.onnx`,decoder:`${model}/decoder.int8.onnx`}};
const r=new sherpa.OnlineRecognizer({featConfig:{sampleRate:16000,featureDim:80},modelConfig:{...modelConfig,tokens:`${model}/tokens.txt`,numThreads:2,provider:'cpu',debug:0},decodingMethod:'greedy_search',enableEndpoint:false});
const unit=manifest.language?.startsWith('en')?'word':'char',results=[];let finals=0,maxFinalSeconds=0;
const started=performance.now();
for(const sample of manifest.samples){
 const wave=sherpa.readWave(path.join(directory,sample.file)),d=new CaptionDecoder(r,{threshold,maxSegmentSeconds,maxTextLength:process.env.ASR_EVAL_CONTINUOUS?Infinity:40,maxLatinTextLength:process.env.ASR_EVAL_CONTINUOUS?Infinity:160,tailPaddingSamples:profile==='zipformer-zh'?12800:6400});
 const audio=new Float32Array(wave.samples.length+16000);audio.set(wave.samples);
 let last='',parts=[],segmentStart=null;const splitReasons={};
 for(let i=0;i<audio.length;i+=1600){
  const result=d.accept(audio.subarray(i,Math.min(i+1600,audio.length)));
  if(result.speechStarted)segmentStart=i/16000;
  if(result.text)last=result.text;
  if(result.final){if(last)parts.push(last);last='';finals++;const reason=result.splitReason??'silence';splitReasons[reason]=(splitReasons[reason]??0)+1;if(segmentStart!==null)maxFinalSeconds=Math.max(maxFinalSeconds,(i+1600)/16000-segmentStart);segmentStart=null;}
 }
 if(last)parts.push(last);
 const hypothesis=parts.join(unit==='word'?' ':''),metric=errorRate(sample.reference,hypothesis,unit);
 results.push({file:sample.file,reference:sample.reference,hypothesis,edits:metric.edits,units:metric.units,splitReasons});d.close();
 console.log(`${results.length}/${manifest.samples.length} ${(metric.rate*100).toFixed(2)}%`);
}
const elapsedSeconds=(performance.now()-started)/1000,units=results.reduce((s,r)=>s+r.units,0),edits=results.reduce((s,r)=>s+r.edits,0);
const report={kind:'native-segmentation-reference-not-browser',dataset:manifest.dataset,language:manifest.language,seconds:manifest.seconds,profile,threshold,maxSegmentSeconds,maxTextLength:process.env.ASR_EVAL_CONTINUOUS?'disabled':40,maxLatinTextLength:160,tag,elapsedSeconds,metric:unit==='word'?'WER':'CER',errorRate:edits/units,edits,units,finals,maxFinalSeconds,results};
fs.writeFileSync(`.work/segmentation-${manifest.language}-${threshold}-${tag}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,results:undefined}));
