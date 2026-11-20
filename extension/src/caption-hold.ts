interface CaptionTiming {
 phase:string;sessionId:string;epoch:number;segmentId:string;engine?:string;audioEndAt?:number;
}
const preferredReadingMs=3000;
const minimumReadingMs=1500;
const renderHeadroomMs=100;

/** Keep the previous caption readable while budgeting for already late ASR output. */
export function captionHoldDelay(previous:CaptionTiming|undefined,next:CaptionTiming,finalShownAt:number,now:number):number{
 if(!previous||previous.phase!=='final'||previous.sessionId!==next.sessionId||previous.epoch!==next.epoch||previous.segmentId===next.segmentId)return 0;
 if(['page-caption','subtitle-import'].includes(next.engine??''))return 0;
 const remaining=Math.max(0,finalShownAt+preferredReadingMs-now);
 if(typeof next.audioEndAt!=='number'||!Number.isFinite(next.audioEndAt))return next.phase==='interim'?remaining:0;
 if(next.phase!=='interim'&&next.phase!=='final')return 0;
 const renderBudget=next.phase==='interim'?1500:3000;
 const readableUntil=finalShownAt+minimumReadingMs;
 return Math.min(remaining,Math.max(0,Math.max(readableUntil,next.audioEndAt+renderBudget-renderHeadroomMs)-now));
}
