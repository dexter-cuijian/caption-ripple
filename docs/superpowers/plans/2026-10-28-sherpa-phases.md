# Active plan: staged Sherpa news captions

Supersedes WLK/Python implementation. User explicitly chose Node.js+sherpa-onnx and phase1 source-only, then authorized automatic progression through stages2–4 after each real-browser acceptance. All stages must be delivered; no further phase approvals.

Task 1: Phase1 Node companion and minimal MV3 extension. sherpa-onnx-node2.0.1, ws8.22.0, streaming paraformer bilingual zh-en int8; loopback9876 and WS session protocol. Offscreen audio pass-through is mandatory, AudioWorklet 16k mono int16 100ms. Source interim updates; finalize >=500ms silence. Popup start/stop/status; overlay fullscreen/SPA/iframe. Node worker isolates decoder, bounded audio, no mic. Model lacks word timestamps: label capture-derived timing estimates and measure first source render from detected audio onset, never invent token alignment. Tests first; real Chinese news capture, audible passthrough, fullscreen, measured logs.

Task2: Final-only pluggable translation (translate(text,sourceLang,targetLang)), bilingual source upper/smaller and target lower/larger; popup synced language/engine/font/position/opacity settings; language lock. Real browser source+translation and language switching before task3.

Task3: Auto reconnect and recovery, bounded queues, scheduled two-hour decoder maintenance at silence, robustness to silence/noise/network/ad/navigation; 2h actual Chrome capture soak, >=3 news sites; human audio evaluation with CER and before/after optimization evidence. Hotwords only where provider supports, do not fake paraformer hotword capability.

Task4: Streaming translation option; subtitle offset; local Hy-MT2 offline translation; persistent history/search and SRT/VTT/TXT/MD export; ASR provider selection; continue earlier approved scoped glossary/knowledge and optional vision capabilities only after preceding phases pass. Reusable setup/start/stop and package docs. Verify optional configured external providers only when real credentials exist; report otherwise.

Latest latency contract: ideal source first character <1s; phase1 Chinese source onset to render <=2s; overall bilingual 2–5s acceptable. Logs distinguish audio onset/capture/server/decode/render, cold/warm, observed figures and unavailable token timestamps.

Commit emojis + Conventional Commit. Branch feature/realtime-captions. Real installed Chrome acceptance required, no synthetic/mocked claims. Completion email to authorized user with fresh Codex quota only once work completes or truthful limitation summary if blocked.
