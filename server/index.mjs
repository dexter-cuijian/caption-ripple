import http from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,chmodSync,existsSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {WebSocketServer,WebSocket} from 'ws';
import {Session,validOrigin,defaultWorkerFactory,ENGINE} from './session.mjs';
import {Diagnostics} from './diagnostics.mjs';
import {profileConfig,decoderOptions} from './profiles.mjs';

const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const loopback=address=>['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address);
const validHost=host=>/^(127\.0\.0\.1|localhost|\[::1\])(:\d{1,5})?$/.test(host??'');
const sameToken=(provided,expected)=>{if(typeof provided!=='string')return false;const actual=Buffer.from(provided),wanted=Buffer.from(expected);return actual.length===wanted.length&&timingSafeEqual(actual,wanted);};
const json=(response,status,payload)=>{response.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});response.end(JSON.stringify(payload));};

export function createServer({modelDir,runtimeDir=join(projectRoot,'.runtime'),workerFactory=defaultWorkerFactory,helloTimeoutMs=5000,evaluationRecordDir=process.env.CAPTION_EVAL_RECORD_DIR,profile=process.env.CAPTION_ASR_PROFILE??'paraformer'}={}){
  runtimeDir=resolve(runtimeDir);modelDir=resolve(modelDir??join(projectRoot,'.models',profile.startsWith('zipformer-')?profile:'paraformer'));
  const selectedProfile=profileConfig(profile,modelDir);decoderOptions(profile);
  mkdirSync(runtimeDir,{recursive:true,mode:0o700});
  const tokenPath=join(runtimeDir,'token');
  if(!existsSync(tokenPath))writeFileSync(tokenPath,randomBytes(32).toString('base64url'),{flag:'wx',mode:0o600});
  chmodSync(tokenPath,0o600);
  const token=readFileSync(tokenPath,'utf8').trim();
  if(!/^[A-Za-z0-9_-]{43,}$/.test(token))throw new Error('Invalid pairing token file; remove it to generate a new token');
  const diagnostics=new Diagnostics(runtimeDir),sessions=new Set(),clients=new Set();
  let decoderOwner=null,lastError=null;
  const acquireDecoder=session=>{
    if(decoderOwner&&decoderOwner!==session){const error=new Error('One native decoder session at a time');error.code='decoder_busy';throw error;}
    decoderOwner=session;lastError=null;
  };
  const releaseDecoder=session=>{if(decoderOwner===session)decoderOwner=null;};
  const modelsPresent=()=>selectedProfile.files.every(name=>existsSync(join(modelDir,name)));
  const server=http.createServer((request,response)=>{
    if(!loopback(request.socket.remoteAddress)||!validHost(request.headers.host)||!validOrigin(request.headers.origin))return json(response,403,{error:'Forbidden host or origin'});
    const origin=request.headers.origin;
    if(origin){response.setHeader('Access-Control-Allow-Origin',origin);response.setHeader('Vary','Origin');response.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');response.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');}
    if(request.method==='OPTIONS'){response.writeHead(204);return response.end();}
    if(request.method!=='GET')return json(response,405,{error:'Method not allowed'});
    const path=new URL(request.url,'http://localhost').pathname;
    const modelState=decoderOwner?(decoderOwner.ready?'ready':'loading'):(lastError?'error':'cold');
    if(path==='/health')return json(response,200,{status:modelState==='error'?'error':modelState==='loading'?'loading':'ok',ready:modelState==='ready',asr:selectedProfile.engine,translation:'disabled',protocolVersion:1,modelState,modelsPresent:modelsPresent(),error:lastError});
    if(!sameToken(request.headers.authorization?.startsWith('Bearer ')?request.headers.authorization.slice(7):undefined,token))return json(response,401,{error:'Bearer pairing token required'});
    if(path==='/capabilities')return json(response,200,{protocolVersion:1,languages:selectedProfile.languages,models:[{id:profile,engine:selectedProfile.engine,streaming:true,wordTimestamps:false,nativeTokenTimestamps:selectedProfile.nativeTokenTimestamps,hotwords:false,installed:modelsPresent()}],sampleRate:16000,maxChunkSamples:1600,translation:false,visual:false,timestampKind:'capture-estimate'});
    if(path==='/v1/diagnostics')return json(response,200,{events:diagnostics.events,logDropped:diagnostics.dropped,logError:diagnostics.error,sessions:[...sessions].map(session=>({sessionId:session.id,epoch:session.epoch,paused:session.paused,history:session.history}))});
    return json(response,404,{error:'Not found'});
  });
  const wss=new WebSocketServer({noServer:true,maxPayload:16384,perMessageDeflate:false});
  server.on('upgrade',(request,socket,head)=>{
    if(!loopback(request.socket.remoteAddress)||!validHost(request.headers.host)||!validOrigin(request.headers.origin)||request.url!=='/ws/v1/session'){
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;
    }
    if(clients.size>=4){socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');return;}
    wss.handleUpgrade(request,socket,head,ws=>wss.emit('connection',ws,request));
  });
  wss.on('connection',ws=>{
    clients.add(ws);let session=null;
    const send=event=>{
      if(ws.readyState!==WebSocket.OPEN)return;
      if(ws.bufferedAmount>1024*1024){ws.close(4408,'Client backpressure limit');session?.close();return;}
      if(event.type==='ready'||event.type==='reset')lastError=null;
      if(event.code==='asr_unavailable'||event.code==='asr_exited'){lastError=event.message;}
      ws.send(JSON.stringify(event));
    };
    const timer=setTimeout(()=>ws.close(4401,'Hello authentication deadline exceeded'),helloTimeoutMs);timer.unref();
    ws.on('message',(data,isBinary)=>{
      try{
        if(!session){
          if(isBinary)return ws.close(4401,'First message must authenticate');
          let message;try{message=JSON.parse(data.toString());}catch{return ws.close(4400,'Invalid hello JSON');}
          if(message.type!=='hello'||message.protocolVersion!==1)return ws.close(4400,'Unsupported hello protocol');
          if(!sameToken(message.token,token))return ws.close(4401,'Invalid pairing token');
          if(typeof message.sessionId!=='string'||!message.sessionId||message.sessionId.length>128||!Number.isSafeInteger(message.epoch)||message.epoch<0||!['auto','zh','en'].includes(message.sourceLanguage??'auto'))return ws.close(4400,'Invalid hello fields');
          if(!selectedProfile.languages.includes(message.sourceLanguage??'auto'))return ws.close(4400,'Language unsupported by selected ASR profile');
          clearTimeout(timer);
          if(decoderOwner)return ws.close(4429,'One native decoder session at a time');
          session=new Session(message,send,workerFactory,event=>diagnostics.log(event),{modelDir,profile,engine:selectedProfile.engine,acquireDecoder,releaseDecoder,evaluationRecordDir});sessions.add(session);
          return;
        }
        if(isBinary){session.audio(data);return;}
        const message=JSON.parse(data.toString());
        if(message.sessionId!==session.id)throw new Error('Session mismatch');
        if(message.type==='reset'){if(message.sourceLanguage&&!selectedProfile.languages.includes(message.sourceLanguage))throw new Error('Language unsupported by selected ASR profile');session.reset(message);return;}
        if(message.epoch!==session.epoch)throw new Error('Epoch mismatch');
        switch(message.type){
          case 'clock':session.clock(message);break;
          case 'pause':session.pause();break;
          case 'stop':session.close();ws.close(1000,'Stopped');break;
          case 'rendered':session.rendered(message);break;
          default:throw new Error('Unknown control message');
        }
      }catch(error){send({type:'status',level:'error',code:error.code==='decoder_busy'?'decoder_busy':'invalid_message',message:error.message,sessionId:session?.id,epoch:session?.epoch});}
    });
    ws.on('close',()=>{
      clearTimeout(timer);clients.delete(ws);session?.close();
      if(sessions.size>16){const first=[...sessions].find(s=>s.closed);if(first)sessions.delete(first);}
    });
    ws.on('error',()=>{session?.close();});
  });
  const close=server.close.bind(server);
  server.close=callback=>{
    for(const ws of clients)ws.terminate();
    const recordings=[...sessions].map(session=>session.close());
    wss.close();
    return close(error=>{Promise.all([diagnostics.close(),...recordings]).then(()=>callback?.(error));});
  };
  server.tokenPath=tokenPath;
  return server;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const server=createServer({modelDir:process.env.CAPTION_MODEL_DIR,runtimeDir:process.env.CAPTION_RUNTIME_DIR});
  server.listen(9876,'127.0.0.1',()=>console.log(`Caption companion listening on http://127.0.0.1:9876\nPairing token file: ${server.tokenPath}`));
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close(()=>process.exit(0)));
}
