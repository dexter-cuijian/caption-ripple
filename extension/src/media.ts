export function canSeekMedia(row:any,current:any,candidates:any[]=[]){
 if(!current||row.live||current.live||row.mediaTime===null||!Number.isFinite(row.mediaTime)||row.url!==current.url||!row.mediaUrl||row.mediaUrl!==current.mediaUrl)return false;
 if(row.videoId===current.id)return true;
 // Blob URLs and ambiguous duplicate sources cannot identify a restored player safely.
 if(!/^https?:\/\//.test(row.mediaUrl))return false;
 return candidates.filter(video=>video.url===row.url&&video.mediaUrl===row.mediaUrl).length===1;
}
/** Paired media events describe one transition; reset only when the old ASR context is invalid. */
export function captureResetReason(reason:string):string|undefined{
 return ['pause','seeking','ratechange','emptied'].includes(reason)?reason:undefined;
}
export function mediaLabel(row:any){const time=row.live?(row.start??0):row.mediaTime;if(time===null||!Number.isFinite(time))return'音频';const formatted=`${String(Math.floor(time/60)).padStart(2,'0')}:${String(Math.floor(time%60)).padStart(2,'0')}`;return row.live?`直播 +${formatted}`:formatted;}
