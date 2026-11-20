import {expect,test} from 'vitest';
import {PageCaptionRevisions,visibleTrackCaption} from '../src/page-captions';

test('a player hiding a caption track stops supplying webpage captions even with active cues',()=>{
 const track={mode:'showing',kind:'subtitles',language:'en',activeCues:[{text:'A visible <i>subtitle</i>'}]} as unknown as TextTrack;
 expect(visibleTrackCaption([track])).toEqual({text:'A visible subtitle',language:'en',track});
 track.mode='hidden';
 expect(visibleTrackCaption([track])).toBeNull();
 track.mode='disabled';
 expect(visibleTrackCaption([track])).toBeNull();
});

test('progressively revealed caption updates one history segment',()=>{
 const captions=new PageCaptionRevisions();
 expect(captions.observe('You know, the first thing',1000)).toMatchObject({segmentId:'page-1',revision:1});
 expect(captions.observe('You know, the first thing you think',1500)).toMatchObject({segmentId:'page-1',revision:2});
 expect(captions.observe('You know, the first thing you think',4500)).toMatchObject({segmentId:'page-1',revision:2});
 expect(captions.observe('about is this, right?',5000)).toMatchObject({segmentId:'page-2',revision:1});
});

test('a delayed recurrence or selected-video change starts a new segment',()=>{
 const captions=new PageCaptionRevisions();
 expect(captions.observe('Welcome',1000)).toMatchObject({segmentId:'page-1',revision:1});
 expect(captions.observe('Welcome back',10000)).toMatchObject({segmentId:'page-2',revision:1});
 captions.reset();
 expect(captions.observe('Welcome back again',11000)).toMatchObject({segmentId:'page-3',revision:1});
});
test('rolling webpage caption windows keep one segment and retain the complete source',()=>{
 const captions=new PageCaptionRevisions();
 const first=captions.observe('you can grab a window if you can get the right touch target point',1000);
 const second=captions.observe('the right touch target point and fling it to one side',2000);
 expect(second.segmentId).toBe(first.segmentId);
 expect(second.revision).toBe(2);
 expect(second.mergedText).toBe('you can grab a window if you can get the right touch target point and fling it to one side');
 expect(captions.observe('the right touch target point and fling it to one side',2500).revision).toBe(2);
});
