import {expect,test} from 'vitest';
import {correctRecognizedNames} from '../src/name-corrections';
import {matchGlossary,effectiveGlossaryEntries} from '../src/glossary';
import {exportCaptions} from '../src/history';

test('corrects the observed Chiang Wan-an homophone before name matching, retaining raw ASR',()=>{
 const event=correctRecognizedNames({sourceText:'讲万安表示，讲万安今天出席。',sourceLanguage:'zh',phase:'final'});
 expect(event.sourceText).toBe('蒋万安表示，蒋万安今天出席。');
 expect(event.sourceRaw).toBe('讲万安表示，讲万安今天出席。');
 expect(correctRecognizedNames({sourceText:'蒋万案现身，蒋万事落后十七个百分点',sourceLanguage:'zh'}).sourceText).toBe('蒋万安现身，蒋万安落后十七个百分点');
 expect(correctRecognizedNames({sourceText:'蒋万恩现身',sourceLanguage:'zh'}).sourceText).toBe('蒋万安现身');
 const observed=correctRecognizedNames({sourceText:'民众直呼讲晚安好帅，蒋万元的选情',sourceLanguage:'zh'});
 expect(observed.sourceText).toBe('民众直呼蒋万安好帅，蒋万安的选情');
 expect(observed.sourceRaw).toBe('民众直呼讲晚安好帅，蒋万元的选情');
 expect(matchGlossary(event.sourceText,effectiveGlossaryEntries([]),'zh','en','https://news.test').map(match=>match.entry.target)).toEqual(['Chiang Wan-an','Chiang Wan-an']);
});

test('a user term takes priority over the built-in name spelling',()=>{
 const user={id:'mine',source:'蒋万安',target:'My preferred spelling',sourceLang:'zh',targetLang:'en',scope:'global'} as const;
 expect(matchGlossary('蒋万安',effectiveGlossaryEntries([user]),'zh','en','https://news.test')[0].entry.target).toBe(user.target);
});

test('does not change unrelated homophones or non-Chinese source',()=>{
 expect(correctRecognizedNames({sourceText:'讲完安保事项后继续',sourceLanguage:'zh'}).sourceText).toBe('讲完安保事项后继续');
 expect(correctRecognizedNames({sourceText:'讲万安',sourceLanguage:'en'}).sourceText).toBe('讲万安');
});

test('uses political context from the same sentence for the ambiguous good-night spelling',()=>{
 const sourceText='要记得跟奶奶讲晚安。台北市长講晚安今天出席。市长在直播里讲晚安后离开。';
 const event=correctRecognizedNames({sourceText,sourceLanguage:'zh',phase:'final'});
 expect(event.sourceRaw).toBe(sourceText);
 expect(event.sourceText).toBe('要记得跟奶奶讲晚安。台北市长蒋万安今天出席。市长在直播里讲晚安后离开。');
});

test('video-scoped place aliases repair ASR while preserving raw text and other pages',()=>{
 const entry={id:'place',source:'新莊',target:'Xinzhuang',sourceLang:'zh',targetLang:'en',scope:'video',videoUrl:'https://youtube.com/watch?v=abc',asrAliases:['辛庄'] } as const;
 const original='辛庄的选民';
 const fixed=correctRecognizedNames({sourceText:original,sourceLanguage:'zh'},[entry as any],entry.videoUrl);
 expect(fixed.sourceText).toBe('新莊的选民');expect(fixed.sourceRaw).toBe(original);
 expect(matchGlossary(fixed.sourceText,[entry as any],'zh','en',entry.videoUrl)[0].entry.target).toBe('Xinzhuang');
 expect(correctRecognizedNames({sourceText:original,sourceLanguage:'zh'},[entry as any],'https://youtube.com/watch?v=else').sourceText).toBe(original);
 expect(correctRecognizedNames({sourceText:'中俄关系',sourceLanguage:'zh'},[entry as any],entry.videoUrl).sourceText).toBe('中俄关系');
});

test('English place aliases respect word boundaries',()=>{
 const entry={id:'place-en',source:'Xinzhuang',target:'新莊',sourceLang:'en',targetLang:'zh',scope:'global',asrAliases:['sin zhuang']} as const;
 expect(correctRecognizedNames({sourceText:'SIN ZHUANG and sin zhuang',sourceLanguage:'en'},[entry as any]).sourceText).toBe('Xinzhuang and Xinzhuang');
 expect(correctRecognizedNames({sourceText:'within sin zhuangese',sourceLanguage:'en'},[entry as any]).sourceText).toBe('within sin zhuangese');
});

test('export uses the corrected subtitle and keeps raw ASR separately',()=>{
 const row={...correctRecognizedNames({sourceText:'讲万安发言',sourceLanguage:'zh'}),sessionId:'s',epoch:1,start:0,end:1,title:'新闻',url:'https://news.test'};
 expect(exportCaptions([row] as any,'txt')).toContain('蒋万安发言');
 expect(exportCaptions([row] as any,'txt')).not.toContain('讲万安发言');
 expect(row.sourceRaw).toBe('讲万安发言');
});

test('repairs verified Korean homophones only in matching finalized contexts',()=>{
 const examples=[
  ['영화 이하로 내려가는 날은 드물지만 실제 온도보다 더 춥게 느껴진다.','영하 이하로 내려가는 날은 드물지만 실제 온도보다 더 춥게 느껴진다.'],
  ['모든 주에서 만장일지의 동의를 얻어야만.','모든 주에서 만장일치의 동의를 얻어야만.'],
  ['발라파고스의1차 방목 동물인 거대 거북이','갈라파고스의1차 방목 동물인 거대 거북이']
 ];
 for(const [sourceText,expected] of examples)expect(correctRecognizedNames({sourceText,sourceLanguage:'ko',phase:'final'})).toMatchObject({sourceRaw:sourceText,sourceText:expected});
 for(const sourceText of ['영화 이하의 영상은 제외한다.','만장일지의 제목을 읽는다.','발라파고스 팀이 이겼다.']){
  expect(correctRecognizedNames({sourceText,sourceLanguage:'ko',phase:'final'}).sourceText).toBe(sourceText);
 }
 expect(correctRecognizedNames({sourceText:examples[0][0],sourceLanguage:'ko',phase:'interim'}).sourceText).toBe(examples[0][0]);
});

test('a scoped Korean place alias preserves its attached particle and whole-word boundaries',()=>{
 const url='https://example.test/news';
 const entry={id:'place',source:'갈라파고스',target:'加拉帕戈斯',sourceLang:'ko',targetLang:'zh',scope:'video' as const,videoUrl:url,asrAliases:['발라파고스']};
 const heard='발라파고스에서 오늘 새로운 조사 소식이 나왔다.';
 expect(correctRecognizedNames({sourceText:heard,sourceLanguage:'ko'},[entry],url).sourceText).toBe('갈라파고스에서 오늘 새로운 조사 소식이 나왔다.');
 expect(correctRecognizedNames({sourceText:heard,sourceLanguage:'ko'},[entry],'https://example.test/other').sourceText).toBe(heard);
 expect(correctRecognizedNames({sourceText:'가짜발라파고스 발라파고스팀',sourceLanguage:'ko'},[entry],url).sourceText).toBe('가짜발라파고스 발라파고스팀');
});
