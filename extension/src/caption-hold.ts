/** Keep a completed ASR line readable briefly while the next interim grows. */
export function captionHoldDelay(previous:{phase:string;sessionId:string;epoch:number;segmentId:string}|undefined,next:{phase:string;sessionId:string;epoch:number;segmentId:string},finalShownAt:number,now:number):number{
 if(!previous||previous.phase!=='final'||next.phase!=='interim'||previous.sessionId!==next.sessionId||previous.epoch!==next.epoch||previous.segmentId===next.segmentId)return 0;
 return Math.max(0,3000-(now-finalShownAt));
}
