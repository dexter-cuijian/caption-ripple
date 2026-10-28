import { expect, test } from 'vitest';
import { PCMResampler, RevisionGate, captureClock } from '../src/core';
for (const rate of [44100,48000]) test(`streaming ${rate}Hz preserves phase across irregular boundaries`,()=>{
 const input=Float32Array.from({length:rate},(_,i)=>Math.sin(i*2*Math.PI*440/rate));
 const a=new PCMResampler(rate), b=new PCMResampler(rate);
 const whole=a.push([input]); const parts:number[]=[];
 for(let i=0;i<input.length;i+=127) parts.push(...b.push([input.slice(i,i+127)]));
 expect(parts).toEqual(Array.from(whole)); expect(parts.length).toBe(16000);
 expect(parts.slice(0,100).some(x=>x>20000)).toBe(true);
});
test('downmixes, saturates and accepts empty buffers',()=>{
 const r=new PCMResampler(16000);
 expect(Array.from(r.push([new Float32Array()]))).toEqual([]);
 expect(Array.from(r.push([Float32Array.of(2,-2,1,-1),Float32Array.of(2,-2,1,-1)]))).toEqual([32767,-32768,32767,-32768]);
});
test('revision gate rejects old epochs, duplicate revisions and late segments',()=>{
 const g=new RevisionGate();g.reset('a',2);
 expect(g.accept({sessionId:'a',epoch:1,segmentId:'1',revision:1})).toBe(false);
 expect(g.accept({sessionId:'a',epoch:2,segmentId:'1',revision:1})).toBe(true);
 expect(g.accept({sessionId:'a',epoch:2,segmentId:'1',revision:1})).toBe(false);
 expect(g.accept({sessionId:'a',epoch:2,segmentId:'2',revision:1})).toBe(true);
 expect(g.accept({sessionId:'a',epoch:2,segmentId:'1',revision:2})).toBe(false);
});
test('clock uses capture sample position, independent of network delay',()=>{
 expect(captureClock(1000,1600)).toBe(1200);
 expect(captureClock(1000,0)).toBe(1100);
});
import { renderAndConfirm } from '../src/render';
test('render confirmation runs after scheduled paint and cancels superseded or hidden text',()=>{
 const frames:Array<()=>void>=[],confirmed:number[]=[];let current=1,visible=true;
 renderAndConfirm(()=>current===1&&visible,()=>confirmed.push(1),cb=>frames.push(cb));
 expect(confirmed).toEqual([]);current=2;frames.shift()!();expect(confirmed).toEqual([]);
 renderAndConfirm(()=>current===2&&visible,()=>confirmed.push(2),cb=>frames.push(cb));
 frames.shift()!();expect(confirmed).toEqual([2]);
 visible=false;renderAndConfirm(()=>visible,()=>confirmed.push(3),cb=>frames.push(cb));frames.shift()!();expect(confirmed).toEqual([2]);
});
import { terminalClose } from '../src/core';
test('authentication/protocol rejection is terminal, network and decoder-busy can reconnect',()=>{
 for(const code of [1008,4400,4401])expect(terminalClose(code)).toBe(true);
 for(const code of [1006,1011,4408,4429])expect(terminalClose(code)).toBe(false);
});
import { overlayVisible } from '../src/render';
test('native video fullscreen and zero/offscreen bounds never claim visible subtitle rendering',()=>{
 expect(overlayVisible(true,{left:0,top:0,right:500,bottom:300},800,600)).toBe(false);
 expect(overlayVisible(false,{left:0,top:0,right:0,bottom:300},800,600)).toBe(false);
 expect(overlayVisible(false,{left:900,top:0,right:1000,bottom:300},800,600)).toBe(false);
 expect(overlayVisible(false,{left:0,top:0,right:500,bottom:300},800,600)).toBe(true);
});
