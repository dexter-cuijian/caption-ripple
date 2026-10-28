// Reference-based native accuracy evaluation. Browser latency is measured separately.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {CaptionDecoder} from '../server/decoder.mjs';
const sherpa=createRequire(import.meta.url)('sherpa-onnx-node');
const directory=process.argv[2]||'.work/fixtures/cmn_hans_cn';
const threshold=Number(process.argv[3]||.008);
const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json')));
const model='.models/paraformer';
const recognizer=new sherpa.OnlineRecognizer({featConfig:{sampleRate:16000,featureDim:80},modelConfig:{paraformer:{encoder:`${model}/encoder.int8.onnx`,decoder:`${model}/decoder.int8.onnx`},tokens:`${model}/tokens.txt`,numThreads:2,provider:'cpu',debug:0},decodingMethod:'greedy_search',enableEndpoint:false});
const normalize=text=>Array.from(text.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{Z}\s]/gu,''));
function editDistance(a,b){let previous=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const row=[i];for(let j=1;j<=b.length;j++)row.push(Math.min(row[j-1]+1,previous[j]+1,previous[j-1]+(a[i-1]===b[j-1]?0:1)));previous=row;}return previous[b.length];}
const started=performance.now(),results=[];
for(const sample of manifest.samples){
 const wave=sherpa.readWave(path.join(directory,sample.file));
 if(wave.sampleRate!==16000)throw Error('Expected16kHz');
 const decoder=new CaptionDecoder(recognizer,{threshold});let last='',parts=[];
 const audio=new Float32Array(wave.samples.length+16000);audio.set(wave.samples);
 for(let i=0;i<audio.length;i+=1600){const result=decoder.accept(audio.subarray(i,Math.min(i+1600,audio.length)));if(result.text)last=result.text;if(result.final){if(last)parts.push(last);last='';}}
 if(last)parts.push(last);
 const text=parts.join(''),reference=normalize(sample.reference),hypothesis=normalize(text);
 results.push({file:sample.file,seconds:sample.seconds,reference:sample.reference,hypothesis:text,edits:editDistance(reference,hypothesis),referenceChars:reference.length});
 console.log(`${results.length}/${manifest.samples.length} ${sample.file} CER ${(results.at(-1).edits/reference.length*100).toFixed(1)}%`);
 decoder.close();
}
const elapsed=(performance.now()-started)/1000,chars=results.reduce((s,r)=>s+r.referenceChars,0),edits=results.reduce((s,r)=>s+r.edits,0);
const report={kind:'native-reference-accuracy-not-browser',dataset:manifest.dataset,source:manifest.source,license:manifest.license,seconds:manifest.seconds,threshold,elapsedSeconds:elapsed,rtf:elapsed/manifest.seconds,CER:edits/chars,chars,edits,results};
fs.writeFileSync(`.work/evaluation-${threshold}.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify({seconds:report.seconds,elapsed,rtf:report.rtf,CER:report.CER,chars,edits}));
