# CaptionRipple browser release checks · 2026-11-27

Candidate code `3cfca88` was built with `npm run build:sensevoice`. TypeScript, 61 service tests, 160 extension tests and the build passed. Chrome for Testing 151.0.7922.34 ran the unpacked build in isolated profiles. The isolated tab and extension speaker output were muted. Chrome performed translation on-device from the extension.

## Draft inference and split-sentence translation

- The normal SenseVoice provisional inference window is now 4.2 seconds. The first draft uses 2.5 seconds of audio, the empty-first-draft retry uses 5 seconds, and the forced final window is 10 seconds.
- An English contextual repair handles a fronted comparison whose relative phrase crosses a forced duration cut. It sends two complete clauses to the translator while keeping the named antecedent in the original row. The stored source and raw ASR texts remain intact. Repair requires the two neighboring captions to satisfy narrow syntax and timing checks. Existing per-row glossary validation still applies.
- A direct Chrome-local translation check reused three actual recognition pairs recorded from the PBS fixture. All three restored the link between Ratini's group and the flooding becoming routine, preserved the name in the previous row, and translated the comparison about naming separately.
- In the installed-candidate PBS replay (79.024 seconds), 11 of 11 final Chinese translations were recorded, including the stop tail. There were 10 final Chinese overlay acknowledgments before shutdown. The bilingual history showed the repaired full sentence about flooding becoming routine in the proper row. Interim source and interim Chinese P95 both came to 1.157 s; final Chinese P95 was 2.403 s. This verifies the reproduced sentence only.

## Platform playback

YouTube's watch page and Bilibili's desktop and mobile pages again returned connection resets in isolated stock Chrome. Retrying without HTTP/2 and QUIC yielded the same result. The YouTube privacy-enhanced embed loaded but did not decode any audio and remained at playback time zero. Neither platform has completed a speech capture check in this environment.

## Thirty-minute muted acceptance

The same `3cfca88` build ran for 1,800.230 seconds, captured 28,676,800 PCM samples and remained on one epoch. All 242 final history rows stored Chinese. Chrome acknowledged 241 final Chinese overlays before stop. The original capture-relative cutoff counted 222 corrected character edits over 1,207 reference characters and included speech from the subsequent loop. The media-clock rescore appears below. Median final translated display time was 3.699 s. Chrome averaged 47.0% of one logical core and had a median summed RSS of 1,082 MiB.

| Metric | Render count | P95 | Gate |
| --- | ---: | ---: | --- |
| Interim source | 171 | 1.511 s | ≤1.500 s |
| Interim Chinese | 82 | 1.498 s | ≤1.500 s |
| Final Chinese | 241 | 2.903 s | ≤3.000 s |

Nine source drafts and four translated drafts took longer than 1.500 s. The source draft at the P95 boundary was generated 1.509 s after the captured audio boundary and took another 2 ms to render. The provisional Chinese gate passed by only 2 ms in this run. The earlier 1.580 s provisional Chinese result used Chrome 159, so the change in measured latency cannot be attributed entirely to the code change.

## Packaging and count follow-up

Candidate `2060cbf` additionally separates the recognized input “family of7” before English-to-Chinese translation. This keeps the original recognized text in history. A ZIP integrity check passed, and the extracted extension was byte-for-byte identical to the built directory. The ZIP contained only the extension directory including its manifest and notices. In the extracted extension, an actual local Chrome history-translation call returned a seven-person household for the recorded glued form. The installed archive also stored 11 of 11 final translations during a short PBS replay. That replay omitted “seven” in the recognized source and in the translation. Its visible-overlay timings were above threshold. The 30-minute figures above apply to `3cfca88`, before this follow-up.

## Alternative recognition models

Native CPU comparison used the same 23 Korean FLEURS clips, the same character-edit scoring, and four configured threads. At oracle clip boundaries SenseVoice INT8 scored 132/1,207 character edits (10.94%) and Moonshine v2 Tiny Korean quantized scored 120/1,207 (9.94%). SenseVoice's 4.2-second draft and full-clip decode P95 were 107 ms and 531 ms; Moonshine's were 115 ms and 722 ms. These are native measurements and exclude capture, segmentation, translation and rendering.

