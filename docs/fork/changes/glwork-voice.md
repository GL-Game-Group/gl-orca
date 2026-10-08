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

只有一处 `import()`，即 `glwork-voice-runtime.ts`，所以 GL Work 语音只多出一个分包。手机网页版（桌面端提供的 `out/mobile-web`）解析到 `glwork-voice-runtime.web.ts` 这个替身：它不加载厂商客户端，直接报“网页版不支持”。原因是 `verify-mobile-web-app-bundle` 按路由数和图片数限制资源总数（预算 128），之前多出的分包让桌面端打包失败。同步官方后如果又超出预算，先检查是否有新的 `import()` 或被多处共用的 GL Work 模块被切成了单独的分包。

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

## 播报的两个坑（2026-10-08 真机上发现）

- 千问合成返回的音频地址是 `http://`（阿里云 OSS），手机 App 只允许访问本地网络的 http 地址，iOS 会直接拦掉，表现为没有声音、也不报错。现在先把地址改成 https 下载到缓存，再播放本地文件；试听的样音地址也同样改成 https。`pnpm voice:test` 能播出来，是因为它在电脑上的测试服务里下载音频，不受这个限制。
- 播放没有开始时原来会一直显示“正在朗读”。现在 20 秒内没开始就报错；试听、自动朗读、长按“朗读”出错都会弹出“无法朗读”和原因（`glwork-speech-alert.ts`）。播放前把音频会话设为只播放（`allowsRecording: false`），免得刚识别完时声音走听筒。

## 默认音色和对话页的“语音”（2026-10-08）

- 播报默认用第一个开放了播报的厂商和它的第一个音色（`glwork-speech-choice.ts`）。设置页显示的选中项和实际朗读用的是同一套规则。原来必须先点选厂商才会出现音色列表，没选时自动朗读也不会播报。
- 厂商没有可用音色时，设置页和朗读都会提示“请管理员在后台「AI 管理 → 语音」把音色加入音色库”：公司服务只下发已加入音色库、并且适用于当前播报模型的音色。
- 对话页右上角的“…”在 GL Work 里一直显示，里面多一项“语音”，点开是简易设置：识别用电脑上的模型还是千问、火山，以及播报设置（`GlWorkVoiceQuickSheet.tsx`）。「设置 → 语音」保留不变。接入点：
  - `MobileSessionHeaderMoreActionsSheet.tsx`：加入 `glWorkVoiceSheetActions()`。
  - `use-mobile-session-panel-route-actions.tsx`：`showHeaderMoreButton` 加上 `glWorkShowsHeaderMoreButton()`。
  - `MobileSessionSheets.tsx`：渲染 `<GlWorkVoiceQuickSheet />`。

## 识别过之后播报报 OSStatus 561017449（2026-10-08 真机）

语音识别用的 `expo-two-way-audio` 初始化后会一直开着带语音处理的录音引擎，音频会话处于 `playAndRecord`/`voiceChat`（默认从扬声器出声）。这时再用 `setAudioModeAsync` 切到只播放，iOS 会拒绝（`'!pri'`，OSStatus 561017449）。现在切换失败就留在原来的会话里直接播放，不再中断朗读。

## 播报一次后语音输入失效（2026-10-08 真机）

`expo-two-way-audio` 只在建立引擎时设置一次音频会话，之后每次录音的 `initialize()` 发现引擎已经存在就直接返回。播报把会话切成只播放后，引擎还按原样复用，麦克风就收不到声音了。现在开始播报前，如果引擎存在但没在录音，先 `tearDown()` 释放；下次录音时 `initialize()` 会重新建立引擎和会话。正在录音时不释放（播报会因为切换不了模式而在原会话里播放，见上一节）。

## 语音模式（按住说话，2026-10-09）

在对话页右上角「… → 语音 → 输入方式」切换键盘或语音，选择存在手机上（`inputMode`，默认键盘）。键盘模式就是 Orca 原来的输入框。

- 语音模式下，输入栏左边是添加图片，中间是“按住 说话”，右边是模型选择（`GlWorkVoiceBar.tsx`）。
- 按住时，上方卡片实时显示识别文字：
  - 松开：发送；
  - 左滑超过屏幕宽度的 18%（至少 56 点）：取消；
  - 右滑：把文字放进 Orca 的输入框，弹出键盘编辑，发送成功后回到语音模式（`GlWorkVoiceComposer.tsx`）。
- 按住不到 0.5 秒算误触，不发送。已有草稿时，识别的文字接在草稿后面一起发送。
- 判断规则写成纯函数：`glwork-hold-to-talk-gesture.ts`，带测试。
- 识别用「设置 → 语音」选的云端厂商；没选，或者选的是“电脑上的模型”时，用第一个开放的云端厂商。电脑识别要等说完才出字，没法实时显示（`use-glwork-hold-to-talk.ts`）。每次按住是独立的一轮，一按就松时，会取消还在连接的识别，不会让麦克风一直开着。
- 手势用 React Native 自带的 `PanResponder`：输入栏不在手势库的根容器里，而且它的回调就在 JS 线程上。
- 接入点：`MobileNativeChatView.tsx` 里把 `MobileNativeChatComposer` 换成 `GlWorkChatComposer`（属性完全相同，改一行 import 和一个标签名）。
  - 语音模式的组件按需加载（`lazy`）。键盘模式、官方 Orca 和对话视图的测试都不会加载麦克风、振动这些原生模块。
  - 手机网页版用 `GlWorkChatComposer.web.tsx`，直接用 Orca 的输入框（网页版没有语音；也不能多出分包，否则超出资源数上限）。
