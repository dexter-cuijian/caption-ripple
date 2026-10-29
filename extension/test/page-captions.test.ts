import {expect,test} from 'vitest';
import {PageCaptionRevisions} from '../src/page-captions';

test('progressively revealed caption updates one history segment',()=>{
 const captions=new PageCaptionRevisions();
 expect(captions.observe('You know, the first thing',1000)).toEqual({segmentId:'page-1',revision:1});
 expect(captions.observe('You know, the first thing you think',1500)).toEqual({segmentId:'page-1',revision:2});
 expect(captions.observe('You know, the first thing you think',4500)).toEqual({segmentId:'page-1',revision:2});
 expect(captions.observe('about is this, right?',5000)).toEqual({segmentId:'page-2',revision:1});
});

test('a delayed recurrence or selected-video change starts a new segment',()=>{
 const captions=new PageCaptionRevisions();
 expect(captions.observe('Welcome',1000)).toEqual({segmentId:'page-1',revision:1});
 expect(captions.observe('Welcome back',10000)).toEqual({segmentId:'page-2',revision:1});
 captions.reset();
 expect(captions.observe('Welcome back again',11000)).toEqual({segmentId:'page-3',revision:1});
});
