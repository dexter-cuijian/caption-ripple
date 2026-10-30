import{emptyGlossary}from'./glossary';
import{canSeekMedia,captureResetReason}from'./media';
import {VideoRegistry} from './registry';
import {saveFinal,saveInterim,saveTranslation,failTranslation,cancelPending,retireInterims,persistReceivedFinal,markProofreading}from'./history';
import {defaults,initialState,requiresCompanionToken,send,type Config,type State} from './shared';
import {parseSubtitleFile,type ImportedCue} from './subtitle-import';
let state:State={...initialState},videos=new VideoRegistry(),selected='',manual=false;
let imported:{cues:ImportedCue[];videoId:string;mediaUrl?:string;translations:Map<number,any>}|undefined;
interface SavedImport {text:string;videoId:string;mediaUrl?:string;state:State}
let restoreImport:Promise<void>|undefined;
async function ensureImportRestored(){
 if(imported||state.sessionId)return;
 restoreImport??=(async()=>{const saved=(await chrome.storage.session.get('importSession')).importSession as SavedImport|undefined;
  if(!saved||state.sessionId)return;
  try{const cues=parseSubtitleFile(saved.text);imported={cues,videoId:saved.videoId,mediaUrl:saved.mediaUrl,translations:new Map()};state=saved.state;}catch{await chrome.storage.session.remove('importSession');}
 })().finally(()=>{restoreImport=undefined;});
 await restoreImport;
}
async function clearImport(){imported=undefined;await chrome.storage.session.remove('importSession');}
const interimSavedAt=new Map<string,number>();
const interimWrites=new Set<Promise<unknown>>();
async function retireHistory(sessionId:string|undefined,epoch:number,reason:string){
 if(!sessionId)return;
 await Promise.allSettled([...interimWrites]);
 await Promise.all([retireInterims(sessionId,epoch),cancelPending(sessionId,epoch,reason)]);
}
const retired=new Set<string>();const epochKey=(session:string|undefined,epoch:number)=>`${session}:${epoch}`;
function retire(session:string|undefined,epoch:number){retired.add(epochKey(session,epoch));if(retired.size>128)retired.delete(retired.values().next().value!);}
let offscreenCreating:Promise<void>|undefined;
let panel:chrome.runtime.Port|undefined,panelPair='';const pendingTranslations=new Map<string,{resolve:(value:any)=>void;timer:ReturnType<typeof setTimeout>}>();
function cancelPanelTranslations(reason:string){for(const[id,pending]of pendingTranslations){clearTimeout(pending.timer);pending.resolve({ok:false,error:reason});panel?.postMessage({kind:'cancel-translation',id});}pendingTranslations.clear();}
chrome.runtime.onConnect.addListener(port=>{
 if(port.name!=='captions-panel')return;panel=port;panelPair='';
 port.onMessage.addListener(message=>{
  if(message.kind==='translation-ready'){panelPair=`${message.sourceLanguage}:${message.targetLanguage}`;void send('offscreen','retry-translation').catch(()=>{});}
  if(message.kind==='translation-result'){const pending=pendingTranslations.get(message.id);if(pending){clearTimeout(pending.timer);pendingTranslations.delete(message.id);pending.resolve(message);}}
 });
 port.onDisconnect.addListener(()=>{if(panel!==port)return;panel=undefined;panelPair='';cancelPanelTranslations('侧栏已关闭；若后台无法使用本地翻译，请重新打开并准备翻译。原文已保存，可重试。');if(state.translationContext!=='offscreen')state.translationError='翻译侧栏已关闭；原文继续保存，重新打开侧栏可重试翻译。';});
});
async function translateInPanel(message:any){
 if(!panel||panelPair!==`${message.sourceLanguage}:${message.targetLanguage}`)return{ok:false,error:'请在侧栏点击“准备本地翻译”。后台模型未就绪，原文已保存；翻译不会伪装成功。'};
 return new Promise(resolve=>{const id=message.requestId??crypto.randomUUID();const timer=setTimeout(()=>{pendingTranslations.delete(id);panel?.postMessage({kind:'cancel-translation',id});resolve({ok:false,error:'本地翻译超过 3 秒，请重试'});},3000);pendingTranslations.set(id,{resolve,timer});panel!.postMessage({kind:'translate',id,text:message.text,sourceLanguage:message.sourceLanguage,targetLanguage:message.targetLanguage});});
}
async function offscreen(){
 if(await chrome.offscreen.hasDocument())return;
 offscreenCreating??=chrome.offscreen.createDocument({url:'offscreen.html',reasons:[chrome.offscreen.Reason.USER_MEDIA],justification:'Capture tab audio, preserve audible playback and translate final captions locally.'}).finally(()=>{offscreenCreating=undefined;});await offscreenCreating;
}
async function broadcast(kind:string,extra:Record<string,unknown>={}){
 if(!state.tabId)return;await chrome.tabs.sendMessage(state.tabId,{target:'content',kind,...extra}).catch(()=>{});
}
async function sendImported(cues:ImportedCue[],video:NonNullable<State['video']>){
 if(!state.tabId)return;
 await chrome.tabs.sendMessage(state.tabId,{target:'content',kind:'import-subtitles',cues,videoId:video.id},{frameId:video.frameId??0});
}
async function choose(){
 const candidates=videos.candidates(),previous=selected,current=videos.choose(selected,manual);
 selected=current?`${current.frameId}:${current.id}`:'';state.video=current;state.videos=candidates;
 if(imported&&current&&current.id!==imported.videoId){await clearImport();state.phase='idle';state.message='视频已切换，请为新视频重新导入字幕';await broadcast('clear-import');}
 await broadcast('select',{id:current?.id,frameId:current?.frameId,config:await chrome.storage.sync.get(defaults),sessionId:state.sessionId,epoch:state.epoch});
 if(imported&&previous!==selected&&current?.id===imported.videoId)await sendImported(imported.cues,current);
 await send('offscreen','video',{video:current,reset:previous&&previous!==selected?'video-change':undefined}).catch(()=>{});
}
async function pageLocation(url:string,title?:string){
 if(!/^https?:\/\//.test(url)||state.captureUrl===url)return;if(imported){await clearImport();await broadcast('clear-import');state.phase='idle';state.message='页面已切换，请重新导入字幕';}state.captureUrl=url;state.captureTitle=title??state.captureTitle;videos.clear();selected='';manual=false;state.video=undefined;state.videos=[];
 await send('offscreen','page-location',{url,title:state.captureTitle}).catch(()=>{});await choose();
}
async function start(expectedTabId?:number){
 const[tab]=await chrome.tabs.query({active:true,currentWindow:true});
 if(!tab?.id||!/^https?:\/\//.test(tab.url??''))throw new Error('请在目标 HTTP/HTTPS 页面点击工具栏中的扩展图标授权，再从侧栏启动');
 if(expectedTabId!==undefined&&expectedTabId!==tab.id)throw new Error('当前页面已切换，请确认侧栏显示的目标页后重新启动');
 const config=await chrome.storage.sync.get(defaults) as Config;
 const{token}=await chrome.storage.local.get('token');if(requiresCompanionToken(config)&&!token)throw new Error('请先在设置粘贴 .runtime/token 配对令牌');
 // Verify page access BEFORE acquiring/muting tab audio.
 await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>true}).catch(()=>{throw new Error('尚未授权此页面。请点击该页面工具栏中的扩展图标，再启动。');});
 await clearImport();
 if(state.phase!=='idle'){retire(state.sessionId,state.epoch);await send('offscreen','stop').catch(()=>{});await broadcast('clear');await retireHistory(state.sessionId,state.epoch,'重新启动后已取消翻译');}
 interimSavedAt.clear();
 cancelPanelTranslations('重新启动后已取消翻译');videos.clear();selected='';manual=false;
 state={...initialState,tabId:tab.id,phase:'connecting',sessionId:crypto.randomUUID(),captureUrl:tab.url,captureTitle:tab.title};
 const streamId=await chrome.tabCapture.getMediaStreamId({targetTabId:tab.id});await offscreen();
 await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},files:['content.js']}).catch(async()=>{await chrome.scripting.executeScript({target:{tabId:tab.id!},files:['content.js']});});
 await broadcast('inspect');const response=await send('offscreen','start',{streamId,sessionId:state.sessionId,token,config,glossary:(await chrome.storage.local.get({glossary:emptyGlossary})).glossary,scopeUrl:tab.url,video:state.video});
 if(!response?.ok)throw new Error(response?.error||'无法启动音频采集');await broadcast('epoch',{sessionId:state.sessionId,epoch:0});
}
async function importSubtitles(message:any){
 const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
 if(!tab?.id||!/^https?:\/\//.test(tab.url??'')||message.tabId!==tab.id)throw new Error('请在目标视频页面导入字幕');
 if(typeof message.text!=='string'||message.text.length>4_000_000)throw new Error('字幕文件过大（上限 4 MB）');
 const cues=parseSubtitleFile(message.text);
 if(state.phase!=='idle'){retire(state.sessionId,state.epoch);await send('offscreen','stop').catch(()=>{});await broadcast('clear');await retireHistory(state.sessionId,state.epoch,'导入字幕后已取消翻译');}
 await clearImport();videos.clear();selected='';manual=false;
 state={...initialState,tabId:tab.id,phase:'connecting',sessionId:crypto.randomUUID(),captureUrl:tab.url,captureTitle:tab.title,message:'正在定位视频播放器'};
 await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>true}).catch(()=>{throw new Error('请先点击此页的扩展图标授权页面访问');});
 await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},files:['content.js']}).catch(async()=>{await chrome.scripting.executeScript({target:{tabId:tab.id!},files:['content.js']});});
 await broadcast('inspect');
 for(let i=0;i<20&&!state.video;i++)await new Promise(resolve=>setTimeout(resolve,100));
 if(!state.video){state={...initialState};throw new Error('当前页面没有可用的视频播放器');}
 const config=await chrome.storage.sync.get(defaults);
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([tab.url,state.video.mediaUrl,config.sourceLanguage,config.targetLanguage,message.text])));
 state.sessionId=`import-${Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('')}`;
 imported={cues,videoId:state.video.id,mediaUrl:state.video.mediaUrl,translations:new Map()};
 state.phase='running';state.message=`已导入 ${cues.length} 条字幕，跟随视频时间显示`;state.asrEngine='imported-subtitles';
 await chrome.storage.session.set({importSession:{text:message.text,videoId:state.video.id,mediaUrl:state.video.mediaUrl,state}});
 await broadcast('select',{id:state.video.id,frameId:state.video.frameId,config,sessionId:state.sessionId,epoch:0});
 await sendImported(cues,state.video);
 return state;
}
chrome.action.onClicked.addListener(tab=>{if(tab.id)void chrome.sidePanel.open({tabId:tab.id});});
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
 if(message.target!=='background')return;
 (async()=>{
  await ensureImportRestored();
  if(message.kind==='start')await start(message.tabId);
  if(message.kind==='import-subtitles')return await importSubtitles(message);
  if(message.kind==='stop'){retire(state.sessionId,state.epoch);interimSavedAt.clear();cancelPanelTranslations('停止后已取消翻译');await retireHistory(state.sessionId,state.epoch,'停止后已取消翻译');await retireInterims();await clearImport();await send('offscreen','stop');await broadcast('clear');videos.clear();state={...initialState};}
  if(message.kind==='prepare-translation'){await offscreen();return await send('offscreen','prepare-translation',{sourceLanguage:message.sourceLanguage,targetLanguage:message.targetLanguage});}
  if(message.kind==='cancel-panel-translation'){const pending=pendingTranslations.get(message.requestId);if(pending){clearTimeout(pending.timer);pendingTranslations.delete(message.requestId);pending.resolve({ok:false,error:'翻译已取消'});panel?.postMessage({kind:'cancel-translation',id:message.requestId});}return{ok:true};}
  if(message.kind==='panel-translate')return await translateInPanel(message);
  if(message.kind==='retry-translation')return await send('offscreen','retry-translation');
  if(message.kind==='state'&&!imported&&message.state?.sessionId===state.sessionId)state={...state,...message.state,tabId:state.tabId,video:state.video,videos:state.videos,captureUrl:state.captureUrl,captureTitle:state.captureTitle};
  if(message.kind==='epoch'){retire(message.sessionId,message.previousEpoch??state.epoch);interimSavedAt.clear();cancelPanelTranslations('识别段重置，已取消旧翻译');await retireHistory(message.sessionId,message.previousEpoch??state.epoch,'识别段重置，已取消旧翻译');state.epoch=message.epoch;state.latestTranslation='';await broadcast('epoch',{sessionId:message.sessionId,epoch:message.epoch});}
  if(message.kind==='subtitle'&&message.event.sessionId===state.sessionId&&message.event.epoch===state.epoch){
   const event=message.event,media=state.video,pageUrl=state.captureUrl,pageTitle=state.captureTitle;
   const isCurrent=()=>event.sessionId===state.sessionId&&event.epoch===state.epoch&&state.phase!=='idle'&&!retired.has(epochKey(event.sessionId,event.epoch));
   const metadata=async()=>{const config=await chrome.storage.sync.get(defaults);return{targetLanguage:event.targetLanguage??config.targetLanguage,url:media?.url||pageUrl||'',title:media?.title||pageTitle||'',videoId:media?.id,mediaUrl:media?.mediaUrl,documentId:media?.documentId,live:media?.live};};
   if(event.phase==='final'){interimSavedAt.delete(`${event.sessionId}:${event.epoch}:${event.segmentId}`);await persistReceivedFinal(event,metadata,isCurrent,()=>broadcast('subtitle',{event}));}
   else if(isCurrent()){await broadcast('subtitle',{event});const key=`${event.sessionId}:${event.epoch}:${event.segmentId}`,now=Date.now();if(event.sourceText?.trim().length>=8&&(now-(interimSavedAt.get(key)??-Infinity)>=1500)){interimSavedAt.set(key,now);const write=metadata().then(data=>isCurrent()?saveInterim({...event,...data}):false).catch(()=>{});interimWrites.add(write);void write.finally(()=>interimWrites.delete(write));}}
  }
  if(message.kind==='translation'&&message.event.sessionId===state.sessionId&&message.event.epoch===state.epoch){const changed=await saveTranslation(message.event);if(changed&&message.event.sessionId===state.sessionId&&message.event.epoch===state.epoch)await broadcast('translation',{event:message.event});}
  if(message.kind==='interim-translation'&&message.event.sessionId===state.sessionId&&message.event.epoch===state.epoch)await broadcast('interim-translation',{event:message.event});
  if(message.kind==='proofreading-failed')await markProofreading(message.event);
  if(message.kind==='retry-history'){const row=message.row;await offscreen();const {token}=await chrome.storage.local.get('token');const result=await send('offscreen','translate-history',{row,token});if(!result.ok)throw new Error(result.error);await saveTranslation(result.event);return{ok:true};}
  if(message.kind==='translation-failed')await failTranslation(message.event);
  if(message.kind==='seek'){
   const row=message.row;if(!canSeekMedia(row,state.video,videos.candidates()))throw new Error('无法安全跳转：直播、媒体来源不匹配或播放器身份不唯一');
   await chrome.tabs.sendMessage(state.tabId!,{target:'content',kind:'seek',id:state.video!.id,mediaUrl:row.mediaUrl,time:row.mediaTime},{frameId:state.video!.frameId??0});
  }
  if(message.kind==='page-location'&&sender.tab?.id===state.tabId&&sender.frameId===0)await pageLocation(message.url,message.title);
  if(message.kind==='frames-changed'&&sender.tab?.id===state.tabId&&state.tabId)await chrome.scripting.executeScript({target:{tabId:state.tabId,allFrames:true},files:['content.js']}).catch(()=>{});
  if(message.kind==='videos'&&sender.tab?.id===state.tabId){videos.report(sender.frameId??0,message.videos.map((video:any)=>({...video,documentId:sender.documentId})));await choose();}
  if(message.kind==='select-video'){manual=true;selected=message.id;await choose();}
  if(message.kind==='video-event'&&sender.tab?.id===state.tabId&&selected===`${sender.frameId}:${message.video.id}`){state.video={...message.video,frameId:sender.frameId};if(imported&&imported.mediaUrl&&message.video.mediaUrl&&imported.mediaUrl!==message.video.mediaUrl){await clearImport();state.phase='idle';state.message='视频来源已切换，请重新导入字幕';await broadcast('clear-import');}await send('offscreen','video',{video:state.video,reset:captureResetReason(message.reason)});}
  if(message.kind==='page-caption'&&!imported&&sender.tab?.id===state.tabId&&selected===`${sender.frameId}:${message.videoId}`&&state.phase!=='idle')await send('offscreen','page-caption',{caption:message.caption});
  if(message.kind==='import-cue'&&imported&&sender.tab?.id===state.tabId&&state.sessionId&&state.video?.id===imported.videoId&&sender.frameId===state.video.frameId&&message.videoId===imported.videoId){
   if(message.index<0){await broadcast('clear-import-cue');state.latestText='';state.latestDisplayText='';state.latestTranslation='';return state;}
   const cue=imported.cues[message.index];if(!cue)return state;
   const revision=1;
   const config=await chrome.storage.sync.get(defaults),now=Date.now();
   const event={type:'subtitle',sessionId:state.sessionId,epoch:0,segmentId:`import-${message.index}`,revision,phase:'final',sourceText:cue.text,sourceRaw:cue.text,sourceLanguage:config.sourceLanguage,displaySourceText:cue.text,targetLanguage:config.targetLanguage,start:cue.start,end:cue.end,mediaTime:cue.start,createdAt:now,engine:'subtitle-import',speechStartAt:null,audioEndAt:now,timestampKind:'imported-cue',translationState:config.translationEngine==='off'?'disabled':undefined};
   await saveFinal({...event,url:state.captureUrl??'',title:state.captureTitle??'',videoId:state.video.id,mediaUrl:state.video.mediaUrl,documentId:state.video.documentId,live:state.video.live});
   await broadcast('subtitle',{event});state.latestText=cue.text;state.latestDisplayText=cue.text;state.latestTranslation='';state.translationError=undefined;
   const cached=imported.translations.get(message.index);if(cached){await broadcast('translation',{event:cached});state.latestTranslation=cached.text;}
   else if(config.translationEngine!=='off'&&config.sourceLanguage!==config.targetLanguage){
    const currentImport=imported,currentIndex=message.index;
    void (async()=>{try{await offscreen();const result=await send('offscreen','translate-history',{row:{...event,url:state.captureUrl??'',title:state.captureTitle??''}});if(result?.ok&&imported===currentImport){await saveTranslation(result.event);currentImport.translations.set(currentIndex,result.event);if(state.latestText===cue.text){await broadcast('translation',{event:result.event});state.latestTranslation=result.event.text;}}else state.translationError=result?.error??'导入字幕翻译失败';}catch(error){state.translationError=String(error);}})();
   }
  }
  if(message.kind==='rendered'&&sender.tab?.id===state.tabId)await send('offscreen','rendered',{event:message.event});
  if(message.kind==='content-warning'&&sender.tab?.id===state.tabId)state.message=message.message;
  return state;
 })().then(reply,error=>{if(message.kind==='start')state={...state,phase:'error',message:String(error)};reply({...state,error:String(error)});});return true;
});
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.glossary)void send('offscreen','glossary',{glossary:changes.glossary.newValue??emptyGlossary}).catch(()=>{});if(area==='sync')void chrome.storage.sync.get(defaults).then(async config=>{await broadcast('config',{config});await send('offscreen','config',{config}).catch(()=>{});});});
chrome.tabs.onRemoved.addListener(tabId=>{void ensureImportRestored().then(async()=>{if(tabId===state.tabId){retire(state.sessionId,state.epoch);cancelPanelTranslations('目标标签页已关闭');await retireHistory(state.sessionId,state.epoch,'目标标签页已关闭');await clearImport();void send('offscreen','stop');state={...initialState};}});});
chrome.tabs.onUpdated.addListener((tabId,change)=>{void ensureImportRestored().then(()=>{if(tabId===state.tabId&&change.url)void pageLocation(change.url);if(tabId===state.tabId&&change.status==='loading'){videos.clear();manual=false;void choose();}if(tabId===state.tabId&&change.status==='complete'&&state.phase!=='idle')void chrome.scripting.executeScript({target:{tabId,allFrames:true},files:['content.js']}).catch(()=>{});});});
