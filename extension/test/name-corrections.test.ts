import {expect,test} from 'vitest';
import {correctRecognizedNames} from '../src/name-corrections';
import {matchGlossary,effectiveGlossaryEntries} from '../src/glossary';
import {exportCaptions} from '../src/history';

test('corrects the observed Chiang Wan-an homophone before name matching, retaining raw ASR',()=>{
 const event=correctRecognizedNames({sourceText:'讲万安表示，讲万安今天出席。',sourceLanguage:'zh',phase:'final'});
 expect(event.sourceText).toBe('蒋万安表示，蒋万安今天出席。');
 expect(event.sourceRaw).toBe('讲万安表示，讲万安今天出席。');
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
