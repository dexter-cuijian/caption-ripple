# ASR homophones and Chinese translation follow-up · 2026-11-20

## Candidate fixes

- `7a01e9d` corrects three recorded Korean recognition substitutions when a finalized caption contains corroborating context. The original ASR remains in history. Users can add Korean and Japanese glossary sources, including video-scoped aliases. Korean matching preserves common attached particles.
- `0145768` reserves 100 ms for browser drawing and messaging when the video overlay is already using part of the following caption's latency budget. The scheduler still targets a three-second reading interval and preserves its 1.5-second minimum when it shortens the hold.
- `45480a8` keeps the confirmed Chiang Wan-an correction and handles “讲晚安” only with political context and a name-like use within the same sentence. Everyday good-night phrases remain unchanged.
- `bcbf559` preserves existing English ASR alias boundaries when applying the new Korean boundary handling.
- `99bc5ac` standardizes mixed Arabic and Korean numerals before Korean-to-Chinese translation. It handles recognized count and placement units and leaves the stored source as heard. A direct test using the same Chrome local translator reproduced 36 people becoming 30 from mixed recognition text, then verified that canonical input retained 116 and 36. Placement 24 and count 56 also survived. The installed capture test below uses the prior build and does not exercise this follow-up.

## Recorded-speech comparisons

Installed unpacked extension, local Chrome translation, isolated Chrome for Testing, 1× playback, muted tab and muted extension speaker output. Korean scoring uses the first complete FLEURS pass against the independently supplied reference. PBS uses the first 75 seconds of the published segment and its saved transcript. A video-scoped glossary entry for Ratini was enabled on the PBS replay. It was not added to the distributed glossary.

| Run | Reference errors, raw → corrected | Chinese final history | Overlay P95, interim source / final Chinese |
| --- | --- | --- | --- |
| Korean, auto decoder | 171 → 169 / 1,207 characters | 44 / 44 first-pass rows | 2.007 s / 3.011 s |
| Korean, explicit Korean decoder experiment | 173 → 170 / 1,207 characters | 44 / 44 first-pass rows | 1.202 s / 3.002 s |
| PBS, original segmentation | 11 → 10 / 171 words | 11 / 11 | 1.857 s / 4.093 s |
| PBS, shorter Silero silence threshold | 15 → 14 / 171 words | 12 / 12 | 1.212 s / 2.600 s |
| PBS, eight-second forced limit | 12 → 12 / 171 words | 13 / 13 | 1.211 s / 3.003 s |
| PBS, retrospective quiet-pause split | 12 → 11 / 171 words | 13 / 13 | 1.732 s / 5.876 s |
| PBS, immediate quiet-pause split | 13 → 12 / 171 words | 15 / 15 | 1.211 s / 2.519 s |
| Korean, immediate quiet-pause split | 143 → 141 / 1,207 characters | 51 / 51 first-pass rows | 1.213 s / 2.743 s |

The Korean render timing includes the opening of a repeated pass. The experiments overlapped on the same Mac, so these timing figures help diagnose boundary behavior and do not establish isolated release latency.

- Original Korean replay: “unanimous consent” and “below freezing” were corrected before translation. The Chinese outputs retained both meanings. “State” still translated as “country” in the consent sentence. The explicit Korean experiment also exercised the Galápagos substitution and restored the place name in the Chinese result. Its overall raw character error count was slightly higher in Chrome, so the decoder stayed in auto mode.
- PBS: the scoped alias changed the detected `Rotiy` to `Ratini`, preserved the raw spelling in history, and carried the corrected name into Chinese. In the original segmentation this still attached “for millions” to the preceding sentence. The quiet-pause tests separated those sentences. The retrospective split arrived too late. The immediate split introduced other clause cuts and reversed “can't enter” to “can enter.” Its latency improvement does not outweigh that regression. The segmentation experiments are excluded from the candidate.
- The Korean early-split comparison improved character error count while adding broken clauses and an erroneous translation of a race placement as a family relationship. The aggregate score alone would have missed that degradation.
- The two user-reported YouTube pages reset the connection before a video player loaded in the isolated Chrome instance. The captions-off path on those exact pages remains unverified.

## Punctuation and webpage captions

- `2e5dbfc` restores missing English sentence punctuation where aligned token timing and the audio agree on a sustained pause. It changes punctuation without moving the underlying audio boundary and records the original ASR separately. The trial left all 40 English FLEURS standalone reference clips unchanged. In installed Chrome, the PBS replay separated the clause about children from the clause about Ratini and preserved the later restriction on vehicles entering. All 11 final rows received Chinese, with 10 rendered final translations. Interim source P95 was 1.257 seconds and final Chinese P95 was 2.649 seconds. The next line of the Ratini paragraph still translated as a fragment.
- `ba625b7` excludes hidden native and hidden DOM captions and lets a deliberate native caption-track shutdown expire the webpage source immediately. The independent Chrome toggle test used an actual hidden track that still had one active cue. The old build still showed the webpage line after 18.120 seconds. Filtering alone resumed speech output in 9.416 seconds; the full fix resumed in 3.501 seconds with the same capture session. A separate Chrome DOM probe selected the displayed node and skipped nodes hidden by display, visibility or opacity.
- Actual Chrome playback attempts for the two reported YouTube URLs, the Bilibili news report and the official CCTV-13 live page were blocked before playback by connection resets. These attempts are recorded as unverified. Prior news-site capture results cover UDN, DW and RFI.
