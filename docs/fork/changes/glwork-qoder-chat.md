# Qoder 对话视图

分支：`my/glwork-qoder-chat`

## 做什么

Qoder CLI 和 Qoder 中国版的标签页可以像 Claude 一样切到对话视图，手机上也能显示对话，不再只能看终端。

## 为什么能这样做

对话视图叠在终端界面上，靠读取代理写在本机的会话记录来显示，不需要代理有专门的结构化模式。Qoder 的会话记录就是 Claude Code 的格式：`user`/`assistant` 记录、`message.content`、`parentUuid`，目录结构也一样（`~/.qoder/projects/<目录>/<会话>.jsonl`、`~/.qoder-cn/projects/…`）。另外它多了几种自己的记录（`active-leaf`、`runtime-config`、`workspace-directories`、`last-prompt`），Claude 的解析器会跳过这些不认识的类型。

Qoder 的代理状态钩子本来就会带上 `session_id` 和 `transcript_path`（`src/shared/agent-session-resume.ts`），对话视图直接读这个路径。

2026-10-08 用本机一份真实的 Qoder 中国版会话记录验证过：Claude 解析器读出 31 条用户提问、1267 条回复、530 条工具调用。

## 改动

- `src/shared/qoder-native-chat.ts`（新）：Qoder 的两种版本，以及各自的主目录名。
- `src/main/native-chat/qoder-projects-dir.ts`（新）：钩子没有报告路径时，按会话 id 去 Qoder 自己的 `projects/` 里找，不去 `~/.claude/projects` 找。
- 接入点：
  - `src/shared/native-chat-agent-support.ts`：把 Qoder 加进支持对话视图的代理列表，`resolveNativeChatTranscriptAgent` 把它映射到 `'claude'`。
  - `src/main/native-chat/session-file-resolver.ts`：按 id 查找前先套用 `withQoderProjectsDir`。
- 测试：`src/main/native-chat/qoder-native-chat.test.ts`。

## 不做什么

- Claude 专用的结构化会话、模型和选项菜单仍然只给 Claude：那些地方判断的是 `agent === 'claude'`，不是解析器类型。
- 远程（SSH）主机上的 Qoder 会话只在钩子报告了路径时可读；按 id 查找时，用的是运行 Orca 的那台机器的主目录。

## 同步后重点检查

- 官方如果自己支持了 Qoder 的对话视图，就改用官方实现，删掉这两个新文件和接入点。
- `pnpm test src/main/native-chat/qoder-native-chat.test.ts`
- Qoder 升级后如果改了会话记录格式，对话视图会变空或缺消息。这时用一份新的会话记录重新确认。
- Qoder 的提问选择框（`shouldStepNativeChatAskAnswer`）和权限确认键（`'1'`）沿用 Claude 的按键规则。Qoder 的终端界面如果改了，要在桌面端实际点一次提问和权限确认。
