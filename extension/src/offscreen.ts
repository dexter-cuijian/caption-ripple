import {translationMatches}from'./render';
import {FinalTranslator,translatorAPI,type NativeTranslator} from './translation';
import {RevisionGate,terminalClose} from './core';
import {defaults, initialState,send, type Config,type VideoInfo} from './shared';
let context:AudioContext|undefined,stream:MediaStream|undefined,source:MediaStreamAudioSourceNode|undefined,worklet:AudioWorkletNode|undefined,silent:GainNode|undefined;
let socket:WebSocket|undefined,retry:ReturnType<typeof setTimeout>|undefined,active=false,accepted=false,attempt=0;
let sessionId='',epoch=0,seq=0,sampleStart=0,anchor:number|null=null,contextWall=0;
let latestSource:any;
let config:Config=defaults,token='',video:VideoInfo|undefined;
let state:import('./shared').State={...initialState};const revisions=new RevisionGate();
const publish=(update:Partial<typeof state>)=>{state={...state,...update,sessionId,epoch,contextState:context?.state??'none'};void send('background','state',{state}).catch(()=>{});};

const nativeInstances=new Map<string,NativeTranslator>();
async function prepareNative(sourceLanguage:string,targetLanguage:string){
 const api=translatorAPI();if(!api)throw new Error('此执行环境没有 Chrome Translator API');
 const availability=await api.availability({sourceLanguage,targetLanguage});
 if(availability!=='available')throw new Error(`翻译模型 ${availability}；请在侧栏点击“准备本地翻译”下载`);
 const key=`${sourceLanguage}:${targetLanguage}`;
 if(!nativeInstances.has(key))nativeInstances.set(key,await api.create({sourceLanguage,targetLanguage}));
 return nativeInstances.get(key)!;
}
const translations=new FinalTranslator({translate:async(text,sourceLanguage,targetLanguage,signal)=>{
 if(config.translationEngine==='off')throw new Error('翻译已关闭；原文保存在历史中');
 try{const native=await prepareNative(sourceLanguage,targetLanguage);publish({translationStatus:'offscreen-ready',translationContext:'offscreen',translationError:undefined});return await native.translate(text,{signal});}
 catch(error){if(signal?.aborted)throw error;
 const response=await send('background','panel-translate',{text,sourceLanguage,targetLanguage});
 if(!response?.ok)throw new Error(response?.error||String(error));publish({translationContext:'panel'});return response.text;
 }
}},event=>{publish({...(translationMatches(latestSource,event)?{latestTranslation:event.text}:{}),translationStatus:'ready',translationError:undefined});void send('background','translation',{event:{...event,engine:event.engine??'chrome-translator'}}).then(response=>{if(response?.error)throw new Error(response.error);}).catch(error=>publish({translationError:String(error)}));},event=>{
 publish({translationStatus:'unavailable',translationError:event.error});void send('background','translation-failed',{event}).catch(()=>{});
});

