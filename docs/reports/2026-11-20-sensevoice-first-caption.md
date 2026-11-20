# SenseVoice first caption and release retest · 2026-11-20

## Change and method

Commit `a4db9ea` attempts a draft at 2.5 seconds after capture start or reset, retries at 5 seconds if the draft is empty, and uses the existing 5-second schedule for subsequent utterances. A prior experiment used early drafts for every utterance. That made later drafts wait behind CaptionRipple's 3-second reading hold, so it was rejected. The 10-second forced-final limit, VAD finalization and offline decoder remain the same. Reused buffers and running power remove repeated audio-buffer allocation, concatenation and rescan.

The candidate passed 61 service and 130 extension tests, typecheck and the SenseVoice build. The worker used for the retest had SHA-256 `5c05079b938cdccd0dc08816770dcf426deda6033b60a5598957b44ce9559b6d`.

Browser tests used a real installed unpacked build in Chrome for Testing on macOS. All playback tabs were muted in Chrome and extension speaker gain was zero. Same-input source benchmarks used the prior PBS and FLEURS Mandarin fixtures. Browser CPU/RSS refer to the isolated Chrome instance. Other test profiles were active for some samples and process RSS can count shared pages more than once.

## External news and Chinese translation

- [UDN](https://video.udn.com/news/1332447) produced Mandarin from real video playback. [DW WorldLink](https://amp.dw.com/en/worldlink-personal-stories-behind-the-headlines/a-19385807) produced English captions from real audio-page playback. The DW AMP video variant never advanced and was excluded. Site profiles pre-granted only the test host permissions.
- Euronews, Singapore CNA, RNZ and ABC Australia did not complete navigation. The France 24 page did not expose playable media in the test, and the KQED episode failed to play. These attempts do not count as news-site passes.
- The isolated Chrome for Testing profile exposed the English-to-Chinese language pack as downloadable but the extension's preparation timed out after 120 seconds. An isolated stock Chrome profile completed the official download. Loading that already prepared test profile in Chrome for Testing allowed the same candidate to prepare local translation in the offscreen context and render Chinese on all 11 final PBS rows. This verified the warmed path. The fresh-profile Chrome for Testing download remains unverified.
- The PBS translated outputs preserved Jakarta, 42 million and the visible negation in the traffic sentence. Some text remained fragmented or changed meaning. For example, the clause introducing a 35-year-old resident was split between source segments and the Chinese output lost the intended relation. This sample clears functional translation rendering but fails the fidelity gate.

## Ten-minute muted retest

The optimized build ran from 09:53:38.508 to 10:03:38.593 UTC (600.085 seconds including stop). No epoch change, disconnect or capture restart was observed. The last video time was 599.96 seconds and the extension sent 9,540,800 PCM samples (596.3 seconds at 16 kHz). It saved 76 final rows and recorded 145 overlay render events. First caption was 3.08 seconds. Mean Chrome CPU was 49.2% of one logical core and median summed RSS was 1,010 MiB. Source interim/final render P95 was 2.10/3.86 seconds. The connection soak passed and these long-run latency figures do not clear the latency gates.

## Same-input comparison against the previous SenseVoice build

| Sample | First caption, old → new | Final source error, old → new | Interim/final source P95, old → new | Mean CPU, old → new | Median RSS, old → new |
| --- | --- | --- | --- | --- | --- |
| PBS, 75 s | 6.10 → 3.17 s | 11 → 12 edits / 171 words (6.43% → 7.02%) | 1.396/2.610 → 1.243/2.894 s | 55.2% → 50.2% | 1,717 → 1,357 MiB |
| Mandarin FLEURS, 7 clips | 6.12 → 3.13 s | 9 → 7 edits / 201 characters (4.48% → 3.48%) | 1.210/2.471 → 1.180/2.452 s | 48.9% → 43.6% | 1,665 → 1,374 MiB |

The difference is one extra English edit and two fewer Mandarin edits. The samples establish a near-halving of the first-caption time under these replay conditions and do not establish a population accuracy or resource estimate.

## Translation quality and release

The warmed profile also completed a 374-second English FLEURS run. All 46 FLEURS and 11 PBS final rows had both a Chinese history translation and a translated render confirmation. The translated-final P95 was 2.94 seconds on FLEURS and 2.60 seconds on PBS. Spot review across both exports found that explicit negations and numbers often survived, but also found broken translation across source segments and wrong senses. One water-current example became an electrical current after a transcription error. Navigation of the KQED live-radio alternative also timed out.

Two independent news domains produced real speech (one video and one audio page). A third news-domain pass, broader fidelity, and long-run render latency remain open. Zipformer remains default and no stable release was published.
