import test from 'node:test';
import assert from 'node:assert/strict';
import {StablePunctuation} from '../logical.mjs';
const raw='因为也剩三十多天而已那我们总共有十二个行政区但是呢我们会尽量按照这样的选战节奏稳定大家的军心';
const first='因为也剩三十多天而已';
const punctuation=text=>text.replace(first,first+'。').replace('那我们总共有十二个行政区','那我们总共有十二个行政区，')+'。';
const observe=(p,text,end=600)=>{let r,firstFinal;for(let ms=0;ms<=end;ms+=100){r=p.update(text,{audioMs:ms});if(r.final&&!firstFinal)firstFinal=r;}return firstFinal??r;};

test('stable internal sentence final leaves unstable tail; trailing automatic period never commits',()=>{
 const p=new StablePunctuation(punctuation);let result=p.update(raw,{audioMs:0});assert.equal(result.final,false);
 result=observe(p,raw);assert.equal(result.final,true);assert.equal(result.rawSourceText,first);assert.equal(result.text,first+'。');assert.equal(result.splitReason,'punctuation');
 const trailing=new StablePunctuation(text=>text+'。');assert.equal(observe(trailing,raw).final,false);
});

test('logical final concatenation preserves exact raw and handles natural finish',()=>{
 const p=new StablePunctuation(punctuation);const finals=[];
 for(let ms=0;ms<=1800;ms+=100){const r=p.update(raw,{audioMs:ms});if(r.final)finals.push(r.rawSourceText);}
 const last=p.update(raw,{audioMs:1900,final:true});if(last.text)finals.push(last.rawSourceText);
 assert.equal(finals.join(''),raw);assert.equal(last.final,true);
 assert.equal(p.update('下一条消息内容',{audioMs:2000}).rawSourceText,'下一条消息内容');
});

test('short connector clause is not committed by its own comma',()=>{
 const p=new StablePunctuation(text=>text.replace('但是呢','但是呢，')+'。');
 assert.equal(observe(p,'但是呢我们会尽量按照这样的一个选战节奏稳定大家的军心').final,false);
});

test('word-changing punctuator rejected and committed-prefix rewrite raises explicit guard',()=>{
 const bad=new StablePunctuation(()=>raw.replace('三十','四十')+'。');const result=observe(bad,raw);assert.equal(result.final,false);assert.equal(result.text,raw);assert.equal(result.punctuationCode,'punctuation_changed_source');
 const p=new StablePunctuation(punctuation);observe(p,raw);assert.throws(()=>p.update(raw.replace('三十','四十'),{audioMs:700}),error=>error.code==='source_prefix_conflict');
});

test('punctuator input bounded to pending tail window plus limited committed context',()=>{
 const inputs=[],p=new StablePunctuation(text=>{inputs.push(text);return text+'。';},{maxInputChars:128,contextChars:24});
 observe(p,'长'.repeat(4000));assert.ok(inputs.length);assert.ok(inputs.every(text=>Array.from(text).length<=128));
});

test('slow punctuation call recorded without blocking future source snapshots with stale punctuation',()=>{
 let ms=0;const p=new StablePunctuation(text=>{ms+=200;return punctuation(text);},{clock:()=>ms,maxPunctuationMs:100});
 const result=observe(p,raw);assert.equal(result.final,false);assert.equal(result.punctuationCode,'punctuation_timeout');assert.ok(result.punctuationMs>=200);assert.equal(result.text,raw);
});

test('decoder logical final preserves acoustic stream and natural silence alone flushes',async()=>{
 const {CaptionDecoder}=await import('../decoder.mjs');const streams=[];
 const recognizer={createStream(){const stream={acceptWaveform(){}};streams.push(stream);return stream;},isReady(){return false;},getResult(){return {text:raw};},reset(){}};
 const d=new CaptionDecoder(recognizer,{logicalProducer:new StablePunctuation(punctuation)});let finals=[];
 for(let i=0;i<20;i++){const result=d.accept(new Float32Array(1600).fill(.1));if(result.final)finals.push(result.rawSourceText);}
 assert.ok(finals.length>0);assert.equal(streams.length,1);
 for(let i=0;i<5;i++){const result=d.accept(new Float32Array(1600));if(result.final)finals.push(result.rawSourceText);}
 assert.equal(streams.length,2);assert.equal(finals.join(''),raw);
});

test('punctuation does not split percentage construction or change numeric symbols',()=>{
 const text='这份民调中最新的得票率是百分之三十五而不是另一个数字';
 const p=new StablePunctuation(raw=>raw.replace('百分','百分，')+'。');assert.equal(observe(p,text).final,false);
 const numeric=new StablePunctuation(raw=>raw.replace('35.5%','355%')+'。');const result=observe(numeric,'这个候选人的得票率是35.5%而不是其他人的数据');assert.equal(result.punctuationCode,'punctuation_changed_source');
});
