interface Stream{acceptWaveform(rate:number,samples:Float32Array):void;free():void}
interface Recognizer{createStream():Stream;isReady(stream:Stream):boolean;decode(stream:Stream):void;getResult(stream:Stream):{text:string};isEndpoint(stream:Stream):boolean;reset(stream:Stream):void;free?():void}
export interface AsrClock{capturedAt:number;mediaTime:number|null}
export interface AsrEvent{phase:'interim'|'final';segmentId:string;revision:number;sourceText:string;sourceLanguage:string;start:number;end:number;mediaTime:number|null;createdAt:number;speechStartAt:number|null;audioEndAt:number;engine:string}

/** One recognizer stream per capture epoch; only the analysis samples are amplified. */
export class BrowserAsrSession {
 private stream:Stream;private gain=1;private gainReady=false;private segment=0;private revision=0;private last='';private speechStart:number|null=null;private origin:number|null=null;
 constructor(private recognizer:Recognizer){this.stream=recognizer.createStream();}
 private normalize(pcm:Int16Array){
  const samples=new Float32Array(pcm.length);let power=0,peak=0;
  for(let index=0;index<pcm.length;index++){const value=pcm[index]/32768;samples[index]=value;power+=value*value;peak=Math.max(peak,Math.abs(value));}
  const rms=Math.sqrt(power/Math.max(1,samples.length));if(rms<=.00002||!samples.length)return samples;
  const desired=Math.max(.05,Math.min(256,.16/rms,.98/peak));
  if(!this.gainReady){this.gain=desired;this.gainReady=true;}else{const tau=desired<this.gain ? .02 : .5;this.gain+=(desired-this.gain)*(1-Math.exp(-samples.length/16000/tau));}
  this.gain=Math.max(.05,Math.min(256,this.gain,.98/peak));
  for(let index=0;index<samples.length;index++)samples[index]=Math.max(-.98,Math.min(.98,samples[index]*this.gain));
  return samples;
 }
 accept(pcm:Int16Array,clock:AsrClock):AsrEvent[]{
  this.origin??=clock.capturedAt-pcm.length/16;
  this.stream.acceptWaveform(16000,this.normalize(pcm));let decoded=0;
  while(this.recognizer.isReady(this.stream)){this.recognizer.decode(this.stream);if(++decoded>200)throw new Error('WASM decoder did not drain');}
  const text=this.recognizer.getResult(this.stream).text.trim(),events:AsrEvent[]=[];
  const make=(phase:'interim'|'final'):AsrEvent=>({phase,segmentId:String(this.segment),revision:this.revision,sourceText:this.last,sourceLanguage:'auto',start:Math.max(0,((this.speechStart??clock.capturedAt)-(this.origin??clock.capturedAt))/1000),end:Math.max(0,(clock.capturedAt-(this.origin??clock.capturedAt))/1000),mediaTime:clock.mediaTime,createdAt:Date.now(),speechStartAt:this.speechStart,audioEndAt:clock.capturedAt,engine:'sherpa-onnx/wasm-zipformer-zh-en'});
  if(text&&text!==this.last){this.last=text;this.speechStart??=clock.capturedAt-pcm.length/16;this.revision++;events.push(make('interim'));}
  if(this.recognizer.isEndpoint(this.stream)){
   if(this.last){this.revision++;events.push(make('final'));this.segment++;}
   this.recognizer.reset(this.stream);this.last='';this.revision=0;this.speechStart=null;
  }
  return events;
 }
 reset(){this.recognizer.reset(this.stream);this.last='';this.revision=0;this.speechStart=null;this.origin=null;this.gain=1;this.gainReady=false;this.segment++;}
 close(){this.stream.free();this.recognizer.free?.();}
}
