import type {CaptionRow} from './history';
import type {State} from './shared';

/** Show the current interim immediately, without waiting for the throttled IndexedDB write. */
export function compactHistory(rows:CaptionRow[],total:number,state:State,tabId:number|undefined){
 const current=state.latestCaption;
 if(!current||current.phase!=='interim'||state.tabId!==tabId||current.sessionId!==state.sessionId||current.epoch!==state.epoch)return{rows,total};
 const key=(row:Pick<CaptionRow,'sessionId'|'epoch'|'segmentId'>)=>`${row.sessionId}:${row.epoch}:${row.segmentId}`;
 const existing=rows.find(row=>key(row)===key(current));
 const live:CaptionRow={...existing,...current,sourceLanguage:existing?.sourceLanguage??'auto',targetLanguage:existing?.targetLanguage??'',start:existing?.start??0,end:existing?.end??0,url:existing?.url??state.captureUrl??'',title:existing?.title??state.captureTitle??'',engine:existing?.engine??state.asrEngine??'browser-asr',translationState:'transcribing',translatedText:undefined};
 return{rows:[live,...rows.filter(row=>key(row)!==key(current))].slice(0,10),total:total+(existing?0:1)};
}
