# Chrome SenseVoice acceptance follow-up · 2026-11-20

## Test setup

- Chrome for Testing 159.0.8154.6 on macOS, isolated headless profiles and installed unpacked CaptionRipple builds. The local media tab was muted in Chrome and the extension's speaker gain was zero. The media element itself retained volume for tab capture. An initial globally muted probe returned zero RMS and zero captions, so it was discarded. No local companion service was started.
- The tests use the installed extension's tab capture, recognition worker, video overlay and IndexedDB history. The test profile auto-allowed tab capture for the isolated extension ID. Model A/B comparisons use the same prerecorded speech at 1× with translation off to isolate recognition cost. CPU uses summed process CPU deltas, where 100% is one logical core. RSS sums the Chrome test instance's processes and can count shared pages more than once.
- Fixed a start-up race in `cc08bab`: the offscreen listener could accept a reset acknowledgment before the worker's model was ready, allowing audio packets to pile up during a seek. The new regression test first reproduced premature PCM, then verified resume after the current epoch's reset.
- Fixed the browser capture clock in `eb8633a`: after about 6.7 minutes, 402.57 seconds of playback had delivered 400.70 seconds of PCM. Anchoring to accumulated PCM made the measured render delay drift. Browser capture now uses the worklet packet end relative to the live AudioContext clock. SenseVoice maps segment timestamps from the latest delivered packet and uses the final captured packet for a stop flush. The 30-minute capture used the earlier `cc08bab` build. Its metrics support capture continuity and resource measurements. The source delay comparison uses `eb8633a`.
- On `eb8633a`: 61 service tests, 127 extension tests, typecheck, candidate build and diff validation passed.

## External sites and translation

- [UDN](https://video.udn.com/news/1332447): the real article and its same-origin iframe loaded and produced Mandarin captions from tab audio after the player itself was unmuted. The isolated tab and extension speaker output stayed muted. The test package pre-granted UDN host permission to exercise that optional permission path. This confirms actual voice capture on one external domain. The recording has no independently timed reference transcript.
- YouTube, Public Television Service, PBS, CCTV and RTHK reset the connection in this Chrome profile. FTV, EBC and TVBS timed out during navigation. CNA opened without a playable media element. These attempts do not count toward the three-domain gate.
- Chrome exposed local EN/JA/KO → ZH translation as downloadable. The Korean model did not finish downloading within the 90-second attempt. The previously documented loss of negation could not be revalidated or cleared. The translation quality gate remains open.

## Continuous muted capture result

- Build `cc08bab`, SenseVoice, looping prerecorded FLEURS English speech inside one 30-minute local video. Played 2026-11-20 09:09:30.860–09:39:31.040 UTC, with 1,800.18 seconds of wall time including stop. The last running sample was 1,800.04 seconds after playback began.
- No capture restart, disconnection or epoch change. Chrome was still reporting `running` and a visible caption before stop. The extension processed 28,708,800 samples (1,794.3 seconds at 16 kHz), saved 227 final captions and recorded 426 render events. The media clock was 1,799.98 seconds at the last sample. The 5.68-second difference is reported separately from the continuity result.
- Mean CPU 49.0% of one logical core, sampled P95 58.0%. Summed Chrome RSS median 931 MiB, observed peak 1,614 MiB. These values cover the isolated test browser, not only the recognition worker.
- This run verified continuous muted local capture. It used the old timing calculation and ran before the clock correction, so its render delays should not be used for model ranking or for a release latency gate.

## Same-input Chrome A/B

Both models used `eb8633a` sequentially, with the same media and overlay configuration for each pair. First caption is measured from starting playback. Interim P95 is the model's aligned packet audio end to a visible overlay event. The two models finalize on different boundaries and report different final audio markers: Zipformer reports an endpoint-detection packet, while SenseVoice reports a VAD boundary or a forced segment end. Final render numbers below describe the native marker for each model and are unsuitable as an aligned head-to-head utterance latency. There is no translated-render measurement in this A/B.

| Media | Model | Final source error rate | First caption | Interim / final source P95 | Mean CPU | Median RSS |
| --- | --- | --- | --- | --- | --- | --- |
| PBS NewsHour · 75 s | Zipformer | 37/171 WER (21.64%) | 1.09 s | 0.101 / 0.091 s | 43.3% | 1,375 MiB |
| PBS NewsHour · 75 s | SenseVoice | 11/171 WER (6.43%) | 6.10 s | 1.396 / 2.610 s | 55.2% | 1,717 MiB |
| FLEURS Mandarin · 7 clips | Zipformer | 31/201 CER (15.42%) | 5.89 s | 0.182 / 0.099 s | 38.5% | 1,556 MiB |
| FLEURS Mandarin · 7 clips | SenseVoice | 9/201 CER (4.48%) | 6.12 s | 1.210 / 2.471 s | 48.9% | 1,665 MiB |

The English reference was aligned to [the first 75 seconds of the PBS segment](https://www.pbs.org/newshour/show/jakarta-rapidly-sinks-as-climate-change-and-overdevelopment-collide). SenseVoice retained Jakarta and the reporter's full name on this sample. The Mandarin reference was the matching text from seven independently labeled FLEURS validation clips. These short samples favor SenseVoice on accuracy at higher CPU, memory and interim latency, and do not justify selecting a new default. The interim P95 results for SenseVoice use eight samples per language.

## Release decision

Zipformer remains the default and SenseVoice remains opt-in. Only one external news domain produced captions from real audio in this run. The translation quality gate and multi-site coverage remain open. Repeat the 30-minute run with the timing fix in the eventual release package. GitHub still lists only `v0.1.0-preview.1`.
