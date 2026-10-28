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
async function run(command,args){
  await new Promise((resolve,reject)=>{
    const child=spawn(command,args,{stdio:'inherit'});
    child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`${command} exit ${code}`)));
  });
}
if(model.archive){
  let ready=true;
  for(const file of model.files){try{if(!verifyArtifact(await readFile(path.join(destination,file.name)),file))ready=false;}catch{ready=false;}}
  if(ready){console.log(`${modelName}: 文件校验通过，复用`);process.exit(0);}
  const archive=path.join(destination,'download.tar.bz2.partial');
  let valid=false;try{valid=verifyArtifact(await readFile(archive),model.archive);}catch{}
  if(!valid)await run('curl',['--fail','--location','--retry','3','--continue-at','-','--connect-timeout','20','--max-time','900','--output',archive,model.archive.url]);
  if(!verifyArtifact(await readFile(archive),model.archive)){await rm(archive,{force:true});throw new Error('模型压缩包校验失败，未启用');}
  // Extract only the locked members, after validating the vendor archive digest.
  const members=[...model.files.map(file=>file.name),...(model.archive.notices??[])].map(name=>`${model.archive.prefix}/${name}`);
  await run('tar',['-xjf',archive,'--strip-components','1','-C',destination,...members]);
  for(const file of model.files)if(!verifyArtifact(await readFile(path.join(destination,file.name)),file))throw new Error(`${file.name} 解压后校验失败`);
  await rm(archive,{force:true});console.log(`${modelName}: 下载、解压与校验完成`);process.exit(0);
}
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
