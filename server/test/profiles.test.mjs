import test from 'node:test';
import assert from 'node:assert/strict';
import {profileConfig,decoderOptions} from '../profiles.mjs';

test('default Paraformer preserved; Chinese Zipformer is an explicit transducer profile',()=>{
 const p=profileConfig('paraformer','/models/para');assert.equal(p.engine,'sherpa-onnx/paraformer');assert.ok(p.recognizer.modelConfig.paraformer);
 const z=profileConfig('zipformer-zh','/models/zip');assert.equal(z.engine,'sherpa-onnx/zipformer-zh');assert.equal(z.recognizer.modelConfig.transducer.joiner,'/models/zip/joiner.int8.onnx');assert.equal(z.recognizer.modelConfig.transducer.decoder,'/models/zip/decoder.onnx');assert.deepEqual(z.languages,['auto','zh']);
 assert.throws(()=>profileConfig('unknown','/tmp'),/profile/);
});

test('natural acoustic stream has no duration or text reset; RMS override explicit and validated',()=>{
 const options=decoderOptions('zipformer-zh',{});assert.equal(options.maxSegmentSeconds,Infinity);assert.equal(options.maxTextLength,Infinity);assert.equal(options.tailPaddingSamples,12800);
 assert.equal(decoderOptions('paraformer',{}).threshold,.008);
 assert.equal(decoderOptions('paraformer',{CAPTION_ASR_RMS_THRESHOLD:'.001'}).threshold,.001);
 assert.throws(()=>decoderOptions('paraformer',{CAPTION_ASR_RMS_THRESHOLD:'broken'}),/threshold/);
});
