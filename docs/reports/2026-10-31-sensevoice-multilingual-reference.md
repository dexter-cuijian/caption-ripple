# SenseVoice multilingual human-speech reference probe — 2026-10-31

Google FLEURS validation (`dev`) supplies independent human-read audio and text. The project collector streamed only about five minutes of audio per language; input clips and per-clip results remain in ignored `.work/`. SenseVoiceSmall int8 was decoded **natively in Node**, one full clip at a time, with four CPU threads. These are not Chrome extension, news, live-caption, translation or rendered-latency results.

| Language | Clips | Audio | Edit errors / reference characters | CER |
| --- | ---: | ---: | ---: | ---: |
| Japanese (`ja_jp`) | 22 | 301.7 s | 62 / 1180 | 5.25% |
| Korean (`ko_kr`) | 23 | 305.0 s | 129 / 1207 | 10.69% |
| Cantonese (`yue_hant_hk`) | 24 | 303.5 s | 112 / 881 | 12.71% after Traditional-to-Simplified normalization |

The Cantonese model output is Simplified Chinese while FLEURS references are Traditional. A direct script-sensitive comparison was 356/881 (40.41%) CER; the table converts **both** sides to Simplified using OpenCC `t2s` before the existing NFKC, punctuation/space removal and Levenshtein calculation. This measures lexical errors more fairly, but does not establish correct Traditional output. FLEURS Cantonese recordings may use standard written Chinese register, so they cannot by themselves establish colloquial Cantonese news quality.

English 40 clips yielded 44/811 WER (5.43%) and Mandarin 28 clips yielded 44/930 CER (4.73%) in the earlier [browser feasibility report](2026-10-31-sensevoice-browser-probe.md). Together these five-language probes justify installed-Chrome evaluation, not a stable default or release.

The Korean collector initially failed on one reference containing quote characters because the TSV parser treated them as field quoting. The collector now uses `csv.QUOTE_NONE`; the 305-second Korean set was recollected successfully. No transcript was manually edited for scoring.
