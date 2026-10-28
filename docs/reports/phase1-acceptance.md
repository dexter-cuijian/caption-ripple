# 阶段一：真实 Chrome 核心闭环验收

日期：2026-10-28。实际 Chrome 156，扩展 ID `goakdeepddjbhmdmodgipgoobcnknhbi`，Apple M1。本报告仅验收原文核心链路，后续翻译、质量和两小时稳定性另行验收。

## 已观察的结果

- 扩展通过开发者模式加载 `dist/extension`，配对本地 Node+sherpa 服务。音频由 Chrome 标签页捕获，经 Offscreen AudioContext 回送扬声器，同时 AudioWorklet 重采样为16kHz单声道、100ms PCM 批次。
- 上游真实人声测试视频出现实际识别原文；用户明确回复“能正常听到”。声音回送不依赖 WebSocket 是否在线。
- 公开中文新闻直播 `https://www.youtube.com/live/vr3XyVCR4T0` 实际捕获成功，原文逐次修订。直播站点本身的画面字幕未被读取或注入作为识别文本。
- 新闻播放器进入全屏后，插件黑色半透明原文字幕仍可见。截图为 `screenshots/phase1-news-live.png`、`screenshots/phase1-news-fullscreen.png`。
- 修复前 Stop→Start 曾触发原生 NAPI 构造异常并导致整个 Node 退出134。be3adc4 将原生解码移到 OS 子进程，并复用模型处理 seek。重启服务后，实际 Chrome Stop→Start、测试音频循环及切换新闻捕获均恢复正常。原生独立探针20次启停和20次推理中重置通过；这不等于两小时稳定性验证。

## 延迟与验证边界

`phase1-news-metrics.json` 使用实际字幕 DOM animation-frame ACK，对应会话 `395c6813-8cc3-45f8-b384-8ec13216464b`。前两条语音起点到首次原文渲染为792ms、1277ms，小样本仅作为闭环证明，不作为可靠总体P95。语音起点由100ms能量窗口估计，模型不提供词级时间戳。可用 `node scripts/report-latency.mjs SESSION_ID` 重复统计保留日志。

回归测试26项后端、15项扩展全部通过。CCTV直播页在本机网络返回连接重置，未标为兼容性通过。

当前限制：连续新闻讲话或背景音乐可能让500ms静音断句过少，出现过长的临时原文；识别有同音字和人名错误。阶段二实现定稿翻译与侧栏历史；阶段三必须改善断句、测量新闻准确率，并完成多站点及长时运行验收。

结论：阶段一核心捕获、声音回送、流式原文、全屏与测量链路已验证，可进入阶段二。整项目尚未完成验收。
