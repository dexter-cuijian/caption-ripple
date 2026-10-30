/** Anchor each capture epoch to wall time when its first packet arrives.
 * AudioContext time can stop during tab navigation while Date.now keeps moving.
 */
export function captureAnchor(now:number,packetSamples:number,sampleRate:number){
 return now-packetSamples/sampleRate*1000;
}

export function capturedAt(anchor:number,sampleEnd:number,sampleRate:number){
 return anchor+sampleEnd/sampleRate*1000;
}

export function mediaTimeAt(video:{currentTime:number|null;observedAt:number;playbackRate:number}|undefined,packetAt:number){
 if(video?.currentTime==null)return null;
 const projected=video.currentTime+(packetAt-video.observedAt)/1000*video.playbackRate;
 return Number.isFinite(projected)?Math.max(0,projected):null;
}
