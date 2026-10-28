import type{VideoInfo}from'./shared';
/** Frames must renew their candidates; detached frames cannot retain selection indefinitely. */
export class VideoRegistry {
 readonly entries=new Map<string,VideoInfo>();private heartbeats=new Map<number,number>();
 constructor(readonly ttl=3500){}
 clear(){this.entries.clear();this.heartbeats.clear();}
 report(frame:number,candidates:VideoInfo[],now=Date.now()){
  for(const[key,value]of this.entries)if(value.frameId===frame)this.entries.delete(key);
  this.heartbeats.set(frame,now);
  for(const candidate of candidates)this.entries.set(`${frame}:${candidate.id}`,{...candidate,frameId:frame});
 }
 candidates(now=Date.now()){
  for(const[key,value]of this.entries)if(now-(this.heartbeats.get(value.frameId??0)??0)>this.ttl)this.entries.delete(key);
  return[...this.entries.values()].sort((a,b)=>Number(a.paused)-Number(b.paused)||b.area-a.area);
 }
 choose(selected:string,manual:boolean,now=Date.now()){
  const candidates=this.candidates(now);return manual&&this.entries.has(selected)?this.entries.get(selected):candidates[0];
 }
}
