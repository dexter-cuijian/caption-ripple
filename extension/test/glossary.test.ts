import{expect,test}from'vitest';
import{matchGlossary,protectTerms,restoreTerms,termsConsistent,hotwordsFor,validateGlossary,newsExamples}from'../src/glossary';
import{correctionSafe}from'../src/providers';
const entry=(source:string,target:string,extra:any={})=>({id:source,source,target,sourceLang:'zh',targetLang:'en',scope:'global',...extra});
test('longest term first protects names and political terms without changing raw source or digits/negation',()=>{
 const raw='蒋万安表示蓝营并不增长20%，蓝营民调下降3%';const matches=matchGlossary(raw,[entry('蓝','blue'),entry('蓝营','pan-blue camp'),entry('蒋万安','Chiang Wan-an')],'zh','en','https://news.test/v');
 expect(matches.map(match=>match.entry.source)).toEqual(['蒋万安','蓝营','蓝营']);const plan=protectTerms(raw,matches,'ABCDEF01');expect(raw).toContain('并不增长20%');expect(plan.text).toContain('20%');expect(plan.text).toContain('3%');
 const translation=plan.text.replace('表示',' says ').replace('并不增长',' does not grow by ').replace('民调下降',' polls fell by ');
 const restored=restoreTerms(translation.toLowerCase(),plan);expect(restored).toContain('Chiang Wan-an');expect(restored.match(/pan-blue camp/g)).toHaveLength(2);expect(restored).not.toMatch(/ZXQ/i);
});
test('lost, duplicated or unknown placeholders are rejected rather than exposed',()=>{
 const plan=protectTerms('蓝营',matchGlossary('蓝营',[entry('蓝营','pan-blue camp')],'zh','en','https://n.test'),'ABCDEF01');
 expect(()=>restoreTerms('Lan Yin',plan)).toThrow('占位符');expect(()=>restoreTerms(plan.text+plan.text,plan)).toThrow('占位符');expect(()=>restoreTerms(plan.text+' ZXQUNKNOWNQXZ',plan)).toThrow('占位符');
});
test('video scope and language isolate terms; video overrides global at equal length',()=>{
 const entries=[entry('蓝营','global'),entry('蓝营','video',{scope:'video',videoUrl:'https://n.test/a'}),entry('沈伯洋','Shen Pao-yang',{scope:'video',videoUrl:'https://n.test/b'})];
 expect(matchGlossary('蓝营沈伯洋',entries,'zh','en','https://n.test/a').map(match=>match.entry.target)).toEqual(['video']);expect(matchGlossary('蓝营',entries,'en','zh','https://n.test/a')).toHaveLength(0);
});
test('term guard rejects Lan Yin and wrong fixed names while numeric/negation guards stay active',()=>{
 const matches=matchGlossary('蓝营不增长20%',[entry('蓝营','pan-blue camp')],'zh','en','https://n.test');expect(termsConsistent('Lan Yin did not grow by20%',matches)).toBe(false);expect(termsConsistent('The pan-blue camp did not grow by20%',matches)).toBe(true);expect(correctionSafe('蓝营不增长20%','The pan-blue camp grew by20%','en')).toBe(false);
});
test('hotwords are scoped, language-filtered, unique and capped64/32 characters; examples are opt-in data',()=>{
 const entries=Array.from({length:70},(_,i)=>entry(`名称${i}`,'term'));entries.push(entry('长'.repeat(33),'long'));expect(hotwordsFor(entries,'zh','https://n.test')).toHaveLength(64);expect(hotwordsFor([entry('只此视频','specific',{scope:'video',videoUrl:'https://n.test/a'})],'zh','https://n.test/b')).toEqual([]);
 expect(validateGlossary([])).toEqual([]);expect(newsExamples.some(term=>term.source==='蒋万安'&&term.target==='Chiang Wan-an')).toBe(true);expect(()=>validateGlossary([{source:'x'}])).toThrow();
});
import{mergeFinal,mergeTranslation}from'../src/history';
import{LocalModelTranslationProvider}from'../src/providers';
test('history patches cannot cross glossary versions for the same source revision',()=>{
 const row=mergeFinal(undefined,{phase:'final',sessionId:'s',epoch:1,segmentId:'a',revision:1,sourceText:'蓝营',targetLanguage:'en',glossaryVersion:2})!;
 expect(mergeTranslation(row,{sessionId:'s',epoch:1,segmentId:'a',sourceRevision:1,targetLanguage:'en',text:'old',glossaryVersion:1}as any)?.translatedText).toBeUndefined();
});
test('local model receives term context and rejects inconsistent fixed names instead of replacing a draft',async()=>{
 let prompt='';const entries=[entry('蓝营','pan-blue camp')];const provider=new LocalModelTranslationProvider(()=>'token',async(_url:any,options:any)=>{prompt=JSON.parse(options.body).messages[0].content;return new Response(JSON.stringify({choices:[{message:{content:'Lan Yin did not grow by20%'}}]}),{status:200});},(text,source,target)=>matchGlossary(text,entries,source,target,'https://n.test'));
 await expect(provider.proofread('蓝营不增长20%','后续语境','The pan-blue camp did not grow by20%','zh','en')).rejects.toThrow('术语');expect(prompt).toContain('pan-blue camp');expect(prompt).toContain('蓝营');
});
