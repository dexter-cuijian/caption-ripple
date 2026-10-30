import{GlossaryEditor}from'./glossary-editor';
import{withDeadline}from'./providers';
import{subtitlePage,displaySource}from'./display';
import{useEffect,useRef,useState}from'react';
import{createRoot}from'react-dom/client';
import{defaults,initialState,send,type Config,type State}from'./shared';
import{queryHistory,closeHistory,type CaptionRow}from'./history';
import{translatorAPI,type NativeTranslator}from'./translation';
import'./sidepanel.css';
function SidePanel(){
 const[state,setState]=useState<State>(initialState),[config,setConfig]=useState<Config>(defaults),[token,setToken]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[settings,setSettings]=useState(false);
 const[tab,setTab]=useState<chrome.tabs.Tab>();
 const[compactRows,setCompactRows]=useState<CaptionRow[]>([]),[compactTotal,setCompactTotal]=useState(0),[historyRevision,setHistoryRevision]=useState(0);
 const[translation,setTranslation]=useState('尚未准备本地翻译'),[progress,setProgress]=useState<number>(),[preparing,setPreparing]=useState(false),[availability,setAvailability]=useState('checking');
 const port=useRef<chrome.runtime.Port|null>(null),native=useRef<NativeTranslator|null>(null),pair=useRef(''),jobs=useRef(new Map<string,AbortController>()),prepareVersion=useRef(0);
 useEffect(()=>{
 void chrome.storage.sync.get(defaults).then(value=>setConfig(value as Config));void chrome.storage.local.get('token').then(value=>setToken(typeof value.token==='string'?value.token:''));
 const connection=chrome.runtime.connect({name:'captions-panel'});port.current=connection;
 connection.onMessage.addListener(message=>{
  if(message.kind==='cancel-translation'){jobs.current.get(message.id)?.abort();jobs.current.delete(message.id);}
  if(message.kind==='translate'){
   const controller=new AbortController();jobs.current.set(message.id,controller);
   (async()=>{if(!native.current||pair.current!==`${message.sourceLanguage}:${message.targetLanguage}`)throw new Error('此语言对尚未准备');const instance=native.current;return await withDeadline(signal=>instance.translate(message.text,{signal}),2500,controller.signal,()=>{instance.destroy();if(native.current===instance){native.current=null;pair.current='';setTranslation('本地翻译已超时/取消，请重新准备；原文保留。');}});})()
   .then(text=>{if(!controller.signal.aborted)connection.postMessage({kind:'translation-result',id:message.id,ok:true,text});},error=>{if(!controller.signal.aborted)connection.postMessage({kind:'translation-result',id:message.id,ok:false,error:String(error)});}).finally(()=>jobs.current.delete(message.id));
  }
 });
 const poll=()=>{void send('background','get-state').then(value=>setState(value)).catch(e=>setError(String(e)));void chrome.tabs.query({active:true,currentWindow:true}).then(([value])=>setTab(value));};poll();const timer=setInterval(poll,1000);
 const historyTimer=setInterval(()=>setHistoryRevision(value=>value+1),2500);
 return()=>{prepareVersion.current++;clearInterval(timer);clearInterval(historyTimer);void closeHistory();jobs.current.forEach(controller=>controller.abort());native.current?.destroy();connection.disconnect();};
 },[]);
 useEffect(()=>{if(!tab?.url||!/^https?:\/\//.test(tab.url)){setCompactRows([]);setCompactTotal(0);return;}let current=true;void queryHistory({url:tab.url,pageSize:10}).then(result=>{if(current){setCompactRows(result.rows);setCompactTotal(result.total);}}).catch(e=>{if(current)setError(`本页历史读取失败：${String(e)}`);});return()=>{current=false;};},[tab?.url,historyRevision]);
 useEffect(()=>{const api=translatorAPI();if(!api){setAvailability('API unavailable');return;}const sourceLanguage=config.sourceLanguage==='auto'?(config.targetLanguage==='zh'?'en':'zh'):config.sourceLanguage;let current=true;void withDeadline(()=>api.availability({sourceLanguage,targetLanguage:config.targetLanguage}),2500).then(value=>{if(current)setAvailability(value);},error=>{if(current)setAvailability(String(error));});return()=>{current=false;};},[config.sourceLanguage,config.targetLanguage]);
 const change=(key:keyof Config,value:unknown)=>{const next={...config,[key]:value};setConfig(next);void chrome.storage.sync.set(next).catch(e=>setError(String(e)));if(['sourceLanguage','targetLanguage','translationEngine'].includes(key)){prepareVersion.current++;native.current?.destroy();native.current=null;pair.current='';setTranslation('语言设置已更改，请重新准备本地翻译');port.current?.postMessage({kind:'translation-ready',sourceLanguage:'',targetLanguage:''});}};
 async function command(kind:string){setBusy(true);setError('');try{if(kind==='start'){await chrome.storage.local.set({token:token.trim()});await chrome.storage.sync.set(config);}const result=await send('background',kind,{tabId:tab?.id});if(result.error)throw new Error(result.error);setState(result);}catch(e){setError(String(e));}finally{setBusy(false);}}
 async function importFile(file:File|undefined){if(!file)return;setBusy(true);setError('');try{if(!/\.(srt|vtt)$/i.test(file.name))throw new Error('请选择 .srt 或 .vtt 文件');if(file.size>4_000_000)throw new Error('字幕文件超过 4 MB');const text=await file.text();const result=await send('background','import-subtitles',{tabId:tab?.id,text});if(result.error)throw new Error(result.error);setState(result);}catch(e){setError(String(e));}finally{setBusy(false);}}
 function prepare(){
 const api=translatorAPI();if(!api){setTranslation('当前 Chrome 没有 Translator API；需要支持内置翻译的桌面 Chrome。原文识别不受影响。');return;}
 const sourceLanguage=config.sourceLanguage==='auto'?(config.targetLanguage==='zh'?'en':'zh'):config.sourceLanguage,targetLanguage=config.targetLanguage;
 if(sourceLanguage===targetLanguage){setTranslation('源语言和目标语言相同，无需翻译');return;}
 const generation=++prepareVersion.current;setPreparing(true);setProgress(undefined);setTranslation('正在准备 Chrome 本地语言模型…');
 // create is called synchronously in this explicit click handler, before any asynchronous hop.
 const creation=withDeadline(()=>api.create({sourceLanguage,targetLanguage,monitor:monitor=>monitor.addEventListener('downloadprogress',(event:any)=>{setProgress(event.loaded);setTranslation(`下载本地语言模型 ${Math.round(event.loaded*100)}%`);})}),120000,undefined,undefined,instance=>instance.destroy());
 void creation.then(async instance=>{
  if(generation!==prepareVersion.current){instance.destroy();return;}
  native.current?.destroy();native.current=instance;pair.current=`${sourceLanguage}:${targetLanguage}`;
  port.current?.postMessage({kind:'translation-ready',sourceLanguage,targetLanguage});
  const result=await send('background','prepare-translation',{sourceLanguage,targetLanguage});
  if(generation!==prepareVersion.current)return;
  if(result.ok){setError('');setAvailability(await withDeadline(()=>api.availability({sourceLanguage,targetLanguage}),2500));setTranslation('本地翻译已就绪 · 后台可持续运行，关闭侧栏仍可翻译');}
  else{setError('');setAvailability(await withDeadline(()=>api.availability({sourceLanguage,targetLanguage}),2500));setTranslation(`本地翻译在侧栏就绪 · 请保持侧栏打开；后台不可用：${result.error}`);}
  await send('background','retry-translation');
 }).catch(e=>{if(generation===prepareVersion.current)setTranslation(`本地翻译准备失败：${String(e)}`);}).finally(()=>{setPreparing(false);setProgress(undefined);});
 }
 function openHistory(){void chrome.tabs.create({url:chrome.runtime.getURL('history.html')}).catch(e=>setError(String(e)));}
 const active=state.phase!=='idle'&&state.phase!=='error';
 return <main><header><div className="brand"><img aria-hidden="true" className="brand-mark" src="icons/icon-32.png" alt=""/><h1>实时字幕</h1></div><button className="quiet" onClick={()=>setSettings(value=>!value)} aria-expanded={settings}>{settings?'收起设置':'设置'}</button></header>
 <section className="capture"><p className="scope" title={tab?.url}>{tab?.title||'切换到要识别的网页'}</p><div className="controls"><button className="primary" disabled={busy||!tab?.id} onClick={()=>void command('start')}>{busy?'处理中…':active?'重新开始当前页':'开始当前页'}</button><button disabled={busy||state.phase==='idle'} onClick={()=>void command('stop')}>停止</button></div><p className="status" role="status">{state.phase} · {state.message}</p>{error&&<p role="alert" className="error">{error}</p>}</section>
 <section className="subtitle-import"><div className="section-title"><h2>导入字幕</h2><span className="muted">SRT / VTT</span></div><label>选择本地字幕文件<input type="file" accept=".srt,.vtt,text/vtt,application/x-subrip" disabled={busy||!tab?.id} onChange={event=>{void importFile(event.target.files?.[0]);event.target.value='';}}/></label><p className="muted">字幕跟随当前视频的播放、暂停和跳转；已显示的内容进入本页历史。</p></section>
 {settings&&<section className="settings"><h2>字幕设置</h2><label>配对令牌<input type="password" autoComplete="off" value={token} onChange={event=>setToken(event.target.value)} onBlur={()=>{void chrome.storage.local.set({token:token.trim()});}} placeholder="粘贴本机 .runtime/token"/></label><p className="muted">令牌只保存在本机，不会同步。</p><label>本地识别服务<input value={config.wsUrl} onChange={event=>change('wsUrl',event.target.value)}/></label>
 <div className="field-row"><label>原文语言<select value={config.sourceLanguage} onChange={event=>change('sourceLanguage',event.target.value)}><option value="auto">自动（依赖模型）</option><option value="zh">中文</option><option value="en">English</option></select></label><label>翻译为<select value={config.targetLanguage} onChange={event=>change('targetLanguage',event.target.value)}><option value="en">English</option><option value="zh">中文</option></select></label></div>
 <p className="muted">当前识别模型：{state.asrEngine??'连接后显示'}。{config.sourceLanguage==='auto'&&state.asrEngine?.includes('zipformer-zh')?'此模型只识别中文；英语视频需切换到英语模型。':config.sourceLanguage==='auto'&&state.asrEngine?.includes('zipformer-en')?'此模型只识别英语；中文视频需切换到中文模型。':''}</p>
 <label>翻译引擎<select value={config.translationEngine} onChange={event=>change('translationEngine',event.target.value)}><option value="chrome">Chrome 优先，本机 Hy-MT2 备用</option><option value="local">本机 Hy-MT2</option><option value="off">关闭翻译</option></select></label>
 <label className="check"><input type="checkbox" checked={config.proofreading} onChange={event=>change('proofreading',event.target.checked)}/>本机上下文校对（未人工核验）</label><p className="muted">仅发送已捕获字幕到 127.0.0.1。优先显示初稿，再修订上一段；输入错词仍可能影响译文。</p>
 <div className="field-row"><label>译文字号<input type="number" min="16" max="72" value={config.fontSize} onChange={event=>change('fontSize',Math.max(16,Math.min(72,Number(event.target.value))))}/></label><label>字幕位置<select value={config.position} onChange={event=>change('position',event.target.value)}><option value="bottom">视频下方</option><option value="top">视频上方</option></select></label></div><label>背景不透明度 {Math.round(config.opacity*100)}%<input type="range" min="0" max="1" step=".02" value={config.opacity} onChange={event=>change('opacity',Number(event.target.value))}/></label>
 <button onClick={()=>{void chrome.permissions.request({origins:['http://*/*','https://*/*']}).then(ok=>setError(ok?'跨域视频已授权，请重新开始当前页':'跨域权限未授权，使用主页面或视口字幕'));}}>允许跨域 iframe 视频（可选）</button>
 {!!state.videos?.length&&<label>字幕目标视频<select value={state.video?`${state.video.frameId}:${state.video.id}`:''} onChange={event=>{void send('background','select-video',{id:event.target.value}).then(setState);}}>{state.videos.map(video=><option key={`${video.frameId}:${video.id}`} value={`${video.frameId}:${video.id}`}>{video.paused?'暂停':'播放'} · {(video.label||video.title).slice(0,40)}</option>)}</select></label>}
 <p className="muted">原文按中文/英文文字比例判断；连续 3 个最终段后锁定。锁定：{state.languageLock||'尚未锁定'}。切换语言会开始新识别段。</p><p className="muted">侧栏左右位置由 Chrome 外观设置决定；扩展无法强制右侧。</p></section>}
 <GlossaryEditor videoUrl={state.video?.url||state.captureUrl||tab?.url||''}/>
 <section className="translation-control"><div className="section-title"><h2>实时翻译</h2><button disabled={preparing||config.translationEngine==='off'} onClick={prepare}>{preparing?'准备中…':'准备本地翻译'}</button></div><p className="muted" role="status">{config.translationEngine==='off'?'翻译已关闭':`${translation} · availability: ${availability}`}</p>{progress!==undefined&&<progress value={progress} max="1" aria-label="翻译模型下载进度"/>}{state.translationError&&<p className="error">{state.translationError}</p>}<p className="muted">当前执行环境：{state.translationContext||'尚未翻译'} · 校对：{state.proofreadingStatus||'等待后续语境'}</p>{state.proofreadingError&&<p className="error">{state.proofreadingError}</p>}{state.glossaryStatus&&<p className="muted">{state.glossaryStatus}</p>}</section>
 <section className="live"><div className="section-title"><h2>正在听</h2><span className="muted">实时原文</span></div><p className="live-source">{subtitlePage(state.latestDisplayText??state.latestText).text||'播放视频后，识别文字会显示在这里。'}</p>{state.latestTranslation&&state.latestTranslation!==state.latestText&&<><p className="live-translation">{subtitlePage(state.latestTranslation).text}</p><small className="muted">{(state.latestTranslationRevision??1)>1?'已修订 · 未人工核验':state.translationStatus==='live-ready'?'实时译文 · 略有延迟':'译文初稿'}</small></>}<p className="muted">识别中的原文按稳定片段翻译；最终段完成后更新译文。</p></section>
 <section className="history-link"><div className="section-title"><h2>本页历史 <span className="count">{compactTotal}</span></h2><button onClick={openHistory}>全部历史</button></div>{compactRows.length?<ol className="compact-history">{compactRows.map(row=><li key={JSON.stringify([row.sessionId,row.epoch,row.segmentId])}><div className="compact-meta"><span>{row.mediaTime==null?new Date(row.createdAt).toLocaleTimeString():`${Math.floor(row.mediaTime/60).toString().padStart(2,'0')}:${Math.floor(row.mediaTime%60).toString().padStart(2,'0')}`}</span><span>{row.phase==='interim'?'识别中':row.engine==='page-caption'?'网页字幕':row.engine==='subtitle-import'?'导入字幕':row.translatedText?'已翻译':'语音识别'}</span></div><p className="compact-source" title={row.displaySourceText??row.sourceText}>{displaySource(row.displaySourceText??row.sourceText,'interim')}</p>{row.translatedText&&<p className="compact-translation" title={row.translatedText}>{row.translatedText}</p>}</li>)}</ol>:<p className="muted">当前网页还没有字幕记录。</p>}</section>
 <details className="diagnostics"><summary>音频诊断</summary><dl><dt>音频 RMS</dt><dd>{state.rms.toFixed(4)}</dd><dt>扬声器连接</dt><dd>{state.outputConnected?'已连接':'未连接'}</dd><dt>AudioContext</dt><dd>{state.contextState}</dd><dt>发送采样数</dt><dd>{state.framesSent}</dd><dt>Epoch</dt><dd>{state.epoch}</dd></dl></details></main>;
}
createRoot(document.getElementById('root')!).render(<SidePanel/>);
