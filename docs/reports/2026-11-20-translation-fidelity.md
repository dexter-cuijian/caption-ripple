# Korean-to-Chinese translation fidelity retest · 2026-11-20

## Reproduced defects and change

A recorded FLEURS reference about delegates missing a meeting contains an explicit Korean negative attendance expression. Earlier recognition separated its negative prefix from the verb. A direct local Chrome Translator comparison reproduced the semantic reversal: the split spelling translated as attendance, while the standard compound translated as absence. A separate English replay had emitted a punctuation-only Chinese translation.

Commit `957a40b` normalizes the specific Korean absence compound on the translation input, leaving the saved/displayed source unchanged. A clearly positive Chinese attendance result for that compound is rejected, as is a punctuation-only translation for readable source. This runs through the same live, final, contextual and history translation entry point. The guard covers the known pattern and does not verify every negative statement. 61 service tests, 139 extension tests, typecheck and the installed candidate build passed. The ASR worker and overlay files are byte-identical to the preceding candidate.

## Targeted Chrome results

- Native Chrome's local translator changed the known short split form from a positive result to a negative result when given the standard compound.
- The running extension replayed actual Korean speech. Near second 90 it saved a Chinese translation that preserved the majority and the delegates' absence. The rendering of “state delegates” was still imprecise. A separate direct call to the installed extension's history translation entry point reproduced the old split spelling and returned the intended absence, using the warmed local Chrome model. This isolated test call did not create a history row.
- English PBS control, 78 seconds at 1×: all 11 finals received Chinese text and the adjacent-caption repair still emitted a revision.
- A real Chrome test reproduced the raw punctuation-only return and confirmed that the installed extension rejects it through its history translation endpoint. A normal English negated attendance sentence still translated with its negation and place name.

## Quality review

The first full Korean pass comprised 43 final outputs before the repeated opening sentence. All 43 received Chinese text. Against the independent Korean reference, raw final source CER was 166/1,207 (13.75%) before the repeat. Review of those rows and the 11 English controls found residual source and translation errors. An independently labeled “below freezing” line was recognized with a homophone associated with a movie, and the translator carried that mistake through. In another line “unanimous consent” was recognized as two near-sounding words and translated as a name. The absence fix is confirmed, but term accuracy and error propagation still block release.

## Ten-minute silent translation run

The installed candidate played the Korean FLEURS reel and its repeat for 600.115 seconds. Both the isolated Chrome tab and the extension's speaker output were muted. The capture stayed on epoch 0, with no observed disconnect or restart, and delivered 9,585,600 samples. All 82 final rows saved a Chinese translation, and all 82 had a translated overlay render confirmation. The translated interim P95 was 1.375 seconds (30 samples); the final P95 was 3.002 seconds (82 samples). The first-pass review above excludes the repeat.

This confirmed the targeted fixes and continuous local translation. The final P95 was marginally above 3 seconds and the independent transcript still exposed materially wrong words and names. No stable Release was published.
