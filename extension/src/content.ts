import {subtitlePage,displaySource}from'./display';
import {RevisionGate} from './core';
import {PageCaptionRevisions,showingCaptionTrack,visibleCaptionText,visibleTrackCaption} from './page-captions';
import {activeCue,type ImportedCue} from './subtitle-import';
import {renderAndConfirm,overlayVisible,translationMatches} from './render';
import {defaults,send,type Config,type VideoInfo} from './shared';
import {typewriterStep,liveSubtitleText} from './typewriter';
import {retainCaptionOnReset} from './media';
import {captionHoldDelay} from './caption-hold';
const sentinel='__localCaptionInstalled';
if(!(globalThis as any)[sentinel]){
 (globalThis as any)[sentinel]=true;
 const owner=crypto.randomUUID(),ownerAttribute='data-captionripple-owner';
 document.documentElement.setAttribute(ownerAttribute,owner);
 document.querySelectorAll('#local-caption-host').forEach(node=>node.remove());
 const ownsPage=()=>document.documentElement.getAttribute(ownerAttribute)===owner;
 const gate=new RevisionGate();let config:Config=defaults,selected:HTMLVideoElement|undefined,enabled=false,sessionId='',epoch=0,frameId=0;
 const ids=new WeakMap<HTMLVideoElement,string>(),observed=new WeakSet<HTMLVideoElement>();
 let pageCaptionText='',pageCaptionAt=0,pendingCaptionText='',pageCaptionTimer:ReturnType<typeof setTimeout>|undefined;
 let pageCaptionTrack:TextTrack|undefined;
 const pageCaptionRevisions=new PageCaptionRevisions();
 let importedCues:ImportedCue[]|undefined,importedVideoId='',importedCueIndex=-2;
 let lastUrl=location.href;let pending=false;let currentEvent:any;let displayedTranslationRevision=0,finalShownAt=0;
 let typingTimer:ReturnType<typeof setTimeout>|undefined,typingTarget='',typingIdentity='';
 let holdTimer:ReturnType<typeof setTimeout>|undefined,pendingEvent:any,pendingUntil=0,pendingFinalTranslation:any,pendingLiveTranslation:any;
 const host=document.createElement('div');host.id='local-caption-host';
 const shadow=host.attachShadow({mode:'closed'});const text=document.createElement('div');text.setAttribute('role','status');text.setAttribute('aria-live','polite');
 const sourceLine=document.createElement('span'),targetLine=document.createElement('span');sourceLine.className='source';targetLine.className='translation';text.append(sourceLine,targetLine);
 const discardPending=()=>{clearTimeout(holdTimer);pendingUntil=0;pendingEvent=undefined;pendingFinalTranslation=undefined;pendingLiveTranslation=undefined;};
 const clearText=()=>{discardPending();clearTimeout(typingTimer);typingTarget='';typingIdentity='';sourceLine.textContent='';targetLine.textContent='';displayedTranslationRevision=0;finalShownAt=0;};
 const showSource=(target:string,identity:string,animate:boolean)=>{
  clearTimeout(typingTimer);typingTarget=target;
  if(identity!==typingIdentity){typingIdentity=identity;sourceLine.textContent='';}
  if(!animate){sourceLine.textContent=target;return;}
  const tick=()=>{sourceLine.textContent=typewriterStep(sourceLine.textContent??'',typingTarget);if(sourceLine.textContent!==typingTarget)typingTimer=setTimeout(tick,35);};
  tick();
 };
 const style=document.createElement('style');style.textContent='span{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;max-height:2.8em}.source{font-size:.72em;opacity:.72}.translation{font-size:1em}.translation:empty{display:none}:host{pointer-events:none!important;z-index:2147483647!important}div{color:white;line-height:1.4;text-align:center;border-radius:8px;padding:8px 16px;width:min(720px,90%);min-height:2.8em;box-sizing:border-box;white-space:pre-wrap;overflow-wrap:anywhere;font-family:system-ui,sans-serif;text-shadow:0 1px 2px black}button{pointer-events:auto;position:fixed;right:16px;top:16px;z-index:2147483647;padding:8px;background:#111c;color:white;border:1px solid #bbb;border-radius:6px}';
 const fullscreenButton=document.createElement('button');fullscreenButton.textContent='带字幕全屏';fullscreenButton.setAttribute('aria-label','使用字幕容器全屏');fullscreenButton.hidden=true;
 shadow.append(style,text,fullscreenButton);
 function info(v:HTMLVideoElement):VideoInfo{
  if(!ids.has(v))ids.set(v,crypto.randomUUID());const rect=v.getBoundingClientRect();const visible=getComputedStyle(v).visibility!=='hidden'&&getComputedStyle(v).display!=='none';
  return{id:ids.get(v)!,mediaUrl:v.currentSrc||v.src,url:location.href,title:document.title,currentTime:Number.isFinite(v.currentTime)?v.currentTime:null,live:!Number.isFinite(v.duration)||!!v.closest('.ytp-live')||!!document.querySelector('meta[itemprop="isLiveBroadcast"][content="True"],meta[itemprop="isLiveBroadcast"][content="true"]'),playbackRate:v.playbackRate,paused:v.paused,observedAt:Date.now(),area:visible?Math.max(0,Math.min(innerWidth,rect.right)-Math.max(0,rect.left))*Math.max(0,Math.min(innerHeight,rect.bottom)-Math.max(0,rect.top)):0,label:v.getAttribute('aria-label')||v.currentSrc||document.title};
 }
 function position(){
  if(!ownsPage()){host.remove();return;}
  if(!enabled){host.remove();return;}
  const fullscreen=document.fullscreenElement;
  if(fullscreen instanceof HTMLVideoElement){void send('background','content-warning',{message:'原生视频全屏会遮住 DOM 字幕。退出后点击“带字幕全屏”。'});}
  const parent=fullscreen&&!(fullscreen instanceof HTMLVideoElement)?fullscreen:document.body;
  if(parent&&!parent.contains(host))parent.append(host);
  const rect=selected?.getBoundingClientRect();const useVideo=rect&&rect.width>0&&rect.height>0;
  const left=useVideo?Math.max(0,rect.left):0,top=useVideo?Math.max(0,rect.top):0,width=useVideo?Math.min(rect.width,innerWidth-left):innerWidth,height=useVideo?Math.min(rect.height,innerHeight-top):innerHeight;
  host.style.cssText=`position:fixed!important;left:${left}px!important;top:${top}px!important;width:${width}px!important;height:${height}px!important;display:flex!important;align-items:${config.position==='top'?'flex-start':'flex-end'}!important;justify-content:center!important;padding:24px 0!important;box-sizing:border-box!important;`;
  text.style.fontSize=`${config.fontSize}px`;
  const light=config.theme==='light',contrast=config.theme==='high-contrast';
  text.style.background=contrast?'#000':light?`rgba(255,255,255,${Math.max(.8,config.opacity)})`:`rgba(0,0,0,${config.opacity})`;
  text.style.color=light?'#171717':'#fff';text.style.textShadow=contrast||light?'none':'0 1px 2px black';
  sourceLine.style.opacity=contrast?'1':light?'.85':'.72';text.hidden=!text.textContent;
  fullscreenButton.hidden=!selected||!!fullscreen;
 }
 fullscreenButton.onclick=async()=>{try{const parent=selected?.parentElement;if(!parent)throw new Error('找不到视频容器');await parent.requestFullscreen();}catch(error){void send('background','content-warning',{message:`全屏失败：${String(error)}`});}};
 function visiblePageCaption():{text:string;language?:string;track?:TextTrack}|null{
  if(!selected||selected.paused)return null;
  const trackCaption=visibleTrackCaption(Array.from(selected.textTracks));
  if(trackCaption)return trackCaption;
  if(location.hostname==='www.youtube.com'||location.hostname==='youtube.com'){
   const text=visibleCaptionText(document.querySelectorAll('.ytp-caption-segment'));
   if(text)return{text,language:/[\u3400-\u9fff]/u.test(text)?'zh':'en'};
  }
  return null;
 }
 function capturePageCaption(){
  if(!ownsPage()||!enabled||!selected||!sessionId||importedCues)return;
  const caption=visiblePageCaption();if(!caption)return;
  if(caption.text===pageCaptionText&&Date.now()-pageCaptionAt<3000)return;
  if(caption.text===pendingCaptionText)return;
  clearTimeout(pageCaptionTimer);const video=selected;
  pendingCaptionText=caption.text;
  pageCaptionTimer=setTimeout(()=>{
   pendingCaptionText='';
   const stable=visiblePageCaption();if(!ownsPage()||!stable||stable.text!==caption.text||selected!==video||!enabled)return;
   pageCaptionText=stable.text;pageCaptionAt=Date.now();pageCaptionTrack=stable.track;
   const identity=pageCaptionRevisions.observe(stable.text,pageCaptionAt);
   void send('background','page-caption',{videoId:ids.get(video),caption:{language:stable.language,text:identity.mergedText,mediaTime:video.currentTime,segmentId:identity.segmentId,revision:identity.revision}}).catch(()=>{});
  },250);
 }
 function scan(){
  if(!ownsPage()){host.remove();return;}
  const items=[...document.querySelectorAll('video')];
  for(const v of items)if(!observed.has(v)){
   observed.add(v);
   for(const event of ['pause','playing','seeking','seeked','ratechange','emptied'])v.addEventListener(event,()=>{if(ownsPage()&&selected===v){void send('background','video-event',{video:info(v),reason:event});captureImportedCue();}});
   v.addEventListener('timeupdate',()=>{if(ownsPage()&&selected===v)captureImportedCue();});
   v.textTracks.addEventListener('change',()=>{
    if(!ownsPage()||!enabled||!sessionId||importedCues||selected!==v||!pageCaptionTrack||showingCaptionTrack(pageCaptionTrack))return;
    pageCaptionTrack=undefined;
    if(Array.from(v.textTracks).some(showingCaptionTrack)||visiblePageCaption())return;
    void send('background','page-caption-ended',{videoId:ids.get(v),sessionId,epoch}).catch(()=>{});
   });
  }
  void send('background','videos',{videos:items.map(info).filter(v=>v.area>0)}).catch(()=>{});position();capturePageCaption();captureImportedCue();
 }
 function captureImportedCue(){
  if(!importedCues||!selected||!enabled||!sessionId||ids.get(selected)!==importedVideoId)return;
  const current=activeCue(importedCues,selected.currentTime),index=current?.index??-1;
  if(index===importedCueIndex)return;
  importedCueIndex=index;
  void send('background','import-cue',{videoId:importedVideoId,index,mediaTime:selected.currentTime}).catch(()=>{});
 }
 function schedule(){if(!pending){pending=true;requestAnimationFrame(()=>{pending=false;scan();});}}
 const observer=new MutationObserver(records=>{if(!ownsPage()){observer.disconnect();host.remove();return;}if(records.some(r=>[...r.addedNodes].some(n=>n instanceof Element&&(n.tagName==='IFRAME'||n.querySelector('iframe')))))void send('background','frames-changed').catch(()=>{});if(records.some(r=>r.target!==host&&!shadow.contains(r.target)))schedule();});observer.observe(document.documentElement,{childList:true,subtree:true});
 document.addEventListener('fullscreenchange',position);window.addEventListener('resize',position);window.addEventListener('scroll',position,{passive:true});
 const interval=setInterval(()=>{if(!ownsPage()){clearInterval(interval);host.remove();return;}if(location.href!==lastUrl){lastUrl=location.href;if(window===window.top&&sessionId)void send('background','page-location',{url:location.href,title:document.title});else if(selected)void send('background','video-event',{video:info(selected),reason:'navigation'});}if(sessionId)scan();},1000);
 const sameCaption=(a:any,b:any)=>a?.sessionId===b?.sessionId&&a?.epoch===b?.epoch&&a?.segmentId===b?.segmentId;
 const showFinalTranslation=(event:any)=>{if(enabled&&translationMatches(currentEvent,event,displayedTranslationRevision)){displayedTranslationRevision=event.translationRevision??1;targetLine.textContent=event.text===currentEvent.sourceText?'':subtitlePage(event.text).text;position();if(targetLine.textContent){const source=currentEvent,translationRevision=displayedTranslationRevision;renderAndConfirm(()=>currentEvent===source&&displayedTranslationRevision===translationRevision&&host.isConnected&&!text.hidden&&document.visibilityState==='visible'&&overlayVisible(document.fullscreenElement instanceof HTMLVideoElement,host.getBoundingClientRect(),innerWidth,innerHeight)&&overlayVisible(false,targetLine.getBoundingClientRect(),innerWidth,innerHeight),()=>{void send('background','rendered',{event:{type:'rendered',sessionId:source.sessionId,epoch:source.epoch,segmentId:source.segmentId,revision:source.revision,renderedAt:Date.now(),hasTranslation:true,translationRevision}});});}}};
 const showLiveTranslation=(event:any)=>{if(enabled&&currentEvent?.phase==='interim'&&sameCaption(currentEvent,event)&&subtitlePage(currentEvent.displaySourceText??currentEvent.sourceText).index===event.pageIndex){targetLine.textContent=event.text===event.pageText?'':subtitlePage(event.text).text;position();if(targetLine.textContent){const source=currentEvent;renderAndConfirm(()=>currentEvent===source&&host.isConnected&&!text.hidden&&document.visibilityState==='visible'&&overlayVisible(document.fullscreenElement instanceof HTMLVideoElement,host.getBoundingClientRect(),innerWidth,innerHeight)&&overlayVisible(false,targetLine.getBoundingClientRect(),innerWidth,innerHeight),()=>{void send('background','rendered',{event:{type:'rendered',sessionId:source.sessionId,epoch:source.epoch,segmentId:source.segmentId,revision:source.revision,renderedAt:Date.now(),hasTranslation:true}});});}}};
 function showSubtitle(event:any){
  const previous=currentEvent;currentEvent=event;if(event.phase==='final')finalShownAt=Date.now();
  const shown=event.displaySourceText??displaySource(event.sourceText,event.phase,event.splitReason);
  showSource(['page-caption','subtitle-import'].includes(event.engine)?subtitlePage(shown).text:liveSubtitleText(shown),`${event.sessionId}:${event.epoch}:${event.segmentId}`,event.phase==='interim'&&event.engine!=='page-caption');
  if(event.phase!=='interim'||previous?.phase!=='interim'||previous.segmentId!==event.segmentId||!event.sourceText.startsWith(previous.sourceText))targetLine.textContent='';
  displayedTranslationRevision=0;position();
  renderAndConfirm(()=>currentEvent===event&&host.isConnected&&!text.hidden&&document.visibilityState==='visible'&&overlayVisible(document.fullscreenElement instanceof HTMLVideoElement,host.getBoundingClientRect(),innerWidth,innerHeight)&&overlayVisible(false,text.getBoundingClientRect(),innerWidth,innerHeight),()=>{void send('background','rendered',{event:{type:'rendered',sessionId:event.sessionId,epoch:event.epoch,segmentId:event.segmentId,revision:event.revision,renderedAt:Date.now(),hasTranslation:false}});});
 }
 const flushPending=()=>{const event=pendingEvent,finalTranslation=pendingFinalTranslation,liveTranslation=pendingLiveTranslation;discardPending();if(!event||!enabled)return;showSubtitle(event);if(liveTranslation)showLiveTranslation(liveTranslation);if(finalTranslation)showFinalTranslation(finalTranslation);};
 chrome.runtime.onMessage.addListener((message,_sender,reply)=>{
  if(message.target!=='content')return;
  if(!ownsPage()){reply({ok:false});return;}
  if(message.kind==='inspect')scan();
  if(message.kind==='config'){config={...defaults,...message.config};position();}
  if(message.kind==='seek'&&selected&&ids.get(selected)===message.id&&Number.isFinite(message.time)&&!info(selected).live&&info(selected).mediaUrl===message.mediaUrl){selected.currentTime=Math.max(0,message.time);}
  if(message.kind==='translation'&&enabled){if(pendingEvent&&sameCaption(pendingEvent,message.event))pendingFinalTranslation=message.event;else showFinalTranslation(message.event);}
  if(message.kind==='interim-translation'&&enabled){if(pendingEvent&&sameCaption(pendingEvent,message.event))pendingLiveTranslation=message.event;else showLiveTranslation(message.event);}
  if(message.kind==='select'){
   if(message.sessionId&&(sessionId!==message.sessionId||epoch!==message.epoch)){sessionId=message.sessionId;epoch=message.epoch;gate.reset(sessionId,epoch);clearText();currentEvent=undefined;}
   frameId=message.frameId??0;config={...defaults,...message.config};
   const next=[...document.querySelectorAll('video')].find(v=>ids.get(v)===message.id);if(next!==selected){pageCaptionText='';pageCaptionAt=0;pendingCaptionText='';pageCaptionTrack=undefined;pageCaptionRevisions.reset();clearTimeout(pageCaptionTimer);importedCueIndex=-2;}selected=next;
   // Only the selected frame renders; top frame is the audio-only/cross-origin fallback.
   enabled=!!selected||(!message.id&&window===window.top);position();capturePageCaption();
  }
  if(message.kind==='import-subtitles'){importedCues=message.cues;importedVideoId=message.videoId;importedCueIndex=-2;captureImportedCue();}
  if(message.kind==='clear-import'){importedCues=undefined;importedVideoId='';importedCueIndex=-2;clearText();position();}
  if(message.kind==='clear-import-cue'){clearText();position();}
  if(message.kind==='epoch'){const keep=retainCaptionOnReset(message.reason);if(keep&&pendingEvent)flushPending();sessionId=message.sessionId;epoch=message.epoch;gate.reset(sessionId,epoch);pageCaptionText='';pageCaptionAt=0;pendingCaptionText='';pageCaptionTrack=undefined;pageCaptionRevisions.reset();clearTimeout(pageCaptionTimer);if(!keep){clearText();currentEvent=undefined;}position();}
  if(message.kind==='clear'){enabled=false;sessionId='';importedCues=undefined;importedVideoId='';importedCueIndex=-2;clearTimeout(pageCaptionTimer);pageCaptionText='';pendingCaptionText='';pageCaptionTrack=undefined;pageCaptionRevisions.reset();clearText();host.remove();}
  if(message.kind==='subtitle'&&enabled&&(message.event.engine==='subtitle-import'||gate.accept(message.event))){
   const event=message.event,now=Date.now(),samePending=!!pendingEvent&&sameCaption(pendingEvent,event);
   const finalTranslation=samePending?pendingFinalTranslation:undefined;
   const liveTranslation=samePending?pendingLiveTranslation:undefined;
   const sourceLanguage=event.sourceLanguage==='yue'?'zh':event.sourceLanguage;
   const awaitingDraftTranslation=config.translationEngine!=='off'&&sourceLanguage!==config.targetLanguage&&!liveTranslation;
   const budget=captionHoldDelay(currentEvent,event,finalShownAt,now,awaitingDraftTranslation);
   const delay=pendingUntil?Math.min(budget,Math.max(0,pendingUntil-now)):budget;
   discardPending();
   if(delay>0){
    pendingEvent=event;pendingUntil=now+delay;pendingFinalTranslation=finalTranslation;pendingLiveTranslation=liveTranslation;
    holdTimer=setTimeout(flushPending,delay);
   }else{
    showSubtitle(event);
    if(liveTranslation)showLiveTranslation(liveTranslation);
    if(finalTranslation)showFinalTranslation(finalTranslation);
   }
  }
  reply({ok:true});
 });scan();
}
