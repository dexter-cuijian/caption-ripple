import{withDeadline}from'./providers';
import{continuationInput,splitContextTranslation}from'./caption-context';
import{termsConsistent}from'./glossary';
import type{TranslationEvent}from'./history';
export interface TranslationProvider{translate(text:string,sourceLanguage:string,targetLanguage:string,signal?:AbortSignal):Promise<string>}
export class LanguageLock{
 locked:string|null=null;private previous='';private count=0;
 observe(text:string){const han=(text.match(/[\u3400-\u9fff]/g)||[]).length,letters=(text.match(/[a-z]/gi)||[]).length;const language=han>0&&han>=letters*.15?'zh':'en';
 if(language===this.previous)this.count++;else{this.previous=language;this.count=1;}if(this.count>=3)this.locked=language;return this.locked??language;
 }
}
export class FinalTranslator{
 private session='';private epoch=0;private generation=0;private busy=false;private queue:any[]=[];private latest=new Map<string,number>();private failed:any[]=[];private previousFinal:any;private controller=new AbortController();language=new LanguageLock();
 private draining=Promise.resolve();
 constructor(private provider:TranslationProvider,private emit:(event:TranslationEvent)=>void,private failure:(event:any)=>void,private options:{deadlineMs?:number;onWork?:(active:boolean)=>void}={}){}
 reset(session:string,epoch:number){this.controller.abort();this.controller=new AbortController();this.generation++;this.session=session;this.epoch=epoch;this.busy=false;this.queue=[];this.failed=[];this.previousFinal=undefined;this.latest.clear();this.language=new LanguageLock();this.draining=Promise.resolve();}
 enqueue(event:any,targetLanguage:string){
 if(event.phase!=='final'||event.sessionId!==this.session||event.epoch!==this.epoch)return;
 const key=event.segmentId;if(event.revision<=(this.latest.get(key)??-1))return;this.latest.set(key,event.revision);
 const sourceLanguage=event.sourceLanguage==='yue'?'zh':event.sourceLanguage==='auto'?this.language.observe(event.sourceText):event.sourceLanguage;
 const task={...event,sourceLanguage,targetLanguage};
 const previous=this.previousFinal;
 const input=previous&&!previous.context&&previous.segmentId!==task.segmentId?continuationInput(previous,task):undefined;
 if(input)task.context={previous,input};
 this.previousFinal=task;
 if(this.queue.length>=20){this.failure({...task,sourceRevision:task.revision,error:'翻译队列已满；原文已保存在历史中'});return;}
 this.queue.push(task);this.startDrain();
 }
 retry(){this.queue.push(...this.failed.splice(0,Math.max(0,20-this.queue.length)));this.startDrain();}
 whenIdle(){return this.draining;}
 private startDrain(){if(!this.busy)this.draining=this.drain();}
 private emitResult(task:any,text:string,startedAt:number,translationRevision=1){
  this.emit({type:'translation',sessionId:task.sessionId,epoch:task.epoch,segmentId:task.segmentId,sourceRevision:task.revision,translationRevision,glossaryVersion:task.glossaryVersion,matchedTerms:task.matchedTerms,targetLanguage:task.targetLanguage,text,engine:task.sourceLanguage===task.targetLanguage?'same-language':undefined,phase:'final',startedAt,completedAt:Date.now()});
 }
 private async drain(){
  this.busy=true;this.options.onWork?.(true);
  const generation=this.generation,signal=this.controller.signal;
  const current=(task:any)=>generation===this.generation&&this.latest.get(task.segmentId)===task.revision;
  try{
   while(this.queue.length&&generation===this.generation){
    const task=this.queue.shift();if(!current(task))continue;
    const startedAt=Date.now();
    try{
     const context=task.context;
     if(context&&current(context.previous)){
      const repaired=await withDeadline(async active=>{
       const text=await this.provider.translate(context.input,task.sourceLanguage,task.targetLanguage,active);
       const parts=splitContextTranslation(text,context.input);
       if(parts&&termsConsistent(parts[0],context.previous.matchedTerms??[])&&termsConsistent(parts[1],task.matchedTerms??[]))return parts;
      },500,signal).catch(()=>undefined);
      if(!current(task))continue;
      if(repaired&&current(context.previous)){
       this.emitResult(context.previous,repaired[0],startedAt,2);
       this.emitResult(task,repaired[1],startedAt);
       this.failed=this.failed.filter(failed=>failed.segmentId!==context.previous.segmentId);
       continue;
      }
     }
     const text=task.sourceLanguage===task.targetLanguage?task.sourceText:await withDeadline(active=>this.provider.translate(task.sourceText,task.sourceLanguage,task.targetLanguage,active),this.options.deadlineMs??8000,signal);
     if(typeof text!=='string'||!text.trim())throw new Error('翻译引擎返回空文本');
     if(current(task))this.emitResult(task,text,startedAt);
    }catch(error){
     if(current(task)&&!signal.aborted){this.failure({...task,sourceRevision:task.revision,error:String(error)});if(this.failed.length<20)this.failed.push(task);}
    }
   }
  }finally{if(generation===this.generation){this.busy=false;this.options.onWork?.(false);}}
 }
}
/** Translate the visible page of a growing ASR hypothesis without waiting for a final. */
export class LiveTranslator{
 private session='';private epoch=0;private latest:any;private timer:ReturnType<typeof setTimeout>|undefined;private controller=new AbortController();private busy=false;private lastAttempt=0;private lastText='';
 constructor(private provider:TranslationProvider,private emit:(event:any)=>void,private failure:(error:string)=>void,private intervalMs=2500){}
 reset(session:string,epoch:number){this.controller.abort();this.controller=new AbortController();clearTimeout(this.timer);this.timer=undefined;this.session=session;this.epoch=epoch;this.latest=undefined;this.busy=false;this.lastAttempt=0;this.lastText='';}
 observe(event:any,targetLanguage:string,pageText:string,pageIndex:number){
  if(event.phase!=='interim'||event.sessionId!==this.session||event.epoch!==this.epoch||pageText.trim().length<18)return;
  this.latest={...event,targetLanguage,pageText,pageIndex};this.schedule();
 }
 finalize(event:any){if(this.latest?.segmentId===event.segmentId){this.latest=undefined;clearTimeout(this.timer);this.timer=undefined;}}
 private schedule(){if(this.timer||this.busy||!this.latest)return;this.timer=setTimeout(()=>{this.timer=undefined;void this.run();},Math.max(75,this.lastAttempt+this.intervalMs-Date.now()));}
 private async run(){const task=this.latest;if(!task||this.busy||task.pageText===this.lastText)return;this.busy=true;this.lastAttempt=Date.now();this.lastText=task.pageText;
  const source=task.sourceLanguage==='yue'?'zh':task.sourceLanguage==='auto'?(/[\u3400-\u9fff]/.test(task.pageText)?'zh':'en'):task.sourceLanguage;
  try{if(source===task.targetLanguage)return;
   const text=await withDeadline(signal=>this.provider.translate(task.pageText,source,task.targetLanguage,signal),5000,this.controller.signal);
   const current=this.latest;if(text?.trim()&&current&&current.sessionId===task.sessionId&&current.epoch===task.epoch&&current.segmentId===task.segmentId&&current.pageIndex===task.pageIndex&&current.sourceText.startsWith(task.sourceText))this.emit({...task,sourceRevision:task.revision,text,sourceLanguage:source});
  }catch(error){if(!this.controller.signal.aborted)this.failure(String(error));}
  finally{this.busy=false;if(this.latest&&this.latest.pageText!==this.lastText)this.schedule();}
 }
}
export interface NativeTranslator{translate(text:string,options?:{signal?:AbortSignal}):Promise<string>;destroy():void}
export interface TranslatorAPI{availability(options:{sourceLanguage:string;targetLanguage:string}):Promise<string>;create(options:{sourceLanguage:string;targetLanguage:string;monitor?:(monitor:any)=>void}):Promise<NativeTranslator>}
export const translatorAPI=()=>(globalThis as any).Translator as TranslatorAPI|undefined;
