import {expect,test} from 'vitest';
import {senseVoiceFinalText} from '../src/sensevoice-punctuation';

const result={
 lang:'<|en|>',
 tokens:['Children found joy in the flooded streets',' for',' millions',' like Ratini.'],
 timestamps:[.2,1.8,1.92,2.14],
 text:'Children found joy in the flooded streets for millions like Ratini.'
};
const speech=()=>new Float32Array(48000).fill(.08);

test('restores a missing period only with aligned tokens and a sustained pause',()=>{
 const samples=speech();
 samples.fill(0,16000,20800);
 expect(senseVoiceFinalText(result,samples)).toEqual({
  text:'Children found joy in the flooded streets. For millions like Ratini.',
  sourceRaw:result.text
 });
 expect(senseVoiceFinalText(result,speech())).toEqual({text:result.text});
 expect(senseVoiceFinalText({...result,lang:'<|ko|>'},samples)).toEqual({text:result.text});
 expect(senseVoiceFinalText({...result,tokens:result.tokens.slice(1)},samples)).toEqual({text:result.text});
});

test('keeps existing punctuation and does not split a cut after an incomplete connective',()=>{
 const samples=speech();
 samples.fill(0,16000,20800);
 for(const left of ['The measure was taken in order to','I have been there.']){
  const tokens=[left,' it',' still works.'];
  const text=tokens.join('');
  expect(senseVoiceFinalText({...result,tokens,text,timestamps:[.2,1.8,1.92]},samples)).toEqual({text});
 }
});
