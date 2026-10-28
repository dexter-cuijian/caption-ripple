export interface GlossaryEntry{id:string;source:string;target:string;sourceLang:string;targetLang:string;scope:'global'|'video';videoUrl?:string;reference?:string}
export interface GlossaryState{version:number;entries:GlossaryEntry[]}
export interface TermMatch{start:number;end:number;sourceText:string;entry:GlossaryEntry}
export const emptyGlossary:GlossaryState={version:0,entries:[]};
const sameVideo=(a:string,b:string)=>{try{const left=new URL(a),right=new URL(b);left.hash='';right.hash='';return left.href===right.href;}catch{return false;}};
export const inScope=(entry:GlossaryEntry,url:string)=>entry.scope==='global'||!!entry.videoUrl&&sameVideo(entry.videoUrl,url);
export function validateGlossary(value:unknown):GlossaryEntry[]{
 if(!Array.isArray(value)||value.length>500)throw new Error('术语 JSON 必须是最多500条的数组');const ids=new Set<string>();
 return value.map((raw:any)=>{if(!raw||typeof raw.source!=='string'||!raw.source.trim()||Array.from(raw.source).length>128||typeof raw.target!=='string'||!raw.target.trim()||Array.from(raw.target).length>160||!['zh','en'].includes(raw.sourceLang)||!['zh','en'].includes(raw.targetLang)||!['global','video'].includes(raw.scope))throw new Error('术语必须含有效source/target/sourceLang/targetLang/scope');
 if(raw.scope==='video'&&(typeof raw.videoUrl!=='string'||!/^https?:\/\//.test(raw.videoUrl)))throw new Error('当前视频范围必须指定HTTP(S) videoUrl');
 if(raw.reference&&!(typeof raw.reference==='string'&&/^https?:\/\//.test(raw.reference)))throw new Error('参考来源必须为HTTP(S)链接');let id=typeof raw.id==='string'&&raw.id&&!ids.has(raw.id)?raw.id:crypto.randomUUID();ids.add(id);
 return{id,source:raw.source.trim(),target:raw.target.trim(),sourceLang:raw.sourceLang,targetLang:raw.targetLang,scope:raw.scope,...(raw.scope==='video'?{videoUrl:raw.videoUrl}:{}),...(raw.reference?{reference:raw.reference}:{})};});
}
export function matchGlossary(text:string,entries:GlossaryEntry[],source:string,target:string,url:string):TermMatch[]{
 const candidates=entries.filter(entry=>entry.sourceLang===source&&entry.targetLang===target&&inScope(entry,url)).sort((a,b)=>b.source.length-a.source.length||Number(b.scope==='video')-Number(a.scope==='video'));
 const matches:TermMatch[]=[];const lower=text.toLocaleLowerCase();let cursor=0;
 while(cursor<text.length){const entry=candidates.find(entry=>{if(!lower.startsWith(entry.source.toLocaleLowerCase(),cursor))return false;if(entry.sourceLang==='en'){const word=/[\p{L}\p{N}]/u;if(word.test(entry.source[0])&&word.test(text[cursor-1]??''))return false;if(word.test(entry.source.at(-1)!)&&word.test(text[cursor+entry.source.length]??''))return false;}return true;});
 if(entry){matches.push({start:cursor,end:cursor+entry.source.length,sourceText:text.slice(cursor,cursor+entry.source.length),entry});cursor+=entry.source.length;}else cursor++;}
 return matches;
}
export interface ProtectedTerms{text:string;tokens:Array<{token:string;target:string}>;matches:TermMatch[]}
export function protectTerms(raw:string,matches:TermMatch[],nonce=crypto.randomUUID().replace(/-/g,'').slice(0,8).toUpperCase()):ProtectedTerms{
 const prefix=`ZXQ${nonce.toUpperCase()}T`;if(raw.toUpperCase().includes(prefix))throw new Error('术语占位符前缀冲突');let cursor=0,text='';const tokens:Array<{token:string;target:string}>=[];
 for(const[order,match]of matches.entries()){const token=`${prefix}${order}QXZ`;text+=raw.slice(cursor,match.start)+token;cursor=match.end;tokens.push({token,target:match.entry.target});}text+=raw.slice(cursor);return{text,tokens,matches};
}
const escaped=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function restoreTerms(candidate:string,plan:ProtectedTerms){
 let text=candidate;for(const{token,target}of plan.tokens){const matcher=new RegExp(escaped(token),'gi');if([...text.matchAll(matcher)].length!==1)throw new Error('术语占位符丢失或重复；拒绝使用未恢复译文');text=text.replace(matcher,()=>target);}
 if(/ZXQ[A-Z0-9]+QXZ/i.test(text))throw new Error('译文包含未知术语占位符');if(!termsConsistent(text,plan.matches))throw new Error('术语恢复数量不一致');return text;
}
export function termsConsistent(candidate:string,matches:TermMatch[]){
 if(/ZXQ[A-Z0-9]+QXZ/i.test(candidate))return false;const expected=new Map<string,number>();for(const match of matches){const target=match.entry.target.toLocaleLowerCase();expected.set(target,(expected.get(target)??0)+1);}
 const lower=candidate.toLocaleLowerCase();for(const[target,count]of expected)if(lower.split(target).length-1!==count)return false;return true;
}
export function hotwordsFor(entries:GlossaryEntry[],sourceLanguage:string,url:string){return[...new Set(entries.filter(entry=>(sourceLanguage==='auto'||entry.sourceLang===sourceLanguage)&&inScope(entry,url)&&Array.from(entry.source).length<=32).map(entry=>entry.source))].slice(0,64);}
const taipei='https://english.gov.taipei/cp.aspx?n=9098E8D466ED59D5&s=1A2F0EABD298B76F',legislator='https://www.ly.gov.tw/Pages/List.aspx?nodeid=46775';
/** Opt-in example data only. Never loaded into defaults or ASR without an explicit UI import. */
export const newsExamples:GlossaryEntry[]=[['蒋万安','Chiang Wan-an',taipei],['蔣萬安','Chiang Wan-an',taipei],['沈伯洋','Shen Pao-yang',legislator],['蓝营','pan-blue camp'],['藍營','pan-blue camp'],['绿营','pan-green camp'],['綠營','pan-green camp'],['民调','opinion poll'],['民調','opinion poll'],['误差范围','margin of error'],['誤差範圍','margin of error']].map(([source,target,reference],index)=>({id:`news-example-${index}`,source,target,sourceLang:'zh',targetLang:'en',scope:'global',...(reference?{reference}:{})}));
