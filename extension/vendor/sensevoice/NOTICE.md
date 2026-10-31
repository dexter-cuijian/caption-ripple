# Optional SenseVoice browser candidate

Model: SenseVoiceSmall int8, converted by k2-fsa from Alibaba/FunASR SenseVoiceSmall. Source revision, integrity values and download URL are in `sensevoice-model.lock.json` at the repository root. Model weights use the FunASR Model Open Source License Agreement v1.1; the complete text is `MODEL_LICENSE.txt` here. The model name and author/source attribution must be retained on redistribution.

Runtime: `@sherpaw/vad-asr@0.3.0`, Apache-2.0, https://github.com/sumimakito/sherpaw. The package's LICENSE is included as `RUNTIME_LICENSE.txt` in candidate builds.

VAD: Silero VAD v5, upstream https://github.com/snakers4/silero-vad, MIT. The complete MIT license is in `VAD_LICENSE.txt`. The pinned ONNX release asset is linked from `sensevoice-model.lock.json`.

Candidate builds include model files, WASM and these notices. Browser inference does not send tab audio to the download hosts.
