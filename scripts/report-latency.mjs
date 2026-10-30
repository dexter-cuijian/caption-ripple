// Summarize real render acknowledgements; never substitute native decode timing.
import fs from 'node:fs';
const sessionId=process.argv[2];
const paths=['.runtime/diagnostics.jsonl.1','.runtime/diagnostics.jsonl'];
const events=paths.filter(fs.existsSync).flatMap(file=>fs.readFileSync(file,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)));
const renders=events.filter(e=>e.type==='rendered'&&(!sessionId||e.sessionId===sessionId));
const first=renders.filter(e=>e.firstSourceRender&&Number.isFinite(e.onsetToRenderMs));
const quantile=(values,p)=>{const sorted=values.toSorted((a,b)=>a-b);return sorted.length?sorted[Math.ceil(sorted.length*p)-1]:null;};
const values=first.map(e=>e.onsetToRenderMs);
console.log(JSON.stringify({kind:'real-Chrome-tabCapture-to-DOM-render-ACK',sessionId:sessionId??'all-retained-sessions',firstRenderSamples:first.length,renderAcks:renders.length,P50Ms:quantile(values,.5),P95Ms:quantile(values,.95),maxMs:values.length?Math.max(...values):null,onsetPrecisionMs:100,timestampKind:'capture-estimate',limitations:['Model supplies no word timestamps.','This report uses retained rotating logs only; pass a sessionId to isolate a run.','Speech-onset detection is energy-based and may include music.','Cold and warm samples are not separated automatically.']},null,2));
