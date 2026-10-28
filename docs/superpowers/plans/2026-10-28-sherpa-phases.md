# Active plan: staged Sherpa news captions

Supersedes WLK/Python implementation. User explicitly chose Node.js+sherpa-onnx and phase1 source-only, then authorized automatic progression through stages2–4 after each real-browser acceptance. All stages must be delivered; no further phase approvals.

Task 1: Phase1 Node companion and minimal MV3 extension. sherpa-onnx-node2.0.1, ws8.22.0, streaming paraformer bilingual zh-en int8; loopback9876 and WS session protocol. Offscreen audio pass-through is mandatory, AudioWorklet 16k mono int16 100ms. Source interim updates; finalize >=500ms silence. Popup start/stop/status; overlay fullscreen/SPA/iframe. Node worker isolates decoder, bounded audio, no mic. Model lacks word timestamps: label capture-derived timing estimates and measure first source render from detected audio onset, never invent token alignment. Tests first; real Chinese news capture, audible passthrough, fullscreen, measured logs.

Task2: Final-only pluggable translation (translate(text,sourceLang,targetLang)), bilingual source upper/smaller and target lower/larger; popup synced language/engine/font/position/opacity settings; language lock. Real browser source+translation and language switching before task3.

Task3: Auto reconnect and recovery, bounded queues, scheduled two-hour decoder maintenance at silence, robustness to silence/noise/network/ad/navigation; 2h actual Chrome capture soak, >=3 news sites; human audio evaluation with CER and before/after optimization evidence. Hotwords only where provider supports, do not fake paraformer hotword capability.

Task4: Streaming translation option; subtitle offset; local Hy-MT2 offline translation; persistent history/search and SRT/VTT/TXT/MD export; ASR provider selection; continue earlier approved scoped glossary/knowledge and optional vision capabilities only after preceding phases pass. Reusable setup/start/stop and package docs. Verify optional configured external providers only when real credentials exist; report otherwise.

Latest latency contract: ideal source first character <1s; phase1 Chinese source onset to render <=2s; overall bilingual 2–5s acceptable. Logs distinguish audio onset/capture/server/decode/render, cold/warm, observed figures and unavailable token timestamps.

Commit emojis + Conventional Commit. Branch feature/realtime-captions. Real installed Chrome acceptance required, no synthetic/mocked claims. Completion email to authorized user with fresh Codex quota only once work completes or truthful limitation summary if blocked.

## Later user refinements (2026-10-28)

- Final installation goal: users install only the Chrome extension and do not start a separate local service. The current Node/sherpa companion remains a measured development baseline. Validate an in-browser ASR provider against the same speech and real Chrome latency/quality gates before replacing that baseline; do not call a companion auto-launcher an extension-only install. Surface any measured quality, speed, privacy, or download tradeoff before changing the previously chosen primary architecture.
- Add interface internationalization, including translated controls, status/errors, history and export labels. Keep spoken source and target language settings independent from interface language. Verify at least Simplified Chinese and English, including long text and small side panel widths.
- Add selectable themes for the sidebar and video subtitles, with light/dark and high-contrast options. Preserve readability over bright and dark video, fullscreen, and narrow side panels; store user preference and verify it persists after browser restart.
- Redesign extension branding around instant translation. User selected the top-right concept: audio waveform flowing to two bilingual subtitle lines. The chosen mark is installed in the Chrome toolbar, extension card and sidebar at 16/32/48/128 px; retain editable SVG and reproducible PNG generator.
- Improve punctuation in long continuous speech: show stable internal commas in interim text as well as final segments, without rewriting native words or adding acoustic resets. Verify against the recorded news audio and retain raw ASR for comparison.
- Translation history now has a dedicated extension page plus a compact current-page preview in the live sidebar. Existing recording/title/date grouping, search/filter and TXT/MD/SRT/VTT export continue on the full page. Later, add source/target language filters and a clearer view of original versus revised translations while preserving existing records.
- Add subtitle import for films and episodes: first support an existing page subtitle track and user-selected local SRT/VTT, align cues to the selected video clock and show them in the same overlay/history. Then assess platform-specific automatic subtitle discovery where permitted; never assume every streaming site exposes a readable track. Keep imported captions distinguishable from ASR and verify seek, pause, rate change and episode switching.

## Open-source release reminder (2026-10-28)

- User approved the proposed public name CaptionRipple and authorized creating a public GitHub repository and uploading the code after the project is complete and accepted. Do not let this delivery step disappear from the plan.
- Before publication: verify CaptionRipple name availability, choose and add a project license, check all bundled code/model/asset licenses, remove local tokens and private audio/fixtures/logs, update installation and privacy documentation, and verify a clean checkout can build and run with the advertised setup.
- After the agreed product acceptance, create the GitHub repository and push the reviewed source code under the approved name. This authorization is already granted; do not ask for it again. A tagged release remains a separate optional step.
