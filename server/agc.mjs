/** Packet-causal ASR-only gain. Uses current <=100ms frame, never future packets. */
export class CausalAgc {
  constructor({targetRms=.05,minGain=.05,maxGain=256,noiseFloor=.00002,peakLimit=.98,attackSeconds=.02,releaseSeconds=.5,sampleRate=16000}={}){
    if(!(targetRms>0&&targetRms<1&&minGain>0&&maxGain>=minGain&&noiseFloor>=0&&peakLimit>0&&peakLimit<=1&&attackSeconds>0&&releaseSeconds>0))throw new Error('Invalid causal AGC parameters');
    Object.assign(this,{targetRms,minGain,maxGain,noiseFloor,peakLimit,attackSeconds,releaseSeconds,sampleRate});this.reset();
  }
  reset(){this.gain=1;this.initialized=false;}
  process(samples){
    let power=0,peak=0;for(const value of samples){power+=value*value;peak=Math.max(peak,Math.abs(value));}
    const rms=Math.sqrt(power/Math.max(1,samples.length));
    if(rms<=this.noiseFloor||!samples.length)return Float32Array.from(samples);
    const desired=Math.max(this.minGain,Math.min(this.maxGain,this.targetRms/rms,this.peakLimit/peak));
    if(!this.initialized){this.gain=desired;this.initialized=true;}
    else{
      const seconds=samples.length/this.sampleRate,tau=desired<this.gain?this.attackSeconds:this.releaseSeconds;
      this.gain+=(desired-this.gain)*(1-Math.exp(-seconds/tau));
    }
    this.gain=Math.max(this.minGain,Math.min(this.maxGain,this.gain,this.peakLimit/peak));
    const output=new Float32Array(samples.length);
    for(let i=0;i<samples.length;i++)output[i]=Math.max(-this.peakLimit,Math.min(this.peakLimit,samples[i]*this.gain));
    return output;
  }
}
