# CaptionRipple Stable Release Implementation Plan

> **For agentic workers:** Execute the tasks below in order; do not publish until every release gate is evidenced.

**Goal:** Ship a browser-only CaptionRipple stable release with readable, accurate captions and translations, verified Chrome behavior, and a reproducible public package.

**Architecture:** Keep ASR and translation in the extension. Preserve the continuous 16 kHz acoustic stream and session/epoch protocol. Separate measured source accuracy, caption rendering, translation, and packaging evidence so a passing unit test cannot stand in for browser acceptance.

**Tech Stack:** Chrome MV3, TypeScript, Sherpa-ONNX WASM, Vitest, Node build scripts, GitHub Releases.

**Spec:** `docs/reports/2026-10-30-stability-progress.md`, `docs/phase3-contract.md`, and the user's three release requirements.

## Tasks

- [ ] Establish reproducible English and Chinese reference clips, including the reported YouTube cases; measure browser ASR output, names, punctuation, segment length, and translation against references. Fix only evidenced defects; add focused regression tests.
- [ ] Rebuild and reload the installed Chrome extension. Verify real page captions and ASR fallback, history de-duplication, subtitle import, pause, seek, fullscreen, translation, and audible playback. Record screenshots and failures.
- [ ] Test human speech on three distinct news-site domains. Run one installed extension capture for 30 actual minutes and record start/end, caption progress, delay, memory/CPU, silent speaker output, and connection/worker recovery.
- [ ] From a clean checkout, verify dependency and model checksums, build the extension ZIP, audit license/notice and privacy/secrets, install and use it without Node, and verify the public download.
- [ ] Only after all preceding checks pass, push the public-safe source, publish the stable GitHub release, and verify its tag and artifact. Otherwise leave the release as preview and report the exact unmet gates.

## Review focus

- Avoid duplicate or missing source text at logical boundaries, especially when ASR revises a prefix.
- Do not turn page-caption disappearance into a dead ASR state.
- Keep source history and translation aligned to the same session, epoch, segment, and revision.
- Ensure packaging has no pairing code, model cache, browser profile, private audio, or screenshots.
