import {fork} from 'node:child_process';
import {EventEmitter} from 'node:events';

/** N-API decoder failures must terminate only the native subprocess, never HTTP/WS. */
export class DecoderProcess extends EventEmitter {
  constructor({modelDir,profile='paraformer',entry=new URL('./worker.mjs',import.meta.url)}={}){
    super();this.supportsReset=true;this.stopping=false;this.exited=false;this.stderr='';
    this.child=fork(entry,[],{
      stdio:['ignore','ignore','pipe','ipc'],serialization:'advanced',
      execArgv:[],env:{...process.env,CAPTION_NATIVE_MODEL_DIR:modelDir??'',CAPTION_NATIVE_PROFILE:profile},
    });
    this.pid=this.child.pid;
    this.child.stderr.on('data',data=>{this.stderr=(this.stderr+data.toString()).slice(-4000);});
    this.child.on('message',message=>this.emit('message',message));
    this.child.on('error',error=>{if(!this.stopping)this.emit('error',error);});
    this.exitPromise=new Promise(resolve=>{
      this.child.on('exit',(code,signal)=>{
        this.exited=true;
        if(!this.stopping)this.emit('error',new Error(`Native decoder exited (${signal??code})${this.stderr?': '+this.stderr.trim():''}`));
        this.emit('exit',code,signal);resolve(code);
      });
    });
  }
  postMessage(message){
    if(this.stopping||this.exited)throw new Error('Native decoder is not running');
    this.child.send(message,error=>{if(error&&!this.stopping&&!this.exited)this.emit('error',error);});
  }
  terminate(){
    if(this.stopping||this.exited)return this.exitPromise;
    this.stopping=true;
    if(this.child.connected)this.child.send({type:'shutdown'},()=>{});
    const timer=setTimeout(()=>{if(!this.exited)this.child.kill('SIGKILL');},1000);timer.unref();
    return this.exitPromise.finally(()=>clearTimeout(timer));
  }
}
