import test from 'node:test';
import assert from 'node:assert/strict';
import {CaptionDecoder} from '../decoder.mjs';

function recognizer(){
 const streams=[];let resets=0;
 return {streams,get resets(){return resets;},createStream(){const stream={audio:[],text:'',ready:false,acceptWaveform({samples}){this.audio.push(Array.from(samples));this.ready=true;if(samples.some(x=>x!==0))this.text+='啊原文';}};streams.push(stream);return stream;},isReady(s){return s.ready;},decode(s){s.ready=false;},getResult(s){return {text:s.text};},reset(){resets++;}};
}

test('continuous speech duration final flushes tail, uses fresh stream and preserves every input sample once',()=>{
 const r=recognizer(),d=new CaptionDecoder(r,{maxSegmentSeconds:.3,maxTextLength:1000});
 const blocks=[.1,.2,.3,.4,.5,.6].map(value=>new Float32Array(1600).fill(value));const results=blocks.map(block=>d.accept(block));
 assert.deepEqual(results.map(e=>e.final),[false,false,true,false,false,true]);
 assert.equal(results[2].splitReason,'duration');assert.equal(results[2].text,'啊原文啊原文啊原文');
 assert.equal(results[3].speechStarted,true);assert.equal(results[5].text,'啊原文啊原文啊原文');
 const real=r.streams.flatMap(s=>s.audio).flat().filter(x=>x!==0);
 assert.deepEqual(real,blocks.flatMap(b=>Array.from(b)));
 assert.equal(r.streams.length,3);
 assert.equal(r.streams[0].audio.at(-1).length,6400);
 assert.ok(r.streams[0].audio.at(-1).every(x=>x===0));
});

test('text bound emits unchanged raw recognized fillers and explicit length reason',()=>{
 const r=recognizer(),d=new CaptionDecoder(r,{maxSegmentSeconds:100,maxTextLength:6});
 const result=d.accept(new Float32Array(1600).fill(.1));
 assert.equal(result.final,false);
 const final=d.accept(new Float32Array(1600).fill(.1));
 assert.equal(final.final,true);assert.equal(final.splitReason,'length');assert.equal(final.text,'啊原文啊原文');
});

test('500ms silence endpoint remains exact and fresh stream prevents previous utterance mixing',()=>{
 const r=recognizer(),d=new CaptionDecoder(r,{maxSegmentSeconds:10,maxTextLength:1000});
 const speech=new Float32Array(1600).fill(.1),silence=new Float32Array(1600);
 d.accept(speech);for(let i=0;i<4;i++)assert.equal(d.accept(silence).final,false);
 const final=d.accept(silence);assert.equal(final.final,true);assert.equal(final.splitReason,'silence');
 assert.equal(d.accept(speech).text,'啊原文');
});

test('short or partial PCM chunks advance duration by exact sample count, without replay',()=>{
 const r=recognizer(),d=new CaptionDecoder(r,{maxSegmentSeconds:.2,maxTextLength:1000});
 const chunks=[new Float32Array(1200).fill(.1),new Float32Array(1200).fill(.2),new Float32Array(800).fill(.3)];
 assert.equal(d.accept(chunks[0]).final,false);assert.equal(d.accept(chunks[1]).final,false);
 assert.equal(d.accept(chunks[2]).splitReason,'duration');
 assert.deepEqual(r.streams.flatMap(s=>s.audio).flat().filter(x=>x!==0),chunks.flatMap(b=>Array.from(b)));
});

test('Chinese 40-character limit does not prematurely cut English at 40 ASCII letters',()=>{
 const r=recognizer();r.getResult=()=>({text:'When you call someone who is thousands of miles away'});
 const d=new CaptionDecoder(r);
 assert.equal(d.accept(new Float32Array(1600).fill(.1)).final,false);
});

test('model-specific lookahead tail padding is honored during natural finalization',()=>{
 const r=recognizer(),d=new CaptionDecoder(r,{tailPaddingSamples:16000,maxSegmentSeconds:100,maxTextLength:1000});
 d.accept(new Float32Array(1600).fill(.1));for(let i=0;i<5;i++)d.accept(new Float32Array(1600));
 assert.equal(r.streams[0].audio.at(-1).length,16000);
});

test('quality default retains acoustic stream through continuous long text until natural silence',()=>{
 const r=recognizer(),d=new CaptionDecoder(r);
 for(let i=0;i<60;i++)assert.equal(d.accept(new Float32Array(1600).fill(.1)).final,false);
 assert.equal(r.streams.length,1);
 let result;for(let i=0;i<5;i++)result=d.accept(new Float32Array(1600));
 assert.equal(result.final,true);assert.equal(result.splitReason,'silence');assert.equal(r.streams.length,2);
});
