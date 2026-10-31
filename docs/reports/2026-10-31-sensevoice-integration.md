# SenseVoice candidate integration status — 2026-10-31

## Implemented

- Opt-in `browser-sensevoice` recognition path with locally packaged SenseVoiceSmall int8, Silero VAD v5 and pinned `@sherpaw/vad-asr@0.3.0` WASM runtime. Existing Zipformer remains the default.
- Exact model, tokens, VAD, runtime archive and extracted runtime file sizes/SHA-256 pinned in `sensevoice-model.lock.json`. Source model and runtime licenses are bundled in the candidate; downloaded binaries stay out of Git.
- 100 ms PCM packets feed 512-sample VAD windows; VAD utterance endings produce final rows, while long speech produces revisable 5-second interim captions. Capture/render timing metadata is bounded to 1,200 rows and excludes text and audio.

## Verification completed

- A detached clean checkout passed `npm ci --ignore-scripts`, 61 server tests, 108 extension tests, `npm run typecheck`, `npm run build:sensevoice`, model hash verification and no source maps in the built extension. The clean checkout and its temporary build were removed after verification.
- The actual compiled `sense-worker.js` was loaded in a regular Chrome module worker through a localhost wrapper and fed the first 75 seconds of the official PBS NewsHour Jakarta video as 100 ms PCM packets. It loaded, accepted a reset, emitted revisable interim captions and VAD final captions without worker errors. First three final segments covered the 88-word official PBS reference. This accelerated PCM feed completed in about 34 seconds after worker creation; it does **not** measure real-time tab capture latency.
- Chrome showed roughly 970 MB of memory use for the local probe tab at completion. This is a browser-tab figure, not isolated model RSS or a 60-minute trend.

## Still required for release

- User-approved clean installation of the new candidate, real tabCapture on local and external news, rendered latency P50/P95, and independent WER/CER/translation review.
- Public live media, YouTube, Bilibili, local, iframe and multi-video sites; playback rates; fault recovery; 60-minute stability with resource measurements; at least 5 minutes each of independently referenced English, Japanese, Korean and Cantonese; and 50 reviewed translations.
- The standalone probe ends at exactly 75 seconds in the middle of an utterance, so its final transcript omits that tail. Production stop/pause behavior still needs real Chrome verification.

No stable release has been published from this candidate.
