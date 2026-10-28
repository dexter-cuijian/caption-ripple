import type{TermMatch}from'./glossary';
export interface CaptionRow{glossaryVersion?:number;matchedTerms?:TermMatch[];sessionId:string;epoch:number;segmentId:string;revision:number;sourceText:string;sourceRaw?:string;videoId?:string;mediaUrl?:string;documentId?:string;live?:boolean;proofreadingState?:string;proofreadingError?:string;translatedText?:string;translationRevision?:number;displaySourceText?:string;sourceLanguage:string;targetLanguage:string;mediaTime:number|null;start:number;end:number;url:string;title:string;createdAt:number;engine:string;translationEngine?:string;translationState?:string;translationError?:string;translationStartedAt?:number;translationCompletedAt?:number}
export interface TranslationEvent{glossaryVersion?:number;matchedTerms?:TermMatch[];type?:string;sessionId:string;epoch:number;segmentId:string;sourceRevision:number;translationRevision?:number;targetLanguage:string;text:string;engine?:string;phase?:string;startedAt?:number;completedAt?:number}
export const rowKey=(row:Pick<CaptionRow,'sessionId'|'epoch'|'segmentId'>)=>[row.sessionId,row.epoch,row.segmentId];
export function mergeFinal(existing:CaptionRow|undefined,event:any):CaptionRow|undefined{
 if(event.phase!=='final')return existing;
 if(existing&&existing.revision>=event.revision)return existing;
 const {translatedText,translationRevision,translationEngine,translationError,translationStartedAt,translationCompletedAt,...source}=event;
 return{...source,translationError:event.translationState==='cancelled'?event.translationError:undefined,translationState:event.translationState??(event.targetLanguage===event.sourceLanguage?'same-language':'pending')};
}
export function mergeTranslation(row:CaptionRow|undefined,event:TranslationEvent):CaptionRow|undefined{
 if(!row||JSON.stringify(rowKey(row))!==JSON.stringify([event.sessionId,event.epoch,event.segmentId])||row.revision!==event.sourceRevision||row.targetLanguage!==event.targetLanguage||(row.glossaryVersion??0)!==(event.glossaryVersion??0))return row;
 const translationRevision=event.translationRevision??1;if((row.translationRevision??0)>=translationRevision)return row;
 return{...row,translationRevision,proofreadingState:translationRevision>1?'revised':undefined,proofreadingError:undefined,translatedText:event.text,translationEngine:event.engine,translationState:'complete',translationError:undefined,translationStartedAt:event.startedAt,translationCompletedAt:event.completedAt};
}
let database:Promise<IDBDatabase>|undefined;
function db(){return database??=new Promise((resolve,reject)=>{const request=indexedDB.open('local-caption-history',1);request.onupgradeneeded=()=>{const store=request.result.createObjectStore('captions',{keyPath:['sessionId','epoch','segmentId']});store.createIndex('createdAt','createdAt');};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
async function mutate(key:IDBValidKey,update:(existing:CaptionRow|undefined)=>CaptionRow|undefined){
 const database=await db();return new Promise<boolean>((resolve,reject)=>{let changed=false;const tx=database.transaction('captions','readwrite'),store=tx.objectStore('captions'),request=store.get(key);request.onsuccess=()=>{const previous=request.result;const value=update(previous);if(value&&value!==previous){store.put(value);changed=true;}};tx.oncomplete=()=>resolve(changed);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
}
export const saveFinal=(event:any)=>mutate(rowKey(event),existing=>mergeFinal(existing,event));
export const saveTranslation=(event:TranslationEvent)=>mutate([event.sessionId,event.epoch,event.segmentId],row=>mergeTranslation(row,event));
export const failTranslation=(event:any)=>mutate([event.sessionId,event.epoch,event.segmentId],row=>row&&row.revision===event.sourceRevision&&row.targetLanguage===event.targetLanguage&&!row.translatedText?{...row,translationState:'error',translationError:event.error}:row);
export async function cancelPending(sessionId:string,epoch:number,reason:string){
 const database=await db();return new Promise<void>((resolve,reject)=>{const tx=database.transaction('captions','readwrite');const request=tx.objectStore('captions').openCursor();request.onsuccess=()=>{const cursor=request.result;if(!cursor)return;const row=cursor.value as CaptionRow;if(row.sessionId===sessionId&&row.epoch===epoch&&['pending','error'].includes(row.translationState??''))cursor.update({...row,translationState:'cancelled',translationError:reason});cursor.continue();};tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});
}
export async function queryHistory({search='',session='',page=0,pageSize=100}:{search?:string;session?:string;page?:number;pageSize?:number}={}){
 const database=await db();return new Promise<{rows:CaptionRow[];total:number;sessions:Array<{id:string;title:string}>}>((resolve,reject)=>{
 const tx=database.transaction('captions'),request=tx.objectStore('captions').index('createdAt').openCursor(null,'prev');const rows:CaptionRow[]=[],sessions=new Map<string,string>();let total=0;const needle=search.toLocaleLowerCase(),limit=Math.min(100,Math.max(1,pageSize)),offset=Math.max(0,page)*limit;
 request.onsuccess=()=>{const cursor=request.result;if(!cursor)return;const row=cursor.value as CaptionRow;if(sessions.size<100)sessions.set(row.sessionId,row.title||row.url||row.sessionId);
 if((!session||row.sessionId===session)&&(!needle||`${row.sourceText}\n${row.translatedText??''}\n${row.title}`.toLocaleLowerCase().includes(needle))){if(total>=offset&&rows.length<limit)rows.push(row);total++;}cursor.continue();};tx.oncomplete=()=>resolve({rows,total,sessions:[...sessions].map(([id,title])=>({id,title}))});tx.onerror=()=>reject(tx.error);
 });
}
export async function allHistory(session=''){const database=await db();return new Promise<CaptionRow[]>((resolve,reject)=>{const rows:CaptionRow[]=[];const request=database.transaction('captions').objectStore('captions').index('createdAt').openCursor();request.onsuccess=()=>{const cursor=request.result;if(!cursor){resolve(rows);return;}if(!session||cursor.value.sessionId===session)rows.push(cursor.value);cursor.continue();};request.onerror=()=>reject(request.error);});}
export type ExportFormat='txt'|'md'|'srt'|'vtt';
function timestamp(seconds:number,separator:string){const ms=Math.max(0,Math.round(seconds*1000));return`${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}${separator}${String(ms%1000).padStart(3,'0')}`;}
export function exportCaptions(rows:CaptionRow[],format:ExportFormat){
 if(format==='txt')return rows.map(r=>[r.sourceText,r.translatedText].filter(Boolean).join('\n')).join('\n\n');
 if(format==='md')return'# 字幕记录\n\n'+rows.map(r=>`## ${r.title.replace(/[\r\n]/g,' ')}\n\n${r.sourceText}\n\n${r.translatedText??''}\n\n来源：${r.url}\n`).join('\n');
 // Media timestamps remain estimates. Multiple sessions/epochs are concatenated, never overlapping at zero.
 let offset=0,previous='',lastEnd=0;const cues=rows.map((r,index)=>{const identity=JSON.stringify([r.sessionId,r.epoch]);if(identity!==previous){offset=lastEnd;previous=identity;}const start=offset+Math.max(0,r.start),end=offset+Math.max(r.start+.01,r.end);lastEnd=Math.max(lastEnd,end);return`${format==='srt'?`${index+1}\n`:''}${timestamp(start,format==='srt'?',':'.')} --> ${timestamp(end,format==='srt'?',':'.')}\n${[r.sourceText,r.translatedText].filter(Boolean).join('\n')}`;});
 return(format==='vtt'?'WEBVTT\n\n':'')+cues.join('\n\n')+'\n';
}
/** Release this document's connection when its reading surface closes. */
export async function closeHistory(){if(database){const current=database;database=undefined;(await current).close();}}
/** Persist received finals even if asynchronous config/storage work crosses a retired epoch. */
export async function persistReceivedFinal(event:any,load:()=>Promise<any>,isCurrent:()=>boolean,notify:()=>Promise<void>){
 const metadata=await load();const retired=!isCurrent();
 await saveFinal({...event,...metadata,...(retired?{translationState:'cancelled',translationError:'识别段已重置；原文保留，可从历史重试翻译'}:{})});
 if(!isCurrent()){await cancelPending(event.sessionId,event.epoch,'识别段已重置；原文保留，可从历史重试翻译');return false;}
 await notify();return true;
}
export const markProofreading=(event:any)=>mutate([event.sessionId,event.epoch,event.segmentId],row=>row&&row.revision===event.sourceRevision&&row.targetLanguage===event.targetLanguage?{...row,proofreadingState:event.proofreadingState,proofreadingError:event.error}:row);
