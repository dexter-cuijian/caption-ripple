import {build as viteBuild} from 'vite';
import {build as esbuild} from 'esbuild';
import {copyFile,mkdir,cp,stat,constants} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import browserModel from '../browser-model.lock.json' with {type:'json'};
import senseModel from '../sensevoice-model.lock.json' with {type:'json'};
const root=fileURLToPath(new URL('../extension/',import.meta.url));
const outdir=fileURLToPath(new URL('../dist/extension/',import.meta.url));
await viteBuild({root,build:{outDir:outdir,emptyOutDir:true,rollupOptions:{input:{popup:`${root}popup.html`,sidepanel:`${root}sidepanel.html`,history:`${root}history.html`,offscreen:`${root}offscreen.html`}}}});
for(const name of ['background','content','worklet','asr-worker',...(process.env.CAPTION_SENSEVOICE==='1'?['sense-worker']:[])]) await esbuild({entryPoints:[`${root}src/${name}.ts`],bundle:true,format:name==='background'||name==='sense-worker'?'esm':'iife',target:'chrome116',outfile:`${outdir}${name}.js`,sourcemap:false});
await mkdir(outdir,{recursive:true});await copyFile(`${root}manifest.json`,`${outdir}manifest.json`);
await copyFile(fileURLToPath(new URL('../LICENSE',import.meta.url)),`${outdir}LICENSE.txt`);
await copyFile(fileURLToPath(new URL('../THIRD_PARTY.md',import.meta.url)),`${outdir}THIRD_PARTY.md`);
await mkdir(`${outdir}licenses`,{recursive:true});
for(const name of ['react','react-dom','scheduler'])await copyFile(fileURLToPath(new URL(`../node_modules/${name}/LICENSE`,import.meta.url)),`${outdir}licenses/${name}.txt`);
await cp(`${root}icons`,`${outdir}icons`,{recursive:true});
await cp(`${root}vendor`,`${outdir}vendor`,{recursive:true});
const model=fileURLToPath(new URL('../.models/browser-asr/sherpa-onnx-wasm-main-asr.data',import.meta.url));
let size=0,hash=createHash('sha256');
try{size=(await stat(model)).size;for await(const chunk of createReadStream(model))hash.update(chunk);}catch{throw new Error('Browser ASR model missing. Run npm run setup:browser-model before building.');}
if(size!==browserModel.dataSize||hash.digest('hex')!==browserModel.dataSha256)throw new Error('Browser ASR model failed pinned size/SHA-256 verification.');
await copyFile(model,`${outdir}vendor/sherpa-onnx-wasm-main-asr.data`);
if(process.env.CAPTION_SENSEVOICE==='1'){
 const input=fileURLToPath(new URL('../.models/sensevoice/',import.meta.url));
 const assets=[
  ['model.int8.onnx',senseModel.model],['tokens.txt',senseModel.tokens],['silero_vad_v5.onnx',senseModel.vad]
 ];
 const dest=`${outdir}vendor/sensevoice/`;await mkdir(`${dest}prebuilt`,{recursive:true});
 for(const [name,entry] of assets){const path=`${input}${name}`;let bytes;try{bytes=(await stat(path)).size;}catch{throw new Error(`SenseVoice asset missing: ${name}. Run npm run setup:sensevoice-model.`);}
  const actual=createHash('sha256');for await(const chunk of createReadStream(path))actual.update(chunk);
  if(bytes!==entry.size||actual.digest('hex')!==entry.sha256)throw new Error(`SenseVoice asset failed pinned verification: ${name}`);
  await copyFile(path,`${dest}${name}`,constants.COPYFILE_FICLONE);
 }
 for(const name of ['index.js','vad-asr-qejT8Rqh.js'])await copyFile(`${input}runtime/dist/${name}`,`${dest}${name}`);
 await copyFile(`${input}runtime/dist/prebuilt/vad-asr.wasm`,`${dest}prebuilt/vad-asr.wasm`,constants.COPYFILE_FICLONE);
 await copyFile(`${input}runtime/LICENSE`,`${dest}RUNTIME_LICENSE.txt`);
 await copyFile(`${root}vendor/sensevoice/MODEL_LICENSE.txt`,`${dest}MODEL_LICENSE.txt`);
}
console.log(`Load unpacked extension: ${outdir}`);
