import {describe,expect,it} from 'vitest';
import {captureAnchor,capturedAt,mediaTimeAt,workletPacketAt} from '../src/capture-clock';

describe('capture wall clock',()=>{
 it('reanchors after a navigation gap even if AudioContext time paused',()=>{
  const firstPacketAfterNavigation=120_000;
  const anchor=captureAnchor(firstPacketAfterNavigation,1600,16_000);
  expect(capturedAt(anchor,1600,16_000)).toBe(firstPacketAfterNavigation);
  expect(capturedAt(anchor,3200,16_000)).toBe(firstPacketAfterNavigation+100);
 });

 it('maps the packet end to wall time without accumulating gaps in delivered audio',()=>{
  const wallNow=300_000;
  expect(workletPacketAt(wallNow,301.4,301.3)).toBe(299_900);
  expect(workletPacketAt(wallNow,301.4,299.4)).toBe(298_000);
  expect(workletPacketAt(wallNow,301.4,301.41)).toBe(wallNow);
  expect(workletPacketAt(wallNow,0,1)).toBeNull();
 });
 it('never displays a negative video time during navigation or decoder backlog',()=>{
  const video={currentTime:1,observedAt:120_000,playbackRate:1};
  expect(mediaTimeAt(video,110_000)).toBe(0);
  expect(mediaTimeAt(video,121_000)).toBe(2);
  expect(mediaTimeAt(undefined,121_000)).toBeNull();
 });
});
