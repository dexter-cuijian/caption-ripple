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
