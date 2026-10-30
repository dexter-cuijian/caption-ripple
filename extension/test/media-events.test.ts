import {expect,test} from 'vitest';
import {captureResetReason} from '../src/media';

test('one pause or seek produces one ASR reset while ordinary playback updates only the clock',()=>{
 const events=['playing','pause','seeking','seeked','playing','ratechange','emptied'];
 expect(events.map(captureResetReason)).toEqual([
  undefined,'pause','seeking',undefined,undefined,'ratechange','emptied'
 ]);
});
