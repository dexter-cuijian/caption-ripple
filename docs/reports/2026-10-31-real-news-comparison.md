# 真实英语新闻识别对比 · 2026-10-31

## 素材与口径

- 视频：PBS NewsHour 官方 YouTube [Jakarta rapidly sinks as climate change and overdevelopment collide](https://www.youtube.com/watch?v=50r53mqXMg0)。独立参考：[PBS 官方文字稿](https://www.pbs.org/newshour/show/jakarta-rapidly-sinks-as-climate-change-and-overdevelopment-collide)。
- 只计算从开头 `Across the U.S.` 到 `holding back the tide` 的 88 个参考词。使用仓库 `scripts/metrics.mjs` 的 NFKC、转小写、按词切分和 Levenshtein 编辑距离；标点不计。此片段包含地名与记者人名。
- 当前扩展：从全新安装的候选 ZIP，在 Chrome 中静音外放、浏览器 WASM、100 ms 标签页音频包实际播放；取前三条已定稿历史。视频与参考逐句核对后截在相同词句边界。未定稿文字不计。
- 对照模型：从同一公开 YouTube 视频下载的音轨提取开头 75 秒、16 kHz 单声道 PCM。whisper.cpp `482279b8a18855ba741d7b88c30fcb3874691f59`、Apple M1 Metal、4 线程、英语转录、默认 5 beam；按相同语句边界截断输出。音频、模型、完整转录仅保留在忽略的 `.work/` 和 `/private/tmp/`，不进入发布包。

| 引擎与运行方式 | 88 词中的编辑错误 | WER | 75 秒本机离线总耗时 |
| --- | ---: | ---: | ---: |
| 当前 Zipformer，真实 Chrome 流式 | 22 | 25.00% | 实时播放，未作离线计时 |
| whisper.cpp `base`，本机 Metal 整段 | 6 | 6.82% | 3.54 秒 |
| whisper.cpp `small-q5_1`，本机 Metal 整段 | 5 | 5.68% | 6.67 秒 |

当前引擎把 `Jakarta` 和 `Fred de Sam Lazaro` 等专名识错。Whisper 两档保留了这些专名，但 `seawall` / `sea wall`、`megacity` / `mega-city` 等排版差异仍被本评估按词算作错误；表中数字不是经过人为纠错的分数。

另外用仓库现有的本机流式 Paraformer 配置跑了同一 75 秒音轨，出现词重复、漏词与中英混杂。该探针未按相同的 88 词边界可靠对齐，不列 WER，也不能仅凭模型名替换浏览器默认引擎。

## 结论与限制

同一真实新闻片段显示离线 Whisper 有值得继续验证的准确率优势。Metal 本机整段速度不能推断 Chrome WASM/WebGPU 的逐字首显、内存、CPU、翻译和连续运行表现。PBS 自述文字稿经机器与人工生成并轻度编辑，可能有错；88 词单片段也不能代表所有新闻或中文。稳定版仍需浏览器原型在同一音轨上的实时测量、中文新闻参考、30 分钟资源与多站点复验。
