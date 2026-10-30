import {expect,test} from 'vitest';
import {captureResetReason,retainCaptionOnReset} from '../src/media';

test('one pause or seek produces one ASR reset while ordinary playback updates only the clock',()=>{
 const events=['playing','pause','seeking','seeked','playing','ratechange','emptied'];
 expect(events.map(captureResetReason)).toEqual([
  undefined,'pause','seeking',undefined,undefined,'ratechange','emptied'
 ]);
});

test('pause keeps the last caption while a seek or invalidation clears it',()=>{
 expect(retainCaptionOnReset('pause')).toBe(true);
 for(const reason of ['seeking','ratechange','emptied','video-change','识别队列积压'])expect(retainCaptionOnReset(reason)).toBe(false);
});
