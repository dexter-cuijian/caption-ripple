# Live Caption Translator · 新闻实时字幕

Chrome Manifest V3 扩展 + Node.js/sherpa-onnx 本地伴侣程序。音频来自标签页，不使用麦克风；捕获后通过 Offscreen AudioContext 回送声音。主要运行环境：Apple Silicon Mac，Chrome 116+，Node 22+。

## 安装和运行

```sh
npm ci
npm run setup:model
npm run build
npm start
```

首次模型下载约226MiB，仅下载 int8 encoder、decoder 和词表，并校验固定版本文件哈希。所有识别均在本机，模型位于 `.models/paraformer`。服务仅监听 `127.0.0.1:9876`。

打开 `chrome://extensions`，启用开发者模式，选择“加载已解压的扩展程序”，选取本项目的 `dist/extension`。插件弹窗输入 `.runtime/token` 中的配对码（不要公开），在有声音的普通网页上点击开始。配对码只保存在 `chrome.storage.local`。

必须通过用户操作启动 `tabCapture`。首次启动需等待模型完成加载。未就绪、捕获失败或后端断开时界面会给出错误，不能据此认为字幕已正常工作。

## 技术与已知边界

- Offscreen 中一条音频支路连接 `AudioContext.destination`，另一条经过 AudioWorklet 重采样，输出16kHz单声道PCM。重连时保持音频回放，不重复播放旧音频。
- 主解码器使用 `streaming-paraformer-bilingual-zh-en`，支持中英文。它不提供词级时间戳；日志中的片段时间使用采集时钟估算，首字延迟使用语音起点和页面渲染回执测量。
- 在播放器容器全屏时重挂字幕；如果网站直接让原生 `<video>` 进入只显示视频画面的系统层全屏，网页DOM有平台限制，需要插件提供的带字幕全屏入口。
- 跨域iframe需要用户授权对应站点。受保护页面、浏览器内部页面或受限媒体会明确提示，不能绕过DRM。
- 声音回送、全屏字幕、长时队列和内存都必须通过真实浏览器测试；自动化测试不替代这些验收。

## 开发与验收

```sh
npm test
npm run test:extension
npm run build
```

当前分阶段实施：阶段一原文字幕；阶段二final整句翻译与双语；阶段三新闻站点与两小时稳定性；阶段四离线翻译、流式译文、历史导出与体验增强。每阶段先在真实Chrome验收再推进。验收证据和限制记录在 `docs/reports/`，不能将尚未运行的检查视为通过。

## 数据与许可

默认音频不离开本机，不保存录音；运行诊断不记录配对码。开启外部服务时会明确说明上传数据与目的。

识别引擎、模型来源与文件哈希见 `models.lock.json` 和 `THIRD_PARTY.md`。此项目未发布至扩展商店。
