# Third-party components

- sherpa-onnx / sherpa-onnx-node: https://github.com/k2-fsa/sherpa-onnx, Apache-2.0; npm version pinned in package-lock.json. Contains native runtime and ONNX Runtime under their own notices.
- Streaming Paraformer bilingual zh-en int8: https://huggingface.co/csukuangfj/sherpa-onnx-streaming-paraformer-bilingual-zh-en, converted from ModelScope damo/speech_paraformer_asr_nat-zh-cn-16k-common-vocab8404-online. Repository revision and file integrity values are pinned in models.lock.json. Consult upstream model terms before redistributing weights. Model weights are not included in Git or extension ZIP.
- ws: https://github.com/websockets/ws, MIT.
- React: https://github.com/facebook/react, MIT.
- Vite/Vitest: https://github.com/vitejs, MIT.
- esbuild: https://github.com/evanw/esbuild, MIT.
- Google FLEURS (optional benchmark input): https://huggingface.co/datasets/google/fleurs, CC-BY-4.0; benchmark results must record source and sample identifiers.
- Tencent Hy-MT2-1.8B-GGUF Q4_K_M (optional local translation): https://huggingface.co/tencent/Hy-MT2-1.8B-GGUF. Fixed revision, size and hashes in models.lock.json; official LICENSE.txt retained alongside downloaded weights in .models/hy-mt2. Tencent Hunyuan license terms apply; model weights are excluded from Git and extension ZIP.
- llama.cpp (optional local model runtime): https://github.com/ggml-org/llama.cpp, MIT; downloaded runtime must retain its bundled notices.

No third-party small extension repository was copied into this project. The former Whisper/Python path was superseded by the user's Node+sherpa decision before installation completed.
