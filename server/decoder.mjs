/** Native recognition state lives exclusively in the native subprocess. */
export class CaptionDecoder {
  constructor(recognizer, {silenceSamples=8000, threshold=.008, maintenanceSamples=16000*7200}={}) {
    this.recognizer=recognizer;this.stream=recognizer.createStream();
    this.silenceSamples=silenceSamples;this.threshold=threshold;this.maintenanceSamples=maintenanceSamples;
    this.active=false;this.silentSamples=0;this.totalSamples=0;
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
    const voiced=rms>=this.threshold;
    const speechStarted=voiced&&!this.active;
    this.totalSamples+=samples.length;
    if(voiced){this.active=true;this.silentSamples=0;}
    else if(this.active)this.silentSamples+=samples.length;
    let text=this.active?this.decode(samples):'';
    const final=this.active&&this.silentSamples>=this.silenceSamples;
    if(final){
      // Streaming paraformer has decoder lookahead; padding flushes that tail.
      text=this.decode(new Float32Array(6400))||text;
      this.recognizer.reset(this.stream);this.active=false;this.silentSamples=0;
    }
    const maintenance=this.totalSamples>=this.maintenanceSamples&&!this.active;
    if(maintenance){this.recognizer.reset(this.stream);this.totalSamples=0;}
    return {text,final,speechStarted,voiced,rms,maintenance,decodeMs:performance.now()-started};
  }
  reset(){
    const previous=this.stream;
    this.recognizer.reset(previous);
    this.stream=this.recognizer.createStream();
    previous.free?.();
    this.active=false;this.silentSamples=0;this.totalSamples=0;
  }
  close(){this.stream.free?.();this.recognizer.free?.();}
}
