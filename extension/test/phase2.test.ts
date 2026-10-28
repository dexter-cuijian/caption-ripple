import{expect,test}from'vitest';
import{mergeFinal,mergeTranslation,exportCaptions}from'../src/history';
import{FinalTranslator,LanguageLock}from'../src/translation';
const row=(revision=1)=>({type:'subtitle',phase:'final',sessionId:'s',epoch:2,segmentId:'a',revision,sourceText:'没有增长20%',sourceLanguage:'zh',targetLanguage:'en',mediaTime:10,start:0,end:1,url:'https://example.com/news',title:'News',createdAt:1,engine:'test'});
test('only finals persist; source revision monotonic and translation patches one exact row',()=>{
 expect(mergeFinal(undefined,{...row(),phase:'interim'})).toBeUndefined();
 const first=mergeFinal(undefined,row())!;expect(mergeFinal(first,row(0))).toEqual(first);
 const translated=mergeTranslation(first,{sessionId:'s',epoch:2,segmentId:'a',sourceRevision:1,targetLanguage:'en',text:'No growth of 20%',engine:'chrome',startedAt:1,completedAt:2})!;
 expect(translated.translatedText).toBe('No growth of 20%');
 expect(mergeTranslation(translated,{sessionId:'s',epoch:1,segmentId:'a',sourceRevision:1,targetLanguage:'en',text:'stale'})).toEqual(translated);
 expect(mergeFinal(translated,row(2))?.translatedText).toBeUndefined();
});
test('exports escape timestamps correctly and include source and translation',()=>{
 const rows=[{...row(),translatedText:'No growth of 20%',start:1.25,end:3.5}];
 expect(exportCaptions(rows as any,'srt')).toContain('00:00:01,250 --> 00:00:03,500');
 expect(exportCaptions(rows as any,'vtt')).toContain('WEBVTT\n\n00:00:01.250');
 expect(exportCaptions(rows as any,'txt')).toContain('No growth of 20%');expect(exportCaptions(rows as any,'md')).toContain('没有增长20%');
});
test('language heuristic locks only after three consistent final windows',()=>{
 const lock=new LanguageLock();expect(lock.observe('你好新闻')).toBe('zh');expect(lock.locked).toBeNull();lock.observe('继续中文');lock.observe('第三句话');expect(lock.locked).toBe('zh');expect(lock.observe('English now')).toBe('zh');
});
test('translator never sends interim and discards completion after epoch reset',async()=>{
 let complete:(text:string)=>void=()=>{};const emitted:any[]=[],calls:string[]=[];
 const translator=new FinalTranslator({translate:async(text)=>{calls.push(text);return new Promise<string>(resolve=>{complete=resolve;});}},event=>emitted.push(event),()=>{});
 translator.reset('s',2);translator.enqueue({...row(),phase:'interim'} as any,'en');expect(calls).toHaveLength(0);
 translator.enqueue(row() as any,'en');await Promise.resolve();expect(calls).toHaveLength(1);
 translator.reset('s',3);complete('stale');await new Promise(resolve=>setTimeout(resolve,0));expect(emitted).toHaveLength(0);
});
test('new final revision supersedes pending translation with same identity',async()=>{
 const completions:Array<(s:string)=>void>=[],events:any[]=[];
 const translator=new FinalTranslator({translate:()=>new Promise(resolve=>completions.push(resolve))},e=>events.push(e),()=>{});
 translator.reset('s',2);translator.enqueue(row() as any,'en');translator.enqueue(row(2) as any,'en');
 completions[0]('old');await new Promise(r=>setTimeout(r,0));completions[1]('new');await new Promise(r=>setTimeout(r,0));
 expect(events.map(e=>[e.sourceRevision,e.text])).toEqual([[2,'new']]);
});
import{translationMatches}from'../src/render';
test('overlay translation requires full segment identity and exact source revision',()=>{
 const current=row();const translated={sessionId:'s',epoch:2,segmentId:'a',sourceRevision:1};expect(translationMatches(current,translated)).toBe(true);
 for(const invalid of [{epoch:3},{sessionId:'other'},{segmentId:'b'},{sourceRevision:0}])expect(translationMatches(current,{...translated,...invalid})).toBe(false);
});
test('proofreading revisions patch the same source row and reject an older translation revision',()=>{
 const source=mergeFinal(undefined,row())!;
 const draft=mergeTranslation(source,{sessionId:'s',epoch:2,segmentId:'a',sourceRevision:1,targetLanguage:'en',text:'Draft',translationRevision:1} as any)!;
 const revised=mergeTranslation(draft,{sessionId:'s',epoch:2,segmentId:'a',sourceRevision:1,targetLanguage:'en',text:'Corrected negation and 20%',translationRevision:2} as any)!;
 expect(revised.translationRevision).toBe(2);expect(revised.translatedText).toBe('Corrected negation and 20%');expect(revised.sourceText).toBe('没有增长20%');
 expect(mergeTranslation(revised,{sessionId:'s',epoch:2,segmentId:'a',sourceRevision:1,targetLanguage:'en',text:'late draft',translationRevision:1} as any)?.translatedText).toBe('Corrected negation and 20%');
});
import{subtitlePage}from'../src/display';
test('unpunctuated cumulative Chinese advances whole visual pages and preserves the raw transcript',()=>{
 const raw='甲'.repeat(28)+'乙'.repeat(10);const page=subtitlePage(raw);expect(page.text).toBe('乙'.repeat(10));expect(page.index).toBe(1);expect(raw).toHaveLength(38);
 expect(subtitlePage('甲'.repeat(27)).text).toHaveLength(27);expect(subtitlePage('甲'.repeat(28)).index).toBe(0);expect(subtitlePage('甲'.repeat(29)).text).toBe('甲');
});
test('punctuation starts a new visual sentence and English pages have at most twelve words',()=>{
 expect(subtitlePage('第一句。第二句话').text).toBe('第二句话');
 const text=Array.from({length:15},(_,i)=>`word${i}`).join(' ');expect(subtitlePage(text).text).toBe('word12 word13 word14');
});
