import {PCMResampler} from './core';
declare const sampleRate:number;declare const currentTime:number;
declare class AudioWorkletProcessor {port:MessagePort;constructor()}
declare function registerProcessor(name:string,ctor:unknown):void;
class CaptureProcessor extends AudioWorkletProcessor {
 resampler=new PCMResampler(sampleRate);pending:number[]=[];
 process(inputs:Float32Array[][]){
  const channels=inputs[0]; if(!channels?.length)return true;
  const pcm=this.resampler.push(channels);this.pending.push(...pcm);
  while(this.pending.length>=1600){
   const packet=Int16Array.from(this.pending.splice(0,1600));
   const rms=Math.sqrt(packet.reduce((sum,x)=>sum+(x/32768)**2,0)/1600);
   this.port.postMessage({pcm:packet.buffer,rms,contextTime:currentTime+channels[0].length/sampleRate-this.pending.length/16000},[packet.buffer]);
  }return true;
 }
}
registerProcessor('capture-16k',CaptureProcessor);
