# CaptionRipple browser release checks · 2026-11-23

Candidate code `116a9ae` was built with `npm run build:sensevoice`. TypeScript, 61 service tests and 153 extension tests passed. Chrome for Testing 159.0.8154.6 ran an unpacked build with isolated profiles and local Chrome translation models. The tab and extension output were muted. The fixture server supplied only the test recording, and the extension used no companion service.

## Corrections and PBS replay

- Preserve the existing minimum reading interval and reserve 200 ms for an overlapping interim caption that still expects a translation. This adjusts only the display hold, so speech decoding and the translator's own scheduling are unchanged.
- A real PBS replay before the contextual guard moved Ratini from one caption to the adjacent row despite preserving the translation boundary marker. Context repair now checks the wanted glossary terms in each row before accepting a pair. It retains independent results when any protected term crosses the row boundary.
- The pre-fix replay ended with 10 of 11 final history rows translated. The stop path now uses its existing two-second save window to wait for the last translation and its history acknowledgment after the source flush.

The revised candidate replayed 79.201 seconds of the PBS recording. All 11 final history rows, including the stop tail, stored Chinese. There were 10 translated final overlay acknowledgments before the overlay closed. Source interim P95 was 1.193 s (8 renders), Chinese interim P95 was 1.288 s (5 renders), and Chinese final P95 was 2.639 s (10 renders). The observed median final translated reading time was 3.827 s. This short replay cannot establish long-run timing.

The scoped name stayed in the correct row. The independent PBS transcript still showed a sentence lost across a forced split. The Chinese output preserved the name but turned the relative clause about Ratini into a fragment. This quality gate stays open.

## Real-site checks

Both the YouTube watch page and Bilibili's desktop and mobile pages reset the connection in isolated Chrome. The privacy-enhanced player returned HTTP 200 but decoded zero audio bytes. With the player embedded in a local page, both the reported video and Google's documented example still showed a platform-watch prompt and decoded zero audio bytes. Bilibili's embedded player reset the connection. These results leave YouTube and Bilibili playback and capture unverified. The previously verified UDN, DW, RFI and KQED results cover other domains. [YouTube player reference](https://developers.google.com/youtube/iframe_api_reference)

## Thirty-minute muted acceptance

The first attempt was discarded after the harness detected that its isolated profile had no available Korean-to-Chinese translator. The valid run registered the existing Chrome language packs in the test profile, used the extension's prepare-translation control, confirmed the background translator was ready, and restarted with the same candidate. The harness now fails if the selected language pair is unavailable or if no translated result appears within 40 seconds.

The valid run lasted 1,800.271 s. It captured 28,708,800 samples on a single epoch, and all 241 final Chinese translations were saved and acknowledged on screen. Median translated reading time was 4.217 s, with a minimum of 1.461 s. Chrome averaged 48.6% of one logical CPU core and had a 1,306 MiB median summed RSS.

| Metric | Renders | P95 | Gate |
| --- | ---: | ---: | --- |
| Interim source | 187 | 1.426 s | ≤1.500 s |
| Interim Chinese | 95 | 1.580 s | ≤1.500 s |
| Final Chinese | 241 | 2.903 s | ≤3.000 s |

The 20-minute interim Chinese snapshot was 1.455 s. Later events raised the full-run P95. The slowest translated drafts took 1.491–1.691 s from the measured audio boundary to generation of the source event, with the source shown 1–6 ms later. Reducing the display hold on these events would not recover their latency. The first complete independently referenced Korean pass had 213 raw and 210 corrected character edits across 1,207 reference characters. Continuity and final timing passed. The interim translation exceeded its gate by 80 ms, the PBS cross-segment quality check remains open, and the two requested platforms remain unverified. The stable release was not published.
