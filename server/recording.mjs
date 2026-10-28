import {mkdir,chmod,open} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';

/** Explicit evaluation-only PCM capture. No directory/file exists without opt-in. */
export function createEvaluationRecorder(directory,identity,options={}){
  return directory?new EvaluationRecorder(directory,identity,options):null;
}
class EvaluationRecorder {
  constructor(directory,identity,{maxAudioBytes=16000*2*600,maxMetadataBytes=800000,maxQueued=32}={}){
    const root=resolve(directory),id=`${Date.now()}-${randomUUID()}`;
    this.audioPath=join(root,id+'.pcm');this.metadataPath=join(root,id+'.jsonl');
    this.maxAudioBytes=Math.min(maxAudioBytes,19200000);this.maxMetadataBytes=Math.min(maxMetadataBytes,800000);this.maxQueued=maxQueued;
    this.queue=[];this.writing=null;this.dropped=0;this.capped=false;this.error=null;this.closed=false;this.audioBytes=0;this.metadataBytes=0;
    const header={type:'start',format:'pcm_s16le',sampleRate:16000,channels:1,sessionId:identity.sessionId,videoId:typeof identity.video?.id==='string'?identity.video.id.slice(0,256):null,sourceLanguage:identity.sourceLanguage??'auto',startedAt:Date.now()};
    this.initializing=(async()=>{
      await mkdir(root,{recursive:true,mode:0o700});await chmod(root,0o700);
      this.audio=await open(this.audioPath,'wx',0o600);this.metadata=await open(this.metadataPath,'wx',0o600);
      const line=JSON.stringify(header)+'\n';await this.metadata.write(line);this.metadataBytes+=Buffer.byteLength(line);
    })().catch(error=>{this.error=error.message;});
  }
  record(buffer,packet){
    if(this.closed||this.error||this.capped)return false;
    if(this.queue.length>=this.maxQueued){this.dropped++;return false;}
    const entry={type:'packet',sessionId:packet.sessionId,epoch:packet.epoch,seq:packet.seq,sampleStart:packet.sampleStart,capturedAt:packet.capturedAt,mediaTime:packet.mediaTime,playbackRate:packet.playbackRate,byteOffset:this.audioBytes,byteLength:buffer.length};
    const metadata=JSON.stringify(entry)+'\n';
    if(this.audioBytes+buffer.length>this.maxAudioBytes||this.metadataBytes+Buffer.byteLength(metadata)>this.maxMetadataBytes-1024){this.capped=true;return false;}
    this.queue.push({audio:Buffer.from(buffer),metadata});this.audioBytes+=buffer.length;this.metadataBytes+=Buffer.byteLength(metadata);this.flush();return true;
  }
  flush(){
    if(this.writing||!this.queue.length)return;
    const entry=this.queue.shift();
    this.writing=(async()=>{
      await this.initializing;if(this.error)return;
      await this.audio.write(entry.audio);await this.metadata.write(entry.metadata);
    })().catch(error=>{this.error=error.message;this.queue=[];}).finally(()=>{this.writing=null;this.flush();});
  }
  close(){
    if(this.closing)return this.closing;this.closed=true;
    this.closing=(async()=>{
      await this.initializing;
      while(this.writing||this.queue.length){this.flush();await this.writing;}
      if(this.metadata){await this.metadata.write(JSON.stringify({type:'end',audioBytes:this.audioBytes,dropped:this.dropped,capped:this.capped,error:this.error,endedAt:Date.now()})+'\n');await this.metadata.close();}
      await this.audio?.close();
    })().catch(error=>{this.error=error.message;});
    return this.closing;
  }
}
