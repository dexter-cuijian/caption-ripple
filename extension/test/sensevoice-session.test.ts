import {test,expect} from 'vitest';
import {SenseVoiceSession,type VoiceDetector,type VoiceSegment} from '../src/sensevoice-session';

class FakeVad implements VoiceDetector{
 blocks=0;queue:VoiceSegment[]=[];resets=0;acceptWaveform(samples:Float32Array){expect(samples.length).toBe(512);this.blocks++;}
 isEmpty(){return this.queue.length===0;}front(){return this.queue[0];}pop(){this.queue.shift();}reset(){this.resets++;this.queue=[];}flush(){}free(){}
}
const packet=(value=1000)=>new Int16Array(1600).fill(value);
test('quiet speech reaches interim and final decoding while digital silence stays suppressed',()=>{
 let calls=0;const session=new SenseVoiceSession(new FakeVad(),{decode:()=>{calls++;return 'quiet words';},free(){}});
 let events=[] as ReturnType<typeof session.accept>;
 for(let n=1;n<=100;n++)events.push(...session.accept(packet(32),{capturedAt:n*100,mediaTime:n/10}));
 expect(events.map(event=>event.phase)).toEqual(['interim','final']);expect(calls).toBe(2);
 session.close();
});
test('explicit Cantonese source formats spoken numbers in emitted captions',()=>{
 const session=new SenseVoiceSession(new FakeVad(),{decode:()=> '约有四十人。',free(){}},'yue');
 let finalText='';
 for(let n=1;n<=100;n++)for(const event of session.accept(packet(1000),{capturedAt:n*100,mediaTime:n/10}))if(event.phase==='final')finalText=event.sourceText;
 expect(finalText).toBe('约有40人。');
 session.close();
});
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
 expect(lengths).toEqual([40000,160000]);expect(vad.resets).toBe(1);
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
test('keeps captured audio before the first VAD segment after a forced cut',()=>{
 const vad=new FakeVad(),decoded:Float32Array[]=[];
 const session=new SenseVoiceSession(vad,{decode:samples=>{decoded.push(samples.slice());return 'speech';},free(){}});
 for(let n=1;n<=105;n++)session.accept(packet(1000+n),{capturedAt:n*100,mediaTime:n/10},false);
 vad.queue.push({start:8000,samples:new Float32Array(1600).fill(.5)});
 const events=session.accept(packet(),{capturedAt:10600,mediaTime:10.6},false);
 expect(events).toMatchObject([{phase:'final',segmentId:'1',start:10,end:10.6}]);
 expect(decoded[1]).toHaveLength(9600);
 expect(decoded[1][0]).toBeCloseTo(1101/32768,6);
 expect(decoded[1][7999]).toBeCloseTo(1105/32768,6);
 expect(decoded[1][8000]).toBe(.5);
 vad.queue.push({start:11200,samples:new Float32Array(1600)});
 expect(session.accept(packet(),{capturedAt:10800,mediaTime:10.8},false))
  .toMatchObject([{phase:'final',segmentId:'2',start:10.7,end:10.8}]);
 expect(decoded[2]).toHaveLength(1600);
 session.close();
});

test('leaves longer gaps after a forced cut to the voice detector',()=>{
 const vad=new FakeVad(),lengths:number[]=[];
 const session=new SenseVoiceSession(vad,{decode:samples=>{lengths.push(samples.length);return 'speech';},free(){}});
 for(let n=1;n<=109;n++)session.accept(packet(),{capturedAt:n*100,mediaTime:n/10},false);
 vad.queue.push({start:14400,samples:new Float32Array(1600)});
 expect(session.accept(packet(),{capturedAt:11000,mediaTime:11},false))
  .toMatchObject([{phase:'final',start:10.9,end:11}]);
 expect(lengths).toEqual([160000,1600]);
 session.close();
});

