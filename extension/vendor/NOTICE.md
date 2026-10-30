# Sherpa-ONNX browser ASR assets

The JavaScript API, Emscripten loader and WebAssembly binary in this directory
come from the `k2-fsa/web-assembly-asr-sherpa-onnx-zh-en` ModelScope Studio at
revision `a5bf321c2c57b0221d12bf6108c73f09eca0f495`. The Studio and
Sherpa-ONNX code are Apache-2.0 licensed; the license text is included here.

The separately downloaded `.data` package contains the bilingual streaming
Zipformer encoder, decoder, joiner, tokens and a source README. The build README
identifies the Sherpa release asset
`sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20` as its source.
The converted checkpoint is `csukuangfj/k2fsa-zipformer-chinese-english-mixed`,
forked from `pfluo/k2fsa-zipformer-chinese-english-mixed`; both model cards
declare Apache-2.0. The package SHA-256 and source address
are pinned in `browser-model.lock.json`.

The `.data` model is excluded from Git. Packaged extension builds include it so
speech recognition runs locally without a companion service. No audio is sent
to the model download host.
