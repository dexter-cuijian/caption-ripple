import type {AsrClock,AsrEvent} from './browser-asr';
import {normalizeChineseNumerals} from './chinese-numerals';

export interface VoiceSegment{start:number;samples:Float32Array}
export interface VoiceDetector{acceptWaveform(samples:Float32Array):void;isEmpty():boolean;front():VoiceSegment;pop():void;reset():void;flush():void;free():void}
export interface OfflineDecoder{decode(samples:Float32Array):string;free():void}
const detectedLanguage=(text:string)=>/[\uac00-\ud7af\u1100-\u11ff]/u.test(text)?'ko':/[\u3040-\u30ff]/u.test(text)?'ja':/[\u3400-\u9fff]/u.test(text)?'zh':'en';
const meaningful=(text:string)=>/[\p{L}\p{N}]/u.test(text);
const minVoiceRms=.0003;

/** Keeps a bounded interim window while the VAD owns final utterance boundaries. */
export class SenseVoiceSession{
 private sample=0;private origin:number|null=null;private segment=0;private revision=0;private last='';private lastFinalSample=0;private lastInterimSample=0;private vadOriginSample=0;
 private pending=new Float32Array(0);private window:Float32Array[]=[];private windowSamples=0;private closed=false;
 constructor(private vad:VoiceDetector,private recognizer:OfflineDecoder,private sourceLanguage='auto'){}
 private event(phase:'interim'|'final',text:string,startSample:number,endSample:number,clock:AsrClock):AsrEvent{
  if(this.sourceLanguage==='zh'||this.sourceLanguage==='yue')text=normalizeChineseNumerals(text);
  this.revision++;this.last=text;
  const origin=this.origin??clock.capturedAt;
  return{phase,segmentId:String(this.segment),revision:this.revision,sourceText:text,sourceLanguage:this.sourceLanguage==='auto'?detectedLanguage(text):this.sourceLanguage,start:Math.max(0,startSample/16000),end:Math.max(0,endSample/16000),mediaTime:clock.mediaTime,createdAt:Date.now(),speechStartAt:origin+startSample/16,audioEndAt:origin+endSample/16,engine:'sherpa-onnx/wasm-sensevoice-small-int8'};
 }
 private drain(clock:AsrClock){
  const events:AsrEvent[]=[];
  while(!this.vad.isEmpty()){
   const segment=this.vad.front();
   const text=this.recognizer.decode(segment.samples).trim();
   const start=this.vadOriginSample+segment.start,end=start+segment.samples.length;
   if(meaningful(text))events.push(this.event('final',text,start,end,clock));
   this.vad.pop();this.segment++;this.revision=0;this.last='';
   this.lastFinalSample=end;this.lastInterimSample=this.sample;
   this.window=[];this.windowSamples=0;
  }
  return events;
 }
 accept(pcm:Int16Array,clock:AsrClock):AsrEvent[]{
  if(this.closed)throw new Error('SenseVoice session closed');
  if(pcm.length!==1600)throw new Error(`Expected 100 ms / 1600 samples, got ${pcm.length}`);
  this.origin??=clock.capturedAt-(this.sample+pcm.length)/16;
  const samples=Float32Array.from(pcm,value=>value/32768);
  this.sample+=samples.length;this.window.push(samples);this.windowSamples+=samples.length;
  while(this.windowSamples>240000){this.windowSamples-=this.window.shift()!.length;}
  const combined=new Float32Array(this.pending.length+samples.length);combined.set(this.pending);combined.set(samples,this.pending.length);
  let offset=0;while(offset+512<=combined.length){this.vad.acceptWaveform(combined.subarray(offset,offset+512));offset+=512;}
  this.pending=combined.slice(offset);
  const events=this.drain(clock);
  const sinceFinal=this.sample-this.lastFinalSample;
  if(sinceFinal>=160000){
   const window=new Float32Array(this.windowSamples);let at=0,power=0;
   for(const block of this.window){window.set(block,at);at+=block.length;for(const value of block)power+=value*value;}
   if(Math.sqrt(power/Math.max(1,window.length))>minVoiceRms){const text=this.recognizer.decode(window).trim();if(meaningful(text))events.push(this.event('final',text,this.sample-window.length,this.sample,clock));}
   this.vad.reset();this.vadOriginSample=this.sample;this.pending=new Float32Array(0);this.window=[];this.windowSamples=0;
   this.lastFinalSample=this.sample;this.lastInterimSample=this.sample;this.segment++;this.revision=0;this.last='';
   return events;
  }
  if(sinceFinal>=80000&&sinceFinal<240000&&this.sample-this.lastInterimSample>=80000){
   const window=new Float32Array(this.windowSamples);let at=0,power=0;
   for(const block of this.window){window.set(block,at);at+=block.length;for(const value of block)power+=value*value;}
   this.lastInterimSample=this.sample;
   if(Math.sqrt(power/Math.max(1,window.length))>minVoiceRms){
    const text=this.recognizer.decode(window).trim();
    if(meaningful(text)&&text!==this.last)events.push(this.event('interim',text,this.sample-window.length,this.sample,clock));
   }
  }
  return events;
 }
 flush(clock:AsrClock){
  this.vad.flush();const events=this.drain(clock);
  if(!events.length&&this.windowSamples){
   const window=new Float32Array(this.windowSamples);let at=0,power=0;
   for(const block of this.window){window.set(block,at);at+=block.length;for(const value of block)power+=value*value;}
   if(Math.sqrt(power/window.length)>minVoiceRms){const text=this.recognizer.decode(window).trim();if(meaningful(text))events.push(this.event('final',text,this.sample-window.length,this.sample,clock));}
  }
  this.window=[];this.windowSamples=0;return events;
 }
 reset(sourceLanguage='auto'){this.vad.reset();this.sourceLanguage=sourceLanguage;this.sample=0;this.origin=null;this.segment++;this.revision=0;this.last='';this.lastFinalSample=0;this.lastInterimSample=0;this.vadOriginSample=0;this.pending=new Float32Array(0);this.window=[];this.windowSamples=0;}
 close(){if(this.closed)return;this.closed=true;this.vad.free();this.recognizer.free();}
}
