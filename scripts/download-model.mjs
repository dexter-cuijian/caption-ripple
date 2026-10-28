import {readFile, mkdir, rename, rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {verifyArtifact} from './artifact.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modelName=process.argv[2]??'paraformer';
const models=JSON.parse(await readFile(path.join(root,'models.lock.json'),'utf8'));
const model=models[modelName];
if(!model)throw new Error(`未知模型 ${modelName}，可选：${Object.keys(models).join(', ')}`);
const destination=path.join(root,'.models',modelName);
await mkdir(destination,{recursive:true});
for (const file of model.files) {
  const target=path.join(destination,file.name);
  let valid=false;
  try {valid=verifyArtifact(await readFile(target),file);} catch {}
  if(valid) {console.log(`${file.name}: 校验通过，复用`); continue;}
  const url=`https://huggingface.co/${model.repository}/resolve/${model.revision}/${file.name}`;
  const partial=`${target}.partial`;
  console.log(`下载 ${file.name} (${(file.size/1048576).toFixed(1)} MiB)`);
  await new Promise((resolve,reject)=> {
    const child=spawn('curl',['--fail','--location','--retry','3','--continue-at','-','--connect-timeout','20','--max-time','900','--output',partial,url],{stdio:'inherit'});
    child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`curl exit ${code}`)));
  });
  if(!verifyArtifact(await readFile(partial),file)) {await rm(partial,{force:true});throw new Error(`${file.name} 校验失败，未启用模型`);}
  await rename(partial,target);
  console.log(`${file.name}: 下载及完整性校验完成`);
}
console.log(`${modelName} 模型准备完成。`);
