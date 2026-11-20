export const showingCaptionTrack=(track:TextTrack)=>track.mode==='showing'&&['subtitles','captions'].includes(track.kind);

export function visibleTrackCaption(tracks:Iterable<TextTrack>){
 for(const track of tracks){
  if(!showingCaptionTrack(track))continue;
  const cues=Array.from(track.activeCues??[]);
  const text=cues.map(cue=>(cue as VTTCue).text??'').join(' ').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim();
  if(text)return {text,language:track.language||undefined,track};
 }
 return null;
}

export function visibleCaptionText(nodes:Iterable<Element>):string{
 return Array.from(nodes)
  .filter(node=>node.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))
  .map(node=>node.textContent?.trim()??'')
  .filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
}

/** YouTube's live captions often extend the same line one word at a time. */
export class PageCaptionRevisions {
 private text='';private merged='';private changedAt=0;private startedAt=0;private serial=0;private revision=0;
 private rollingOverlap(next:string){
  const previousWords=this.text.trim().split(/\s+/u),nextWords=next.trim().split(/\s+/u);
  const normalize=(word:string)=>word.toLocaleLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu,'');
  for(let count=Math.min(previousWords.length,nextWords.length);count>=4;count--){
   const suffix=previousWords.slice(-count).map(normalize),prefix=nextWords.slice(0,count).map(normalize);
   if(suffix.join(' ').length>=18&&suffix.every((word,index)=>word&&word===prefix[index]))return nextWords.slice(count).join(' ');
  }
  return null;
 }
 observe(text:string,now:number){
  if(text!==this.text){
   const withinWindow=this.text&&now-this.changedAt<=6000&&now-this.startedAt<=6000;
   const overlap=withinWindow?this.rollingOverlap(text):null;
   if(withinWindow&&text.startsWith(this.text)){this.merged+=text.slice(this.text.length);this.revision++;}
   else if(overlap!==null){this.merged+=(overlap?' '+overlap:'');this.revision++;}
   else{this.serial++;this.revision=1;this.merged=text;this.startedAt=now;}
   this.text=text;this.changedAt=now;
  }
  return{segmentId:`page-${this.serial}`,revision:this.revision,mergedText:this.merged};
 }
 reset(){this.text='';this.merged='';this.changedAt=0;this.startedAt=0;this.revision=0;}
}
