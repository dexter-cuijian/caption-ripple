import type {AsrClock,AsrEvent} from './browser-asr';
import {normalizeChineseNumerals} from './chinese-numerals';

export interface VoiceSegment{start:number;samples:Float32Array}
export interface VoiceDetector{acceptWaveform(samples:Float32Array):void;isEmpty():boolean;front():VoiceSegment;pop():void;reset():void;flush():void;free():void}
export interface OfflineDecoder{decode(samples:Float32Array):string;free():void}
const detectedLanguage=(text:string)=>/[\uac00-\ud7af\u1100-\u11ff]/u.test(text)?'ko':/[\u3040-\u30ff]/u.test(text)?'ja':/[\u3400-\u9fff]/u.test(text)?'zh':'en';
const meaningful=(text:string)=>/[\p{L}\p{N}]/u.test(text);
const minVoiceRms=.0003;
const draftSamples=40_000;
const finalSamples=160_000;
const vadSamples=512;

/** Keeps a bounded interim window while the VAD owns final utterance boundaries. */
export class SenseVoiceSession{
 private sample=0;private packetEndAt:number|null=null;private segment=0;private revision=0;private last='';private lastFinalSample=0;private vadOriginSample=0;
 private readonly vadWindow=new Float32Array(vadSamples);
 private vadOffset=0;
 private readonly window=new Float32Array(finalSamples);
 private windowSamples=0;private windowPower=0;private draftAttempts=0;private hasCaption=false;private closed=false;
 constructor(private vad:VoiceDetector,private recognizer:OfflineDecoder,private sourceLanguage='auto'){}
 private event(phase:'interim'|'final',text:string,startSample:number,endSample:number,clock:AsrClock):AsrEvent{
  if(this.sourceLanguage==='zh'||this.sourceLanguage==='yue')text=normalizeChineseNumerals(text);
  this.revision++;this.last=text;this.hasCaption=true;
  const packetEndAt=this.packetEndAt??clock.capturedAt;
  return{phase,segmentId:String(this.segment),revision:this.revision,sourceText:text,sourceLanguage:this.sourceLanguage==='auto'?detectedLanguage(text):this.sourceLanguage,start:Math.max(0,startSample/16000),end:Math.max(0,endSample/16000),mediaTime:clock.mediaTime,createdAt:Date.now(),speechStartAt:packetEndAt-(this.sample-startSample)/16,audioEndAt:packetEndAt-(this.sample-endSample)/16,engine:'sherpa-onnx/wasm-sensevoice-small-int8'};
 }
 private clearWindow(){
  this.windowSamples=0;this.windowPower=0;this.draftAttempts=0;
 }
 private decodeWindow(){
  if(!this.windowSamples||Math.sqrt(this.windowPower/this.windowSamples)<=minVoiceRms)return '';
  return this.recognizer.decode(this.window.subarray(0,this.windowSamples)).trim();
 }
 private drain(clock:AsrClock){
  const events:AsrEvent[]=[];
  while(!this.vad.isEmpty()){
   const segment=this.vad.front();
   const text=this.recognizer.decode(segment.samples).trim();
   const start=this.vadOriginSample+segment.start,end=start+segment.samples.length;
   if(meaningful(text))events.push(this.event('final',text,start,end,clock));
   this.vad.pop();this.segment++;this.revision=0;this.last='';
   this.lastFinalSample=end;
   this.clearWindow();
  }
  return events;
 }
 accept(pcm:Int16Array,clock:AsrClock,allowDraft=true):AsrEvent[]{
  if(this.closed)throw new Error('SenseVoice session closed');
  if(pcm.length!==1600)throw new Error(`Expected 100 ms / 1600 samples, got ${pcm.length}`);
  this.packetEndAt=clock.capturedAt;
  for(let index=0;index<pcm.length;index++){
   const sample=pcm[index]/32768;
   this.window[this.windowSamples++]=sample;
   this.windowPower+=sample*sample;
  }
  const packet=this.window.subarray(this.windowSamples-pcm.length,this.windowSamples);
  let offset=0;
  while(offset<packet.length){
   const count=Math.min(vadSamples-this.vadOffset,packet.length-offset);
   this.vadWindow.set(packet.subarray(offset,offset+count),this.vadOffset);
   this.vadOffset+=count;offset+=count;
   if(this.vadOffset===vadSamples){
    this.vad.acceptWaveform(this.vadWindow);
    this.vadOffset=0;
   }
  }
  this.sample+=pcm.length;
  const events=this.drain(clock);
  if(this.sample-this.lastFinalSample>=finalSamples){
   const text=this.decodeWindow();
   if(meaningful(text))events.push({...this.event('final',text,this.sample-this.windowSamples,this.sample,clock),splitReason:'max-duration'});
   this.vad.reset();this.vadOriginSample=this.sample;this.vadOffset=0;
   this.clearWindow();this.lastFinalSample=this.sample;this.segment++;this.revision=0;this.last='';
   return events;
  }
  // Earlier drafts only help before the first caption; later ones can sit behind the previous final.
  const draftWindow=this.hasCaption?2*draftSamples:draftSamples*(this.draftAttempts+1);
  const maxAttempts=this.hasCaption?1:2;
  if(allowDraft&&!this.last&&this.draftAttempts<maxAttempts&&this.windowSamples>=draftWindow){
   this.draftAttempts++;
   const text=this.decodeWindow();
   if(meaningful(text))events.push(this.event('interim',text,this.sample-this.windowSamples,this.sample,clock));
  }
  return events;
 }
 flush(clock:AsrClock){
  this.vad.flush();const events=this.drain(clock);
  if(!events.length){
   const text=this.decodeWindow();
   if(meaningful(text))events.push(this.event('final',text,this.sample-this.windowSamples,this.sample,clock));
  }
  this.clearWindow();return events;
 }
 reset(sourceLanguage='auto'){
  this.vad.reset();this.sourceLanguage=sourceLanguage;this.sample=0;this.packetEndAt=null;this.segment++;
  this.revision=0;this.last='';this.hasCaption=false;this.lastFinalSample=0;this.vadOriginSample=0;this.vadOffset=0;this.clearWindow();
 }
 close(){if(this.closed)return;this.closed=true;this.vad.free();this.recognizer.free();}
}
