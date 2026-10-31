# SenseVoice 浏览器候选验证 · 2026-10-31

## 可复现输入与来源

- [SenseVoiceSmall 的 Sherpa-ONNX int8 转换模型](https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17)，固定修订 `2365baeacb507f821a0c8120fcee3d484dba7a07`。`model.int8.onnx` 239,233,841 字节，SHA-256 `c71f0ce00bec95b07744e116345e33d8cbbe08cef896382cf907bf4b51a2cd51`；模型只在本机临时目录。
- 浏览器原型使用 npm `@sherpaw/vad-asr@0.3.0` 的独立 WASM 运行时及官方 Sherpa-ONNX [Silero VAD v5](https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad_v5.onnx)，后者 SHA-256 `6b99cbfd39246b6706f98ec13c7c50c6b299181f2474fa05cbc8046acc274396`。没有把这两个依赖加入正式扩展，也没有上传模型。
- 模型权重的来源指向 [FunASR Model Open Source License Agreement v1.1](https://github.com/modelscope/FunASR/blob/main/MODEL_LICENSE)，需要保留出处、作者和模型名；不能把转换模型的权重笼统称为 Apache-2.0。运行时包标示 Apache-2.0；稳定版发布前还需核对完整通知文件。

## 离线短音频准确率

同 `2026-10-31-whisper-model-comparison.md` 的 FLEURS validation 音频与参考，SenseVoice int8 的本机 `sherpa-onnx-node 2.0.1` 整段解码：英语 40 段、44/811 WER（5.43%）、总解码约 6.77 秒；普通话 28 段、44/930 CER（4.73%）、总解码约 6.56 秒。中文输出本身为简体，按项目 NFKC/标点清理规则计算。上述计时不含模型初始化约 0.69 秒，也不含真实浏览器采集。逐条结果保留在忽略的 `.work/sensevoice-en.json` 与 `.work/sensevoice-zh.json`。

## 实际 Chrome WASM 探针

在独立 Chrome 窗口、本机 HTTP 页面里加载独立 WASM 与模型，对 PBS NewsHour [官方 YouTube 新闻片段](https://www.youtube.com/watch?v=50r53mqXMg0)音轨开头 75 秒运行。音频未发送到第三方。冷加载到 `model-ready` 约 2.08 秒；同一 15 秒前缀的 5、10、15 秒窗口解码分别约 1.22、2.49、3.52 秒。前缀输出有可用的中途文字，但尚未验证扩展内真实采集到渲染的 P95。

另用 Silero VAD v5、500 ms 最短静音、15 秒最长语段切开相同 75 秒音轨。Chrome WASM 共得到 8 段，前 3 段覆盖 PBS [官方文字稿](https://www.pbs.org/newshour/show/jakarta-rapidly-sinks-as-climate-change-and-overdevelopment-collide)开头 88 词，WER 5/88（5.68%）；相同范围的现有扩展真实 Chrome 流式输出为 22/88（25.00%）。各段 WASM 解码耗时 0.52–3.60 秒；75 秒音轨在一次性输入后的整个浏览器模型处理约 18.9 秒。该批处理不能当作实时延迟或连续运行证明。

已验证的输出保留了 `Jakarta`、`Fred de Sam Lazaro` 等专名，但首段出现 `Indonesiaes's`，短段里也有 `motorbike stall` 等错词。网页探针没有扩展音频采集、侧栏、翻译、历史、跨站、资源占用或 30 分钟压力数据。正式切换前必须做递增音频的端到端实现和这些验收，且需决定临时字幕频率与最长语段的折中。