test('does not decode or publish a forced caption for silence',()=>{
 const vad=new FakeVad();let calls=0;
 const session=new SenseVoiceSession(vad,{decode:()=>{calls++;return 'ghost';},free(){}});
 let events=[] as ReturnType<typeof session.accept>;
 for(let n=1;n<=100;n++)events.push(...session.accept(packet(0),{capturedAt:n*100,mediaTime:null}));
 expect(events).toEqual([]);expect(calls).toBe(0);expect(vad.resets).toBe(1);
 for(let n=101;n<=180;n++)events.push(...session.accept(packet(),{capturedAt:n*100,mediaTime:null}));
 expect(events.at(-1)).toMatchObject({phase:'interim',segmentId:'1',start:10,end:12.5});
 session.close();
});
test('forced finals consume consecutive audio windows without a gap or replay',()=>{
 const finals:Float32Array[]=[];
 const session=new SenseVoiceSession(new FakeVad(),{decode:samples=>{if(samples.length===160000)finals.push(samples.slice());return 'speech';},free(){}});
 for(let n=1;n<=200;n++)session.accept(packet(1000+n),{capturedAt:n*100,mediaTime:null});
 expect(finals).toHaveLength(2);
 for(let i=0;i<100;i++){
  expect(finals[0][i*1600]).toBeCloseTo((1001+i)/32768,6);
  expect(finals[1][i*1600]).toBeCloseTo((1101+i)/32768,6);
 }
 session.close();
});
test('flush finalizes a speech tail that VAD has not ended',()=>{
 const session=new SenseVoiceSession(new FakeVad(),{decode:()=> 'last words',free(){}});
 for(let n=1;n<=60;n++)session.accept(packet(),{capturedAt:n*100,mediaTime:n/10});
 expect(session.flush({capturedAt:6000,mediaTime:6})).toMatchObject([
  {phase:'final',segmentId:'0',start:0,end:6,sourceText:'last words'}
 ]);
 session.close();
});
test('keeps original words alongside restored punctuation on final events',()=>{
 const session=new SenseVoiceSession(new FakeVad(),{
  decode:()=> 'first words the next sentence',
  decodeFinal:()=>({text:'First words. The next sentence.',sourceRaw:'First words the next sentence.'}),
  free(){}
 });
 for(let n=1;n<=25;n++){
  const events=session.accept(packet(),{capturedAt:n*100,mediaTime:n/10});
  if(n===25)expect(events[0]).toMatchObject({phase:'interim',sourceText:'first words the next sentence'});
 }
 expect(session.flush({capturedAt:2500,mediaTime:2.5})).toMatchObject([
  {phase:'final',sourceText:'First words. The next sentence.',sourceRaw:'First words the next sentence.'}
 ]);
 session.close();
});
test('punctuation-only decode does not create a caption at stop',()=>{
 const session=new SenseVoiceSession(new FakeVad(),{decode:()=>'.',free(){}});
 for(let n=1;n<=20;n++)session.accept(packet(),{capturedAt:n*100,mediaTime:n/10});
 expect(session.flush({capturedAt:2000,mediaTime:2})).toEqual([]);
 session.close();
});
test('labels auto Japanese and Korean speech and honors an explicit Cantonese source',()=>{
 const vad=new FakeVad();let text='日本語です';
 const session=new SenseVoiceSession(vad,{decode:()=>text,free(){}});
 for(let n=1;n<=100;n++){
  const events=session.accept(packet(),{capturedAt:n*100,mediaTime:null});
  if(n===100)expect(events.at(-1)?.sourceLanguage).toBe('ja');
 }
 session.reset();text='한국어입니다';
 for(let n=1;n<=100;n++){
  const events=session.accept(packet(),{capturedAt:n*100,mediaTime:null});
  if(n===100)expect(events.at(-1)?.sourceLanguage).toBe('ko');
 }
 session.reset('yue');text='大家好';
 for(let n=1;n<=100;n++){
  const events=session.accept(packet(),{capturedAt:n*100,mediaTime:null});
  if(n===100)expect(events.at(-1)?.sourceLanguage).toBe('yue');
 }
 session.close();
});

