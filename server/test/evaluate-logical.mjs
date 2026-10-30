/** Replay actual opt-in PCM; verifies source conservation, never invents a news CER. */
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {CaptionDecoder} from '../decoder.mjs';
import {profileConfig} from '../profiles.mjs';
import {StablePunctuation} from '../logical.mjs';
import {errorRate} from '../../scripts/metrics.mjs';
const sherpa=createRequire(import.meta.url)('sherpa-onnx-node');
const profile=profileConfig('zipformer-zh',path.resolve('.models/zipformer-zh'));
const recognizer=new sherpa.OnlineRecognizer(profile.recognizer);
const punctuation=new sherpa.OfflinePunctuation({model:{ctTransformer:path.resolve('.models/punctuation/model.int8.onnx'),numThreads:1,provider:'cpu'}});
const input=process.argv[2]??fs.readdirSync('.work/fixtures/newsrun').find(x=>x.endsWith('.pcm'));
const pcmPath=path.resolve(input.includes('/')?input:path.join('.work/fixtures/newsrun',input)),pcm=fs.readFileSync(pcmPath);
const sidecar=pcmPath.replace(/\.pcm$/,'.jsonl'),rows=fs.readFileSync(sidecar,'utf8').trim().split('\n').map(JSON.parse);
const packets=rows.filter(x=>x.type==='packet'),footer=rows.at(-1);
if(footer.dropped||footer.error)throw new Error('Incomplete capture recording');
let offset=0;for(const p of packets){if(p.byteOffset!==offset)throw new Error('PCM packet gap');offset+=p.byteLength;}if(offset!==pcm.length)throw new Error('PCM byte mismatch');
let calls=0,maxInputChars=0,punctuationMs=[],conflicts=0,lastEpoch=packets[0].epoch;
const logical=new StablePunctuation(text=>{calls++;maxInputChars=Math.max(maxInputChars,Array.from(text).length);const start=performance.now();const value=punctuation.addPunct(text);punctuationMs.push(performance.now()-start);return value;});
const decoder=new CaptionDecoder(recognizer,{threshold:.001,tailPaddingSamples:12800,logicalProducer:logical});
const finals=[],nativeFinals=[],codes={},start=performance.now();
function accept(samples){
 const r=decoder.accept(samples);
 if(r.punctuationCode)codes[r.punctuationCode]=(codes[r.punctuationCode]??0)+1;
 if(r.final){finals.push({text:r.text,raw:r.rawSourceText,reason:r.splitReason,audioSeconds:decoder.totalSamples/16000});if(r.splitReason==='silence')nativeFinals.push(decoder.lastNativeText);}
}
try{
 for(let i=0;i<packets.length;i++){
  const p=packets[i];if(p.epoch!==lastEpoch){throw new Error('Multi-epoch replay requires explicit per-epoch final flush');}
  const b=pcm.subarray(p.byteOffset,p.byteOffset+p.byteLength),samples=new Float32Array(b.length/2);for(let j=0;j<samples.length;j++)samples[j]=b.readInt16LE(j*2)/32768;
  accept(samples);if((i+1)%500===0)console.log('packets',i+1,'finals',finals.length);
 }
 for(let i=0;i<10;i++)accept(new Float32Array(1600));
}catch(error){if(error.code==='source_prefix_conflict')conflicts++;else throw error;console.error(error.code,error.message);}
const nativeRaw=nativeFinals.join(''),logicalRaw=finals.map(x=>x.raw).join(''),metric=errorRate(nativeRaw,logicalRaw,'char');
const report={kind:'actual-recorded-news-logical-conservation-not-news-accuracy',source:pcmPath,recordedSeconds:pcm.length/32000,packets:packets.length,conflicts,conservedExact:logicalRaw===nativeRaw,nativeChars:nativeRaw.length,logicalChars:logicalRaw.length,addedCharacterEdits:metric.edits,punctuationCalls:calls,maxInputChars,maxPunctuationMs:Math.max(...punctuationMs),slowCalls:punctuationMs.filter(ms=>ms>150).length,codes,nativeFinals:nativeFinals.length,logicalFinals:finals.length,elapsedSeconds:(performance.now()-start)/1000,finals,nativeRaw};
fs.writeFileSync('.work/news-logical-conservation.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,finals:undefined,nativeRaw:undefined}));
if(conflicts||!report.conservedExact)process.exitCode=1;