function reset(reason:string){
 latestSource=undefined;const previousEpoch=epoch;epoch++;revisions.reset(sessionId,epoch);translations.reset(sessionId,epoch);seq=0;sampleStart=0;anchor=null;accepted=false;
 publish({latestText:'',latestTranslation:'',translationError:undefined,message:reason});
 if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'reset',sessionId,epoch,mediaTime:video?.currentTime??null,sourceLanguage:config.sourceLanguage,reason}));
 void send('background','epoch',{sessionId,epoch,previousEpoch}).catch(()=>{});
}
function connect(){
 if(!active)return;
 publish({phase:attempt?'reconnecting':'connecting',message:attempt?'正在重新连接本地服务':'正在连接本地服务'});
 socket=new WebSocket(config.wsUrl);const thisSocket=socket;
 socket.onopen=()=>{socket?.send(JSON.stringify({type:'hello',protocolVersion:1,token,sessionId,epoch,sourceLanguage:config.sourceLanguage,targetLanguage:config.targetLanguage,mode:'fast',video:video??{id:'viewport',url:'',title:'',currentTime:null,live:true,playbackRate:1}}));};
 socket.onmessage=(event)=>{
  if(socket!==thisSocket)return;
  try{
   const data=JSON.parse(event.data);
   if(data.sessionId&&data.sessionId!==sessionId)return;
   if(data.epoch!==undefined&&data.epoch!==epoch)return;
   if(data.type==='ready'||data.type==='reset'){accepted=true;attempt=0;publish({phase:'running',message:'正在识别原文'});}
   if(data.type==='subtitle'&&revisions.accept(data)){latestSource=data;publish({latestText:data.sourceText,latestTranslation:''});const targetLanguage=config.targetLanguage;void send('background','subtitle',{event:{...data,targetLanguage,translationState:config.translationEngine==='off'?'disabled':undefined}}).then(response=>{if(response?.error)throw new Error(response.error);if(data.phase==='final'&&config.translationEngine!=='off'){translations.enqueue(data,targetLanguage);publish({languageLock:translations.language.locked??undefined});}}).catch(error=>publish({translationError:`字幕保存失败：${String(error)}`}));}
   if(data.type==='status'){if(data.level==='error')accepted=false;publish({phase:data.level==='error'?'error':state.phase,message:data.message||data.code});if(data.code==='audio_overload')reset('识别队列积压，重新同步');}
  }catch(error){publish({message:`服务响应错误：${String(error)}`});}
 };
 socket.onerror=()=>publish({message:'无法连接本地识别服务，请检查服务地址和配对令牌'});
 socket.onclose=(event)=>{
  if(!active||socket!==thisSocket)return;accepted=false;
  if(terminalClose(event.code)){publish({phase:'error',message:`服务拒绝连接：${event.reason||'请检查配对令牌'}`});return;}
  reset('连接中断，开始新识别段');attempt++;
  publish({phase:'reconnecting',message:`连接断开 (${event.code})，${Math.min(15,2**Math.min(attempt,4))} 秒后重试`});
  retry=setTimeout(connect,Math.min(15000,1000*2**Math.min(attempt,4)));
 };
}
async function stop(){
 latestSource=undefined;active=false;accepted=false;clearTimeout(retry);translations.reset('',-1);
 if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'stop',sessionId,epoch}));socket?.close();socket=undefined;
 if(worklet)worklet.port.onmessage=null;
 for(const node of [worklet,source,silent])try{node?.disconnect();}catch{}
 stream?.getTracks().forEach(t=>t.stop());
 if(context){context.onstatechange=null;try{await context.close();}catch{}}context=undefined;stream=undefined;worklet=undefined;source=undefined;silent=undefined;
 publish({...initialState});
}
async function start(message:any){
 await stop();seq=0;sampleStart=0;anchor=null;attempt=0;contextWall=0;config={...defaults,...message.config};token=message.token;sessionId=message.sessionId;epoch=0;revisions.reset(sessionId,epoch);translations.reset(sessionId,epoch);video=message.video;
 try{
 stream=await navigator.mediaDevices.getUserMedia({audio:{mandatory:{chromeMediaSource:'tab',chromeMediaSourceId:message.streamId}} as MediaTrackConstraints,video:false});
 context=new AudioContext();await context.audioWorklet.addModule(chrome.runtime.getURL('worklet.js'));await context.resume();
 context.onstatechange=()=>publish({contextState:context?.state??'none'});
 contextWall=Date.now()-context.currentTime*1000;
 source=context.createMediaStreamSource(stream);
 // Pass-through is independent of WebSocket and the analysis branch.
 source.connect(context.destination);
 worklet=new AudioWorkletNode(context,'capture-16k');silent=context.createGain();silent.gain.value=0;
 source.connect(worklet);worklet.connect(silent);silent.connect(context.destination);
 worklet.port.onmessage=({data})=>{
  publish({rms:data.rms,outputConnected:true});
  if(!accepted||video?.paused||socket?.readyState!==WebSocket.OPEN)return;
  if(socket.bufferedAmount>64000){reset('音频发送积压，重新同步');return;}
  if(anchor===null)anchor=contextWall+data.contextTime*1000-100;
  const capturedAt=anchor+(sampleStart+1600)/16;
  const mediaTime=video?.currentTime==null?null:video.currentTime+(capturedAt-video.observedAt)/1000*video.playbackRate;
  socket.send(JSON.stringify({type:'clock',sessionId,epoch,seq:seq++,capturedAt,sampleStart,mediaTime,playbackRate:video?.playbackRate??1,paused:false}));
  socket.send(data.pcm);sampleStart+=1600;publish({framesSent:state.framesSent+1600});
 };
 stream.getAudioTracks()[0].onended=()=>{void stop();};active=true;publish({outputConnected:true});connect();
 }catch(error){await stop();throw error;}
}
chrome.runtime.onMessage.addListener((message,_sender,reply)=>{
 if(message.target!=='offscreen')return;
 (async()=>{
  if(message.kind==='prepare-translation'){try{await prepareNative(message.sourceLanguage,message.targetLanguage);translations.retry();publish({translationStatus:'offscreen-ready',translationContext:'offscreen',translationError:undefined});return{ok:true,context:'offscreen'};}catch(error){return{ok:false,error:String(error)};}}
  if(message.kind==='retry-translation'){translations.retry();}
  if(message.kind==='config'){const changed=config.sourceLanguage!==message.config.sourceLanguage||config.targetLanguage!==message.config.targetLanguage||config.translationEngine!==message.config.translationEngine;config={...defaults,...message.config};if(changed&&active)reset('语言或翻译引擎设置已更新');}
  if(message.kind==='start')await start(message);
  if(message.kind==='stop')await stop();
  if(message.kind==='video'){video=message.video;if(message.reset&&active)reset(message.reset);}
  if(message.kind==='rendered'&&accepted&&socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(message.event));
  return {ok:true};
 })().then(reply,error=>{publish({phase:'error',message:String(error)});reply({ok:false,error:String(error)});});return true;
});