test('a late VAD final uses the current packet clock after a delivery gap',()=>{
 const vad=new FakeVad();
 const session=new SenseVoiceSession(vad,{decode:()=> 'speech',free(){}});
 session.accept(packet(),{capturedAt:100,mediaTime:0.1});
 session.accept(packet(),{capturedAt:1200,mediaTime:1.2});
 vad.queue.push({start:1600,samples:new Float32Array(1600)});
 const events=session.accept(packet(),{capturedAt:1300,mediaTime:1.3});
 expect(events).toMatchObject([{phase:'final',speechStartAt:1100,audioEndAt:1200}]);
 session.close();
});

test('flushing a voiced tail keeps its last capture time, not the stop command time',()=>{
 const session=new SenseVoiceSession(new FakeVad(),{decode:()=> 'last words',free(){}});
 session.accept(packet(),{capturedAt:200,mediaTime:0.1});
 session.accept(packet(),{capturedAt:1300,mediaTime:1.2});
 expect(session.flush({capturedAt:2000,mediaTime:1.2})).toMatchObject([
  {phase:'final',audioEndAt:1300}
 ]);
 session.close();
});

test('publishes the first draft at 2.5 seconds without repeatedly decoding the growing utterance',()=>{
 const lengths:number[]=[];
 const session=new SenseVoiceSession(new FakeVad(),{decode:samples=>{lengths.push(samples.length);return 'words';},free(){}});
 for(let n=1;n<25;n++)expect(session.accept(packet(),{capturedAt:n*100,mediaTime:n/10})).toEqual([]);
 expect(session.accept(packet(),{capturedAt:2500,mediaTime:2.5})).toMatchObject([{phase:'interim',end:2.5}]);
 for(let n=26;n<100;n++)session.accept(packet(),{capturedAt:n*100,mediaTime:n/10});
 expect(lengths).toEqual([40000]);
 session.close();
});
test('retries an empty early draft at the previous five-second boundary',()=>{
 const lengths:number[]=[];
 const session=new SenseVoiceSession(new FakeVad(),{decode:samples=>{lengths.push(samples.length);return samples.length===40000?'':'words';},free(){}});
 for(let n=1;n<50;n++)expect(session.accept(packet(),{capturedAt:n*100,mediaTime:n/10})).toEqual([]);
 expect(session.accept(packet(),{capturedAt:5000,mediaTime:5})).toMatchObject([{phase:'interim',end:5}]);
 expect(lengths).toEqual([40000,80000]);
 session.close();
});
test('bounds later provisional decodes to 4.2 seconds and keeps the final window intact',()=>{
 const lengths:number[]=[];
 const session=new SenseVoiceSession(new FakeVad(),{decode:samples=>{lengths.push(samples.length);return 'words';},free(){}});
 for(let n=1;n<142;n++)session.accept(packet(),{capturedAt:n*100,mediaTime:n/10});
 expect(session.accept(packet(),{capturedAt:14200,mediaTime:14.2})).toMatchObject([{phase:'interim',start:10,end:14.2}]);
 for(let n=143;n<=200;n++)session.accept(packet(),{capturedAt:n*100,mediaTime:n/10});
 expect(lengths).toEqual([40000,160000,67200,160000]);
 session.reset();
 for(let n=1;n<=25;n++)session.accept(packet(),{capturedAt:n*100,mediaTime:n/10});
 expect(lengths.at(-1)).toBe(40000);
 session.close();
});

test('drops provisional decoding when audio packets are already queued but still finalizes',()=>{
 const lengths:number[]=[];
 const session=new SenseVoiceSession(new FakeVad(),{decode:samples=>{lengths.push(samples.length);return 'speech';},free(){}});
 for(let n=1;n<100;n++)expect(session.accept(packet(),{capturedAt:n*100,mediaTime:n/10},false)).toEqual([]);
 expect(session.accept(packet(),{capturedAt:10000,mediaTime:10},false)).toMatchObject([{phase:'final',splitReason:'max-duration'}]);
 expect(lengths).toEqual([160000]);
 session.close();
});
