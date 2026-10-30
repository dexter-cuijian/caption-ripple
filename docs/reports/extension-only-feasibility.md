# Extension-only installation: feasibility checkpoint

Status: installed-extension WASM spike completed; quality and packaging gates remain open. The current product still uses the Node companion for speech recognition.

## Verified platform facts

- Sherpa-ONNX publishes streaming ASR WebAssembly demos for English, Chinese/English Zipformer and Paraformer. This is a plausible path for keeping the project's streaming model family while removing the Node companion. Source: [Sherpa WebAssembly demos](https://k2-fsa.github.io/sherpa/onnx/wasm/hf-spaces.html), [official build guide](https://k2-fsa.github.io/sherpa/onnx/wasm/build.html).
- The official bilingual sample build lists approximately 199 MB of model data and 10 MB of WASM. These are example build sizes, **not** measured sizes of our planned model/package. Source: [official build guide](https://k2-fsa.github.io/sherpa/onnx/wasm/build.html).
- Manifest V3 permits WebAssembly in extension pages with explicit `'wasm-unsafe-eval'` in `script-src`. The extension CSP now includes it, and the installed Chrome prototype loaded the WASM module. Source: [Chrome extension CSP](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy).
- Chrome's Offscreen Document can retain the tab audio graph while a separate worker runs ASR; the `AUDIO_PLAYBACK` reason has a 30-second no-audio lifetime rule. Source: [Chrome Offscreen API](https://developer.chrome.com/docs/extensions/reference/api/offscreen).
- The Chrome Web Store upload limit is 2 GB, but package acceptance and real install/performance must still be measured. Source: [Chrome Web Store publishing](https://developer.chrome.com/docs/webstore/publish).

## Required proof before replacing the companion

1. Pin and checksum a vendor WASM build and streaming model; retain their licenses. Prefer the exact native model already in the evaluation set when supported.
2. Implement a standalone extension-page/worker spike that consumes the existing 16 kHz PCM stream, sends interim/final events through the same session/epoch contract, and never sends audio off-device.
3. Measure cold model load, memory growth, CPU, first render P50/P95, and FLEURS CER/WER against the native baseline on this M1 Mac. Then repeat on an actual news tab and check audible audio passthrough.
4. Test MV3 lifecycle, extension reload, model caching/package update, full screen, and a two-hour run. Do not substitute a website demo for installed-extension proof.
5. Move the default to browser-only only if quality and delay gates pass. Any cloud fallback needs explicit privacy, credential and cost decisions.

The current Node/sherpa service remains a diagnostic reference. Installing a native messaging host or automatically launching Node would still require a separate native installation and would not meet the user's goal.

## Installed Chrome prototype, 2026-10-30

- Used the official `k2-fsa/web-assembly-asr-sherpa-onnx-zh-en` ModelScope Studio checkout at commit `a5bf321c2c57b0221d12bf6108c73f09eca0f495`. The temporary JS/WASM/model files live only in ignored `.work/` and `dist/`; they are not part of the source tree or reproducible build.
- Verified the downloaded WASM SHA-256 `d0c15c3042fd61ca2a158a1eeb8b8c2099201f7580945efc8f729d2830cf746d` (13,150,239 bytes) and model data SHA-256 `90b04a9403e4bae9b23a0a3c00dbac8603e183361105a52cc03f053217490863` (199,059,238 bytes).
- In the installed unpacked Chrome extension, warm local model load ranged 286–614 ms and recognizer creation 712–983 ms. An initial probe only read the last streaming segment; a corrected probe now accumulates endpoint results. On raw low-volume FLEURS clips, a 6.5-second English sample gave a partial transcript, while 16.4-second and 4.1-second samples were empty. The samples peak at -32.5, -38.4 and -44.9 dB respectively. With a fixed test gain of 10, the first two yielded plausible though imperfect English (`WHEN YOU CALL SOMEONE ... A SETTLEY` and `DISHES ...`); the proper-name-heavy 4.1-second sample still returned empty. A 10.1-second Mandarin sample produced mixed Chinese/English with a minor English token error. This fixed gain is a diagnostic, not a safe production AGC; the native packet-causal AGC is the basis for a future browser port. These are file probes, not streaming first-character latency or news accuracy.
- The ModelScope Studio declares Apache-2.0. The official Sherpa model documentation traces the converted weights to `pfluo/k2fsa-zipformer-chinese-english-mixed`, whose original model card explicitly declares Apache-2.0; the duplicated checkpoint card also declares Apache-2.0. This improves the license evidence, but the compiled `.data` bundle still needs an exact asset/notice audit before redistribution. Sources: [Studio](https://www.modelscope.cn/studios/k2-fsa/web-assembly-asr-sherpa-onnx-zh-en), [Sherpa model provenance](https://k2-fsa.github.io/sherpa/onnx/pretrained_models/online-transducer/zipformer-transducer-models.html), [original checkpoint card](https://huggingface.co/pfluo/k2fsa-zipformer-chinese-english-mixed).
- This prototype proves extension-page WASM execution and suggests quiet-audio normalization matters. It does not satisfy extension-only installation, packaging, first-caption delay, memory, news-site quality or the two-hour soak. Keep the companion baseline while those gates are addressed.
