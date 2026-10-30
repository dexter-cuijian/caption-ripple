import {expect,test} from 'vitest';
import {compactHistory} from '../src/compact-history';
import {initialState,type State} from '../src/shared';
import type {CaptionRow} from '../src/history';

const row:CaptionRow={phase:'interim',sessionId:'s',epoch:0,segmentId:'7',revision:1,sourceText:'Old words',sourceLanguage:'en',targetLanguage:'zh',mediaTime:73,start:70,end:73,url:'https://example.com',title:'Video',createdAt:1,engine:'wasm'};
const state:State={...initialState,tabId:2,sessionId:'s',epoch:0,latestCaption:{sessionId:'s',epoch:0,segmentId:'7',revision:3,phase:'interim',sourceText:'New words are being recognized',displaySourceText:'New words are being recognized',mediaTime:75,createdAt:3}};
test('compact history displays current interim revision ahead of stale persisted row',()=>{
 const result=compactHistory([row],1,state,2);
 expect(result.total).toBe(1);
 expect(result.rows).toMatchObject([{segmentId:'7',revision:3,sourceText:'New words are being recognized',translatedText:undefined}]);
});
test('current interim appears before its first database write and stays scoped to active tab',()=>{
 expect(compactHistory([],0,state,2)).toMatchObject({total:1,rows:[{segmentId:'7'}]});
 expect(compactHistory([],0,state,3)).toMatchObject({total:0,rows:[]});
 expect(compactHistory([row],1,{...state,latestCaption:{...state.latestCaption!,phase:'final'}},2).rows).toEqual([row]);
});
