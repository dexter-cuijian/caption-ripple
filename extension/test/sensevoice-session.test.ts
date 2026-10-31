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
 vad.queue.push({start:0,samples:new Float32Array(8000)});session.reset();
 expect(session.accept(packet(),{capturedAt:20100,mediaTime:null})).toEqual([]);
 expect(vad.resets).toBe(1);session.close();
});
test('rejects malformed packets and closed sessions',()=>{
 const session=new SenseVoiceSession(new FakeVad(),{decode:()=>'',free(){}});
 expect(()=>session.accept(new Int16Array(4),{capturedAt:1,mediaTime:null})).toThrow('1600');
 session.close();expect(()=>session.accept(packet(),{capturedAt:1,mediaTime:null})).toThrow('closed');
});
