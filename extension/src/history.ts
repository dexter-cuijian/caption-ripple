import type{TermMatch}from'./glossary';
import{displaySource}from'./display';
export interface CaptionRow{phase?:string;glossaryVersion?:number;matchedTerms?:TermMatch[];sessionId:string;epoch:number;segmentId:string;revision:number;sourceText:string;sourceRaw?:string;videoId?:string;frameUrl?:string;mediaUrl?:string;documentId?:string;live?:boolean;proofreadingState?:string;proofreadingError?:string;translatedText?:string;translationRevision?:number;displaySourceText?:string;sourceLanguage:string;targetLanguage:string;mediaTime:number|null;start:number;end:number;url:string;title:string;createdAt:number;engine:string;translationEngine?:string;translationState?:string;translationError?:string;translationStartedAt?:number;translationCompletedAt?:number;fragments?:CaptionRow[]}
export const visibleTranslation=(row:CaptionRow)=>row.translatedText&&row.translatedText!==row.sourceText?row.translatedText:undefined;
export interface TranslationEvent{glossaryVersion?:number;matchedTerms?:TermMatch[];type?:string;sessionId:string;epoch:number;segmentId:string;sourceRevision:number;translationRevision?:number;targetLanguage:string;text:string;engine?:string;phase?:string;startedAt?:number;completedAt?:number}
export const rowKey=(row:Pick<CaptionRow,'sessionId'|'epoch'|'segmentId'>)=>[row.sessionId,row.epoch,row.segmentId];
/** Hide legacy rows created while a single webpage caption was revealed word by word. */
export function olderPageCaptionDuplicate(older:CaptionRow,newer:CaptionRow){
 if(older.engine!=='page-caption'||newer.engine!=='page-caption'||older.sessionId!==newer.sessionId||older.url!==newer.url)return false;
 if(newer.createdAt<older.createdAt||newer.createdAt-older.createdAt>5000)return false;
 if(older.mediaTime!=null&&newer.mediaTime!=null&&Math.abs(newer.mediaTime-older.mediaTime)>5)return false;
 const oldText=older.sourceText.trim(),newText=newer.sourceText.trim();
 return oldText.length>0&&newText.length>oldText.length&&newText.startsWith(oldText);
}
const parts=(row:CaptionRow)=>row.fragments??[row];
const shortChinese=(text:string)=>{const clean=text.replace(/[\s，。！？、,.!?；;]+/gu,'');return /^[\u3400-\u9fff\d]+$/u.test(clean)&&Array.from(clean).length<=4;};
/** Join only adjacent short ASR fragments for reading; keep stored rows untouched. */
export function stitchHistory(older:CaptionRow,newer:CaptionRow):CaptionRow|undefined{
 if(older.sessionId!==newer.sessionId||older.epoch!==newer.epoch||older.url!==newer.url||older.frameUrl!==newer.frameUrl||older.engine!==newer.engine||older.videoId!==newer.videoId||older.mediaUrl!==newer.mediaUrl||older.targetLanguage!==newer.targetLanguage)return;
 if(['page-caption','subtitle-import'].includes(older.engine)||older.phase!=='final'||newer.phase!=='final'||[...parts(older),...parts(newer)].some(row=>['error','cancelled'].includes(row.translationState??'')))return;
 const gap=newer.start-older.end;if(!Number.isFinite(gap)||gap<-.5||gap>2||older.mediaTime!=null&&newer.mediaTime!=null&&newer.mediaTime<older.mediaTime)return;
 const tail=parts(older).at(-1)!,head=parts(newer)[0];
 const ordinalSplit=/第\s*$/u.test(tail.sourceText)&&/^\s*[一二三四五六七八九十百千万两\d]/u.test(head.sourceText);
 if(!shortChinese(tail.sourceText)&&!shortChinese(head.sourceText)&&!ordinalSplit||/[。！？!?]$/u.test(older.sourceText.trim()))return;
 const fragments=[...parts(older),...parts(newer)],sourceText=fragments.map(row=>row.sourceText).join('');
 const translated=fragments.map(visibleTranslation),allTranslated=translated.every(Boolean);
 const translatedText=allTranslated?translated.join(older.targetLanguage==='zh'?'':' '):undefined;
 const sameLanguage=fragments.every(row=>row.translationState==='same-language'||row.translationEngine==='same-language'||row.translatedText===row.sourceText);
 const translationState=sameLanguage?'same-language':fragments.every(row=>row.translationState==='disabled')?'disabled':allTranslated?'complete':'pending';
 return{...older,sourceText,sourceRaw:fragments.map(row=>row.sourceRaw??row.sourceText).join(''),displaySourceText:displaySource(sourceText,'final'),end:newer.end,createdAt:newer.createdAt,translatedText,translationState,translationError:undefined,fragments};
}
export function mergeFinal(existing:CaptionRow|undefined,event:any):CaptionRow|undefined{
 if(event.phase!=='final')return existing;
 if(existing&&existing.revision>=event.revision)return existing;
 const {translatedText,translationRevision,translationEngine,translationError,translationStartedAt,translationCompletedAt,...source}=event;
 return{...source,translationError:event.translationState==='cancelled'?event.translationError:undefined,translationState:event.translationState??(event.targetLanguage===event.sourceLanguage?'same-language':'pending')};
}
export function mergeInterim(existing:CaptionRow|undefined,event:any):CaptionRow|undefined{
 if(event.phase!=='interim'||!event.sourceText?.trim()||existing?.phase==='final'||existing&&existing.revision>=event.revision)return existing;
 return{...event,translationState:'transcribing'};
}
export function mergeTranslation(row:CaptionRow|undefined,event:TranslationEvent):CaptionRow|undefined{
 if(!row||JSON.stringify(rowKey(row))!==JSON.stringify([event.sessionId,event.epoch,event.segmentId])||row.revision!==event.sourceRevision||row.targetLanguage!==event.targetLanguage||(row.glossaryVersion??0)!==(event.glossaryVersion??0))return row;
 const translationRevision=event.translationRevision??1;if((row.translationRevision??0)>=translationRevision)return row;
 const sameLanguage=event.engine==='same-language';
 return{...row,translationRevision,proofreadingState:translationRevision>1?'revised':undefined,proofreadingError:undefined,translatedText:sameLanguage?undefined:event.text,translationEngine:event.engine,translationState:sameLanguage?'same-language':'complete',translationError:undefined,translationStartedAt:event.startedAt,translationCompletedAt:event.completedAt};
}
let database:Promise<IDBDatabase>|undefined;
function db(){return database??=new Promise((resolve,reject)=>{const request=indexedDB.open('local-caption-history',1);request.onupgradeneeded=()=>{const store=request.result.createObjectStore('captions',{keyPath:['sessionId','epoch','segmentId']});store.createIndex('createdAt','createdAt');};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
async function mutate(key:IDBValidKey,update:(existing:CaptionRow|undefined)=>CaptionRow|undefined){
 const database=await db();return new Promise<boolean>((resolve,reject)=>{let changed=false;const tx=database.transaction('captions','readwrite'),store=tx.objectStore('captions'),request=store.get(key);request.onsuccess=()=>{const previous=request.result;const value=update(previous);if(value&&value!==previous){store.put(value);changed=true;}};tx.oncomplete=()=>resolve(changed);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
}
export const saveFinal=(event:any)=>mutate(rowKey(event),existing=>mergeFinal(existing,event));
export const saveInterim=(event:any)=>mutate(rowKey(event),existing=>mergeInterim(existing,event));
export const saveTranslation=(event:TranslationEvent)=>mutate([event.sessionId,event.epoch,event.segmentId],row=>mergeTranslation(row,event));
export const failTranslation=(event:any)=>mutate([event.sessionId,event.epoch,event.segmentId],row=>row&&row.revision===event.sourceRevision&&row.targetLanguage===event.targetLanguage&&!row.translatedText?{...row,translationState:'error',translationError:event.error}:row);
/** A displayed row can contain several stored ASR fragments. Delete them together. */
export async function deleteHistoryRows(rows:CaptionRow[]){
 const keys=[...new Map(rows.flatMap(row=>(row.fragments??[row]).map(part=>[JSON.stringify(rowKey(part)),rowKey(part)] as const))).values()];
 if(!keys.length)return 0;
 const database=await db();return new Promise<number>((resolve,reject)=>{let deleted=0;const tx=database.transaction('captions','readwrite'),store=tx.objectStore('captions');
  for(const key of keys){const request=store.get(key);request.onsuccess=()=>{if(request.result!==undefined){store.delete(key);deleted++;}};}
  tx.oncomplete=()=>resolve(deleted);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 });
}
export async function clearHistory(){
 const database=await db();return new Promise<number>((resolve,reject)=>{let deleted=0;const tx=database.transaction('captions','readwrite'),store=tx.objectStore('captions'),count=store.count();
  count.onsuccess=()=>{deleted=count.result;store.clear();};tx.oncomplete=()=>resolve(deleted);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 });
}
/** An interrupted hypothesis remains searchable, but is no longer shown as live recognition. */
export async function retireInterims(sessionId?:string,epoch?:number){
 const database=await db();return new Promise<void>((resolve,reject)=>{const tx=database.transaction('captions','readwrite');const request=tx.objectStore('captions').openCursor();request.onsuccess=()=>{const cursor=request.result;if(!cursor)return;const row=cursor.value as CaptionRow;if((!sessionId||row.sessionId===sessionId)&&(epoch===undefined||row.epoch===epoch)&&row.phase==='interim')cursor.update({...row,phase:'interrupted',translationState:'cancelled'});cursor.continue();};tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});
}
export async function cancelPending(sessionId:string,epoch:number,reason:string){
 const database=await db();return new Promise<void>((resolve,reject)=>{const tx=database.transaction('captions','readwrite');const request=tx.objectStore('captions').openCursor();request.onsuccess=()=>{const cursor=request.result;if(!cursor)return;const row=cursor.value as CaptionRow;if(row.sessionId===sessionId&&row.epoch===epoch&&['pending','error'].includes(row.translationState??''))cursor.update({...row,translationState:'cancelled',translationError:reason});cursor.continue();};tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});
}
export async function queryHistory({search='',session='',url='',urls=[],page=0,pageSize=100}:{search?:string;session?:string;url?:string;urls?:string[];page?:number;pageSize?:number}={}){
 const database=await db();return new Promise<{rows:CaptionRow[];total:number;sessions:Array<{id:string;title:string}>}>((resolve,reject)=>{
 const tx=database.transaction('captions'),request=tx.objectStore('captions').index('createdAt').openCursor(null,'prev');const rows:CaptionRow[]=[],sessions=new Map<string,string>();let total=0,lastAccepted:CaptionRow|undefined,pending:CaptionRow|undefined;const needle=search.toLocaleLowerCase(),limit=Math.min(100,Math.max(1,pageSize)),offset=Math.max(0,page)*limit;
 const flush=()=>{if(!pending)return;const row=pending;pending=undefined;if(!needle||`${row.sourceText}\n${row.translatedText??''}\n${row.title}`.toLocaleLowerCase().includes(needle)){if(total>=offset&&rows.length<limit)rows.push(row);total++;}};
 request.onsuccess=()=>{const cursor=request.result;if(!cursor){flush();return;}const row=cursor.value as CaptionRow;if(sessions.size<100)sessions.set(row.sessionId,row.title||row.url||row.sessionId);
 if((!session||row.sessionId===session)&&(!url&&!urls.length||row.url===url||urls.includes(row.url))){
  if(!lastAccepted||!olderPageCaptionDuplicate(row,lastAccepted)){
   const joined=pending&&stitchHistory(row,pending);
   if(joined)pending=joined;else{flush();pending=row;}
   lastAccepted=row;
  }
 }cursor.continue();};tx.oncomplete=()=>resolve({rows,total,sessions:[...sessions].map(([id,title])=>({id,title}))});tx.onerror=()=>reject(tx.error);
 });
}
export async function allHistory(session=''){const database=await db();return new Promise<CaptionRow[]>((resolve,reject)=>{const rows:CaptionRow[]=[];const request=database.transaction('captions').objectStore('captions').index('createdAt').openCursor();request.onsuccess=()=>{const cursor=request.result;if(!cursor){resolve(rows);return;}const row=cursor.value as CaptionRow;if(!session||row.sessionId===session){const previous=rows.at(-1);if(previous&&olderPageCaptionDuplicate(previous,row))rows[rows.length-1]=row;else if(previous){const joined=stitchHistory(previous,row);if(joined)rows[rows.length-1]=joined;else rows.push(row);}else rows.push(row);}cursor.continue();};request.onerror=()=>reject(request.error);});}
export type ExportFormat='txt'|'md'|'srt'|'vtt';
function timestamp(seconds:number,separator:string){const ms=Math.max(0,Math.round(seconds*1000));return`${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}${separator}${String(ms%1000).padStart(3,'0')}`;}
export function exportCaptions(rows:CaptionRow[],format:ExportFormat){
 if(format==='txt')return rows.map(r=>[r.sourceText,visibleTranslation(r)].filter(Boolean).join('\n')).join('\n\n');
 if(format==='md')return'# 字幕记录\n\n'+rows.map(r=>`## ${r.title.replace(/[\r\n]/g,' ')}\n\n${r.sourceText}\n\n${visibleTranslation(r)??''}\n\n来源：${r.url}\n`).join('\n');
 // Media timestamps remain estimates. Multiple sessions/epochs are concatenated, never overlapping at zero.
 let offset=0,previous='',lastEnd=0;const cues=rows.map((r,index)=>{const identity=JSON.stringify([r.sessionId,r.epoch]);if(identity!==previous){offset=lastEnd;previous=identity;}const start=offset+Math.max(0,r.start),end=offset+Math.max(r.start+.01,r.end);lastEnd=Math.max(lastEnd,end);return`${format==='srt'?`${index+1}\n`:''}${timestamp(start,format==='srt'?',':'.')} --> ${timestamp(end,format==='srt'?',':'.')}\n${[r.sourceText,visibleTranslation(r)].filter(Boolean).join('\n')}`;});
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
