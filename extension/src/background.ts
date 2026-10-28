import {VideoRegistry} from './registry';
import {defaults,initialState,send,type State,type VideoInfo} from './shared';
let state:State={...initialState},videos=new VideoRegistry(),selected='',manual=false;
let offscreenCreating:Promise<void>|undefined;
async function offscreen(){
 if(await chrome.offscreen.hasDocument())return;
 offscreenCreating??=chrome.offscreen.createDocument({url:'offscreen.html',reasons:[chrome.offscreen.Reason.USER_MEDIA],justification:'Capture tab audio and preserve audible playback while transcribing locally.'}).finally(()=>{offscreenCreating=undefined;});await offscreenCreating;
}
async function broadcast(kind:string,extra:Record<string,unknown>={}){
 if(!state.tabId)return;
 await chrome.tabs.sendMessage(state.tabId,{target:'content',kind,...extra}).catch(()=>{});
}
async function choose(){
 const candidates=videos.candidates();
 const previous=selected;
 const current=videos.choose(selected,manual);
 selected=current?`${current.frameId}:${current.id}`:'';state.video=current;state.videos=candidates;
 await broadcast('select',{id:current?.id,frameId:current?.frameId,config:(await chrome.storage.sync.get(defaults)),sessionId:state.sessionId,epoch:state.epoch});
 await send('offscreen','video',{video:current,reset:previous&&previous!==selected?'video-change':undefined}).catch(()=>{});
}
async function start(){
 const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
 if(!tab?.id||!/^https?:\/\//.test(tab.url??''))throw new Error('请切换到普通 HTTP/HTTPS 网页再启动');
 const {token}=await chrome.storage.local.get('token');if(!token)throw new Error('请先粘贴本地 .runtime/token 配对令牌');
 if(state.phase!=='idle')await send('offscreen','stop').catch(()=>{});
 videos.clear();selected='';manual=false;state={...initialState,tabId:tab.id,phase:'connecting',sessionId:crypto.randomUUID()};
 // This user-invoked service-worker call is required by tabCapture. Never call it from offscreen.
 const streamId=await chrome.tabCapture.getMediaStreamId({targetTabId:tab.id});
 await offscreen();
 await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},files:['content.js']}).catch(async()=>{await chrome.scripting.executeScript({target:{tabId:tab.id!},files:['content.js']});});
 await broadcast('inspect');
 const response=await send('offscreen','start',{streamId,sessionId:state.sessionId,token,config:await chrome.storage.sync.get(defaults),video:state.video});
 if(!response?.ok)throw new Error(response?.error||'无法启动音频采集');
 await broadcast('epoch',{sessionId:state.sessionId,epoch:0});
}
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
 if(message.target!=='background')return;
 (async()=>{
  if(message.kind==='start')await start();
  if(message.kind==='stop'){await send('offscreen','stop');await broadcast('clear');videos.clear();state={...initialState};}
  if(message.kind==='state'){state={...state,...message.state,tabId:state.tabId,video:state.video,videos:state.videos};}
  if(message.kind==='epoch'){state.epoch=message.epoch;await broadcast('epoch',{sessionId:message.sessionId,epoch:message.epoch});}
  if(message.kind==='subtitle')await broadcast('subtitle',{event:message.event});
  if(message.kind==='frames-changed'&&sender.tab?.id===state.tabId&&state.tabId)await chrome.scripting.executeScript({target:{tabId:state.tabId,allFrames:true},files:['content.js']}).catch(()=>{});
  if(message.kind==='videos'&&sender.tab?.id===state.tabId){
   videos.report(sender.frameId??0,message.videos);await choose();
  }
  if(message.kind==='select-video'){manual=true;selected=message.id;await choose();}
  if(message.kind==='video-event'&&sender.tab?.id===state.tabId&&selected===`${sender.frameId}:${message.video.id}`){state.video={...message.video,frameId:sender.frameId};await send('offscreen','video',{video:state.video,reset:message.reason});}
  if(message.kind==='rendered'&&sender.tab?.id===state.tabId)await send('offscreen','rendered',{event:message.event});
  if(message.kind==='content-warning'&&sender.tab?.id===state.tabId)state.message=message.message;
  return state;
 })().then(reply,error=>{state={...state,phase:'error',message:String(error)};reply(state);});return true;
});
chrome.tabs.onRemoved.addListener(tabId=>{if(tabId===state.tabId){void send('offscreen','stop');state={...initialState};}});
chrome.tabs.onUpdated.addListener((tabId,change)=>{if(tabId===state.tabId&&change.status==='loading'){videos.clear();manual=false;void choose();}if(tabId===state.tabId&&change.status==='complete'&&state.phase!=='idle')void chrome.scripting.executeScript({target:{tabId,allFrames:true},files:['content.js']}).catch(()=>{});});
