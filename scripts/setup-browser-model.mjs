import {createHash} from 'node:crypto';
import {createReadStream,createWriteStream} from 'node:fs';
import {mkdir,rename,rm,stat} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {pipeline} from 'node:stream/promises';
import {Readable,Transform} from 'node:stream';
import {fileURLToPath} from 'node:url';
import lock from '../browser-model.lock.json' with {type:'json'};

const destination=fileURLToPath(new URL('../.models/browser-asr/sherpa-onnx-wasm-main-asr.data',import.meta.url));
const digest=async path=>{const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);return hash.digest('hex');};
async function valid(path){try{return(await stat(path)).size===lock.dataSize&&await digest(path)===lock.dataSha256;}catch{return false;}}
if(await valid(destination)){console.log('Browser ASR model verified:',destination);process.exit(0);}
await mkdir(fileURLToPath(new URL('../.models/browser-asr/',import.meta.url)),{recursive:true});
const archive=`${destination}.archive-${process.pid}`;
const temporary=`${destination}.download-${process.pid}`;
async function checkedStream(input,path,expectedSize,expectedHash){
 let size=0;const hash=createHash('sha256');
 await pipeline(input,new Transform({transform(chunk,_encoding,done){size+=chunk.length;if(size>expectedSize){done(new Error('Download exceeds pinned size'));return;}hash.update(chunk);done(null,chunk);}}),createWriteStream(path));
 const sha=hash.digest('hex');if(size!==expectedSize||sha!==expectedHash)throw new Error(`Checksum mismatch: ${size} bytes, sha256 ${sha}`);
}
try{
 const response=await fetch(lock.archiveUrl);if(!response.ok||!response.body)throw new Error(`Extension archive download HTTP ${response.status}`);
 await checkedStream(Readable.fromWeb(response.body),archive,lock.archiveSize,lock.archiveSha256);
 const unzip=spawn('unzip',['-p',archive,lock.archiveEntry],{stdio:['ignore','pipe','pipe']});
 const completed=new Promise((resolve,reject)=>{unzip.once('error',reject);unzip.once('close',resolve);});
 let errorText='';unzip.stderr.setEncoding('utf8');unzip.stderr.on('data',chunk=>{errorText+=chunk.slice(0,1024);});
 await checkedStream(unzip.stdout,temporary,lock.dataSize,lock.dataSha256);
 const exitCode=await completed;
 if(exitCode!==0)throw new Error(`Archive extraction failed (${exitCode}): ${errorText}`);
 await rename(temporary,destination);console.log('Browser ASR model verified:',destination);
}finally{await rm(archive,{force:true});await rm(temporary,{force:true});}
