import {subtitlePage}from'./display';
import {RevisionGate} from './core';
import {renderAndConfirm,overlayVisible,translationMatches} from './render';
import {defaults,send,type Config,type VideoInfo} from './shared';
const sentinel='__localCaptionInstalled';
if(!(globalThis as any)[sentinel]){
 (globalThis as any)[sentinel]=true;
 const gate=new RevisionGate();let config:Config=defaults,selected:HTMLVideoElement|undefined,enabled=false,sessionId='',epoch=0,frameId=0;
 const ids=new WeakMap<HTMLVideoElement,string>(),observed=new WeakSet<HTMLVideoElement>();
 let lastUrl=location.href;let pending=false;let currentEvent:any;let displayedTranslationRevision=0;
 const host=document.createElement('div');host.id='local-caption-host';
 const shadow=host.attachShadow({mode:'closed'});const text=document.createElement('div');text.setAttribute('role','status');text.setAttribute('aria-live','polite');
 const sourceLine=document.createElement('span'),targetLine=document.createElement('span');sourceLine.className='source';targetLine.className='translation';text.append(sourceLine,targetLine);
 const clearText=()=>{sourceLine.textContent='';targetLine.textContent='';displayedTranslationRevision=0;};
 const style=document.createElement('style');style.textContent='span{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;max-height:2.8em}.source{font-size:.72em;opacity:.72}.translation{font-size:1em}.translation:empty{display:none}:host{pointer-events:none!important;z-index:2147483647!important}div{color:white;line-height:1.4;text-align:center;border-radius:8px;padding:8px 16px;max-width:90%;white-space:pre-wrap;overflow-wrap:anywhere;font-family:system-ui,sans-serif;text-shadow:0 1px 2px black}button{pointer-events:auto;position:fixed;right:16px;top:16px;z-index:2147483647;padding:8px;background:#111c;color:white;border:1px solid #bbb;border-radius:6px}';
 const fullscreenButton=document.createElement('button');fullscreenButton.textContent='带字幕全屏';fullscreenButton.setAttribute('aria-label','使用字幕容器全屏');fullscreenButton.hidden=true;
 shadow.append(style,text,fullscreenButton);
 function info(v:HTMLVideoElement):VideoInfo{
  if(!ids.has(v))ids.set(v,crypto.randomUUID());const rect=v.getBoundingClientRect();const visible=getComputedStyle(v).visibility!=='hidden'&&getComputedStyle(v).display!=='none';
  return{id:ids.get(v)!,url:location.href,title:document.title,currentTime:Number.isFinite(v.currentTime)?v.currentTime:null,live:!Number.isFinite(v.duration),playbackRate:v.playbackRate,paused:v.paused,observedAt:Date.now(),area:visible?Math.max(0,Math.min(innerWidth,rect.right)-Math.max(0,rect.left))*Math.max(0,Math.min(innerHeight,rect.bottom)-Math.max(0,rect.top)):0,label:v.getAttribute('aria-label')||v.currentSrc||document.title};
 }
 function position(){
  if(!enabled){host.remove();return;}
  const fullscreen=document.fullscreenElement;
  if(fullscreen instanceof HTMLVideoElement){void send('background','content-warning',{message:'原生视频全屏会遮住 DOM 字幕。退出后点击“带字幕全屏”。'});}
  const parent=fullscreen&&!(fullscreen instanceof HTMLVideoElement)?fullscreen:document.body;
  if(parent&&!parent.contains(host))parent.append(host);
  const rect=selected?.getBoundingClientRect();const useVideo=rect&&rect.width>0&&rect.height>0;
  const left=useVideo?Math.max(0,rect.left):0,top=useVideo?Math.max(0,rect.top):0,width=useVideo?Math.min(rect.width,innerWidth-left):innerWidth,height=useVideo?Math.min(rect.height,innerHeight-top):innerHeight;
  host.style.cssText=`position:fixed!important;left:${left}px!important;top:${top}px!important;width:${width}px!important;height:${height}px!important;display:flex!important;align-items:${config.position==='top'?'flex-start':'flex-end'}!important;justify-content:center!important;padding:24px 0!important;box-sizing:border-box!important;`;
  text.style.fontSize=`${config.fontSize}px`;text.style.background=`rgba(0,0,0,${config.opacity})`;text.hidden=!text.textContent;
  fullscreenButton.hidden=!selected||!!fullscreen;
 }
 fullscreenButton.onclick=async()=>{try{const parent=selected?.parentElement;if(!parent)throw new Error('找不到视频容器');await parent.requestFullscreen();}catch(error){void send('background','content-warning',{message:`全屏失败：${String(error)}`});}};
 function scan(){
  const items=[...document.querySelectorAll('video')];
  for(const v of items)if(!observed.has(v)){
   observed.add(v);
   for(const event of ['pause','playing','seeking','ratechange','emptied'])v.addEventListener(event,()=>{if(selected===v)void send('background','video-event',{video:info(v),reason:event});});
  }
  void send('background','videos',{videos:items.map(info).filter(v=>v.area>0)}).catch(()=>{});position();
 }
 function schedule(){if(!pending){pending=true;requestAnimationFrame(()=>{pending=false;scan();});}}
 new MutationObserver(records=>{if(records.some(r=>[...r.addedNodes].some(n=>n instanceof Element&&(n.tagName==='IFRAME'||n.querySelector('iframe')))))void send('background','frames-changed').catch(()=>{});if(records.some(r=>r.target!==host&&!shadow.contains(r.target)))schedule();}).observe(document.documentElement,{childList:true,subtree:true});
 document.addEventListener('fullscreenchange',position);window.addEventListener('resize',position);window.addEventListener('scroll',position,{passive:true});
 setInterval(()=>{if(location.href!==lastUrl){lastUrl=location.href;if(selected)void send('background','video-event',{video:info(selected),reason:'navigation'});}if(sessionId)scan();},1000);
 chrome.runtime.onMessage.addListener((message,_sender,reply)=>{
  if(message.target!=='content')return;
  if(message.kind==='inspect')scan();
  if(message.kind==='config'){config={...defaults,...message.config};position();}
  if(message.kind==='seek'&&selected&&ids.get(selected)===message.id&&Number.isFinite(message.time)){selected.currentTime=Math.max(0,message.time);}
  if(message.kind==='translation'&&enabled&&translationMatches(currentEvent,message.event,displayedTranslationRevision)){displayedTranslationRevision=message.event.translationRevision??1;targetLine.textContent=message.event.text===currentEvent.sourceText?'':subtitlePage(message.event.text).text;position();}
  if(message.kind==='select'){
   if(message.sessionId&&(sessionId!==message.sessionId||epoch!==message.epoch)){sessionId=message.sessionId;epoch=message.epoch;gate.reset(sessionId,epoch);clearText();currentEvent=undefined;}
   frameId=message.frameId??0;config={...defaults,...message.config};
   selected=[...document.querySelectorAll('video')].find(v=>ids.get(v)===message.id);
   // Only the selected frame renders; top frame is the audio-only/cross-origin fallback.
   enabled=!!selected||(!message.id&&window===window.top);position();
  }
  if(message.kind==='epoch'){sessionId=message.sessionId;epoch=message.epoch;gate.reset(sessionId,epoch);clearText();currentEvent=undefined;}
  if(message.kind==='clear'){enabled=false;sessionId='';clearText();host.remove();}
  if(message.kind==='subtitle'&&enabled&&gate.accept(message.event)){
   const event=message.event;currentEvent=event;sourceLine.textContent=subtitlePage(event.sourceText).text;targetLine.textContent='';displayedTranslationRevision=0;position();
   renderAndConfirm(()=>currentEvent===event&&host.isConnected&&!text.hidden&&document.visibilityState==='visible'&&overlayVisible(document.fullscreenElement instanceof HTMLVideoElement,host.getBoundingClientRect(),innerWidth,innerHeight)&&overlayVisible(false,text.getBoundingClientRect(),innerWidth,innerHeight),()=>{void send('background','rendered',{event:{type:'rendered',sessionId:event.sessionId,epoch:event.epoch,segmentId:event.segmentId,revision:event.revision,renderedAt:Date.now(),hasTranslation:false}});});
  }
  reply({ok:true});
 });scan();
}
