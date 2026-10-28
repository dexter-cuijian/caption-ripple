import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,stat,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Diagnostics} from '../diagnostics.mjs';

test('diagnostics rotate, bound memory and exclude credential fields',async t=>{
 const root=await mkdtemp(join(tmpdir(),'lct-logs-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const diagnostics=new Diagnostics(root,{maxBytes:300,maxEvents:3});
 for(let i=0;i<10;i++){diagnostics.log({type:'test',i,token:'secret',key:'secret',Authorization:'secret'});await diagnostics.close();}
 assert.equal(diagnostics.events.length,3);
 assert.ok((await stat(diagnostics.path)).size<=300);
 assert.ok((await stat(diagnostics.previous)).size<=300);
 assert.equal((await stat(diagnostics.path)).mode&0o777,0o600);
 assert.ok(!(await readFile(diagnostics.path,'utf8')).includes('secret'));
});

test('single oversized diagnostic cannot exceed the rotation file cap',async t=>{
 const root=await mkdtemp(join(tmpdir(),'lct-logs-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const diagnostics=new Diagnostics(root,{maxBytes:300});
 diagnostics.log({type:'subtitle',sourceText:'x'.repeat(5000)});await diagnostics.close();
 assert.ok((await stat(diagnostics.path)).size<=300);
});
