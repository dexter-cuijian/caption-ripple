// Optional English Sherpa streaming model comparison. Offline native evaluation,
// not browser proof. Speech boundaries are natural 500ms pauses, no timed resets.
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {CaptionDecoder} from '../server/decoder.mjs';
import {errorRate} from './metrics.mjs';
const sherpa=createRequire(import.meta.url)('sherpa-onnx-node');
const model='.models/zipformer-en',suffix='epoch-99-avg-1-chunk-16-left-128.int8.onnx';
const recognizer=new sherpa.OnlineRecognizer({featConfig:{sampleRate:16000,featureDim:80},modelConfig:{transducer:{encoder:`${model}/encoder-${suffix}`,decoder:`${model}/decoder-${suffix}`,joiner:`${model}/joiner-${suffix}`},tokens:`${model}/tokens.txt`,numThreads:2,provider:'cpu',debug:0},decodingMethod:'greedy_search',enableEndpoint:false});
const manifest=JSON.parse(fs.readFileSync('.work/fixtures/en_us/manifest.json'));
const threshold=Number(process.argv[2]??.00001),results=[],started=performance.now();
const normalize=process.argv.includes('--normalize');
for(const sample of manifest.samples){
 const decoder=new CaptionDecoder(recognizer,{threshold,maxSegmentSeconds:Infinity,maxTextLength:Infinity,maxLatinTextLength:Infinity});
 const wave=sherpa.readWave(`.work/fixtures/en_us/${sample.file}`),audio=new Float32Array(wave.samples.length+32000);
 let peak=0;for(const value of wave.samples)peak=Math.max(peak,Math.abs(value));
 const gain=normalize&&peak>0?.8/peak:1;
 for(let i=0;i<wave.samples.length;i++)audio[i]=wave.samples[i]*gain;
 const parts=[];let last='';
 for(let i=0;i<audio.length;i+=1600){const result=decoder.accept(audio.subarray(i,i+1600));if(result.text)last=result.text;if(result.final){if(last)parts.push(last);last='';}}
 if(last)parts.push(last);
 const hypothesis=parts.join(' '),metric=errorRate(sample.reference,hypothesis,'word');
 results.push({file:sample.file,reference:sample.reference,hypothesis,...metric});
 decoder.close();
 console.log(`${results.length}/${manifest.samples.length}: ${(metric.rate*100).toFixed(1)}%`);
}
const seconds=(performance.now()-started)/1000,edits=results.reduce((n,r)=>n+r.edits,0),units=results.reduce((n,r)=>n+r.units,0);
const report={kind:'native-reference-accuracy-not-browser',model:'zipformer-en-2023-06-26-int8',dataset:'google/fleurs dev',license:'CC-BY-4.0',threshold,normalization:normalize?'whole-file-peak-diagnostic-not-causal':'none',seconds,rtf:seconds/manifest.seconds,WER:edits/units,edits,units,results};
fs.writeFileSync(`.work/zipformer-en-${threshold}${normalize?'-normalized':''}.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,results:undefined}));
