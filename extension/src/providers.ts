import{termsConsistent,type TermMatch}from'./glossary';
import type{TranslationProvider,TranslatorAPI,NativeTranslator}from'./translation';
import type{TranslationEvent}from'./history';
export function withDeadline<T>(operation:(signal:AbortSignal)=>Promise<T>,milliseconds:number,parent?:AbortSignal,onCancel?:()=>void,onLate?:(value:T)=>void):Promise<T>{
 return new Promise((resolve,reject)=>{const controller=new AbortController();let settled=false;let timer:ReturnType<typeof setTimeout>;
 const cleanup=()=>{clearTimeout(timer);parent?.removeEventListener('abort',abort);};
 const cancel=(reason:Error)=>{if(settled)return;settled=true;controller.abort(reason);try{onCancel?.();}catch{}cleanup();reject(reason);};
 const abort=()=>cancel(new Error('操作已取消'));if(parent?.aborted){abort();return;}parent?.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>cancel(new Error(`操作超时 (${milliseconds} ms)`)),milliseconds);
 try{Promise.resolve(operation(controller.signal)).then(value=>{if(settled){try{onLate?.(value);}catch{}return;}settled=true;cleanup();resolve(value);},error=>{if(!settled){settled=true;cleanup();reject(error);}});}catch(error){settled=true;cleanup();reject(error);}
 });
}
export class NativeTranslationProvider implements TranslationProvider{
 private instances=new Map<string,NativeTranslator>();
 constructor(private api:()=>TranslatorAPI|undefined,private deadlineMs=2500){}
 invalidate(source:string,target:string){const key=`${source}:${target}`;this.instances.get(key)?.destroy();this.instances.delete(key);}
 async prepare(sourceLanguage:string,targetLanguage:string,signal?:AbortSignal){
 const key=`${sourceLanguage}:${targetLanguage}`;if(this.instances.has(key))return this.instances.get(key)!;
 const api=this.api();if(!api)throw new Error('此执行环境没有 Chrome Translator API');
 const availability=await withDeadline(()=>api.availability({sourceLanguage,targetLanguage}),this.deadlineMs,signal);
 if(availability!=='available')throw new Error(`翻译模型 ${availability}；请在侧栏准备本地翻译`);
 const instance=await withDeadline(()=>api.create({sourceLanguage,targetLanguage}),this.deadlineMs,signal,undefined,value=>value.destroy());
 if(signal?.aborted){instance.destroy();throw new Error('操作已取消');}this.instances.set(key,instance);return instance;
 }
 async translate(text:string,source:string,target:string,signal?:AbortSignal){
 return await withDeadline(async active=>{const instance=await this.prepare(source,target,active);return await instance.translate(text,{signal:active});},this.deadlineMs,signal,()=>this.invalidate(source,target));
 }
}
export interface CorrectionProvider{proofread(previous:string,next:string,draft:string,source:string,target:string,signal?:AbortSignal):Promise<string>}
export class LocalModelTranslationProvider implements TranslationProvider,CorrectionProvider{
 constructor(private token:()=>string,private request:typeof fetch=fetch,private terms:(text:string,source:string,target:string)=>TermMatch[]=()=>[]){}
 async translate(text:string,source:string,target:string,signal?:AbortSignal){return this.proofread(text,'','',source,target,signal);}
 async proofread(previous:string,next:string,draft:string,source:string,target:string,signal?:AbortSignal){
 const token=this.token();if(!token)throw new Error('本机翻译未配对：缺少本机令牌');
 return withDeadline(async active=>{
 const matches=this.terms(previous,source,target);const terminology=[...new Map(matches.map(match=>[match.entry.source,{source:match.entry.source,target:match.entry.target}])).values()];
 const prompt=`【背景信息】\n固定术语映射（必须逐项采用，不可换名）：${JSON.stringify(terminology)}\n后续原文语境：${next||'无'}\n原文初稿译文（仅供参考，可能有误）：${draft||'无'}\n保留转折、比较、否定、数字和专名，不得颠倒关系，不得添加后续语境中的事实。\n请结合背景信息将以下文本翻译为${target==='zh'?'简体中文':'英语'}，只输出译文：${previous}`;
 const response=await this.request.call(globalThis,'http://127.0.0.1:8081/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({model:'local-hy-mt2',messages:[{role:'user',content:prompt}],temperature:0,max_tokens:256,stream:false}),signal:active});
 if(!response.ok)throw new Error(`本机 Hy-MT2 HTTP ${response.status}`);const data=await response.json();const text=data?.choices?.[0]?.message?.content;if(typeof text!=='string'||!text.trim())throw new Error('本机模型返回空译文');if(!termsConsistent(text,matches))throw Object.assign(new Error('校对未采用，保留初稿：固定术语名称不一致'),{code:'glossary_mismatch'});return text.trim();
 },2900,signal);
 }
}
/** Necessary lexical checks only. Passing never proves semantic equivalence or ASR correctness. */
export function correctionSafe(source:string,candidate:string,target:string){
 if(!candidate.trim())return false;
 const numbers=(text:string)=>[...text.normalize('NFKC').replace(/[−﹣‒–—]/g,'-').replace(/(?:minus|negative)\s+(?=\d)/gi,'-').replace(/(?:plus|positive)\s+(?=\d)/gi,'+').replace(/负(?=\d)/g,'-').replace(/正(?=\d)/g,'+').replace(/(\d)\s*(?:percent|per cent)\b/gi,'$1%').replace(/(\d)\s*%/g,'$1%').matchAll(/[+-]?\d+(?:[.,]\d+)*(?:%)?/g)].map(match=>match[0]);
 const expected=numbers(source),actual=numbers(candidate);
 if(expected.some(number=>!actual.includes(number))||actual.some(number=>!expected.includes(number)))return false;
 const englishNegation=/\b(?:not|no|never|neither|without|cannot|unable|lack(?:s|ed|ing)?|fail(?:s|ed|ing)?)\b|n['’]t\b/i;
 // Lexical/discourse uses do not by themselves assert a negative predicate.
 const predicateSource=source.replace(/不过|不仅|不但|不论|不管|不妨|不久|不错|不凡|不约而同|未来/g,'');
 const chineseNegation=/[不未]\s*(?=[\p{Script=Han}A-Za-z])|没有|没能|无需|无权|无法|无力|无效|缺乏|缺少/u;
 if(target==='en'){
 if(chineseNegation.test(predicateSource)&&!englishNegation.test(candidate))return false;
 if(/比.{1,50}更/.test(source)&&!/\bthan\b|\bexceed|\bout(?:number|perform|weigh)|\bcompared\b/i.test(candidate))return false;
 }else if(englishNegation.test(source)&&!/[不没未无非]|缺乏|缺少/.test(candidate))return false;
 return true;
}

export class ContextProofreader{
 private session='';private epoch=0;private generation=0;private paused=false;private busy=false;private controller:AbortController|undefined;
 private preempted=new WeakSet<AbortController>();
 private previous:any;private queue:any[]=[];private drafts=new Map<string,TranslationEvent>();private latest=new Map<string,number>();
 constructor(private provider:CorrectionProvider,private emit:(event:TranslationEvent)=>void,private failure:(event:any)=>void){}
 reset(session:string,epoch:number){this.controller?.abort();this.generation++;this.session=session;this.epoch=epoch;this.busy=false;this.paused=false;this.queue=[];this.previous=undefined;this.drafts.clear();this.latest.clear();}
 recordDraft(event:TranslationEvent){if(event.sessionId===this.session&&event.epoch===this.epoch&&(event.translationRevision??1)===1){this.drafts.set(event.segmentId,event);void this.drain();}}
 observe(event:any,targetLanguage:string){if(event.phase!=='final'||event.sessionId!==this.session||event.epoch!==this.epoch)return;
 this.latest.set(event.segmentId,event.revision);
 if(this.previous&&this.previous.segmentId!==event.segmentId){const task={previous:this.previous,next:event.sourceText,targetLanguage};if(this.queue.length>=2){const dropped=this.queue.shift();this.failure({...dropped.previous,sourceRevision:dropped.previous.revision,targetLanguage:dropped.targetLanguage,error:'本轮校对未采用，保留初稿：新字幕优先，校对队列已满',proofreadingState:'skipped'});}this.queue.push(task);}
 this.previous=event;void this.drain();
 }
 prioritizeDraft(active:boolean){this.paused=active;if(active&&this.controller){this.preempted.add(this.controller);this.controller.abort();}else if(!active)void this.drain();}
 private async drain(){
 if(this.busy||this.paused||!this.queue.length)return;const task=this.queue[0],draft=this.drafts.get(task.previous.segmentId);if(!draft)return;
 this.queue.shift();this.busy=true;const generation=this.generation;const controller=new AbortController();this.controller=controller;const previous=task.previous,startedAt=Date.now();
 try{const source=previous.sourceLanguage==='auto'?(/[\u3400-\u9fff]/.test(previous.sourceText)?'zh':'en'):previous.sourceLanguage;
 const text=await withDeadline(signal=>this.provider.proofread(previous.sourceText,task.next,draft.text,source,task.targetLanguage,signal),3000,controller.signal);
 if(generation!==this.generation||controller.signal.aborted||this.latest.get(previous.segmentId)!==previous.revision)return;
 if(!correctionSafe(previous.sourceText,text,task.targetLanguage)){this.failure({...previous,sourceRevision:previous.revision,targetLanguage:task.targetLanguage,error:'本轮校对未采纳：数字、否定或比较结构守门未通过',proofreadingState:'rejected'});return;}
 this.emit({type:'translation',sessionId:previous.sessionId,epoch:previous.epoch,segmentId:previous.segmentId,sourceRevision:previous.revision,translationRevision:2,glossaryVersion:previous.glossaryVersion,matchedTerms:previous.matchedTerms,targetLanguage:task.targetLanguage,text,engine:'local-hy-mt2/context',phase:'final',startedAt,completedAt:Date.now()});
 }catch(error){if(generation===this.generation){if(controller.signal.aborted&&this.preempted.has(controller)){if(this.queue.length<2)this.queue.unshift(task);else this.failure({...previous,sourceRevision:previous.revision,targetLanguage:task.targetLanguage,error:'本轮校对未采用，保留初稿：新字幕优先，已放弃被抢占的最旧校对',proofreadingState:'skipped'});}else if(!controller.signal.aborted&&(error as any)?.code==='glossary_mismatch')this.failure({...previous,sourceRevision:previous.revision,targetLanguage:task.targetLanguage,error:String(error),proofreadingState:'rejected'});else if(!controller.signal.aborted)this.failure({...previous,sourceRevision:previous.revision,targetLanguage:task.targetLanguage,error:`本机校对暂停：${String(error)}`,proofreadingState:'paused'});}}
 finally{if(generation===this.generation){this.busy=false;this.controller=undefined;if(!this.paused)void this.drain();}}
 }
}
