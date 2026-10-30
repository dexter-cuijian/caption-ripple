import {mkdirSync,statSync,existsSync} from 'node:fs';
import {appendFile,rename,unlink} from 'node:fs/promises';
import {join} from 'node:path';

/** Bounded in-memory view and rotating private JSONL; model I/O never waits on disk. */
export class Diagnostics {
  constructor(runtimeDir,{maxBytes=2*1024*1024,maxEvents=2000}={}){
    mkdirSync(runtimeDir,{recursive:true,mode:0o700});
    this.path=join(runtimeDir,'diagnostics.jsonl');this.previous=this.path+'.1';
    this.size=existsSync(this.path)?statSync(this.path).size:0;
    this.maxBytes=maxBytes;this.maxEvents=maxEvents;this.events=[];this.queue=[];this.writing=null;this.dropped=0;this.error=null;
  }
  log(event){
    let safe={...event,loggedAt:Date.now()};delete safe.token;delete safe.key;delete safe.Authorization;
    let line=JSON.stringify(safe)+'\n';
    if(Buffer.byteLength(line)>Math.min(this.maxBytes,65536)){
      safe={type:safe.type,loggedAt:safe.loggedAt,truncated:true,sourceChars:String(safe.sourceText??'').length};
      line=JSON.stringify(safe)+'\n';
    }
    this.events.push(safe);if(this.events.length>this.maxEvents)this.events.shift();
    if(this.queue.length>=256){this.dropped++;return;}
    this.queue.push(line);this.flush();
  }
  flush(){
    if(this.writing||!this.queue.length)return;
    const lines=this.queue.splice(0);
    this.writing=(async()=>{
      for(const data of lines){
      if(this.size+Buffer.byteLength(data)>this.maxBytes){
        await unlink(this.previous).catch(error=>{if(error.code!=='ENOENT')throw error;});
        await rename(this.path,this.previous).catch(error=>{if(error.code!=='ENOENT')throw error;});
        this.size=0;
      }
      await appendFile(this.path,data,{mode:0o600});this.size+=Buffer.byteLength(data);
      }
    })().catch(error=>{this.error=error.message;}).finally(()=>{this.writing=null;this.flush();});
  }
  async close(){while(this.writing||this.queue.length){this.flush();await this.writing;}}
}
