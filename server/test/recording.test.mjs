import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,stat,readdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createEvaluationRecorder} from '../recording.mjs';

async function folder(t){const dir=await mkdtemp(join(tmpdir(),'caption-rec-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}

test('recording disabled by default creates no audio files',async t=>{
 const dir=await folder(t);assert.equal(createEvaluationRecorder(undefined,{sessionId:'secret-session'}),null);assert.deepEqual(await readdir(dir),[]);
});

test('opt-in actual PCM slices and packet identity saved privately without token',async t=>{
 const dir=await folder(t),rec=createEvaluationRecorder(dir,{sessionId:'s',token:'SECRET',video:{id:'v'}});
 const backing=Buffer.alloc(500,255);const pcm=backing.subarray(100,300);pcm.fill(3);
 rec.record(pcm,{sessionId:'s',epoch:1,seq:2,sampleStart:1600,capturedAt:1000,mediaTime:2,playbackRate:1,token:'SECRET'});
 await rec.close();
 const files=await readdir(dir);assert.equal(files.length,2);assert.equal((await stat(dir)).mode&0o777,0o700);
 for(const file of files)assert.equal((await stat(join(dir,file))).mode&0o777,0o600);
 assert.deepEqual(await readFile(rec.audioPath),pcm);
 const text=await readFile(rec.metadataPath,'utf8');assert.ok(!text.includes('SECRET'));
 const rows=text.trim().split('\n').map(JSON.parse),packet=rows.find(x=>x.type==='packet');
 assert.equal(packet.byteOffset,0);assert.equal(packet.byteLength,200);assert.equal(packet.epoch,1);assert.equal(packet.sampleStart,1600);
});

test('recording byte/time cap and bounded async queue never block PCM caller',async t=>{
 const dir=await folder(t),rec=createEvaluationRecorder(dir,{sessionId:'s'},{maxAudioBytes:3200,maxQueued:2});
 const packet={epoch:0,seq:0,sampleStart:0,capturedAt:1000,mediaTime:null,playbackRate:1};
 for(let i=0;i<100;i++)rec.record(Buffer.alloc(3200),{...packet,seq:i});
 await rec.close();assert.ok((await stat(rec.audioPath)).size<=3200);assert.ok(rec.dropped>0||rec.capped);
 const limited=createEvaluationRecorder(dir,{sessionId:'q'},{maxAudioBytes:32000,maxQueued:2});
 for(let i=0;i<100;i++)limited.record(Buffer.alloc(3200),{...packet,seq:i});
 assert.ok(limited.queue.length<=2);assert.ok(limited.dropped>0);await limited.close();
});

test('Session opt-in records only validated audio and close flushes packet sidecar',async t=>{
 const {Session}=await import('../session.mjs');const {EventEmitter}=await import('node:events');
 class Worker extends EventEmitter{postMessage(){}terminate(){return Promise.resolve();}}
 const dir=await folder(t),worker=new Worker();
 const session=new Session({sessionId:'s',epoch:0,sourceLanguage:'zh'},()=>{},()=>worker,()=>{},{evaluationRecordDir:dir});worker.emit('message',{type:'ready'});
 const pcm=Buffer.alloc(3200,7);assert.throws(()=>session.audio(pcm),/clock/);
 session.clock({sessionId:'s',epoch:0,seq:0,sampleStart:0,capturedAt:1000,mediaTime:1,playbackRate:1,paused:false});session.audio(pcm);await session.close();
 const files=await readdir(dir);const audio=files.find(x=>x.endsWith('.pcm'));assert.ok(audio);assert.deepEqual(await readFile(join(dir,audio)),pcm);
 const metadata=await readFile(join(dir,files.find(x=>x.endsWith('.jsonl'))),'utf8');assert.match(metadata,/"type":"end"/);assert.match(metadata,/"seq":0/);
});
