import{afterEach,expect,test,vi}from'vitest';
import{withDeadline,NativeTranslationProvider,LocalModelTranslationProvider,ContextProofreader}from'../src/providers';
import{FinalTranslator}from'../src/translation';
import{canSeekMedia,mediaLabel}from'../src/media';
import{displaySource}from'../src/display';
const final=(id:string)=>({sessionId:'s',epoch:1,segmentId:id,revision:1,phase:'final',sourceText:id==='1'?'没有增长20%':'只是同比下降3%',sourceLanguage:'zh',targetLanguage:'en'});
afterEach(()=>vi.useRealTimers());
test('deadline aborts a hanging provider and later finals continue instead of permanent busy state',async()=>{
 vi.useFakeTimers();const events:any[]=[],failures:any[]=[];let late:(s:string)=>void=()=>{},signal:AbortSignal|undefined;
 const translator=new FinalTranslator({translate:async(text,_s,_t,active)=>{signal=active;if(text==='没有增长20%')return new Promise(resolve=>{late=resolve;});return'Next 3%';}},e=>events.push(e),e=>failures.push(e),{deadlineMs:100});
 translator.reset('s',1);translator.enqueue(final('1'),'en');translator.enqueue(final('2'),'en');await vi.advanceTimersByTimeAsync(110);
 expect(failures).toHaveLength(1);expect(events[0].segmentId).toBe('2');late('stale');await vi.advanceTimersByTimeAsync(1);expect(events).toHaveLength(1);
});
test('native timeout destroys stuck instance and recreates a working translator for next call',async()=>{
 vi.useFakeTimers();let created=0,destroyed=0;const provider=new NativeTranslationProvider(()=>({availability:async()=>'available',create:async()=>{const id=created++;return{translate:async()=>id===0?new Promise<string>(()=>{}):'recovered',destroy:()=>{destroyed++;}};}}),100);
 const first=provider.translate('hello','en','zh');const rejected=expect(first).rejects.toThrow('超时');await vi.advanceTimersByTimeAsync(110);await rejected;expect(destroyed).toBe(1);expect(await provider.translate('again','en','zh')).toBe('recovered');expect(created).toBe(2);
});
test('later context creates production proofreading revision2 for previous identity and reset drops late correction',async()=>{
 const updates:any[]=[],inputs:any[]=[];let finish:(s:string)=>void=()=>{};
 const correction=new ContextProofreader({proofread:async(...args:any[])=>{inputs.push(args);return new Promise(resolve=>{finish=resolve;});}},e=>updates.push(e),()=>{});
 correction.reset('s',1);correction.observe(final('1'),'en');correction.recordDraft({...final('1'),sourceRevision:1,text:'Did not grow by 20%'} as any);correction.observe(final('2'),'en');await Promise.resolve();expect(inputs[0][0]).toContain('没有增长20%');expect(inputs[0][1]).toContain('下降3%');finish('No growth of 20%; only a decline.');await new Promise(r=>setTimeout(r,0));expect(updates[0]).toMatchObject({segmentId:'1',sourceRevision:1,translationRevision:2});
 correction.recordDraft({...final('2'),sourceRevision:1,text:'Down 3%'} as any);correction.observe({...final('3'),sourceText:'下一句'},'en');await Promise.resolve();correction.reset('s',2);finish('late');await new Promise(r=>setTimeout(r,0));expect(updates).toHaveLength(1);
});
test('local provider uses authenticated fixed loopback and context/negation/number preserving prompt',async()=>{
 let request:any;const provider=new LocalModelTranslationProvider(()=>'private-token',async(url:any,options:any)=>{request={url,options};return new Response(JSON.stringify({choices:[{message:{content:'Did not grow by 20%.'}}]}),{status:200});});
 expect(await provider.proofread('没有增长20%','只下降3%','Grew 20%','zh','en')).toBe('Did not grow by 20%.');
 expect(request.url).toBe('http://127.0.0.1:8081/v1/chat/completions');expect(request.options.headers.Authorization).toBe('Bearer private-token');const body=JSON.parse(request.options.body);expect(body.messages[0].content).toContain('【背景信息】');expect(body.messages[0].content).toContain('否定');expect(body.messages[0].content).toContain('20%');
});
test('media seek rejects another video on same page and live streams, permits unique stable restored media',()=>{
 const row={url:'https://news.test',videoId:'a',mediaUrl:'https://cdn.test/a.mp4',live:false,mediaTime:10};const a={id:'a',url:row.url,mediaUrl:row.mediaUrl,live:false},b={...a,id:'b',mediaUrl:'https://cdn.test/b.mp4'};
 expect(canSeekMedia(row,b,[a,b])).toBe(false);expect(canSeekMedia(row,a,[a,b])).toBe(true);expect(canSeekMedia(row,{...a,id:'restored'},[{...a,id:'restored'}])).toBe(true);expect(canSeekMedia(row,{...a,id:'restored'},[{...a,id:'x'},{...a,id:'restored'}])).toBe(false);expect(canSeekMedia({...row,live:true},a,[a])).toBe(false);expect(mediaLabel({...row,live:true,mediaTime:48212,start:3})).toBe('直播 +00:03');
});
test('display cleanup preserves negation/numbers/meaningful fillers, final punctuation reflects boundary',()=>{
 const raw='嗯，啊，那个不是20个，就是没有增长3%';expect(displaySource(raw,'interim','duration')).toBe(raw);
 expect(displaySource(raw,'final','duration')).toBe('那个不是20个，就是没有增长3%，');expect(displaySource(raw,'final','silence')).toBe('那个不是20个，就是没有增长3%。');expect(displaySource('嗯嗯嗯 没有20个','final','silence')).toBe('没有20个。');
});
import{correctionSafe}from'../src/providers';
test('proofreading guard rejects dropped negation/numbers and missing comparative structure',()=>{
 expect(correctionSafe('没有增长20%','Growth of 20%.','en')).toBe(false);expect(correctionSafe('没有增长20%','Did not grow by 30%.','en')).toBe(false);
 expect(correctionSafe('这座城市比传统的土耳其更有欧洲氛围','The city is more similar to traditional Turkey.','en')).toBe(false);
 expect(correctionSafe('没有增长20%','Did not grow by 20%.','en')).toBe(true);
});
test('a new draft aborts low-priority correction and resumes it only after draft priority ends',async()=>{
 let signal:AbortSignal|undefined,finish:(text:string)=>void=()=>{};const emitted:any[]=[];let calls=0;
 const proofreader=new ContextProofreader({proofread:async(_previous,_next,_draft,_source,_target,active)=>{signal=active;calls++;return new Promise(resolve=>{finish=resolve;});}},event=>emitted.push(event),()=>{});
 proofreader.reset('s',1);proofreader.observe(final('1'),'en');proofreader.recordDraft({...final('1'),sourceRevision:1,text:'No growth of 20%'}as any);proofreader.observe(final('2'),'en');await Promise.resolve();expect(calls).toBe(1);
 proofreader.prioritizeDraft(true);expect(signal?.aborted).toBe(true);await new Promise(resolve=>setTimeout(resolve,0));expect(calls).toBe(1);
 proofreader.prioritizeDraft(false);await Promise.resolve();expect(calls).toBe(2);finish('There was no growth of 20%.');await new Promise(resolve=>setTimeout(resolve,0));expect(emitted[0].translationRevision).toBe(2);
});
test('late native create after timeout is destroyed rather than installed in the instance cache',async()=>{
 vi.useFakeTimers();let resolveCreate:(value:any)=>void=()=>{};const destroyed=vi.fn();
 const provider=new NativeTranslationProvider(()=>({availability:async()=>'available',create:()=>new Promise(resolve=>{resolveCreate=resolve;})}),100);
 const request=provider.prepare('zh','en');const rejected=expect(request).rejects.toThrow('超时');await vi.advanceTimersByTimeAsync(110);await rejected;
 resolveCreate({translate:async()=>'',destroy:destroyed});await vi.advanceTimersByTimeAsync(1);expect(destroyed).toHaveBeenCalledOnce();
});
