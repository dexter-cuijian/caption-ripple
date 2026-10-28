import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {DecoderProcess} from '../process.mjs';

test('native child abnormal exit is contained and reports an error to parent',async()=>{
 const worker=new DecoderProcess({entry:new URL('./process-fixture.mjs',import.meta.url)});
 const [ready]=await once(worker,'message');assert.equal(ready.type,'ready');
 const errored=once(worker,'error');
 worker.postMessage({type:'audio',samples:new Float32Array(1600)});
 const [error]=await errored;assert.match(error.message,/SIGKILL|exited/);
 assert.equal(typeof process.pid,'number');await worker.terminate();
});

test('process adapter transports Float32Array preserving values and stop is idempotent',async()=>{
 const worker=new DecoderProcess({entry:new URL('./process-fixture.mjs',import.meta.url)});
 await once(worker,'message');const result=once(worker,'message');
 worker.postMessage({type:'echo',samples:new Float32Array([-.5,.25])});
 assert.deepEqual((await result)[0].samples,new Float32Array([-.5,.25]));
 await Promise.all([worker.terminate(),worker.terminate()]);
});
