export interface SourceTiming{sessionId:string;epoch:number;segmentId:string;revision:number;phase:string;engine:string;createdAt:number;audioEndAt:number;speechStartAt:number|null}
export interface RenderTiming{sessionId:string;epoch:number;segmentId:string;revision:number;renderedAt:number;hasTranslation?:boolean;translationRevision?:number}
export interface BrowserMetric extends SourceTiming{renderedAt:number;audioEndToRenderMs:number;decodeToRenderMs:number;speechStartToRenderMs:number|null;hasTranslation:boolean;translationRevision?:number}
const key=(value:Pick<SourceTiming,'sessionId'|'epoch'|'segmentId'|'revision'>)=>JSON.stringify([value.sessionId,value.epoch,value.segmentId,value.revision]);
export class BrowserMetrics{
 private pending=new Map<string,SourceTiming>();private translationCandidates=new Map<string,SourceTiming>();private rows:BrowserMetric[]=[];
 constructor(private limit=1200){}
 source(event:SourceTiming){this.pending.set(key(event),event);this.translationCandidates.set(key(event),event);while(this.translationCandidates.size>200)this.translationCandidates.delete(this.translationCandidates.keys().next().value!);while(this.pending.size>200)this.pending.delete(this.pending.keys().next().value!);}
 rendered(event:RenderTiming){
  const id=key(event),source=event.hasTranslation?this.translationCandidates.get(id):this.pending.get(id);if(!source)return;
  if(event.hasTranslation)this.translationCandidates.delete(id);else this.pending.delete(id);
  const metric:BrowserMetric={...source,renderedAt:event.renderedAt,audioEndToRenderMs:event.renderedAt-source.audioEndAt,decodeToRenderMs:event.renderedAt-source.createdAt,speechStartToRenderMs:source.speechStartAt===null?null:event.renderedAt-source.speechStartAt,hasTranslation:!!event.hasTranslation,...(event.hasTranslation?{translationRevision:event.translationRevision}: {})};
  this.rows.push(metric);if(this.rows.length>this.limit)this.rows.shift();return metric;
 }
 snapshot(){return this.rows.slice();}
 clearPending(){this.pending.clear();this.translationCandidates.clear();}
}
