import {createHash} from 'node:crypto';
import {createReadStream,createWriteStream} from 'node:fs';
import {mkdir,rename,rm,stat} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import {Readable,Transform} from 'node:stream';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import lock from '../sensevoice-model.lock.json' with {type:'json'};

const directory=fileURLToPath(new URL('../.models/sensevoice/',import.meta.url));
await mkdir(directory,{recursive:true});
async function digest(path){const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);return hash.digest('hex');}
async function valid(path,entry){try{return(await stat(path)).size===entry.size&&await digest(path)===entry.sha256;}catch{return false;}}
async function download(url,path,entry){
 if(await valid(path,entry))return;
 const temporary=`${path}.download-${process.pid}`;
 try{
  const response=await fetch(url,{redirect:'follow'});if(!response.ok||!response.body)throw new Error(`Download HTTP ${response.status}: ${url}`);
  const hash=createHash('sha256');let size=0;
  await pipeline(Readable.fromWeb(response.body),new Transform({transform(chunk,_encoding,done){size+=chunk.length;if(size>entry.size)return done(new Error('Download exceeds pinned size'));hash.update(chunk);done(null,chunk);}}),createWriteStream(temporary));
  if(size!==entry.size||hash.digest('hex')!==entry.sha256)throw new Error(`Pinned size/SHA-256 mismatch: ${path}`);
  await rename(temporary,path);
 }finally{await rm(temporary,{force:true});}
}
async function extractRuntime(archive){
 const target=`${directory}runtime`;
 await mkdir(target,{recursive:true});
 const required=Object.keys(lock.runtimeFiles);
 const complete=await Promise.all(required.map(name=>valid(`${target}/${name}`,lock.runtimeFiles[name])));
 if(complete.every(Boolean))return;
 const child=spawn('tar',['-xzf',archive,'-C',target,'--strip-components=1',...required.map(name=>`package/${name}`)],{stdio:'inherit'});
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
 if(code!==0)throw new Error(`Runtime archive extraction failed (${code})`);
 for(const name of required)if(!await valid(`${target}/${name}`,lock.runtimeFiles[name]))throw new Error(`Runtime integrity failed: ${name}`);
}
const source=`${lock.modelSource}/resolve/${lock.modelRevision}/`;
await download(`${source}${lock.model.name}`,`${directory}${lock.model.name}`,lock.model);
await download(`${source}${lock.tokens.name}`,`${directory}${lock.tokens.name}`,lock.tokens);
await download(lock.vad.url,`${directory}silero_vad_v5.onnx`,lock.vad);
await download(lock.runtime.url,`${directory}runtime.tgz`,lock.runtime);
await extractRuntime(`${directory}runtime.tgz`);
console.log('SenseVoice model, VAD and WASM runtime verified:',directory);
