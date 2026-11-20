import {expect,test} from 'vitest';
import {captionHoldDelay} from '../src/caption-hold';

test('a new interim waits briefly after a completed caption',()=>{
 const previous={phase:'final',sessionId:'s',epoch:1,segmentId:'1'};
 const next={phase:'interim',sessionId:'s',epoch:1,segmentId:'2'};
 expect(captionHoldDelay(previous,next,1000,1500)).toBe(2500);
 expect(captionHoldDelay(previous,next,1000,4100)).toBe(0);
 expect(captionHoldDelay(previous,{...next,phase:'final'},1000,1500)).toBe(0);
 expect(captionHoldDelay(previous,{...next,epoch:2},1000,1500)).toBe(0);
 expect(captionHoldDelay(previous,{...next,segmentId:'1'},1000,1500)).toBe(0);
});

test('late ASR drafts and finals cannot consume the whole next caption latency budget',()=>{
 const previous={phase:'final',sessionId:'s',epoch:1,segmentId:'1',engine:'asr'};
 const next={phase:'interim',sessionId:'s',epoch:1,segmentId:'2',engine:'asr',audioEndAt:500};
 expect(captionHoldDelay(previous,next,1000,1300)).toBe(1200);
 expect(captionHoldDelay(previous,next,1000,2500)).toBe(0);
 expect(captionHoldDelay(previous,{...next,phase:'final',audioEndAt:0},1000,1800)).toBe(1100);
 expect(captionHoldDelay(previous,{...next,audioEndAt:3500},1000,3500)).toBe(500);
});

test('reserves time for the browser to render after an overlap hold',()=>{
 const previous={phase:'final',sessionId:'s',epoch:1,segmentId:'1',engine:'asr'};
 const next={...previous,segmentId:'2',audioEndAt:0};
 expect(captionHoldDelay(previous,{...next,phase:'interim',audioEndAt:1400},1000,1800)).toBe(1000);
 expect(captionHoldDelay(previous,{...next,audioEndAt:1700},1000,1800)).toBe(2200);
});
