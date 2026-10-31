import {test,expect} from 'vitest';
import {SenseVoiceSession,type VoiceDetector,type VoiceSegment} from '../src/sensevoice-session';

class FakeVad implements VoiceDetector{
 blocks=0;queue:VoiceSegment[]=[];resets=0;acceptWaveform(samples:Float32Array){expect(samples.length).toBe(512);this.blocks++;}
 isEmpty(){return this.queue.length===0;}front(){return this.queue[0];}pop(){this.queue.shift();}reset(){this.resets++;this.queue=[];}flush(){}free(){}
}
const packet=(value=1000)=>new Int16Array(1600).fill(value);
test('feeds 100 ms PCM in exact VAD windows and emits a revisable interim',()=>{
 const vad=new FakeVad();let calls=0;const session=new SenseVoiceSession(vad,{decode:()=>`words ${++calls}`,free(){}});
 let events=[] as ReturnType<typeof session.accept>;
 for(let n=1;n<=50;n++)events.push(...session.accept(packet(),{capturedAt:n*100,mediaTime:n/10}));
 expect(vad.blocks).toBe(156);expect(events).toMatchObject([{phase:'interim',segmentId:'0',revision:1,sourceText:'words 1'}]);
 vad.queue.push({start:0,samples:new Float32Array(64000)});
 events=session.accept(packet(),{capturedAt:5100,mediaTime:5.1});
 expect(events).toMatchObject([{phase:'final',segmentId:'0',revision:2,sourceText:'words 2'}]);
 session.close();
});
test('bounds the provisional buffer and clears stale VAD events on reset',()=>{
 const vad=new FakeVad();let max=0;const session=new SenseVoiceSession(vad,{decode:samples=>{max=Math.max(max,samples.length);return 'speech';},free(){}});
 for(let n=1;n<=200;n++)session.accept(packet(),{capturedAt:n*100,mediaTime:null});
 expect(max).toBeLessThanOrEqual(240000);
 vad.queue.push({start:0,samples:new Float32Array(8000)});const before=vad.resets;session.reset();
 expect(session.accept(packet(),{capturedAt:20100,mediaTime:null})).toEqual([]);
 expect(vad.resets).toBe(before+1);session.close();
});
test('rejects malformed packets and closed sessions',()=>{
 const session=new SenseVoiceSession(new FakeVad(),{decode:()=>'',free(){}});
 expect(()=>session.accept(new Int16Array(4),{capturedAt:1,mediaTime:null})).toThrow('1600');
 session.close();expect(()=>session.accept(packet(),{capturedAt:1,mediaTime:null})).toThrow('closed');
});
test('forces a final at 10 seconds of continuous speech and starts a fresh VAD segment',()=>{
 const vad=new FakeVad();const lengths:number[]=[];
 const session=new SenseVoiceSession(vad,{decode:samples=>{lengths.push(samples.length);return 'speech';},free(){}});
 let events=[] as ReturnType<typeof session.accept>;
 for(let n=1;n<=100;n++)events.push(...session.accept(packet(),{capturedAt:n*100,mediaTime:n/10}));
 expect(events.map(event=>event.phase)).toEqual(['interim','final']);
 expect(events.at(-1)).toMatchObject({segmentId:'0',end:10,sourceText:'speech'});
 expect(lengths).toEqual([80000,160000]);expect(vad.resets).toBe(1);
 events=[];for(let n=101;n<=200;n++)events.push(...session.accept(packet(),{capturedAt:n*100,mediaTime:n/10}));
 expect(events.at(-1)).toMatchObject({phase:'final',segmentId:'1',start:10,end:20});
 session.close();
});
test('maps VAD segment times to the global capture clock after a forced split',()=>{
 const vad=new FakeVad(),session=new SenseVoiceSession(vad,{decode:()=> 'speech',free(){}});
 for(let n=1;n<=100;n++)session.accept(packet(),{capturedAt:n*100,mediaTime:n/10});
 vad.queue.push({start:0,samples:new Float32Array(8000)});
 const events=session.accept(packet(),{capturedAt:10100,mediaTime:10.1});
 expect(events).toMatchObject([{phase:'final',segmentId:'1',start:10,end:10.5}]);
 session.close();
});
test('does not decode or publish a forced caption for silence',()=>{
 const vad=new FakeVad();let calls=0;
 const session=new SenseVoiceSession(vad,{decode:()=>{calls++;return 'ghost';},free(){}});
 let events=[] as ReturnType<typeof session.accept>;
 for(let n=1;n<=100;n++)events.push(...session.accept(packet(0),{capturedAt:n*100,mediaTime:null}));
 expect(events).toEqual([]);expect(calls).toBe(0);expect(vad.resets).toBe(1);
 for(let n=101;n<=180;n++)events.push(...session.accept(packet(),{capturedAt:n*100,mediaTime:null}));
 expect(events.at(-1)).toMatchObject({phase:'interim',segmentId:'1',start:10,end:15});
 session.close();
});
