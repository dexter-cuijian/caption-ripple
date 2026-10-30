/** Streaming linear interpolation with an absolute source cursor; chunk boundaries do not affect phase. */
export class PCMResampler {
 private buffer:number[]=[]; private base=0; private cursor=0;
 constructor(readonly inputRate:number) { if(inputRate<16000) throw new Error('Input rate must be >=16kHz'); }
 push(channels:Float32Array[]):Int16Array {
  if(!channels.length || !channels[0].length) return new Int16Array();
  for(let i=0;i<channels[0].length;i++) this.buffer.push(channels.reduce((s,c)=>s+(c[i]||0),0)/channels.length);
  const result:number[]=[]; const end=this.base+this.buffer.length;
  while(this.cursor<end){
   const left=Math.floor(this.cursor), fraction=this.cursor-left;
   if(fraction>1e-8 && left+1>=end) break;
   const value=this.buffer[left-this.base]*(1-fraction)+(fraction>1e-8 ? this.buffer[left+1-this.base]*fraction:0);
   result.push(Math.round(Math.max(-1,Math.min(1,value))*(value<0?32768:32767)));
   this.cursor+=this.inputRate/16000;
  }
  const discard=Math.min(this.buffer.length,Math.floor(this.cursor)-this.base);
  this.buffer.splice(0,discard);this.base+=discard;
  return Int16Array.from(result);
 }
}
export class RevisionGate {
 private session=''; private epoch=-1; private revisions=new Map<string,number>(); private current='';
 reset(session:string,epoch:number){this.session=session;this.epoch=epoch;this.revisions.clear();this.current='';}
 accept(e:{sessionId:string;epoch:number;segmentId:string;revision:number}){
  if(e.sessionId!==this.session||e.epoch!==this.epoch)return false;
  if(this.revisions.has(e.segmentId)&&this.current!==e.segmentId)return false;
  if(e.revision<=(this.revisions.get(e.segmentId)??-1))return false;
  this.current=e.segmentId;this.revisions.set(e.segmentId,e.revision);return true;
 }
}
export const captureClock=(epochAnchor:number,sampleStart:number)=>epochAnchor+(sampleStart+1600)/16;
export const terminalClose=(code:number)=>[1008,4400,4401].includes(code);
