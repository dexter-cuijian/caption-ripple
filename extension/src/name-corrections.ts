import {inScope,type GlossaryEntry} from './glossary';
/** Explicit, observed ASR name corrections. Keep the original hypothesis in sourceRaw. */
const chineseNames:ReadonlyArray<readonly [string,string]>=[['讲万安','蒋万安'],['蒋万案','蒋万安'],['蒋万事','蒋万安'],['蒋万恩','蒋万安']];

export function correctRecognizedNames<T extends {sourceText:string;sourceLanguage?:string;sourceRaw?:string}>(event:T,entries:GlossaryEntry[]=[],url=''):T&{sourceRaw:string}{
 const raw=event.sourceRaw??event.sourceText;
 const language=event.sourceLanguage==='auto'?(/[\u3400-\u9fff]/u.test(event.sourceText)?'zh':'en'):event.sourceLanguage??'zh';
 let corrected=event.sourceText;
 if(language==='zh')for(const[heard,name]of chineseNames)corrected=corrected.replaceAll(heard,name);
 const aliases=new Map<string,string>();
 for(const entry of [...entries].sort((a,b)=>Number(b.scope==='video')-Number(a.scope==='video'))){
  if(entry.sourceLang!==language||!inScope(entry,url))continue;
  for(const alias of entry.asrAliases??[]){const key=language==='en'?alias.toLocaleLowerCase():alias;if(!aliases.has(key))aliases.set(key,entry.source);}
 }
 if(aliases.size){
  const escape=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const alternatives=[...aliases.keys()].sort((a,b)=>b.length-a.length).map(escape).join('|');
  const pattern=new RegExp(language==='en'?`(?<![\\p{L}\\p{N}])(?:${alternatives})(?![\\p{L}\\p{N}])`:alternatives,language==='en'?'giu':'gu');
  corrected=corrected.replace(pattern,value=>aliases.get(language==='en'?value.toLocaleLowerCase():value)!);
 }
 return{...event,sourceRaw:raw,sourceText:corrected};
}
