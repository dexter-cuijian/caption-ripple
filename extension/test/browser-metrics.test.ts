import {test,expect} from 'vitest';
import {BrowserMetrics} from '../src/browser-metrics';
test('only a matching rendered revision records bounded timing without caption text',()=>{
 const metrics=new BrowserMetrics(1);
 const event={sessionId:'s',epoch:1,segmentId:'0',revision:1,phase:'final',engine:'sense',createdAt:1050,audioEndAt:1000,speechStartAt:100};
 metrics.source(event);
 expect(metrics.rendered({...event,revision:2,renderedAt:1100})).toBeUndefined();
 expect(metrics.rendered({...event,renderedAt:1200})).toMatchObject({audioEndToRenderMs:200,decodeToRenderMs:150,speechStartToRenderMs:1100});
 expect(metrics.rendered({...event,renderedAt:1300})).toBeUndefined();
 metrics.source({...event,segmentId:'1'});metrics.rendered({...event,segmentId:'1',renderedAt:1400});
 expect(metrics.snapshot()).toHaveLength(1);expect(JSON.stringify(metrics.snapshot())).not.toContain('sourceText');
});
