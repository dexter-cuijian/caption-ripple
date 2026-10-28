import {CausalAgc} from './agc.mjs';

/** Native recognition state lives exclusively in the native subprocess. */
export class CaptionDecoder {
  constructor(recognizer, {silenceSamples=8000, threshold=.008, maintenanceSamples=16000*7200,maxSegmentSeconds=Infinity,maxTextLength=Infinity,maxLatinTextLength=Infinity,tailPaddingSamples=6400,agc=false}={}) {
    this.agc=agc?new CausalAgc(agc===true?{}:agc):null;
    this.recognizer=recognizer;this.stream=recognizer.createStream();
    this.silenceSamples=silenceSamples;this.threshold=threshold;this.maintenanceSamples=maintenanceSamples;
    this.active=false;this.silentSamples=0;this.totalSamples=0;this.segmentSamples=0;
    this.maxSegmentSamples=maxSegmentSeconds*16000;this.maxTextLength=maxTextLength;this.maxLatinTextLength=maxLatinTextLength;this.tailPaddingSamples=tailPaddingSamples;
  }
  decode(samples) {
    this.stream.acceptWaveform({sampleRate:16000,samples});
    while(this.recognizer.isReady(this.stream))this.recognizer.decode(this.stream);
    return this.recognizer.getResult(this.stream).text?.trim()??'';
  }
  accept(samples) {
    const started=performance.now();
    let power=0;for(const value of samples)power+=value*value;
    const rms=Math.sqrt(power/Math.max(1,samples.length));
    const normalized=this.agc?this.agc.process(samples):samples;
    let normalizedPower=0;if(this.agc)for(const value of normalized)normalizedPower+=value*value;
    const normalizedRms=this.agc?Math.sqrt(normalizedPower/Math.max(1,normalized.length)):rms;
    const voiced=normalizedRms>=this.threshold;
    const speechStarted=voiced&&!this.active;
    this.totalSamples+=samples.length;
    if(voiced){this.active=true;this.silentSamples=0;}
    else if(this.active)this.silentSamples+=samples.length;
    if(this.active)this.segmentSamples+=samples.length;
    let text=this.active?this.decode(normalized):'';
    const textLimit=/\p{Script=Han}/u.test(text)?this.maxTextLength:this.maxLatinTextLength;
    const splitReason=!this.active?null:this.silentSamples>=this.silenceSamples?'silence':this.segmentSamples>=this.maxSegmentSamples?'duration':Array.from(text).length>=textLimit?'length':null;
    const final=splitReason!==null;
    if(final){
      // Streaming paraformer has decoder lookahead; padding flushes that tail.
      text=this.decode(new Float32Array(this.tailPaddingSamples))||text;
      this.resetStream();
    }
    const maintenance=this.totalSamples>=this.maintenanceSamples&&!this.active;
    if(maintenance){this.recognizer.reset(this.stream);this.totalSamples=0;}
    return {text,final,splitReason,speechStarted,voiced,rms,normalizedRms,agcGain:this.agc?.gain??1,maintenance,decodeMs:performance.now()-started};
  }
  resetStream(){
    const previous=this.stream;
    this.recognizer.reset(previous);
    this.stream=this.recognizer.createStream();
    previous.free?.();
    this.active=false;this.silentSamples=0;this.segmentSamples=0;
  }
  reset(){this.resetStream();this.totalSamples=0;this.agc?.reset();}
  close(){this.stream.free?.();this.recognizer.free?.();}
}
