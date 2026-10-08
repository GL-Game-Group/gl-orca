# GL Work 手机语音（千问、火山的识别和播报）

## 目的

手机 App 原有的「设置 → 语音」里：语音模型列表加入公司开放的千问、火山语音识别；同一页新增“语音播报”，选千问或火山和对应音色。手机直接连厂商，公司服务只发令牌（千问：DashScope 临时 Key；火山：为 GL Work 单独建的新版控制台 API Key），成员的 Key 规则见 agent-work `gateway/src/voice.ts`。

## 识别

- 列表：抽屉里最上面一组“公司云端”，列出管理员开了识别、给成员分配了 Key 的厂商（`GET /agent-work/phone/voice`）；下面是电脑上的模型。选云端的存在手机上（`glwork:voice-prefs`），选电脑模型时自动改回电脑识别。
- 接入：`use-mobile-session-native-chat-dictation.ts` 里 `useGlWorkCloudDictation(options) ?? useMobileDictation(options)`，接口相同，麦克风按钮、按住说话或点按切换、识别结果填进聊天或终端输入框都沿用 Orca 的。音频来自同一个录音模块（16kHz 单声道 PCM），每 100ms 一包发给厂商；识别中的文字实时显示在会话上方（`GlWorkVoiceOverlay`）。
- 千问：`wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen3-asr-flash-realtime`，`Authorization: Bearer <临时 Key>`；`session.update`（pcm、16000、zh、server_vad）→ `input_audio_buffer.append`（base64）→ `session.finish`；`…transcription.text` 的 `text` 是已确认、`stash` 是识别中，`…completed` 是每段的结果，`session.finished` 后结束。
- 火山：`wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async`，请求头 `X-Api-Key`、`X-Api-Resource-Id`（后台配置的识别资源，如 `volc.seedasr.sauc.duration`）、`X-Api-Connect-Id`；二进制帧（`volc-asr-frames.ts`，4 字节头 + 序号 + 长度 + 负载），full client request（JSON，`result_type: full`）→ 音频包 → 最后一包带结束标记和负序号；服务端带结束标记的结果是最终文本。

## 播报

- 设置：自动朗读回复（默认关）、播报厂商、音色（点 ▶ 用官方试听音频，没有的现场合成一句）、语速（只有火山）。
- 时机：聊天视图里代理一轮结束（`nativeChatAgentWorking` 由真变假）读最后一条回复；消息长按菜单里的“朗读”；开始说话时停止；朗读时顶部有“正在朗读 · 点这里停止”。
- 文本（`glwork-speech-text.ts`）：代码块读成“（代码略）”，去掉 Markdown 记号和链接地址，超过 600 字在句末截断并提示看屏幕；按句子分段请求。
- 千问：`POST …/api/v1/services/aigc/multimodal-generation/generation`（`qwen3-tts-flash` 等，`input.text/voice/language_type`），返回 `output.audio.url`（24kHz wav），直接播放这个地址。
- 火山：`POST https://openspeech.bytedance.com/api/v3/tts/unidirectional`（`x-api-key`、`x-api-resource-id` 为合成模型），返回逐行 JSON 的 base64 mp3，拼起来写到缓存文件再播放（和公司服务后台试听同一个接口）。
- 播放用新增的 `expo-audio`（Expo 官方模块）。

## 原生模块按需加载

厂商客户端、播放器、公司登录要用原生模块（`expo-audio`、`expo-crypto`、钥匙串）。Orca 的组件只引入 `glwork-voice-lazy.ts`、`glwork-speech-state.ts` 这类不依赖原生模块的文件，用到时再 `import()`，所以 Orca 的组件和测试不会因此加载原生模块。

## 代码位置

新文件都在 `mobile/src/eva/glwork/voice/`。对官方文件的改动：

| 文件 | 改动 |
| --- | --- |
| `mobile/src/session/use-mobile-session-native-chat-dictation.ts` | 选了云端时用 `useGlWorkCloudDictation` |
| `mobile/src/session/MobileSessionActiveContent.tsx` | 挂 `GlWorkVoiceOverlay`（实时文字、停止朗读、自动朗读） |
| `mobile/src/session/MobileNativeChatMessageActionsSheet.tsx` | 长按菜单加“朗读” |
| `mobile/src/settings/voice-settings-screen.tsx` | 抽屉里加 `GlWorkCloudAsrList`、页面加 `GlWorkSpeechSettings`；GL Work 版模型行不受“启用电脑听写”开关限制；选电脑模型时清掉云端选择 |
| `mobile/package.json`、`mobile/pnpm-lock.yaml` | 新增 `expo-audio` |

## 测试

`(cd mobile && pnpm exec vitest run src/eva)`：火山帧的编码和解析（结果、最后一包、错误帧）、UTF-8 和 base64、PCM 分包、播报文本处理、千问识别客户端（模拟 WebSocket：会话设置、音频、已确认和识别中的文字拼接、结束）。

## 已知限制

- 2026-10-08 写完时还没有对真实厂商跑过：千问临时 Key 能否用于实时识别和合成、火山 API Key 能否用于流式识别，要在真机上用后台配好的 Key 验证。
- 终端视图不播报；识别语言固定中文。
