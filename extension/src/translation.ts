import type{TranslationEvent}from'./history';
export interface TranslationProvider{translate(text:string,sourceLanguage:string,targetLanguage:string,signal?:AbortSignal):Promise<string>}
export class LanguageLock{
 locked:string|null=null;private previous='';private count=0;
 observe(text:string){const han=(text.match(/[\u3400-\u9fff]/g)||[]).length,letters=(text.match(/[a-z]/gi)||[]).length;const language=han>0&&han>=letters*.15?'zh':'en';
 if(language===this.previous)this.count++;else{this.previous=language;this.count=1;}if(this.count>=3)this.locked=language;return this.locked??language;
 }
}
export class FinalTranslator{
 private session='';private epoch=0;private generation=0;private busy=false;private queue:any[]=[];private latest=new Map<string,number>();private failed:any[]=[];private controller=new AbortController();language=new LanguageLock();
 constructor(private provider:TranslationProvider,private emit:(event:TranslationEvent)=>void,private failure:(event:any)=>void){}
 reset(session:string,epoch:number){this.controller.abort();this.controller=new AbortController();this.generation++;this.session=session;this.epoch=epoch;this.busy=false;this.queue=[];this.failed=[];this.latest.clear();this.language=new LanguageLock();}
 enqueue(event:any,targetLanguage:string){
 if(event.phase!=='final'||event.sessionId!==this.session||event.epoch!==this.epoch)return;
 const key=event.segmentId;if(event.revision<=(this.latest.get(key)??-1))return;this.latest.set(key,event.revision);
 const sourceLanguage=event.sourceLanguage==='auto'?this.language.observe(event.sourceText):event.sourceLanguage;
 const task={...event,sourceLanguage,targetLanguage};if(this.queue.length>=20){this.failure({...task,sourceRevision:task.revision,error:'翻译队列已满；原文已保存在历史中'});return;}
 this.queue.push(task);void this.drain();
 }
 retry(){this.queue.push(...this.failed.splice(0,Math.max(0,20-this.queue.length)));void this.drain();}
 private async drain(){
 if(this.busy)return;this.busy=true;const generation=this.generation,signal=this.controller.signal;
 try{while(this.queue.length&&generation===this.generation){const task=this.queue.shift();if(this.latest.get(task.segmentId)!==task.revision)continue;const startedAt=Date.now();
 try{const text=task.sourceLanguage===task.targetLanguage?task.sourceText:await this.provider.translate(task.sourceText,task.sourceLanguage,task.targetLanguage,signal);
 if(typeof text!=='string'||!text.trim())throw new Error('翻译引擎返回空文本');
 if(generation===this.generation&&this.latest.get(task.segmentId)===task.revision)this.emit({type:'translation',sessionId:task.sessionId,epoch:task.epoch,segmentId:task.segmentId,sourceRevision:task.revision,translationRevision:1,targetLanguage:task.targetLanguage,text,engine:task.sourceLanguage===task.targetLanguage?'same-language':undefined,phase:'final',startedAt,completedAt:Date.now()});
 }catch(error){if(generation===this.generation&&!signal.aborted){this.failure({...task,sourceRevision:task.revision,error:String(error)});if(this.failed.length<20)this.failed.push(task);}}
 }}finally{if(generation===this.generation)this.busy=false;}
 }
}
export interface NativeTranslator{translate(text:string,options?:{signal?:AbortSignal}):Promise<string>;destroy():void}
export interface TranslatorAPI{availability(options:{sourceLanguage:string;targetLanguage:string}):Promise<string>;create(options:{sourceLanguage:string;targetLanguage:string;monitor?:(monitor:any)=>void}):Promise<NativeTranslator>}
export const translatorAPI=()=>(globalThis as any).Translator as TranslatorAPI|undefined;
