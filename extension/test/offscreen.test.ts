import {beforeEach,expect,test,vi} from 'vitest';
import {EventEmitter}from'node:events';
import {Session}from'../../server/session.mjs';
let runtimeMessages:any[]=[],translateFinish:((value:any)=>void)|undefined;
let listener:any,failModule=false,contexts:any[],tracks:any[],sockets:any[],nodes:any[];
class FakeSocket {
 static OPEN=1;readyState=0;bufferedAmount=0;sent:any[]=[];onopen:any;onmessage:any;onclose:any;onerror:any;
 constructor(_url:string){sockets.push(this);}send(data:any){this.sent.push(data);}close(){this.readyState=3;}
 open(){this.readyState=1;this.onopen();this.onmessage({data:JSON.stringify({type:'ready',sessionId:'session',epoch:0})});}
}
class FakeNode {port={onmessage:null as any};disconnect=vi.fn();connect=vi.fn();constructor(){nodes.push(this);}}
class FakeContext {currentTime=0;state='running';destination={};audioWorklet={addModule:async()=>{if(failModule)throw new Error('worklet failed');}};close=vi.fn(async()=>{this.state='closed';});resume=vi.fn(async()=>{});onstatechange:any;constructor(){contexts.push(this);}createMediaStreamSource(){return new FakeNode();}createGain(){return Object.assign(new FakeNode(),{gain:{value:1}});}}
async function command(kind:string,extra:any={}){return new Promise<any>(resolve=>listener({target:'offscreen',kind,...extra},{},resolve));}
async function start(video?:any,extra:any={}){return command('start',{streamId:'capture',sessionId:'session',token:'secret',config:{},video,...extra});}
function packet(){[...nodes].reverse().find(n=>n.port.onmessage)?.port.onmessage({data:{pcm:new Int16Array(1600).buffer,rms:.1,contextTime:1}});}
beforeEach(async()=>{
 vi.resetModules();vi.stubGlobal('Translator',undefined);vi.stubGlobal('fetch',async()=>{throw new Error('local offline');});runtimeMessages=[];translateFinish=undefined;failModule=false;contexts=[];tracks=[];sockets=[];nodes=[];
 vi.stubGlobal('chrome',{runtime:{onMessage:{addListener:(fn:any)=>listener=fn},sendMessage:async(message:any)=>{runtimeMessages.push(message);if(message.kind==='panel-translate')return new Promise(resolve=>{translateFinish=resolve;});return{};},getURL:(s:string)=>s}});
 vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:async()=>{const track={stop:vi.fn(),onended:null};tracks.push(track);return{getTracks:()=>[track],getAudioTracks:()=>[track]};}}});
 vi.stubGlobal('AudioContext',FakeContext);vi.stubGlobal('AudioWorkletNode',FakeNode);vi.stubGlobal('WebSocket',FakeSocket);
 await import('../src/offscreen');
});
test('same offscreen document Stop then Start creates fresh packet counters and context anchor',async()=>{
 vi.spyOn(Date,'now').mockReturnValue(100000);
 await start();sockets[0].open();packet();const first=JSON.parse(sockets[0].sent[1]);expect(first.seq).toBe(0);
 await command('stop');vi.mocked(Date.now).mockReturnValue(200000);await start();sockets[1].open();packet();const second=JSON.parse(sockets[1].sent[1]);
 expect(second.seq).toBe(0);expect(second.sampleStart).toBe(0);expect(second.capturedAt).toBe(201000);expect(first.capturedAt).toBe(101000);
 await command('stop');vi.restoreAllMocks();
});
test('failed worklet setup releases acquired tab stream and context before replying error',async()=>{
 failModule=true;const response=await start();expect(response.ok).toBe(false);expect(response.error).toContain('worklet failed');
 expect(tracks[0].stop).toHaveBeenCalledOnce();expect(contexts[0].close).toHaveBeenCalledOnce();expect(sockets).toHaveLength(0);
});
for(const playbackRate of [1,2])test(`packet mediaTime describes capture END at rate ${playbackRate}`,async()=>{
 vi.spyOn(Date,'now').mockReturnValue(100000);
 await start({currentTime:10,observedAt:100000,playbackRate,paused:false});sockets[0].open();packet();const clock=JSON.parse(sockets[0].sent[1]);
 expect(clock.capturedAt).toBe(101000);expect(clock.mediaTime).toBe(10+playbackRate);
 const worker=Object.assign(new EventEmitter(),{postMessage:()=>{},terminate:()=>{}}),events:any[]=[];
 const server=new Session({sessionId:'session',epoch:0,sourceLanguage:'auto'},(event:any)=>events.push(event),()=>worker);
 worker.emit('message',{type:'ready'});server.clock(clock);server.audio(Buffer.from(sockets[0].sent[2]));
 worker.emit('message',{type:'decoded',text:'真实接口测试',speechStarted:true,decodeMs:1});
 expect(events.find(event=>event.type==='subtitle').mediaTime).toBeCloseTo(10+.9*playbackRate);server.close();
 await command('stop');vi.restoreAllMocks();
});

