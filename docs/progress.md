# Implementation ledger — plan: docs/superpowers/plans/2026-10-28-realtime-captions.md

- 2026-10-28: User approved and requested complete implementation and real Chrome installation/testing.
- Pre-flight: new repository, no pre-existing code. Backend and extension share docs/protocol.md; this is their source of integration truth.
- Ruling: initialize new isolated project directly at requested path on feature/realtime-captions; no existing repository/worktree to protect.
- Ruling: use upstream WhisperLiveKit only as locked dependency, not fork tiny example extension; implement first-party extension around fixed protocol.
- Network: sandbox DNS blocked package sources; elevated dependency download requested.
- User steering: replaced Python/WLK with Node+sherpa; then authorized automatic stages1–4 with real Chrome acceptance between stages. Active spec docs/phase1-contract.md and plan 2026-10-28-sherpa-phases.md.
- Task 1: server implementation 12aeffc; review found exclusivity-on-reset, empty-final retention and stale-health defects. Fix bbe46b0 tested RED->GREEN, 21/21 passing; scoped reviewer marked all addressed. Native/browser proof remains pending model readiness.
- Setup: npm dependencies installed and native sherpa-onnx-node2.0.1 imported successfully. 330.4 seconds real FLEURS Mandarin speech + references collected locally for later CER; this is not labelled news audio. Official Paraformer test voice converted into a local MP4 fixture (10.053s) for real tabCapture testing.
