import {createEvaluationRecorder} from './recording.mjs';
import {DecoderProcess} from './process.mjs';

export const ENGINE='sherpa-onnx/paraformer';
export const validOrigin=origin=>origin===undefined||/^chrome-extension:\/\/[a-p]{32}$/.test(origin);
export const defaultWorkerFactory=options=>new DecoderProcess(options);
const finite=value=>typeof value==='number'&&Number.isFinite(value);

export class Session {
  constructor(hello,send,workerFactory,log=()=>{},options={}){
    this.engine=options.engine??ENGINE;this.id=hello.sessionId;this.epoch=hello.epoch;this.language=hello.sourceLanguage??'auto';
    this.hello=hello;this.send=send;this.workerFactory=workerFactory;this.log=log;this.options=options;
    this.queue=[];this.pending=null;this.clockPacket=null;this.nextSeq=0;this.nextSample=0;
    this.segment=0;this.revision=0;this.lastText='';this.speechStartAt=null;this.segmentStart=null;this.segmentMediaTime=null;
    this.paused=false;this.closed=false;this.ready=false;this.history=[];this.renderedRows=new Map();this.firstRenders=new Set();
    this.recording=createEvaluationRecorder(options.evaluationRecordDir,hello);
    this.startWorker(false);
  }
  startWorker(reset,reuse=null){
    this.options.acquireDecoder?.(this);
    let worker;
    try{worker=reuse??this.workerFactory({modelDir:this.options.modelDir,profile:this.options.profile});}
    catch(error){this.options.releaseDecoder?.(this);throw error;}
    if(this.workerHandlers){
      const {worker:previous,message,error,exit}=this.workerHandlers;
      previous.off('message',message);previous.off('error',error);previous.off('exit',exit);
    }
    this.worker=worker;
    const epoch=this.epoch;
    const current=()=>!this.closed&&!this.paused&&epoch===this.epoch&&this.worker===worker;
    const onMessage=message=>{
      if(!current())return;
      if(message.type==='ready'){
        this.ready=true;
        this.emit(reset?{type:'reset',sessionId:this.id,epoch}:{type:'ready',sessionId:this.id,epoch,engine:this.engine,sampleRate:16000});
        this.pump();
      }else if(message.type==='error')this.fail('asr_unavailable',message.message);
      else if(message.type==='decoded')this.decoded(message);
    };
    const onError=error=>{if(current())this.fail('asr_unavailable',error.message);};
    const onExit=code=>{if(current())this.fail('asr_exited',`Decoder exited unexpectedly (${code})`);};
    worker.on('message',onMessage);worker.on('error',onError);worker.on('exit',onExit);
    this.workerHandlers={worker,message:onMessage,error:onError,exit:onExit};
  }
  emit(event){this.send(event);this.log(event);}
  status(code,message,level='error'){this.emit({type:'status',sessionId:this.id,epoch:this.epoch,level,code,message});}
  fail(code,message){this.paused=true;this.ready=false;this.queue=[];this.pending=null;this.clockPacket=null;this.worker?.terminate();this.options.releaseDecoder?.(this);this.status(code,message);}
  clock(packet){
    if(this.closed||this.paused)return;
    if(packet.sessionId!==this.id||packet.epoch!==this.epoch)throw new Error('Stale session/epoch clock');
    if(this.clockPacket)throw new Error('Previous clock requires binary audio');
    if(!Number.isSafeInteger(packet.seq)||packet.seq!==this.nextSeq)throw new Error('Invalid sequence');
    if(!Number.isSafeInteger(packet.sampleStart)||packet.sampleStart!==this.nextSample)throw new Error('Invalid sampleStart');
    if(!finite(packet.capturedAt)||packet.capturedAt<0||!(packet.mediaTime===null||finite(packet.mediaTime))||!finite(packet.playbackRate)||packet.playbackRate<=0||packet.playbackRate>16||packet.paused!==false)throw new Error('Invalid clock metadata');
    this.clockPacket={...packet};
  }
  audio(buffer){
    if(this.closed||this.paused)return;
    if(!this.clockPacket)throw new Error('Binary audio requires a preceding clock');
    const meta=this.clockPacket;this.clockPacket=null;
    if(!buffer.length||buffer.length>3200||buffer.length%2)throw new Error('PCM must contain 1–1600 int16 mono samples');
    this.nextSeq++;this.nextSample+=buffer.length/2;
    if(this.queue.length>=20){this.fail('audio_overload','Decoder queue exceeded 2 seconds; reset with a new epoch');return;}
    this.recording?.record(buffer,meta);
    const samples=new Float32Array(buffer.length/2);
    for(let i=0;i<samples.length;i++)samples[i]=buffer.readInt16LE(i*2)/32768;
    this.queue.push({samples,meta,receivedAt:Date.now(),enqueuedAt:performance.now()});
    this.pump();
  }
  pump(){
    if(!this.ready||this.pending||this.paused||!this.queue.length)return;
    this.pending=this.queue.shift();this.pending.queueMs=performance.now()-this.pending.enqueuedAt;
    this.worker.postMessage({type:'audio',samples:this.pending.samples});
  }
  decoded(result){
    const packet=this.pending;if(!packet)return;
    this.pending=null;
    const {meta,samples}=packet;
    if(result.speechStarted){
      this.speechStartAt=meta.capturedAt-samples.length/16;
      this.segmentStart=meta.sampleStart/16000;
      this.segmentMediaTime=meta.mediaTime===null?null:meta.mediaTime-samples.length/16000*meta.playbackRate;
    }
    const decodedText=String(result.text??'').trim();
    const text=decodedText||(result.final?this.lastText:'');
    if(text&&(text!==this.lastText||result.final)){
      this.revision++;
      const start=this.segmentStart??meta.sampleStart/16000;
      const end=(meta.sampleStart+samples.length)/16000;
      // clock.mediaTime corresponds to packet END (same instant as capturedAt).
      const mediaTime=this.segmentStart===null?(meta.mediaTime===null?null:meta.mediaTime-samples.length/16000*meta.playbackRate):this.segmentMediaTime;
      const event={type:'subtitle',sessionId:this.id,epoch:this.epoch,segmentId:String(this.segment),revision:this.revision,phase:result.final?'final':'interim',sourceText:text,sourceLanguage:this.language,start,end,mediaTime,createdAt:Date.now(),engine:this.engine,speechStartAt:this.speechStartAt,audioEndAt:meta.capturedAt,timestampKind:'capture-estimate',metrics:{decodeMs:result.decodeMs??0,queueMs:packet.queueMs,serverReceivedAt:packet.receivedAt}};
      if(result.splitReason)event.splitReason=result.splitReason;
      this.emit(event);this.lastText=text;
      const key=`${this.epoch}:${this.segment}:${this.revision}`;
      this.renderedRows.set(key,event);
      if(this.renderedRows.size>512)this.renderedRows.delete(this.renderedRows.keys().next().value);
      if(result.final){this.history.push(event);if(this.history.length>5000)this.history.shift();}
    }
    if(result.final){this.segment++;this.revision=0;this.lastText='';this.segmentStart=null;this.speechStartAt=null;}
    if(result.maintenance)this.emit({type:'status',level:'info',code:'decoder_maintenance',message:'Decoder reset at a silence boundary',sessionId:this.id,epoch:this.epoch});
    this.log({type:'decode',sessionId:this.id,epoch:this.epoch,seq:meta.seq,capturedAt:meta.capturedAt,receivedAt:packet.receivedAt,decodeMs:result.decodeMs,queueMs:packet.queueMs,rms:result.rms,normalizedRms:result.normalizedRms,agcGain:result.agcGain,voiced:result.voiced});
    this.pump();
  }
  rendered(message){
    if(message.sessionId!==this.id||message.epoch!==this.epoch||!finite(message.renderedAt))throw new Error('Invalid rendered acknowledgement');
    const row=this.renderedRows.get(`${this.epoch}:${message.segmentId}:${message.revision}`);
    if(!row)throw new Error('Unknown subtitle revision');
    const renderKey=`${this.epoch}:${message.segmentId}`;
    const firstSourceRender=!this.firstRenders.has(renderKey);
    this.firstRenders.add(renderKey);
    if(this.firstRenders.size>512)this.firstRenders.delete(this.firstRenders.values().next().value);
    this.log({type:'rendered',firstSourceRender,sessionId:this.id,epoch:this.epoch,segmentId:message.segmentId,revision:message.revision,renderedAt:message.renderedAt,speechStartAt:row.speechStartAt,audioEndAt:row.audioEndAt,onsetToRenderMs:row.speechStartAt===null?null:message.renderedAt-row.speechStartAt,captureToRenderMs:message.renderedAt-row.audioEndAt,hasTranslation:false,timestampKind:'capture-estimate'});
  }
  reset(message){
    if(!Number.isSafeInteger(message.epoch)||message.epoch<=this.epoch)throw new Error('Reset requires a newer epoch');
    this.options.acquireDecoder?.(this);
    const reuse=!this.closed&&!this.paused&&this.worker?.supportsReset?this.worker:null;
    if(!reuse)this.worker?.terminate();
    this.epoch=message.epoch;this.queue=[];this.pending=null;this.clockPacket=null;
    this.nextSeq=0;this.nextSample=0;this.segment=0;this.revision=0;this.lastText='';this.speechStartAt=null;this.segmentStart=null;this.segmentMediaTime=null;
    this.language=message.sourceLanguage??this.language;
    this.paused=false;this.ready=false;this.renderedRows.clear();this.firstRenders.clear();this.startWorker(true,reuse);
    if(reuse)reuse.postMessage({type:'reset'});
  }
  pause(){this.paused=true;this.ready=false;this.queue=[];this.pending=null;this.clockPacket=null;this.worker?.terminate();this.options.releaseDecoder?.(this);this.status('paused','Capture paused; resume with a newer epoch','info');}
  close(){if(this.closed)return this.recording?.close();this.closed=true;this.ready=false;this.queue=[];this.pending=null;this.clockPacket=null;this.worker?.terminate();this.options.releaseDecoder?.(this);return this.recording?.close();}
}
