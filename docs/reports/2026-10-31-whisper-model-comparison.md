# CaptionRipple 低错字率模型对照 · 2026-10-31

## 目的与方法

参考 [whisper.cpp](https://github.com/ggml-org/whisper.cpp) 的本机离线识别实现，与现有扩展的 Sherpa-ONNX WASM 双语流式模型对照。固定同一批 FLEURS validation 音频：英语 40 段、339.86 秒、811 个参考词；普通话 28 段、330.42 秒、930 个参考字符。Whisper 每段单独解码，但在一次 CLI 进程中顺序执行。英文用项目 `scripts/metrics.mjs` 的词错率计算；中文先用 OpenCC `t2s` 统一繁简，再按相同的 NFKC、大小写、标点和空白清理规则计算字符错率。两个 Whisper 模型都指定语言 `en` 或 `zh`，使用 4 个线程和 Apple Silicon Metal。

| 模型与模式 | 英文 WER | 中文 CER | 完成整批的本机墙钟时间 |
| --- | ---: | ---: | ---: |
| 现有浏览器双语 Zipformer，100 ms 包、目标 RMS 0.16 | 167/811，20.59% | 100/930，10.75% | 未与本轮同机计时 |
| whisper.cpp `base`，离线整段 | 50/811，6.17% | 162/930，17.42% | 英语 11.66 秒；中文 11.18 秒 |
| whisper.cpp `small-q5_1`，离线整段 | 33/811，4.07% | 90/930，9.68% | 英语 27.38 秒；中文 24.59 秒 |

上表的音频和参考集相同，但流式与离线整段推理不同，不能把数值差直接视为切换引擎后实时字幕的收益。Whisper 的整批计时包含一次模型初始化，不包含扩展集成、浏览器 WASM/WebGPU、逐字更新、实时翻译或多站点开销。FLEURS 是朗读语音，不代表新闻直播、用户视频、专名和背景音乐。普通话的简繁归一化只用于评估，不改产品输出。

## 模型与可复核材料

- whisper.cpp 源码提交：`482279b8a18855ba741d7b88c30fcb3874691f59`；用临时目录构建，未修改项目依赖。
- `ggml-base.bin`：141 MiB，SHA-256 `60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe`。
- `ggml-small-q5_1.bin`：181 MiB，SHA-256 `ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb`。
- 逐条输出保存在忽略的 `.work/whisper-base-fleurs.json`、`.work/whisper-small-q5-en.json`、`.work/whisper-small-q5-zh.json`；用户音频和模型不进入公开仓库。

## 决策与后续验收

`base` 中文退步明显，不作为替代。`small-q5_1` 在该数据集两种语言上有改善，值得做独立浏览器原型；目前保持原有默认模型。原型必须验证模型首次载入、Chrome 内逐字首显/最终段延迟、30 分钟 CPU/内存与音频回送，并与现有浏览器模型用同一真实新闻样本和人工参考文本比较。只有准确率、延迟、资源占用与许可都达到门槛，才考虑切换默认引擎或发布稳定版。

上游 [stream.wasm 示例](https://github.com/ggml-org/whisper.cpp/tree/master/examples/stream.wasm)的当前构建设置使用 1 GiB 初始/总 WASM 内存和 8 个 pthread worker；它是浏览器实时原型的参考，不能据本机 Metal 速度推断扩展内的延迟或内存。还需独立验证 MV3 扩展中的跨来源隔离、线程和模型加载方式。
