# SenseVoice context and caption latency retest · 2026-11-20

## Candidate

- `fa6705f` adds bounded English-to-Chinese context repair for two adjacent SenseVoice finals when the first was cut by the duration limit and appears to end mid-clause. The previous row gets its draft promptly. The paired translation can revise both rows only if the local engine returns a single recoverable boundary marker. The optional repair has a 500 ms deadline and falls back to independent translation. Source captions and audio stay unchanged.
- An initial Chrome run wrongly joined a one-word acknowledgment into the preceding sentence. `a22f71e` excludes standalone replies such as “Yeah.” and was used for the completed retest.
- The worker skips speculative drafts when incoming PCM is over 250 ms late. Final decoding still uses all delivered packets. Video overlay reading time targets 3 seconds. When waiting would consume the next caption's latency budget, the hold can reduce to 1.5 seconds. A newer revision cannot extend an existing hold timer. Unrelated queued translations are discarded.
- 61 service tests, 135 extension tests, typecheck and the candidate build passed. Installed test worker SHA-256 `4e3ad7f5ed8c600eadee5ca49fcab3e2f4a0c51d6713292d709699051d04dfdb`. Each playback tab and the extension's output were both muted.

## Early evidence

- The warmed local Chrome translator stored Chinese text for all 11 PBS finals. Ten Chinese final renders were confirmed on the video overlay, with P95 2.92 seconds. One duration-boundary translation pair was revised, and the standalone reply retained its own “是的。” translation. The recognized source had already misplaced a clause boundary and misspelled the speaker's name. The paired translation improved continuity but did not recover all of the intended meaning.
- The [RFI report](https://www.rfi.fr/en/podcasts/international-report/20261114-turkey-talks-green-at-cop31-while-cracking-down-on-activists) used its own embedded player. Waiting for its live Play button rather than its loading skeleton resolved the first attempt's timeout. After 29.46 seconds of real audio, the test verified a live capture session, 484,800 sent samples, nonzero RMS and a reporting caption. Direct official audio playback was checked separately and was not used to substitute for the article test.

## Ten-minute silent retest and real news

With translation disabled for the matched source comparison, the same English FLEURS playback fixture ran for 600.781 seconds on `a22f71e`. The session stayed on epoch 0, with no observed disconnect or restart. It sent 9,579,200 samples (598.70 seconds of PCM at 16 kHz), saved 77 finals and recorded 144 source renders. Mean Chrome CPU was 48.0% of one logical core.

| Source overlay latency | Previous 10-minute run | This 10-minute run |
| --- | ---: | ---: |
| Interim P95 | 2.096 s | 1.406 s |
| Final P95 | 3.857 s | 2.641 s |

Across 75 observable switches from a final to a different caption, the shortest visible time before the next caption was 3.001 seconds and the median was 4.625 seconds. These observed values apply to this run. The scheduler can reduce its hold when required by a later caption. It is not a universal three-second minimum.

Three independent publisher pages produced real speech and captions with their own players for about 30 seconds each. [UDN](https://video.udn.com/news/1332447) was a video page. [DW WorldLink](https://amp.dw.com/en/worldlink-personal-stories-behind-the-headlines/a-19385807) and RFI were audio pages. These checks establish tab capture and caption delivery on those pages.

## Translation alignment regression

In the full 374-second English fixture, all 46 final rows acquired Chinese text and all 46 generated a translated overlay confirmation. P95 translated-final render latency was 2.831 seconds. The preceding 11 PBS rows also received Chinese text. Review of the 57 text pairs identified remaining errors from source recognition and translation, including water current translated as electrical current after an erroneous verb and source fragments that could not be reconstructed.

The same run exposed a more specific regression: on a pair about positive comments, Chrome preserved the marker but moved nearly all preceding meaning into the following row. Commit `ec2b882` adds a conservative per-side content check. Excessively unbalanced results keep the previous individual draft and translate the next independently. The exact worker and overlay files have the same SHA-256 before and after this translation-only change. The revised source passed 61 service tests, 136 extension tests, typecheck, and the build.

On a 150-second replay with the latest build, the affected FLEURS pair was recognized again near 125.7–144 seconds. The first row retained its complete independent translation at revision 1 and the next row received its own independent translation. No one-word replacement was stored.

A separate 78-second PBS replay on `ec2b882` still produced all 11 final Chinese history rows, one valid context revision across a forced cut, and an independent acknowledgment. None of the stored translations displayed the marker. This verifies the guard without disabling contextual translation.

The three-site capture check and long source-latency retest passed. Chinese fidelity remains below release expectations, so Zipformer remains the default and GitHub Stable was not published.
