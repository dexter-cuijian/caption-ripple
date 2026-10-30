/** History is grouped by the visible page; a frame URL is retained for safe seeking. */
export function pageMediaMetadata(pageUrl:string|undefined,pageTitle:string|undefined,media:any){
 return{url:pageUrl||media?.url||'',title:pageTitle||media?.title||'',frameUrl:media?.url,videoId:media?.id,mediaUrl:media?.mediaUrl,documentId:media?.documentId,live:media?.live};
}
export function canSeekMedia(row:any,current:any,candidates:any[]=[],pageUrl?:string){
 if(!current||row.live||current.live||row.mediaTime===null||!Number.isFinite(row.mediaTime)||row.frameUrl&&row.url!==pageUrl||(row.frameUrl||row.url)!==current.url||!row.mediaUrl||row.mediaUrl!==current.mediaUrl)return false;
 if(row.videoId===current.id)return true;
 // Blob URLs and ambiguous duplicate sources cannot identify a restored player safely.
 if(!/^https?:\/\//.test(row.mediaUrl))return false;
 return candidates.filter(video=>video.url===(row.frameUrl||row.url)&&video.mediaUrl===row.mediaUrl).length===1;
}
/** Paired media events describe one transition; reset only when the old ASR context is invalid. */
export function captureResetReason(reason:string):string|undefined{
 return ['pause','seeking','ratechange','emptied'].includes(reason)?reason:undefined;
}
/** Pausing leaves the last caption visible so viewers can finish reading it. */
export function retainCaptionOnReset(reason:string):boolean{return reason==='pause';}
export function mediaLabel(row:any){const time=row.live?(row.start??0):row.mediaTime;if(time===null||!Number.isFinite(time))return'音频';const safe=Math.max(0,time);const formatted=`${String(Math.floor(safe/60)).padStart(2,'0')}:${String(Math.floor(safe%60)).padStart(2,'0')}`;return row.live?`直播 +${formatted}`:formatted;}
