import 'fake-indexeddb/auto';
import{beforeEach,expect,test,vi}from'vitest';
const row=(id='a',revision=1)=>({phase:'final',sessionId:'persistent',epoch:0,segmentId:id,revision,sourceText:'没有增长20%',sourceLanguage:'zh',targetLanguage:'en',mediaTime:10,start:0,end:1,url:'https://example.com/news',title:'News',createdAt:Number(id)||1,engine:'test'});
beforeEach(async()=>{vi.resetModules();});
test('final source and translation patch survive closing and reopening connection as one row',async()=>{
 const history=await import('../src/history');await history.saveFinal(row());await history.saveTranslation({sessionId:'persistent',epoch:0,segmentId:'a',sourceRevision:1,targetLanguage:'en',text:'No growth of 20%',engine:'chrome',startedAt:1,completedAt:2});
 await history.closeHistory();const result=await history.queryHistory({session:'persistent'});expect(result.total).toBe(1);expect(result.rows[0].translatedText).toBe('No growth of 20%');await history.closeHistory();
});
test('progressive page-caption revisions replace the same history row',async()=>{
 const history=await import('../src/history');
 const first={...row('page-1',1),sessionId:'page-revisions',engine:'page-caption',sourceText:'You know, the first thing'};
 await history.saveFinal(first);
 await history.saveFinal({...first,revision:2,sourceText:'You know, the first thing you think',createdAt:2});
 const result=await history.queryHistory({session:'page-revisions'});
 expect(result.total).toBe(1);expect(result.rows[0].sourceText).toBe('You know, the first thing you think');
 await history.closeHistory();
});
test('retiring an epoch marks unfinished recognition as interrupted and preserves finalized captions',async()=>{
 const history=await import('../src/history');
 const interim={...row('unfinished',2),sessionId:'retire-interim',phase:'interim',sourceText:'Words heard before stop',createdAt:100};
 await history.saveInterim(interim);
 await history.saveFinal({...row('done'),sessionId:'retire-interim',createdAt:101});
 await history.retireInterims('retire-interim',0);
 const result=await history.queryHistory({session:'retire-interim'});
 expect(result.rows.find(item=>item.segmentId==='unfinished')).toMatchObject({phase:'interrupted',sourceText:'Words heard before stop',translationState:'cancelled'});
 expect(result.rows.find(item=>item.segmentId==='done')?.phase).toBe('final');
 await history.closeHistory();
});
test('retiring all orphaned interim rows cleans up legacy sessions',async()=>{
 const history=await import('../src/history');
 await history.saveInterim({...row('old'),sessionId:'old-interim',phase:'interim',sourceText:'Orphaned words',createdAt:200});
 await history.retireInterims();
 const result=await history.queryHistory({session:'old-interim'});
 expect(result.rows[0].phase).toBe('interrupted');
 await history.closeHistory();
});
test('history hides older cumulative page-caption rows already stored with separate IDs',async()=>{
 const history=await import('../src/history');
 const base={...row('page-1'),sessionId:'legacy-page',engine:'page-caption',sourceText:'You know, the first thing',createdAt:1000,mediaTime:2};
 await history.saveFinal(base);
 await history.saveFinal({...base,segmentId:'page-2',sourceText:'You know, the first thing you think',createdAt:2000,mediaTime:3});
 await history.saveFinal({...base,segmentId:'page-3',sourceText:'You know, the first thing you think about',createdAt:3000,mediaTime:4});
 const result=await history.queryHistory({session:'legacy-page'});
 expect(result.total).toBe(1);expect(result.rows[0].sourceText).toBe('You know, the first thing you think about');
 expect(await history.allHistory('legacy-page')).toHaveLength(1);
 await history.closeHistory();
});
test('live interim source is visible in history and later final replaces the same row',async()=>{
 const history=await import('../src/history');
 const interim={...row('live',1),sessionId:'live-source',phase:'interim',sourceText:'THIS IS A LONG LIVE UTTERANCE'};
 await history.saveInterim(interim);
 let result=await history.queryHistory({session:'live-source'});
 expect(result.total).toBe(1);expect(result.rows[0].sourceText).toBe(interim.sourceText);
 expect(result.rows[0].translationState).toBe('transcribing');
 await history.saveInterim({...interim,revision:2,sourceText:'THIS IS A LONG LIVE UTTERANCE NOW'});
 await history.saveFinal({...interim,phase:'final',revision:3,sourceText:'This is a long live utterance now.'});
 await history.saveInterim({...interim,revision:4,sourceText:'LATE INTERIM'});
 result=await history.queryHistory({session:'live-source'});
 expect(result.total).toBe(1);expect(result.rows[0].sourceText).toBe('This is a long live utterance now.');
 expect(result.rows[0].translationState).toBe('pending');
 await history.closeHistory();
});
test('compact current-page history filters by the active page URL and limits visible rows',async()=>{
 const history=await import('../src/history');
 for(let i=0;i<6;i++)await history.saveFinal({...row(`current-${i}`),sessionId:'compact',url:'https://example.com/news',createdAt:i+100});
 await history.saveFinal({...row('other'),sessionId:'compact',url:'https://example.com/other',createdAt:999});
 const result=await history.queryHistory({session:'compact',url:'https://example.com/news',pageSize:3});
 expect(result.total).toBe(6);expect(result.rows).toHaveLength(3);expect(result.rows.every(item=>item.url==='https://example.com/news')).toBe(true);
 await history.closeHistory();
});
test('IndexedDB upserts serialize revisions, reject old translation, keep interim out and paginate 100',async()=>{
 const history=await import('../src/history');await Promise.all(Array.from({length:105},(_,i)=>history.saveFinal({...row(String(i+1)),sessionId:'pages'})));
 await history.saveFinal({...row('1'),sessionId:'pages',phase:'interim',revision:20});
 await Promise.all([history.saveFinal({...row('1',3),sessionId:'pages'}),history.saveFinal({...row('1',2),sessionId:'pages'})]);
 await history.saveTranslation({sessionId:'pages',epoch:0,segmentId:'1',sourceRevision:1,targetLanguage:'en',text:'stale'});
 const first=await history.queryHistory({session:'pages'}),second=await history.queryHistory({session:'pages',page:1});expect(first.rows).toHaveLength(100);expect(second.rows).toHaveLength(5);expect(first.total).toBe(105);
 expect(second.rows.find(row=>row.segmentId==='1')?.revision).toBe(3);expect(second.rows.find(row=>row.segmentId==='1')?.translatedText).toBeUndefined();expect((await history.queryHistory({session:'pages',search:'增长'})).total).toBe(105);await history.closeHistory();
});
test('reset cancellation marks pending rows without destroying completed history',async()=>{
 const history=await import('../src/history');await history.saveFinal({...row('pending'),sessionId:'cancel'});await history.saveFinal({...row('complete'),sessionId:'cancel'});await history.saveTranslation({sessionId:'cancel',epoch:0,segmentId:'complete',sourceRevision:1,targetLanguage:'en',text:'Done'});
 await history.cancelPending('cancel',0,'new epoch');const result=await history.queryHistory({session:'cancel'});expect(result.rows.find(row=>row.segmentId==='pending')?.translationState).toBe('cancelled');expect(result.rows.find(row=>row.segmentId==='complete')?.translatedText).toBe('Done');await history.closeHistory();
});
test('delayed config read followed by reset retains old final as cancelled with no live broadcast',async()=>{
 const history=await import('../src/history');let active=true,release:(value:any)=>void=()=>{};const broadcasts:any[]=[];
 const save=history.persistReceivedFinal({...row('race'),sessionId:'retired'},()=>new Promise(resolve=>{release=resolve;}),()=>active,async()=>{broadcasts.push('old');});
 active=false;await history.cancelPending('retired',0,'reset');release({targetLanguage:'en'});await save;
 const result=await history.queryHistory({session:'retired'});expect(result.rows[0].translationState).toBe('cancelled');expect(result.rows[0].translationError).toContain('重试');expect(broadcasts).toHaveLength(0);await history.closeHistory();
});
