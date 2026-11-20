/** Anchor each capture epoch to wall time when its first packet arrives.
 * AudioContext time can stop during tab navigation while Date.now keeps moving.
 */
export function captureAnchor(now:number,packetSamples:number,sampleRate:number){
 return now-packetSamples/sampleRate*1000;
}

export function capturedAt(anchor:number,sampleEnd:number,sampleRate:number){
 return anchor+sampleEnd/sampleRate*1000;
}

/** Timestamp a delivered packet in the live AudioContext clock, including any capture gaps. */
export function workletPacketAt(now:number,contextTime:number,packetContextTime:number){
 if(!Number.isFinite(contextTime)||!Number.isFinite(packetContextTime)||packetContextTime<0)return null;
 const ageMs=(contextTime-packetContextTime)*1000;
 // The clocks may differ by a few render quanta when the message arrives.
 if(ageMs< -40)return null;
 return now-Math.max(0,Math.round(ageMs));
}

export function mediaTimeAt(video:{currentTime:number|null;observedAt:number;playbackRate:number}|undefined,packetAt:number){
 if(video?.currentTime==null)return null;
 const projected=video.currentTime+(packetAt-video.observedAt)/1000*video.playbackRate;
 return Number.isFinite(projected)?Math.max(0,projected):null;
}
