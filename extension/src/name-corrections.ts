import {inScope,termBoundary,type GlossaryEntry} from './glossary';
/** Explicit, observed ASR name corrections. Keep the original hypothesis in sourceRaw. */
const chineseNames:ReadonlyArray<readonly [string,string]>=[['讲万安','蒋万安'],['讲晚安','蒋万安'],['蒋万案','蒋万安'],['蒋万事','蒋万安'],['蒋万恩','蒋万安'],['蒋万元','蒋万安']];

function correctKoreanContext(text:string){
 let result=text.replace(/(?<![\p{L}\p{N}])만장일지(?=의[ \t]*동의)/gu,'만장일치');
 // The bare homophone can genuinely refer to cinema; require temperature context.
 if(/(?:온도|기온|추워|춥게|쌀쌀|동결|얼어)/u.test(result)){
  result=result.replace(/(?<![\p{L}\p{N}])영화(?=[ \t]*이하로[ \t]*내려가)/gu,'영하');
 }
 if(/거대[ \t]*거북/u.test(result)){
  result=result.replace(/(?<![\p{L}\p{N}])발라파고스(?=의|[ \t.,!?。]|$)/gu,'갈라파고스');
 }
 return result;
}

export function correctRecognizedNames<T extends {sourceText:string;sourceLanguage?:string;sourceRaw?:string;phase?:string}>(event:T,entries:GlossaryEntry[]=[],url=''):T&{sourceRaw:string}{
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
  const pattern=new RegExp(`(?:${alternatives})`,language==='en'?'giu':'gu');
  corrected=corrected.replace(pattern,(value,offset:number,input:string)=>
   termBoundary(input,offset,offset+value.length,language)?aliases.get(language==='en'?value.toLocaleLowerCase():value)!:value);
 }
 if(language==='ko'&&event.phase==='final')corrected=correctKoreanContext(corrected);
 return{...event,sourceRaw:raw,sourceText:corrected};
}
