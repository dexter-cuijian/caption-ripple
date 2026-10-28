# Extension-only installation: feasibility checkpoint

Status: research only. No browser-only ASR implementation or acceptance yet.

## Verified platform facts

- Sherpa-ONNX publishes streaming ASR WebAssembly demos for English, Chinese/English Zipformer and Paraformer. This is a plausible path for keeping the project's streaming model family while removing the Node companion. Source: [Sherpa WebAssembly demos](https://k2-fsa.github.io/sherpa/onnx/wasm/hf-spaces.html), [official build guide](https://k2-fsa.github.io/sherpa/onnx/wasm/build.html).
- The official bilingual sample build lists approximately 199 MB of model data and 10 MB of WASM. These are example build sizes, **not** measured sizes of our planned model/package. Source: [official build guide](https://k2-fsa.github.io/sherpa/onnx/wasm/build.html).
- Manifest V3 permits WebAssembly in extension pages with explicit `'wasm-unsafe-eval'` in `script-src`. Our current CSP omits it, so a browser-only prototype must change CSP and verify installation. Source: [Chrome extension CSP](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy).
- Chrome's Offscreen Document can retain the tab audio graph while a separate worker runs ASR; the `AUDIO_PLAYBACK` reason has a 30-second no-audio lifetime rule. Source: [Chrome Offscreen API](https://developer.chrome.com/docs/extensions/reference/api/offscreen).
- The Chrome Web Store upload limit is 2 GB, but package acceptance and real install/performance must still be measured. Source: [Chrome Web Store publishing](https://developer.chrome.com/docs/webstore/publish).

## Required proof before replacing the companion

1. Pin and checksum a vendor WASM build and streaming model; retain their licenses. Prefer the exact native model already in the evaluation set when supported.
2. Implement a standalone extension-page/worker spike that consumes the existing 16 kHz PCM stream, sends interim/final events through the same session/epoch contract, and never sends audio off-device.
3. Measure cold model load, memory growth, CPU, first render P50/P95, and FLEURS CER/WER against the native baseline on this M1 Mac. Then repeat on an actual news tab and check audible audio passthrough.
4. Test MV3 lifecycle, extension reload, model caching/package update, full screen, and a two-hour run. Do not substitute a website demo for installed-extension proof.
5. Move the default to browser-only only if quality and delay gates pass. Any cloud fallback needs explicit privacy, credential and cost decisions.

The current Node/sherpa service remains a diagnostic reference. Installing a native messaging host or automatically launching Node would still require a separate native installation and would not meet the user's goal.
