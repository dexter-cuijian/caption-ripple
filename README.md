# CaptionRipple

Real-time captions and translation for Chrome, with on-device speech recognition.

[English](README.md) · [简体中文](README.zh-CN.md)

CaptionRipple is a Chrome Manifest V3 extension in development preview. By default, it recognizes tab audio in the browser with Sherpa-ONNX WebAssembly, without a separate server or microphone access. Captured audio is routed back to the speakers through an offscreen AudioContext. The primary environment is an Apple Silicon Mac with Chrome 116+; source builds require Node.js 22+.

## Install and use

**Preview package:** Download `CaptionRipple-extension-0.1.0-preview-clean.zip` from [GitHub Releases](https://github.com/dexter-cuijian/caption-ripple/releases), extract it, enable Developer mode at `chrome://extensions`, select **Load unpacked**, and choose the extracted `extension` folder. Node.js and a local server are not needed. The bundled model can take time to load on first use. **This preview package predates the latest display and playback fixes in the repository. It is not a stable release.**

**Build the latest source:**

```sh
npm ci
npm run setup:browser-model
npm run build
```

Model setup downloads an archive of about 180 MB and extracts a model of about 199 MB. Its version and SHA-256 hash are recorded in [`browser-model.lock.json`](browser-model.lock.json). The model is bundled into `dist/extension` and is not committed to Git. The download serves static files and does not receive user audio.

**Experimental SenseVoice candidate:** Run `npm run setup:sensevoice-model && npm run build:sensevoice`, then choose **SenseVoice candidate** in the side-panel settings. This build bundles both the default Zipformer and the additional 239 MB SenseVoiceSmall model. For Japanese or Korean translation, explicitly select the source language and prepare its Chrome translation model. Cantonese recognition currently produces Simplified Chinese text; selecting Cantonese with a Chinese target displays that text directly. The candidate has promising offline reference results, but real Chrome capture latency, translation quality, multiple sites, and long-running stability have not passed release gates. The model uses a separate FunASR license; see [`sensevoice-model.lock.json`](sensevoice-model.lock.json) and [`THIRD_PARTY.md`](THIRD_PARTY.md).

Load `dist/extension` at `chrome://extensions`. On a regular webpage with audio, click the extension icon and start capture from the side panel. Capture requires a user action. Browser mode needs no pairing code. The UI reports model loading, capture failures, and backend disconnections.

The optional Node companion is for performance and quality comparison: run `npm run setup:model && npm start`, select **Node local companion** in the side panel, and enter the pairing code from `.runtime/token`. The service listens only on `127.0.0.1:9876`; the code is stored in `chrome.storage.local`.

## Features and limits

- Live English and Chinese source captions, translation, a video overlay, and side-panel history. The history page can search by page URL, group recordings by page and session, show time ranges, and delete individual entries, sessions, pages, or all history.
- Import local `.srt` or `.vtt` subtitles in the side panel. Imported captions follow the current HTML5 video's playback time and appear in page history. Files are limited to 4 MB and 20,000 entries; import again after changing page or video.
- An offscreen audio path plays tab audio back, while an AudioWorklet resamples another path to 16 kHz mono PCM for recognition. Silent playback mutes the speaker path while preserving recognition.
- Browser recognition uses a bilingual streaming Zipformer; the optional Node companion uses `streaming-paraformer-bilingual-zh-en`. Recognition errors, punctuation, long-sentence segmentation, and translation quality still need work. Neither model supplies word-level timestamps; segment times are estimated from the capture clock.
- Captions can be reattached in player-container fullscreen. Native video-only fullscreen may hide webpage DOM overlays; use the extension's captioned fullscreen entry in that case.
- Cross-origin iframes require permission for their sites. Protected pages, browser-internal pages, and restricted media are unsupported; the extension does not bypass DRM.

## Development and release status

```sh
npm test
npm run test:extension
npm run typecheck
npm run build
```

A continuous 30-minute capture check has been completed, but it does not establish recognition accuracy or multi-site compatibility. Before a stable release, the project still needs better real-video recognition and translation, Chrome checks across multiple sites and playback states, resource measurements, and a clean package, license, privacy, and download review. The available GitHub release is a preview; no stable release has been published.

## Privacy and licenses

In browser mode, audio stays on the device and recordings are not saved. Runtime diagnostics do not record the pairing code. Any future external-service option must explain what data it sends and why.

Project source code is MIT licensed. The WASM engines and models have their own licenses; see [`THIRD_PARTY.md`](THIRD_PARTY.md), [`browser-model.lock.json`](browser-model.lock.json), [`sensevoice-model.lock.json`](sensevoice-model.lock.json), and [`models.lock.json`](models.lock.json). CaptionRipple is not published in the Chrome Web Store.
