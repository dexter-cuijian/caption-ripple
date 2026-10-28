import {createHash} from 'node:crypto';

export function verifyArtifact(bytes, spec) {
  if (bytes.length !== spec.size) return false;
  if (spec.sha256) return createHash('sha256').update(bytes).digest('hex') === spec.sha256;
  if (spec.gitBlob) return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') === spec.gitBlob;
  return false;
}
