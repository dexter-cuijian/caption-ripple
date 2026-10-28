import React,{useEffect,useState} from 'react';
import{createRoot}from'react-dom/client';
import{defaults,initialState,send,type State}from'./shared';
import './popup.css';
function Popup(){
 const[state,setState]=useState<State>(initialState),[config,setConfig]=useState(defaults),[token,setToken]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{void chrome.storage.sync.get(defaults).then(x=>setConfig(x as typeof defaults));void chrome.storage.local.get('token').then(x=>setToken(typeof x.token==='string'?x.token:''));
 const poll=()=>send('background','get-state').then(setState).catch(e=>setError(String(e)));void poll();const timer=setInterval(poll,700);return()=>clearInterval(timer);},[]);
 async function command(kind:string){setBusy(true);setError('');try{await chrome.storage.sync.set(config);await chrome.storage.local.set({token:token.trim()});setState(await send('background',kind));}catch(e){setError(String(e));}finally{setBusy(false);}}
 const change=(key:string,value:unknown)=>{const updated={...config,[key]:value};setConfig(updated);void chrome.storage.sync.set(updated);};
 return <main><h1>本地实时字幕</h1><p className="hint">只识别当前标签页音频 · 阶段 1 原文字幕</p>
 <label>配对令牌（本机 .runtime/token）<input type="password" value={token} onChange={e=>setToken(e.target.value)} autoComplete="off" placeholder="粘贴令牌，不会同步"/></label>
 <label>本地服务 WebSocket<input value={config.wsUrl} onChange={e=>change('wsUrl',e.target.value)}/></label>
 <div className="row"><label>原文语言<select value={config.sourceLanguage} onChange={e=>change('sourceLanguage',e.target.value)}><option value="auto">自动中英</option><option value="zh">中文</option><option value="en">English</option></select></label><label>字号<input type="number" min="16" max="72" value={config.fontSize} onChange={e=>change('fontSize',Math.max(16,Math.min(72,Number(e.target.value))))}/></label></div>
 <div className="row"><label>位置<select value={config.position} onChange={e=>change('position',e.target.value)}><option value="bottom">下方</option><option value="top">上方</option></select></label><label>背景透明度<input type="range" min="0" max="1" step=".02" value={config.opacity} onChange={e=>change('opacity',Number(e.target.value))}/></label></div>
 <div className="row"><button disabled={busy} onClick={()=>void command('start')}>开始当前标签页</button><button disabled={busy||state.phase==='idle'} onClick={()=>void command('stop')}>停止</button></div>
 <button className="secondary" onClick={()=>{void chrome.permissions.request({origins:['http://*/*','https://*/*']}).then(granted=>setError(granted?'已授权跨域视频。请重新启动字幕以注入已有 iframe。':'未授权，使用已授权页面的视频或视口字幕。')).catch(e=>setError(String(e)));}}>允许跨域 iframe 视频字幕（可选）</button>
 {!!state.videos?.length&&<label>字幕目标视频<select value={state.video?`${state.video.frameId}:${state.video.id}`:''} onChange={e=>{void send('background','select-video',{id:e.target.value}).then(setState);}}>{state.videos.map(v=><option key={`${v.frameId}:${v.id}`} value={`${v.frameId}:${v.id}`}>{v.paused?'暂停':'播放中'} · frame {v.frameId} · {(v.label||v.title).slice(0,55)}</option>)}</select></label>}
 <section role="status"><strong>{state.phase}</strong><p>{state.message}</p>{error&&<p className="error">{error}</p>}<p className="transcript">{state.latestText||'尚无识别文本'}</p><dl><dt>音频 RMS</dt><dd>{state.rms.toFixed(4)}</dd><dt>扬声器输出连接</dt><dd>{state.outputConnected?'是':'否'}</dd><dt>AudioContext</dt><dd>{state.contextState}</dd><dt>发送采样数</dt><dd>{state.framesSent}</dd><dt>Epoch</dt><dd>{state.epoch}</dd></dl></section>
 <p className="hint">原生视频全屏可能遮住字幕；退出后点击视频上的“带字幕全屏”。配对令牌只保存在本机。语言设置在下次启动时生效。</p></main>;
}
createRoot(document.getElementById('root')!).render(<Popup/>);
