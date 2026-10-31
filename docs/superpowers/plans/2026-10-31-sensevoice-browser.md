# SenseVoice Browser ASR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a measurable browser-only SenseVoice candidate to CaptionRipple, then select a stable default only after real Chrome accuracy, latency, resource, translation, and site gates pass.

**Architecture:** Keep the existing Zipformer path working while an independent worker runs SenseVoiceSmall int8 with Silero VAD. Feed the same 100 ms tab PCM packets into the selected worker and keep the existing subtitle event contract so video overlay, sidebar, translation, and history share one pipeline. Package pinned model and WASM files with their license notices; choose the default only after comparing both modes in installed Chrome.

**Tech Stack:** TypeScript, MV3 offscreen/worker, sherpa-onnx WASM via `@sherpaw/vad-asr@0.3.0`, SenseVoiceSmall int8, Silero VAD v5, Vitest, real Chrome.

**Spec:** `docs/phase3-contract.md`, `docs/superpowers/specs/2026-10-28-design.md`, `docs/reports/2026-10-31-sensevoice-browser-probe.md`.

## Global Constraints

- Speech and model inference stay local; no upload of captured audio.
- Warm interim source P95 ≤1.5 s from aligned chunk end; finalized Chinese P95 ≤3 s from utterance end. Report actual capture-to-render timing, cold load separately.
- English clear-speech WER ≤15%; measure independent real media references and Chinese CER, not model agreement.
- Real YouTube, public live media, Bilibili, local, iframe, multi-video, playback rates, 60-minute stability, recovery, and translation checks remain release gates.
- Preserve a no-service installation path, all existing history and caption behavior, and explicit errors on model or translation failure.
- Model source revision, size and SHA-256 are pinned. Retain the FunASR model agreement attribution and the WASM/VAD notices in the distributed ZIP.

## File Map

- `sensevoice-model.lock.json`, `scripts/setup-sensevoice-model.mjs`, `scripts/build.mjs`: pinned offline model download, verification, and candidate packaging.
- `extension/src/sensevoice-session.ts`, `extension/src/sense-worker.ts`: bounded PCM/VAD state and browser WASM worker protocol.
- `extension/src/offscreen.ts`, `extension/src/shared.ts`, `extension/src/sidepanel.tsx`: select the candidate without changing the current default; preserve session and epoch behavior.
- `extension/test/sensevoice-session.test.ts`, `extension/test/offscreen.test.ts`: timing, reset, queue, final/interim boundaries and failure cases.
- `THIRD_PARTY.md`, `extension/vendor/NOTICE.md`, bilingual READMEs: model/runtime attribution and accurate user facing limits after acceptance.

## Review Focus

- A slow decode must not overflow the 50-packet worker queue or reset an otherwise healthy capture.
- VAD max-duration and silence boundaries must not duplicate or drop words across final segments.
- Reset, pause, seek, site navigation and stop must invalidate stale model events.
- Model memory, CPU, first caption timing and 60-minute growth must be measured in Chrome, not inferred from the local batch probe.
- Translation must consume the corrected final source without silently reusing an earlier provisional translation.

## Tasks

### 1. Pin and package the candidate model

- [ ] Add a reproducible download script and lock with SenseVoice model revision, exact byte size and SHA-256; verify the downloaded file before build.
- [ ] Include Silero VAD v5, the `@sherpaw/vad-asr` browser runtime, and the model in an opt-in local candidate build with complete license notices.
- [ ] Verify `npm ci` from a clean checkout, build, ZIP content, source map exclusion and model hashes; commit only source, notices and lock, never binaries.

### 2. Build bounded recognition state

- [ ] Write failing tests for 100 ms PCM feeding, 5 s provisional windows, 500 ms VAD silence, 15 s forced final, reset/stop, stale events and queue limits.
- [ ] Implement the smallest `SenseVoiceSession` that emits the existing `AsrEvent` shape. Use VAD final text as authority; provisional windows may revise but cannot become duplicate history rows.
- [ ] Run focused tests and commit.

### 3. Wire the opt-in Chrome worker

- [ ] Add `browser-sensevoice` to the existing selector and worker startup; keep current `browser` default until acceptance.
- [ ] Load pinned packaged assets locally, surface load/decode errors, and keep mute-output and translation behavior.
- [ ] Verify types, extension tests and build; then perform a clean-install Chrome test on local speech and PBS NewsHour media with the same independent reference.

### 4. Complete release gates

- [ ] Measure P50/P95 cold/warm interim, final, and rendered latency; English WER, Chinese CER and 50 reviewed translations, including numbers, names and negation.
- [ ] Repeat required sites, frame/fullscreen/history/import/seek/pause/playback-rate and 60-minute CPU/RSS/queue/latency checks on the selected engine.
- [ ] Update English `README.md`, Chinese `README.zh-CN.md`, English GitHub description and notices; build and reinstall a clean candidate ZIP.
- [ ] Publish a stable tag/Release only when every gate has recorded passing evidence; otherwise retain preview status and report the remaining specific failures.
