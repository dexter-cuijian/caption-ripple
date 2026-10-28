# Realtime captions implementation plan

Spec: ../specs/2026-10-28-design.md. Integration contract: ../../protocol.md.

## Task 1: Companion backend
Implement backend/ Python package, requirements and meaningful tests. Cover authenticated loopback API, bounded realtime PCM ASR with WhisperLiveKit MLX adapter, revisions/epochs/media clock, provider configuration/Keychain, local and optional translation, marker retrieval/timeouts, OCR helper interface. Test false tokens/origins, stale epoch cancellation, no speech/queue overload, translated revisions, provenance, timeout behavior and local-only defaults. Keep optional model imports lazy so unit/API tests run without models. No mock model results in production.

## Task 2: Extension
Implement extension/ TypeScript/Vite/React and root Node build/test config. Cover capture/background/offscreen lifecycle, real 16k PCM AudioWorklet, translation drafts, video discovery/fullscreen/DocumentPiP and playback state resets, Shadow overlay, side-panel settings/history/glossary/knowledge/cloud config, immediate final IndexedDB upserts and exports/cache. Tests for chunk-boundary resampling, revision ordering/epoch rejection, history/cache keys/search/export. Respect protocol.md. No fake success UI.

## Task 3: Integration and model runtime
Create isolated Python3.12 env, lock dependency versions, download only selected models with progress. Start real backend and fix API integration. Provide setup/start/stop/model benchmarks and OCR via Vision. Compare MLX base/small/turbo on same real referenced audio, select by measured latency+WER. Enable local translation and knowledge model on demand.

## Task 4: Chrome installation and acceptance
Load extension in installed Chrome, run actual tabCapture on public live, YouTube/Bilibili, local fixture, iframe, multi-video. Exercise five playback speeds, pause/seek/reset/fullscreen/PiP/reconnect. Record actual rendering timestamps with aligned reference speech, languages and translated review >=50 sentences. Stability >=60min. Record evidence, fix issues with tests, review full branch, rerun gates. Do not claim nonpassing/unavailable gates complete.

## Task 5: Delivery
README, model/license notices, build bundle and acceptance matrix with concrete evidence and remaining blockers. Commit on feature/realtime-captions with emoji Conventional Commit prefix; do not push. Query Codex quota at completion then send authorized summary email to jiancui@crestline.pro.
