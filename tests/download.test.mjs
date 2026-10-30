import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifyArtifact} from '../scripts/artifact.mjs';

test('corrupt or truncated model bytes are rejected before use', () => {
  const bytes=Buffer.from('verified model');
  const sha256=createHash('sha256').update(bytes).digest('hex');
  assert.equal(verifyArtifact(bytes,{size:14,sha256}),true);
  assert.equal(verifyArtifact(Buffer.from('corrupt model!'),{size:14,sha256}),false);
  assert.equal(verifyArtifact(bytes.subarray(0,8),{size:14,sha256}),false);
});
test('git-blob checks include size header used by HF small files', () => {
  assert.equal(verifyArtifact(Buffer.from('hello\n'),{size:6,gitBlob:'ce013625030ba8dba906f756967f9e9ca394464a'}),true);
  assert.equal(verifyArtifact(Buffer.from('Hello\n'),{size:6,gitBlob:'ce013625030ba8dba906f756967f9e9ca394464a'}),false);
});