A separate Chrome worker comparison loaded the existing WASM runtime. SenseVoice decoded all 23 clips, with 130/1,207 edits and a 983 ms draft P95. Moonshine initialized, but the first decode threw inside the current WASM runtime. The Korean package uses the Moonshine Community License and remains an evaluation-only candidate. [Moonshine v2 model documentation](https://k2-fsa.github.io/sherpa/onnx/moonshine/models-v2.html)

The Apache-2.0 Korean streaming Zipformer processed 23 of the same clips in 100 ms packets. Both native CPU and Chrome WASM produced 684/1,207 character edits (56.67%) on the original audio, including 10 empty clips. Native packet processing P95 was 21 ms and Chrome packet processing P95 was 61 ms. The packet timer measures ingestion and decoding for each packet. A diagnostic native run scaled each clip to a peak of 0.8 using its entire recording. It produced text in all clips and lowered the error rate to 273/1,207 (22.62%). That normalization uses future audio, and even with it the error count exceeded SenseVoice's 132 on the unmodified recordings. The model remains outside the extension. [Korean Zipformer model and license](https://huggingface.co/k2-fsa/sherpa-onnx-streaming-zipformer-korean-2024-06-16/tree/ba6078bca4daf3f0dd37f79d0ab505af71df14a6)

In a paired Chrome worker check on those same 23 clips, lowering the normal SenseVoice draft input from 4.2 s to 4.0 s moved draft decode P95 from 986 ms to 945 ms. The shorter draft differed by 33 edits across 328 characters from the longer draft, including edits before the excluded tail. Neither window produced an empty draft. The comparison uses the longer draft hypothesis as its edit-distance denominator. The candidate retains the 4.2-second window while keeping the experimental result separate from render timings.

## Korean negation follow-up

A comparison against the Korean reference found the recorded spelling `불 참석석했습니다`. Chrome's local provider translated that row as attending a meeting, even though the reference says that most delegates were absent. The earlier normalizer already handled the single final syllable and left the duplicated one untouched. Candidate `30dc254` canonicalizes the repeated syllable only within the negative attendance phrase before Korean-to-Chinese translation. The original recognition remains in history. Tests cover the captured variant, rejection of a wrongly positive translation after normalization, and a positive attendance variant that must stay untouched.

An actual offscreen history translation of the same row in the preceding build returned positive attendance. The new build returned a Chinese sentence stating that most delegates were absent. The provider still rendered the administrative unit ambiguously as a country. This verifies the negation repair for that recorded row. TypeScript, all 223 tests, and the candidate build passed. All 48 files inside the candidate ZIP matched the directory used in Chrome by SHA-256.

The 30-minute replay for `30dc254` stopped early. The last valid sample was at elapsed 1,626.068 seconds with 25,816,000 captured PCM samples and one epoch. The harness then timed out locating the video element. Disk free space was approximately 124 MiB around the interruption. The available evidence establishes the timeout and low free space independently.

## Audio at forced cuts

The independent Korean transcript exposed an eighteenth-century reference that became eighth-century after a forced duration cut. The capture had 592 ms between the preceding forced caption's end and the next VAD start. In a native replay of the same recorded sample range, adding those 592 ms restored “18th century.” In other recorded gaps this restored the start of the word “guide” before a proper name and recovered part of a previously garbled continuation. The skier-count example still lacked the initial 116 participants. The probe compared both decodes on actual audio and used the independent source transcript to check these cases.

The browser candidate now retains at most 800 ms of captured audio for the first VAD final following a forced cut that emitted text. The recovered samples start exactly at the preceding caption's end. The expected segment end and its translation timing keep their captured audio timestamp. Tests verify the preserved PCM, exact boundary, unchanged audio length for a second natural segment, and handling of a longer gap.

In the resumed Chrome playback, the final source row started at the forced boundary and included “18th century.” Chrome's on-device translator produced “18 世纪.” The same replay restored the start of “guide” before Anna's name. Translation still rendered the role incorrectly and interpreted the 13th-place finish as the thirteenth race. In the long replay, the duplicated-syllable absence case also appeared in actual captured speech and was correctly translated as absence.

## First-pass score with media-clock alignment

The reference consists of 23 Korean FLEURS validation recordings with 304.98 seconds of speech and 11.50 seconds of inserted silence. This comparison selects finals before the first loop boundary at 316.48 seconds using the actual media clock. It excludes the next loop's opening speech, which was included by the earlier capture-relative cutoff. Each run contributed 42 final rows, including the last reference recording. Both captures used Chrome for Testing 151.0.7922.34 on the same Mac.

| Candidate | Raw character edits | Displayed-source character edits |
| --- | ---: | ---: |
| `3cfca88` | 183 / 1,207 (15.16%) | 181 / 1,207 (15.00%) |
| `1ed987f` | 159 / 1,207 (13.17%) | 156 / 1,207 (12.92%) |

These scores describe character recognition for the recorded Korean passage. [Google FLEURS dataset](https://huggingface.co/datasets/google/fleurs)

## Complete 30-minute run with post-cut audio retained

Candidate `1ed987f` played the same reference recording at 1× for 1,800.254 seconds in Chrome for Testing 151.0.7922.34, with the Chrome tab and extension speaker output muted. It captured 28,736,000 PCM samples in one epoch at media time 1,799.976 seconds. All 240 final history rows stored a Chinese translation and received a corresponding translated-overlay acknowledgment. Median final Chinese reading time was 3.658 s. Average process CPU was 48.2% of one logical core and median summed RSS was 1,571 MiB.

| Metric | Renders | P50 | P95 | Gate |
| --- | ---: | ---: | ---: | ---: |
| Interim source | 180 | 0.993 s | 1.202 s | ≤1.500 s |
| Interim Chinese | 85 | 1.110 s | 1.295 s | ≤1.500 s |
| Final Chinese | 240 | 2.153 s | 2.903 s | ≤3.000 s |

The character score above comes from this completed run. Absence, the 18th-century date, the 24th-place result, Nigeria and the below-freezing reference were recognizable in Chinese. The 13th-place result and several words and names still need fidelity improvements. The input also lost part of the 116-person count at a forced cut, leaving a confusing continuation around 36 participants.

## Live platform checks after the long run

The same installed build in isolated Chrome returned `ERR_CONNECTION_RESET` before the player loaded for the two reported YouTube videos and the Bilibili test video. A fresh Chrome run without HTTP/2 and QUIC reproduced the connection resets. Installed Chrome 158.0.8127.88 reproduced them in a fresh isolated profile as well. The YouTube privacy-enhanced embed reached HTTP 200 and stayed at media time zero with zero decoded audio. YouTube and Bilibili playback and speech capture remain unverified. [YouTube captions-off test](https://www.youtube.com/watch?v=2reQut8WNGc) [Earlier YouTube example](https://www.youtube.com/watch?v=R1ECMLrwDYQ) [Bilibili test video](https://www.bilibili.com/video/BV1wsup6ZEoX/)

## Follow-up for Korean sports placement

Candidate `8366414` normalizes a doubled syllable and removes stray spaces between number syllables in the recorded “finish the race in nth place” construction. This applies to the Korean-to-Chinese translation input and keeps the captured source in history. The exact recorded source translated as a thirteenth race before the fix and as 13th place through the updated extension's actual Chrome offscreen history-translation route. The proper-name transliteration and the guide title still need review. The build and TypeScript checks passed alongside 226 automated tests. The 30-minute figures above apply to `1ed987f`.

A muted 101.799-second replay in the updated build saved and confirmed the display of all 13 final translations. The actual race audio was again recognized with a doubled syllable, and the Chinese history showed 13th place. The neighboring recording continued to show 24th place.

The stable release remains pending live YouTube and Bilibili capture and the remaining translation-fidelity checks. GitHub continues to list `v0.1.0-preview.1`.
