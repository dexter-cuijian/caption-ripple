import React,{useEffect,useState}from'react';import{createRoot}from'react-dom/client';import{send,initialState,type State}from'./shared';import'./popup.css';
function Popup(){
 const[state,setState]=useState<State>(initialState),[error,setError]=useState(''),[tab,setTab]=useState<chrome.tabs.Tab>();
 useEffect(()=>{void send('background','get-state').then(setState);void chrome.tabs.query({active:true,currentWindow:true}).then(([current])=>setTab(current));},[]);
 return<main><h1>本地实时字幕</h1><p>{state.message}</p><button disabled={!tab?.id} onClick={()=>{void send('background','start',{tabId:tab?.id}).then(value=>{setState(value);if(value.error)setError(value.error);}).catch(error=>setError(String(error)));}}>开始当前标签页</button><button onClick={()=>{void send('background','stop').then(setState);}}>停止</button><button disabled={!tab?.id} onClick={()=>{if(tab?.id)void chrome.sidePanel.open({tabId:tab.id}).catch(error=>setError(String(error)));}}>打开字幕与历史侧栏</button>{error&&<p>{error}</p>}</main>;
}createRoot(document.getElementById('root')!).render(<Popup/>);
