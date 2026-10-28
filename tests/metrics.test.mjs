import test from 'node:test';
import assert from 'node:assert/strict';
import {errorRate} from '../scripts/metrics.mjs';
test('WER measures words, ignores case and surrounding punctuation, preserves negation',()=>{
 assert.deepEqual(errorRate('Do not pay 50 dollars.', 'do pay 15 dollars','word'),{edits:2,units:5,rate:.4});
 assert.equal(errorRate('Hello, WORLD!', 'hello world','word').rate,0);
});
test('CER normalizes full width, excludes punctuation and counts missing characters',()=>{
 assert.deepEqual(errorRate('昨天有１２个人。','昨天有2个人','char'),{edits:1,units:7,rate:1/7});
});
