import test from 'node:test';
import assert from 'node:assert/strict';
import {CausalAgc} from '../agc.mjs';

const rms=a=>Math.sqrt(a.reduce((sum,x)=>sum+x*x,0)/a.length);
function wave(amplitude,length=1600){return Float32Array.from({length},(_,i)=>Math.sin(2*Math.PI*220*i/16000)*amplitude);}

test('causal AGC lifts quiet speech within bounded gain without changing source samples',()=>{
 const a=new CausalAgc(),input=wave(.001),copy=Float32Array.from(input),output=a.process(input);
 assert.deepEqual(input,copy);assert.ok(rms(output)>.04&&rms(output)<.06);assert.ok(a.gain>=a.minGain&&a.gain<=a.maxGain);
});

test('loud onset after quiet speech never clips, gain remains bounded and release is gradual',()=>{
 const a=new CausalAgc();a.process(wave(.001));const gain=a.gain;
 const loud=a.process(wave(1));assert.ok(loud.every(x=>Math.abs(x)<=.980001));assert.ok(a.gain<gain);
 const after=a.gain;a.process(wave(.001));assert.ok(a.gain>after&&a.gain<gain);
});

test('digital silence and sub-floor noise are not amplified, reset clears preceding epoch gain',()=>{
 const a=new CausalAgc();a.process(wave(.001));const gain=a.gain;
 assert.ok(a.process(new Float32Array(1600)).every(x=>x===0));assert.equal(a.gain,gain);
 const noise=wave(.000001);assert.deepEqual(a.process(noise),noise);
 a.reset();assert.equal(a.gain,1);assert.equal(a.initialized,false);
});

test('AGC is packet causal: same first frame yields same output regardless future loudness',()=>{
 const first=wave(.001),a=new CausalAgc(),b=new CausalAgc();
 assert.deepEqual(a.process(first),b.process(first));a.process(wave(1));b.process(wave(.0001));
});

test('decoder AGC opt-in normalizes ASR only, raw PCM untouched, epoch reset clears gain',async()=>{
 const {CaptionDecoder}=await import('../decoder.mjs');
 let accepted=[];
 const r={createStream(){return {acceptWaveform({samples}){accepted.push(samples);}};},isReady(){return false;},getResult(){return {text:'speech'};},reset(){}};
 const input=wave(.001),copy=Float32Array.from(input),off=new CaptionDecoder(r);off.accept(input);assert.equal(accepted.length,0);
 const on=new CaptionDecoder(r,{agc:true});on.accept(input);assert.ok(rms(accepted[0])>.04);assert.deepEqual(input,copy);assert.ok(on.agc.gain>1);
 on.reset();assert.equal(on.agc.gain,1);assert.equal(on.agc.initialized,false);
});
