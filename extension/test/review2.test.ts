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
test('context proofreading uses corrected source while raw ASR remains available for history',async()=>{
 let received='';const correction=new ContextProofreader({proofread:async(source:string)=>{received=source;return 'Chiang Wan-an spoke.';}},()=>{},()=>{});
 correction.reset('s',1);const previous={...final('name'),sourceText:'蒋万安发言',sourceRaw:'讲万安发言'};
 correction.observe(previous,'en');correction.recordDraft({...previous,sourceRevision:1,text:'Chiang Wan-an spoke.'} as any);
 correction.observe({...final('next'),sourceText:'下一句'},'en');await new Promise(resolve=>setTimeout(resolve,0));
 expect(received).toBe('蒋万安发言');expect(previous.sourceRaw).toBe('讲万安发言');
});
test('local provider uses authenticated fixed loopback and context/negation/number preserving prompt',async()=>{
 let request:any;const provider=new LocalModelTranslationProvider(()=>'private-token',async(url:any,options:any)=>{request={url,options};return new Response(JSON.stringify({choices:[{message:{content:'Did not grow by 20%.'}}]}),{status:200});});
 expect(await provider.proofread('没有增长20%','只下降3%','Grew 20%','zh','en')).toBe('Did not grow by 20%.');
 expect(request.url).toBe('http://127.0.0.1:8081/v1/chat/completions');expect(request.options.headers.Authorization).toBe('Bearer private-token');const body=JSON.parse(request.options.body);expect(body.messages[0].content).toContain('【背景信息】');expect(body.messages[0].content).toContain('否定');expect(body.messages[0].content).toContain('20%');
});
test('local provider calls a browser fetch with the global receiver',async()=>{
 const browserFetch=function(this:unknown):Promise<Response>{
  if(this!==globalThis)throw new TypeError('Illegal invocation');
  return Promise.resolve(new Response(JSON.stringify({choices:[{message:{content:'Context corrected.'}}]}),{status:200}));
 } as typeof fetch;
 const provider=new LocalModelTranslationProvider(()=>'private-token',browserFetch);
 expect(await provider.proofread('原文','后文','Draft','zh','en')).toBe('Context corrected.');
});
test('media seek rejects another video on same page and live streams, permits unique stable restored media',()=>{
 const row={url:'https://news.test',videoId:'a',mediaUrl:'https://cdn.test/a.mp4',live:false,mediaTime:10};const a={id:'a',url:row.url,mediaUrl:row.mediaUrl,live:false},b={...a,id:'b',mediaUrl:'https://cdn.test/b.mp4'};
 expect(canSeekMedia(row,b,[a,b])).toBe(false);expect(canSeekMedia(row,a,[a,b])).toBe(true);expect(canSeekMedia(row,{...a,id:'restored'},[{...a,id:'restored'}])).toBe(true);expect(canSeekMedia(row,{...a,id:'restored'},[{...a,id:'x'},{...a,id:'restored'}])).toBe(false);expect(canSeekMedia({...row,live:true},a,[a])).toBe(false);expect(mediaLabel({...row,live:true,mediaTime:48212,start:3})).toBe('直播 +00:03');
});
test('display cleanup preserves negation/numbers/meaningful fillers, final punctuation reflects boundary',()=>{
 const raw='嗯，啊，那个不是20个，就是没有增长3%';expect(displaySource(raw,'interim','duration')).toBe(raw);
 expect(displaySource(raw,'final','duration')).toBe('那个不是20个，就是没有增长3%，');expect(displaySource(raw,'final','silence')).toBe('那个不是20个，就是没有增长3%。');expect(displaySource('嗯嗯嗯 没有20个','final','silence')).toBe('没有20个。');
});
test('English all-caps ASR is sentence-cased for display while source remains untouched',()=>{
 const raw='THIS IS A TOUCH SCREEN. I THINK IT WORKS';
 expect(displaySource(raw,'interim')).toBe('This is a touch screen. I think it works');
 expect(raw).toBe('THIS IS A TOUCH SCREEN. I THINK IT WORKS');
 expect(displaySource('MacBook ProLED is here','interim')).toBe('MacBook ProLED is here');
});
test('long Chinese final gains conservative display commas without changing words',()=>{
 const raw='调查的时间是十月十四号到十六号所以这一份民调很重要不过我们还要看投票结果';
 const shown=displaySource(raw,'final','duration');
 expect(shown).toBe('调查的时间是十月十四号到十六号，所以这一份民调很重要，不过我们还要看投票结果，');
 expect(shown.replace(/[，。！？、]/g,'')).toBe(raw);
 expect(displaySource(raw,'interim')).toBe('调查的时间是十月十四号到十六号，所以这一份民调很重要，不过我们还要看投票结果');
 expect(displaySource('这一次公布的结果呢我们还要继续观察','interim')).toBe('这一次公布的结果呢，我们还要继续观察');
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
test('correction guard preserves signed values, Unicode signs, percent units and ordinary Chinese negation',()=>{
 for(const[source,candidate]of [['收益为-3%','The yield was 3%.'],['收益为−3％','The yield was +3%.'],['收益为＋3%','The yield was -3%.'],['不增长20%','Growth of 20%.'],['未增长20%','Growth of 20%.'],['收益为-3%','The yield was -3.']])expect(correctionSafe(source,candidate,'en')).toBe(false);
 for(const[source,candidate]of [['收益为−3％','The yield was -3%.'],['收益为＋3%','The yield was +3%.'],['不增长20%','It does not grow by 20%.'],['未增长20%','It failed to grow by 20%.'],['不增长20%','There is no growth of 20%.'],['不过增长20%','However, it grew by 20%.'],['未来增长20%','Future growth of 20%.']])expect(correctionSafe(source,candidate,'en')).toBe(true);
});
test('preempting active correction when two waiters exist explicitly skips oldest active row and keeps two waiters',async()=>{
 const failures:any[]=[],calls:string[]=[];const completions:Array<(s:string)=>void>=[];
 const checker=new ContextProofreader({proofread:async(previous)=>{calls.push(previous);return new Promise(resolve=>completions.push(resolve));}},()=>{},event=>failures.push(event));
 checker.reset('s',1);for(const id of ['a','b','c','d']){const source={...final(id),sourceText:`sentence ${id}`};checker.recordDraft({...source,sourceRevision:1,text:`draft ${id}`}as any);checker.observe(source,'en');}
 await Promise.resolve();expect(calls).toEqual(['sentence a']);checker.prioritizeDraft(true);await new Promise(resolve=>setTimeout(resolve,0));
 expect(failures).toContainEqual(expect.objectContaining({segmentId:'a',proofreadingState:'skipped',error:expect.stringContaining('保留初稿')}));
 checker.prioritizeDraft(false);await Promise.resolve();expect(calls).toEqual(['sentence a','sentence b']);completions[1]('sentence b corrected');await new Promise(resolve=>setTimeout(resolve,0));expect(calls).toEqual(['sentence a','sentence b','sentence c']);completions[2]('sentence c corrected');await new Promise(resolve=>setTimeout(resolve,0));expect(calls).toHaveLength(3);checker.reset('s',2);
});
test('a fast draft unpausing before aborted continuation requeues correction instead of silently losing it',async()=>{
 const calls:string[]=[],failures:any[]=[];let complete:(text:string)=>void=()=>{};
 const checker=new ContextProofreader({proofread:async(previous)=>{calls.push(previous);return new Promise(resolve=>{complete=resolve;});}},()=>{},event=>failures.push(event));
 checker.reset('s',1);checker.observe(final('1'),'en');checker.recordDraft({...final('1'),sourceRevision:1,text:'No growth of 20%'}as any);checker.observe(final('2'),'en');await Promise.resolve();
 checker.prioritizeDraft(true);checker.prioritizeDraft(false);await new Promise(resolve=>setTimeout(resolve,0));expect(calls).toHaveLength(2);expect(failures).toHaveLength(0);complete('No growth of 20%.');await new Promise(resolve=>setTimeout(resolve,0));checker.reset('s',2);
});
