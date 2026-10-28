/** Confirm only a still-current DOM update on its next animation frame. */
export function renderAndConfirm(isVisibleAndCurrent:()=>boolean,confirm:()=>void,schedule:(callback:()=>void)=>unknown=requestAnimationFrame){
 schedule(()=>{if(isVisibleAndCurrent())confirm();});
}
