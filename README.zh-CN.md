# CaptionRipple

Real-time captions and translation for Chrome, with on-device speech recognition.

[English](README.md) · [简体中文](README.zh-CN.md)

开发预览：Chrome Manifest V3 扩展，默认在浏览器内使用 Sherpa-ONNX WebAssembly 识别语音，无需另启服务。音频来自标签页，不使用麦克风；捕获后通过 Offscreen AudioContext 回送声音。主要运行环境：Apple Silicon Mac，Chrome 116+，Node 22+。

## 安装和运行

直接安装：从 [GitHub Releases](https://github.com/dexter-cuijian/caption-ripple/releases) 下载 `CaptionRipple-extension-0.1.0-preview-clean.zip`，解压后在 `chrome://extensions` 启用开发者模式，点“加载已解压的扩展程序”，选择解压得到的 `extension` 文件夹。无需安装 Node 或启动本地服务。首次启动需要等待内置模型载入内存。这个预览 ZIP 是旧构建，不包含仓库最新的显示与播放同步修复；稳定版安装包仍在验收中。

从源码构建：

```sh
npm ci
npm run setup:browser-model
npm run build
```

首次下载约 180 MB 的扩展压缩包，从中提取约 199 MB 的模型；版本和 SHA-256 校验见 `browser-model.lock.json`。模型打入 `dist/extension`，安装后语音识别在浏览器内运行。模型文件不提交到 Git；下载地址只提供静态安装文件，不接收用户音频。

**SenseVoice 实验候选：**运行 `npm run setup:sensevoice-model && npm run build:sensevoice`，再到侧栏设置选择“SenseVoice 候选”。此构建同时包含默认 Zipformer 和约 239 MB 的 SenseVoiceSmall 模型。离线参考集表现较好，但真实 Chrome 采集延迟、翻译质量、多站点兼容和长时间稳定性尚未通过发布门槛。模型使用单独的 FunASR 许可，详见 `sensevoice-model.lock.json` 和 `THIRD_PARTY.md`。

打开 `chrome://extensions`，启用开发者模式，选择“加载已解压的扩展程序”，选取本项目的 `dist/extension`。在有声音的普通网页上点击扩展图标，再从侧栏点击开始。浏览器模式不需要配对码。首次启动需要等待模型载入内存。

Node 伴侣只作为性能与质量对照：`npm run setup:model && npm start`，然后在侧栏设置里切换到“Node 本地伴侣”并输入 `.runtime/token`。服务仅监听 `127.0.0.1:9876`，配对码只保存在 `chrome.storage.local`。

必须通过用户操作启动 `tabCapture`。首次启动需等待模型完成加载。未就绪、捕获失败或后端断开时界面会给出错误，不能据此认为字幕已正常工作。

## 技术与已知边界

- Offscreen 中一条音频支路连接 `AudioContext.destination`，另一条经过 AudioWorklet 重采样，输出16kHz单声道PCM。重连时保持音频回放，不重复播放旧音频。
- 默认浏览器解码器使用双语流式 Zipformer；可选 Node 伴侣使用 `streaming-paraformer-bilingual-zh-en`。两者都支持中英文，目前浏览器模式的长句分段、标点和专有名词准确率仍需优化。它们不提供词级时间戳；日志中的片段时间使用采集时钟估算。
- 在播放器容器全屏时重挂字幕；如果网站直接让原生 `<video>` 进入只显示视频画面的系统层全屏，网页DOM有平台限制，需要插件提供的带字幕全屏入口。
- 跨域iframe需要用户授权对应站点。受保护页面、浏览器内部页面或受限媒体会明确提示，不能绕过DRM。
- 声音回送、全屏字幕、长时队列和内存都必须通过真实浏览器测试；自动化测试不替代这些验收。

## 开发与验收

```sh
npm test
npm run test:extension
npm run build
```

单次连续 30 分钟采集验收已完成，但不能据此认定识别准确率或多站点兼容性达标。稳定版仍需改善真实视频的识别与翻译、完成多站点和播放状态复验，并检查资源占用、安装包、许可、隐私与公开下载。GitHub 当前只有预览版，尚未发布稳定版。

侧栏可选择本地 `.srt` 或 `.vtt` 文件，字幕跟随当前 HTML5 视频的播放时间显示，已显示的字幕进入本页历史。导入文件最多 4 MB、20,000 条；切换页面或视频后需重新导入。浏览器内语音识别的质量、长时间稳定性和不同网站兼容性仍在真实 Chrome 中验证。

## 数据与许可

默认音频不离开本机，不保存录音；运行诊断不记录配对码。开启外部服务时会明确说明上传数据与目的。

识别引擎、模型来源与文件哈希见 `browser-model.lock.json`、`sensevoice-model.lock.json`、`models.lock.json` 和 `THIRD_PARTY.md`。项目源码采用 MIT 许可，第三方 WASM 代码和模型使用各自许可。此项目未发布至扩展商店。
