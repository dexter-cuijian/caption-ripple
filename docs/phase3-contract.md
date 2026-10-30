# Next gate: news robustness and measured segmentation

Start implementation only after phase2 real installed Chrome bilingual+history gate. Preserve Node+sherpa streaming,500ms silence finalization,100ms capture, source-first and audio pass-through. Native process isolation remains mandatory.

Observed real news limitation: background music/continuous speech yields long cumulative interim and sparse finals; final-only translation can therefore be delayed. Investigate actual decoded output and native reference set before tuning. Compare threshold.008 baseline CER19.6774%(183/930) on330.4s/28 FLEURS clips against candidate gates (.003,.001). Clearly label FLEURS as general human read speech rather than news. Add a bounded speech segment duration/length with tail flush only if accuracy is measured and boundary duplication/loss tested; expose explicit split reason, retain500ms silence rule. Do not claim a tuned RMS gate is a neural VAD. Native recognizer free/reset limitations remain transparent.

Connection faults: real Chrome stop backend/restart, child fatal recovery, WebSocket reconnect, stale epoch rejection, bounded PCM buffering and audible output independence. No unlimited replay after disconnect. Timed maintenance can be accelerated in unit tests, but two-hour soak must be actual wall-clock installed Chrome tabCapture, separate from that test.

Soak evidence: collect periodic authenticated health/diagnostics summaries and macOS process RSS for parent/native child, explicit start/end UTC, sample counters, captions/finals/render progress, errors and disconnects. Bounded logs may rotate; incrementally retain statistical aggregates outside rotating logs. Do not save credentials. Treat users' unrelated tabs as out of scope.

Three actual news sites need distinct site domains and actual captured human voice, not three YouTube channels or HTTP reachability. Network-blocked sites are blocked and must not count as passes. Capture clean screenshots, source language/target and model profile in report. Local fixture, cross-origin iframe and multi-player interactions are separate compatibility cases.

Accuracy/latency reports must state source scope, reference method, measured word/character errors, source onset precision100ms, cold vs warm where available, final endpoint vs MT vs actual render; tiny samples have descriptive percentiles only. Report human-reviewed numbers/negation/names errors honestly and fix critical translation regressions before claiming gate passed.
