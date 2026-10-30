import {describe, expect, it} from 'vitest';
import {activeCue, parseSubtitleFile} from '../src/subtitle-import';

describe('subtitle import', () => {
 it('parses SRT and follows seek boundaries', () => {
  const cues = parseSubtitleFile('1\r\n00:00:01,000 --> 00:00:03,000\r\nHello, world.\r\n\r\n2\r\n00:00:04,000 --> 00:00:06,500\r\nAnother line');
  expect(cues).toEqual([{start:1,end:3,text:'Hello, world.'},{start:4,end:6.5,text:'Another line'}]);
  expect(activeCue(cues,2)?.index).toBe(0);
  expect(activeCue(cues,3)).toBeNull();
  expect(activeCue(cues,5)?.index).toBe(1);
  expect(activeCue(cues,1.5)?.index).toBe(0);
 });
 it('parses VTT settings and strips markup', () => {
  const cues = parseSubtitleFile('WEBVTT\n\nid-1\n00:01.200 --> 00:03.400 align:start\n<c.green>你好</c>\n世界\n');
  expect(cues).toEqual([{start:1.2,end:3.4,text:'你好\n世界'}]);
 });
 it('rejects files without valid cues', () => expect(() => parseSubtitleFile('WEBVTT\n\nNOTE empty')).toThrow());
});
