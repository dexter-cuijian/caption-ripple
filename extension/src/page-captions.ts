/** YouTube's live captions often extend the same line one word at a time. */
export class PageCaptionRevisions {
 private text='';private changedAt=0;private serial=0;private revision=0;
 observe(text:string,now:number){
  if(text!==this.text){
   if(this.text&&text.startsWith(this.text)&&now-this.changedAt<=6000)this.revision++;
   else{this.serial++;this.revision=1;}
   this.text=text;this.changedAt=now;
  }
  return{segmentId:`page-${this.serial}`,revision:this.revision};
 }
 reset(){this.text='';this.changedAt=0;this.revision=0;}
}
