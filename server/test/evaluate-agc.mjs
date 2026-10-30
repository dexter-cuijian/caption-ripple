/** Explicit native causal AGC reference evaluation; no future-clip statistics used. */
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {CaptionDecoder} from '../decoder.mjs';
import {profileConfig} from '../profiles.mjs';
import {errorRate} from '../../scripts/metrics.mjs';
const sherpa=createRequire(import.meta.url)('sherpa-onnx-node');
const mode=process.argv[2]??'causal',targetRms=Number(process.env.AGC_TARGET_RMS??.05),threshold=Number(process.env.AGC_EVAL_THRESHOLD??.00001);
const profile=profileConfig('zipformer-en',path.resolve('.models/zipformer-en'));
const recognizer=new sherpa.OnlineRecognizer(profile.recognizer);
const directory='.work/fixtures/en_us',manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'))),results=[];
const start=performance.now();let highestGain=1,lowestGain=Infinity;
for(const sample of manifest.samples){
 const wave=sherpa.readWave(path.join(directory,sample.file));
 const decoder=new CaptionDecoder(recognizer,{threshold,agc:mode==='causal'?{targetRms}:false});
 const audio=new Float32Array(wave.samples.length+32000);audio.set(wave.samples);
 let parts=[],last='';
 for(let i=0;i<audio.length;i+=1600){
  const result=decoder.accept(audio.subarray(i,i+1600));
  highestGain=Math.max(highestGain,result.agcGain);lowestGain=Math.min(lowestGain,result.agcGain);
  if(result.text)last=result.text;if(result.final){if(last)parts.push(last);last='';}
 }
 if(last)parts.push(last);
 const hypothesis=parts.join(' '),metric=errorRate(sample.reference,hypothesis,'word');
 results.push({file:sample.file,reference:sample.reference,hypothesis,...metric});decoder.close();
 console.log(`${results.length}/${manifest.samples.length}: ${(metric.rate*100).toFixed(2)}%`);
}
const elapsedSeconds=(performance.now()-start)/1000,units=results.reduce((n,r)=>n+r.units,0),edits=results.reduce((n,r)=>n+r.edits,0);
const report={kind:'native-reference-causal-agc-not-browser',dataset:'google/fleurs en_us validation',audioSeconds:manifest.seconds,threshold,mode,targetRms,highestGain,lowestGain,elapsedSeconds,rtf:elapsedSeconds/manifest.seconds,WER:edits/units,edits,units,results};
fs.writeFileSync(`.work/causal-agc-${mode}-${targetRms}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,results:undefined}));