test('removing the last paused video clears paused gate and resumes audio-only packets after reset ACK',async()=>{
 await start({currentTime:10,observedAt:Date.now(),playbackRate:1,paused:true});sockets[0].open();packet();expect(sockets[0].sent).toHaveLength(1);
 await command('video',{video:undefined,reset:'video-change'});packet();expect(sockets[0].sent).toHaveLength(2);
 sockets[0].onmessage({data:JSON.stringify({type:'reset',sessionId:'session',epoch:1})});packet();
 const clock=JSON.parse(sockets[0].sent[2]);expect(clock.mediaTime).toBeNull();expect(clock.paused).toBe(false);expect(clock.epoch).toBe(1);
 await command('stop');
});

test('late final translation persists but never pairs with a newer interim in live sidebar state',async()=>{
 await start();sockets[0].open();
 sockets[0].onmessage({data:JSON.stringify({type:'subtitle',phase:'final',sessionId:'session',epoch:0,segmentId:'1',revision:1,sourceText:'旧段文字',sourceLanguage:'zh'})});
 await new Promise(resolve=>setTimeout(resolve,0));expect(translateFinish).toBeDefined();
 sockets[0].onmessage({data:JSON.stringify({type:'subtitle',phase:'interim',sessionId:'session',epoch:0,segmentId:'2',revision:1,sourceText:'新段文字',sourceLanguage:'zh'})});
 translateFinish!({ok:true,text:'Old translation'});await new Promise(resolve=>setTimeout(resolve,0));
 expect(runtimeMessages.some(message=>message.kind==='translation'&&message.event.text==='Old translation')).toBe(true);
 expect(runtimeMessages.filter(message=>message.kind==='state').at(-1).state.latestTranslation).toBe('');await command('stop');
});

test('hello hotwords and real offscreen draft path use scoped versioned names while preserving original source',async()=>{
 vi.stubGlobal('Translator',{availability:async()=>'available',create:async()=>({translate:async(text:string)=>text,destroy:()=>{}})});
 const entries=[{id:'name',source:'蒋万安',target:'Chiang Wan-an',sourceLang:'zh',targetLang:'en',scope:'video',videoUrl:'https://n.test/a'},{id:'camp',source:'蓝营',target:'pan-blue camp',sourceLang:'zh',targetLang:'en',scope:'global'}];
 await start(undefined,{scopeUrl:'https://n.test/a',glossary:{version:5,entries}});sockets[0].open();expect(JSON.parse(sockets[0].sent[0]).hotwords).toEqual(['蒋万安','蓝营']);
 sockets[0].onmessage({data:JSON.stringify({type:'subtitle',phase:'final',sessionId:'session',epoch:0,segmentId:'a',revision:1,sourceText:'蒋万安谈蓝营',sourceLanguage:'zh'})});await new Promise(resolve=>setTimeout(resolve,0));
 const source=runtimeMessages.find(message=>message.kind==='subtitle').event,translated=runtimeMessages.find(message=>message.kind==='translation').event;
 expect(source.sourceText).toBe('蒋万安谈蓝营');expect(source.sourceRaw).toBe('蒋万安谈蓝营');expect(source.glossaryVersion).toBe(5);expect(translated.text).toContain('Chiang Wan-an');expect(translated.text).toContain('pan-blue camp');expect(translated.text).not.toMatch(/ZXQ/i);expect(translated.glossaryVersion).toBe(5);
 await command('glossary',{glossary:{version:6,entries:[]}});expect(runtimeMessages.some(message=>message.kind==='epoch'&&message.epoch===1)).toBe(true);await command('stop');
});
