// Real local model benchmark. Sources are attributed FLEURS human speech references;
// this is text translation evaluation, not Chrome capture or independent human QA.
import fs from 'node:fs';
const samples=[];
for(const [language,target,count] of [['cmn_hans_cn','en',25],['en_us','zh',25]]){
  const manifest=JSON.parse(fs.readFileSync(`.work/fixtures/${language}/manifest.json`));
  for(const row of manifest.samples.slice(0,count))samples.push({...row,sourceLanguage:language==='en_us'?'en':'zh',targetLanguage:target});
}
const token=fs.readFileSync('.runtime/token','utf8').trim();
const results=[];
for(const sample of samples){
  const started=performance.now();
  const response=await fetch('http://127.0.0.1:8081/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30000),body:JSON.stringify({model:'local',messages:[{role:'user',content:`将以下文本翻译成${sample.targetLanguage==='zh'?'简体中文':'英语'}，注意只输出译文，不要解释：\n\n${sample.reference}`}],temperature:.1,max_tokens:400})});
  const data=await response.json();
  if(!response.ok)throw new Error(`Local MT HTTP ${response.status}`);
  const text=data.choices?.[0]?.message?.content?.trim();
  if(!text)throw new Error('Local MT returned no text');
  results.push({file:sample.file,sourceLanguage:sample.sourceLanguage,targetLanguage:sample.targetLanguage,source:sample.reference,translation:text,latencyMs:Math.round(performance.now()-started)});
  fs.writeFileSync('.work/local-mt-evaluation.json',JSON.stringify({kind:'local-text-MT-not-browser',model:'Hy-MT2-1.8B-Q4_K_M',dataset:'google/fleurs dev',license:'CC-BY-4.0',reviewStatus:'pending-manual-review',results},null,2));
  console.log(`${results.length}/${samples.length}: ${results.at(-1).latencyMs}ms`);
}
