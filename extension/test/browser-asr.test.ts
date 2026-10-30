import {expect,test} from 'vitest';
import {BrowserAsrSession} from '../src/browser-asr';

class Recognizer {
 text='';endpoint=false;accepted:Float32Array[]=[];resets=0;
 createStream(){return {acceptWaveform:(_rate:number,samples:Float32Array)=>this.accepted.push(samples),free:()=>{}};}
 isReady(){return false;}
 decode(){}
 getResult(){return {text:this.text};}
 isEndpoint(){return this.endpoint;}
 reset(){this.resets++;this.endpoint=false;this.text='';}
}

test('browser ASR streams packet-causal audio, updates one segment, then finalizes on endpoint',()=>{
 const recognizer=new Recognizer(),session=new BrowserAsrSession(recognizer);
 recognizer.text='HELLO';
 const first=session.accept(new Int16Array(1600).fill(100),{capturedAt:1000,mediaTime:1});
 expect(first).toMatchObject([{phase:'interim',segmentId:'0',revision:1,sourceText:'HELLO'}]);
 recognizer.text='HELLO THERE';
 expect(session.accept(new Int16Array(1600).fill(100),{capturedAt:1100,mediaTime:1.1})).toMatchObject([{phase:'interim',segmentId:'0',revision:2,sourceText:'HELLO THERE'}]);
 recognizer.endpoint=true;
 expect(session.accept(new Int16Array(1600),{capturedAt:1200,mediaTime:1.2})).toMatchObject([{phase:'final',segmentId:'0',revision:3,sourceText:'HELLO THERE'}]);
 expect(recognizer.resets).toBe(1);
 recognizer.text='NEXT';
 expect(session.accept(new Int16Array(1600).fill(100),{capturedAt:1300,mediaTime:1.3})).toMatchObject([{phase:'interim',segmentId:'1',revision:1,sourceText:'NEXT'}]);
 expect(recognizer.accepted[0][0]).toBeGreaterThan(0);
});

test('reset retires old text and never emits a fabricated empty final',()=>{
 const recognizer=new Recognizer(),session=new BrowserAsrSession(recognizer);
 recognizer.text='OLD';session.accept(new Int16Array(1600).fill(200),{capturedAt:1000,mediaTime:null});
 session.reset();
 recognizer.endpoint=true;
 expect(session.accept(new Int16Array(1600),{capturedAt:1100,mediaTime:null})).toEqual([]);
 expect(recognizer.resets).toBe(2);
});

test('quiet browser audio is lifted for the bilingual model without clipping the analysis stream',()=>{
 const recognizer=new Recognizer(),session=new BrowserAsrSession(recognizer);
 const quiet=new Int16Array(1600).fill(328);
 session.accept(quiet,{capturedAt:1000,mediaTime:null});
 expect(recognizer.accepted[0][0]).toBeGreaterThan(.12);
 const loud=new Int16Array(1600).fill(32000);
 session.accept(loud,{capturedAt:1100,mediaTime:null});
 expect(Math.max(...recognizer.accepted[1])).toBeLessThanOrEqual(.98);
});
