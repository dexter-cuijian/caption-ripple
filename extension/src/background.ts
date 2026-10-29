import{emptyGlossary}from'./glossary';
import{canSeekMedia}from'./media';
import {VideoRegistry} from './registry';
import {saveFinal,saveInterim,saveTranslation,failTranslation,cancelPending,persistReceivedFinal,markProofreading}from'./history';
import {defaults,initialState,send,type State} from './shared';
let state:State={...initialState},videos=new VideoRegistry(),selected='',manual=false;
const interimSavedAt=new Map<string,number>();
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
async function choose(){
 const candidates=videos.candidates(),previous=selected,current=videos.choose(selected,manual);
 selected=current?`${current.frameId}:${current.id}`:'';state.video=current;state.videos=candidates;
 await broadcast('select',{id:current?.id,frameId:current?.frameId,config:await chrome.storage.sync.get(defaults),sessionId:state.sessionId,epoch:state.epoch});
 await send('offscreen','video',{video:current,reset:previous&&previous!==selected?'video-change':undefined}).catch(()=>{});
}
async function pageLocation(url:string,title?:string){
 if(!/^https?:\/\//.test(url)||state.captureUrl===url)return;state.captureUrl=url;state.captureTitle=title??state.captureTitle;videos.clear();selected='';manual=false;state.video=undefined;state.videos=[];
 await send('offscreen','page-location',{url,title:state.captureTitle}).catch(()=>{});await choose();
}
async function start(expectedTabId?:number){
 const[tab]=await chrome.tabs.query({active:true,currentWindow:true});
 if(!tab?.id||!/^https?:\/\//.test(tab.url??''))throw new Error('请在目标 HTTP/HTTPS 页面点击工具栏中的扩展图标授权，再从侧栏启动');
 if(expectedTabId!==undefined&&expectedTabId!==tab.id)throw new Error('当前页面已切换，请确认侧栏显示的目标页后重新启动');
 const{token}=await chrome.storage.local.get('token');if(!token)throw new Error('请先在设置粘贴 .runtime/token 配对令牌');
 // Verify page access BEFORE acquiring/muting tab audio.
 await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>true}).catch(()=>{throw new Error('尚未授权此页面。请点击该页面工具栏中的扩展图标，再启动。');});
 if(state.phase!=='idle'){retire(state.sessionId,state.epoch);await send('offscreen','stop').catch(()=>{});await broadcast('clear');if(state.sessionId)await cancelPending(state.sessionId,state.epoch,'重新启动后已取消翻译');}
 interimSavedAt.clear();
 cancelPanelTranslations('重新启动后已取消翻译');videos.clear();selected='';manual=false;
 state={...initialState,tabId:tab.id,phase:'connecting',sessionId:crypto.randomUUID(),captureUrl:tab.url,captureTitle:tab.title};
 const streamId=await chrome.tabCapture.getMediaStreamId({targetTabId:tab.id});await offscreen();
 await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},files:['content.js']}).catch(async()=>{await chrome.scripting.executeScript({target:{tabId:tab.id!},files:['content.js']});});
 await broadcast('inspect');const response=await send('offscreen','start',{streamId,sessionId:state.sessionId,token,config:await chrome.storage.sync.get(defaults),glossary:(await chrome.storage.local.get({glossary:emptyGlossary})).glossary,scopeUrl:tab.url,video:state.video});
 if(!response?.ok)throw new Error(response?.error||'无法启动音频采集');await broadcast('epoch',{sessionId:state.sessionId,epoch:0});
}
chrome.action.onClicked.addListener(tab=>{if(tab.id)void chrome.sidePanel.open({tabId:tab.id});});
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
 if(message.target!=='background')return;
 (async()=>{
  if(message.kind==='start')await start(message.tabId);
  if(message.kind==='stop'){retire(state.sessionId,state.epoch);interimSavedAt.clear();cancelPanelTranslations('停止后已取消翻译');if(state.sessionId)await cancelPending(state.sessionId,state.epoch,'停止后已取消翻译');await send('offscreen','stop');await broadcast('clear');videos.clear();state={...initialState};}
  if(message.kind==='prepare-translation'){await offscreen();return await send('offscreen','prepare-translation',{sourceLanguage:message.sourceLanguage,targetLanguage:message.targetLanguage});}
  if(message.kind==='cancel-panel-translation'){const pending=pendingTranslations.get(message.requestId);if(pending){clearTimeout(pending.timer);pendingTranslations.delete(message.requestId);pending.resolve({ok:false,error:'翻译已取消'});panel?.postMessage({kind:'cancel-translation',id:message.requestId});}return{ok:true};}
  if(message.kind==='panel-translate')return await translateInPanel(message);
  if(message.kind==='retry-translation')return await send('offscreen','retry-translation');
  if(message.kind==='state')state={...state,...message.state,tabId:state.tabId,video:state.video,videos:state.videos,captureUrl:state.captureUrl,captureTitle:state.captureTitle};
  if(message.kind==='epoch'){retire(message.sessionId,message.previousEpoch??state.epoch);interimSavedAt.clear();cancelPanelTranslations('识别段重置，已取消旧翻译');if(state.sessionId)await cancelPending(state.sessionId,message.previousEpoch??state.epoch,'识别段重置，已取消旧翻译');state.epoch=message.epoch;state.latestTranslation='';await broadcast('epoch',{sessionId:message.sessionId,epoch:message.epoch});}
  if(message.kind==='subtitle'&&message.event.sessionId===state.sessionId&&message.event.epoch===state.epoch){
   const event=message.event,media=state.video,pageUrl=state.captureUrl,pageTitle=state.captureTitle;
   const isCurrent=()=>event.sessionId===state.sessionId&&event.epoch===state.epoch&&state.phase!=='idle'&&!retired.has(epochKey(event.sessionId,event.epoch));
   const metadata=async()=>{const config=await chrome.storage.sync.get(defaults);return{targetLanguage:event.targetLanguage??config.targetLanguage,url:media?.url||pageUrl||'',title:media?.title||pageTitle||'',videoId:media?.id,mediaUrl:media?.mediaUrl,documentId:media?.documentId,live:media?.live};};
   if(event.phase==='final'){interimSavedAt.delete(`${event.sessionId}:${event.epoch}:${event.segmentId}`);await persistReceivedFinal(event,metadata,isCurrent,()=>broadcast('subtitle',{event}));}
   else if(isCurrent()){await broadcast('subtitle',{event});const key=`${event.sessionId}:${event.epoch}:${event.segmentId}`,now=Date.now();if(event.sourceText?.trim().length>=8&&(now-(interimSavedAt.get(key)??-Infinity)>=1500)){interimSavedAt.set(key,now);void metadata().then(data=>saveInterim({...event,...data})).catch(()=>{});}}
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
  if(message.kind==='video-event'&&sender.tab?.id===state.tabId&&selected===`${sender.frameId}:${message.video.id}`){state.video={...message.video,frameId:sender.frameId};await send('offscreen','video',{video:state.video,reset:message.reason});}
  if(message.kind==='page-caption'&&sender.tab?.id===state.tabId&&selected===`${sender.frameId}:${message.videoId}`&&state.phase!=='idle')await send('offscreen','page-caption',{caption:message.caption});
  if(message.kind==='rendered'&&sender.tab?.id===state.tabId)await send('offscreen','rendered',{event:message.event});
  if(message.kind==='content-warning'&&sender.tab?.id===state.tabId)state.message=message.message;
  return state;
 })().then(reply,error=>{if(message.kind==='start')state={...state,phase:'error',message:String(error)};reply({...state,error:String(error)});});return true;
});
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.glossary)void send('offscreen','glossary',{glossary:changes.glossary.newValue??emptyGlossary}).catch(()=>{});if(area==='sync')void chrome.storage.sync.get(defaults).then(async config=>{await broadcast('config',{config});await send('offscreen','config',{config}).catch(()=>{});});});
chrome.tabs.onRemoved.addListener(tabId=>{if(tabId===state.tabId){retire(state.sessionId,state.epoch);cancelPanelTranslations('目标标签页已关闭');if(state.sessionId)void cancelPending(state.sessionId,state.epoch,'目标标签页已关闭');void send('offscreen','stop');state={...initialState};}});
chrome.tabs.onUpdated.addListener((tabId,change)=>{if(tabId===state.tabId&&change.url)void pageLocation(change.url);if(tabId===state.tabId&&change.status==='loading'){videos.clear();manual=false;void choose();}if(tabId===state.tabId&&change.status==='complete'&&state.phase!=='idle')void chrome.scripting.executeScript({target:{tabId,allFrames:true},files:['content.js']}).catch(()=>{});});
