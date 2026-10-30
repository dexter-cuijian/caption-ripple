// A transparent, local browser fixture. Audio is actual human speech from the
// upstream model's test_wavs/0.wav; no transcript is injected by this page.
import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','.work','fixtures');
const port=Number(process.env.FIXTURE_PORT||8766);
const html=(mode='single')=>`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>新闻字幕 · 真实音频验收</title>
<style>body{margin:0;background:#0b1220;color:#e2e8f0;font:16px system-ui;padding:32px}h1{font-size:26px}p{color:#94a3b8}#player{position:relative;width:min(960px,95vw);background:#142135;border-radius:14px;overflow:hidden}video{display:block;width:100%;max-height:70vh}#player:fullscreen{width:100vw;height:100vh;display:grid;place-content:center}#player:fullscreen video{width:100vw;max-height:100vh}button,select{font:inherit;padding:9px 14px;margin:6px 6px 6px 0;border:1px solid #475569;border-radius:8px;background:#1e293b;color:white}iframe{width:100%;height:620px;border:1px solid #475569}#metrics{font:13px monospace;white-space:pre-wrap}</style>
<h1>新闻字幕 · 真实音频验收</h1><p>这是本机验证页面；音频为 sherpa 上游提供的真实中文人声。字幕必须由扩展捕获音频后生成，此页面不注入识别结果。</p>
${mode==='iframe'?'<iframe allow="autoplay;fullscreen" src="http://localhost:'+port+'/player"></iframe>':'<div id="player"><video id="video" controls loop src="/zh.mp4"></video></div><button id="play">播放真实音频</button><button id="pause">暂停</button><button id="fullscreen">播放器全屏</button><button id="seek">跳转到2秒</button><select id="rate"><option>0.5</option><option selected>1</option><option>1.5</option><option>2</option></select><button id="navigate">模拟 SPA 路由变化</button>'}
${mode==='multi'?'<h2>次要播放器（默认暂停）</h2><video style="width:300px" controls src="/zh.mp4"></video>':''}
<p id="metrics">等待播放</p><p><a style="color:#7dd3fc" href="/iframe">跨域 iframe 页面</a> · <a style="color:#7dd3fc" href="/multi">多播放器页面</a> · <a style="color:#7dd3fc" href="/">标准页面</a></p>
<script>
const v=document.getElementById('video');
if(v){document.getElementById('play').onclick=()=>v.play();document.getElementById('pause').onclick=()=>v.pause();document.getElementById('fullscreen').onclick=()=>document.getElementById('player').requestFullscreen();document.getElementById('seek').onclick=()=>{v.currentTime=2};document.getElementById('rate').onchange=e=>v.playbackRate=Number(e.target.value);document.getElementById('navigate').onclick=()=>{history.pushState({},'','?route='+Date.now());window.dispatchEvent(new PopStateEvent('popstate'))};setInterval(()=>document.getElementById('metrics').textContent=JSON.stringify({mediaTime:v.currentTime,paused:v.paused,rate:v.playbackRate,fullscreen:!!document.fullscreenElement},null,2),500)}
</script></html>`;
createServer(async(req,res)=>{
 const url=new URL(req.url,`http://127.0.0.1:${port}`);
 if(url.pathname!=='/zh.mp4'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(html(url.pathname.slice(1)));return;}
 try{const file=path.join(root,'zh.mp4');const {size}=await stat(file);const range=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);const start=range?Number(range[1]):0;const end=range&&range[2]?Math.min(Number(range[2]),size-1):size-1;if(start> end){res.writeHead(416,{'Content-Range':`bytes */${size}`});res.end();return;}res.writeHead(range?206:200,{'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Length':end-start+1,...(range?{'Content-Range':`bytes ${start}-${end}/${size}`}:{})});createReadStream(file,{start,end}).pipe(res);}catch{res.writeHead(404);res.end('Run the documented fixture preparation first.');}
}).listen(port,'127.0.0.1',()=>console.log(`Browser fixture: http://127.0.0.1:${port} (localhost iframe)`));
