/** Confirm only a still-current DOM update on its next animation frame. */
export function renderAndConfirm(isVisibleAndCurrent:()=>boolean,confirm:()=>void,schedule:(callback:()=>void)=>unknown=requestAnimationFrame){
 schedule(()=>{if(isVisibleAndCurrent())confirm();});
}
export function overlayVisible(nativeVideoFullscreen:boolean,bounds:{left:number;top:number;right:number;bottom:number},width:number,height:number){
 return !nativeVideoFullscreen&&bounds.right>bounds.left&&bounds.bottom>bounds.top&&bounds.right>0&&bounds.bottom>0&&bounds.left<width&&bounds.top<height;
}
export function translationMatches(source:any,translation:any,lastTranslationRevision=0){return !!source&&source.sessionId===translation.sessionId&&source.epoch===translation.epoch&&source.segmentId===translation.segmentId&&source.revision===translation.sourceRevision&&(translation.translationRevision??1)>lastTranslationRevision;}
