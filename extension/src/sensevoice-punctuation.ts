interface SenseVoiceText {
 text:string;
 lang?:string;
 tokens?:string[];
 timestamps?:number[];
}

export interface DecodedFinal {text:string;sourceRaw?:string}

const sampleRate=16000;
const frame=320;
const sentenceOpening=/^\s+(?:I|you|he|she|it|we|they|this|these|there|that|however|meanwhile|for\s+(?:millions|many|most|some|those))\b/iu;
const unfinishedEnding=/\b(?:a|an|the|and|but|or|to|with|for|of|like)$/iu;

function hasQuietPause(samples:Float32Array,start:number,end:number,limit:number){
 let quiet=0;
 for(let offset=Math.ceil(start*sampleRate/frame)*frame;offset+frame<=Math.min(end*sampleRate,samples.length);offset+=frame){
  let power=0;
  for(let index=offset;index<offset+frame;index++)power+=samples[index]*samples[index];
  quiet=power<=limit?quiet+frame:0;
  if(quiet>=3200)return true;
 }
 return false;
}

export function senseVoiceFinalText(result:SenseVoiceText,samples:Float32Array):DecodedFinal{
 const {text,lang,tokens,timestamps}=result;
 if(lang!=='<|en|>'||!tokens?.length||tokens.length!==timestamps?.length||tokens.join('')!==text)return {text};

 let revised=text,offset=text.length,quietLimit:number|undefined;
 // Work right-to-left so adding punctuation never changes the earlier token offsets.
 for(let index=tokens.length-1;index>0;index--){
  offset-=tokens[index].length;
  const start=timestamps[index-1],end=timestamps[index];
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end-start<1.25)continue;
  const left=text.slice(0,offset);
  if(!/[a-z0-9]$/iu.test(left)||unfinishedEnding.test(left)||!sentenceOpening.test(text.slice(offset)))continue;
  if(quietLimit===undefined){
   let power=0;
   for(const sample of samples)power+=sample*sample;
   quietLimit=Math.min(.012,Math.sqrt(power/samples.length)*.2)**2*frame;
  }
  if(!hasQuietPause(samples,start,end,quietLimit))continue;
  const following=revised.slice(offset).trimStart();
  revised=revised.slice(0,offset)+'. '+following[0].toUpperCase()+following.slice(1);
 }
 return revised===text?{text}:{text:revised,sourceRaw:text};
}
