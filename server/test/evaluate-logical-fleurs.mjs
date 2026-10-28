import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {CaptionDecoder} from '../decoder.mjs';
import {profileConfig} from '../profiles.mjs';
import {StablePunctuation} from '../logical.mjs';
import {errorRate} from '../../scripts/metrics.mjs';
const sherpa=createRequire(import.meta.url)('sherpa-onnx-node'),directory='.work/fixtures/cmn_hans_cn';
const config=profileConfig('zipformer-zh',path.resolve('.models/zipformer-zh'));
const recognizer=new sherpa.OnlineRecognizer(config.recognizer),punctuation=new sherpa.OfflinePunctuation({model:{ctTransformer:path.resolve('.models/punctuation/model.int8.onnx'),numThreads:1,provider:'cpu'}});
const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'))),results=[];let conflicts=0,totalFinals=0;const start=performance.now();
for(const sample of manifest.samples){
 const logical=new StablePunctuation(text=>punctuation.addPunct(text));
 const decoder=new CaptionDecoder(recognizer,{threshold:.001,tailPaddingSamples:12800,logicalProducer:logical}),wave=sherpa.readWave(path.join(directory,sample.file));
 const audio=new Float32Array(wave.samples.length+16000);audio.set(wave.samples);const finals=[],nativeFinals=[],display=[];
 try{for(let i=0;i<audio.length;i+=1600){const r=decoder.accept(audio.subarray(i,i+1600));if(r.final){finals.push(r.rawSourceText);display.push(r.text);totalFinals++;if(r.splitReason==='silence')nativeFinals.push(decoder.lastNativeText);}}}
 catch(error){if(error.code!=='source_prefix_conflict')throw error;conflicts++;}
 const native=nativeFinals.join(''),raw=finals.join(''),text=display.join(''),metric=errorRate(sample.reference,text,'char'),baseline=errorRate(sample.reference,native,'char');
 results.push({file:sample.file,native,raw,text,conserved:native===raw,edits:metric.edits,nativeEdits:baseline.edits,units:metric.units});decoder.close();console.log(results.length,'/',manifest.samples.length,metric.edits,baseline.edits,native===raw);
}
const edits=results.reduce((s,r)=>s+r.edits,0),nativeEdits=results.reduce((s,r)=>s+r.nativeEdits,0),units=results.reduce((s,r)=>s+r.units,0);
const report={kind:'native-fleurs-logical-segmentation-not-browser',seconds:manifest.seconds,conflicts,conservedAll:results.every(r=>r.conserved),edits,nativeEdits,units,CER:edits/units,nativeCER:nativeEdits/units,addedEdits:edits-nativeEdits,totalFinals,elapsedSeconds:(performance.now()-start)/1000,results};
fs.writeFileSync('.work/fleurs-logical-conservation.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,results:undefined}));if(conflicts||!report.conservedAll||edits!==nativeEdits)process.exitCode=1;
