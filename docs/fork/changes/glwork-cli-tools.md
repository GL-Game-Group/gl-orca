# GL Work 命令行工具

## 目的

GL Work 的成员用自己的订阅登录 Claude Code、Codex、Qoder（公司不代持、不读取订阅凭据）。GL Work 只负责：

- **检测**：装没装、登没登录（都用工具自己的官方命令判断，不读凭据文件）；
- **安装**：说明要执行的官方命令，成员确认后在 GL Work 的浮动终端里执行，过程可见；
- **登录**：在浮动终端里运行该工具的官方登录命令，成员在厂商自己的流程里登录；
- **停用**：已就绪的工具可以停用，新会话里不再出现（用 Orca 的 `disabledTuiAgents`）。

另外两项 GL Work 的默认：

- **代理状态钩子先关闭**：Orca 会往 `~/.claude/settings.json`、`~/.codex/config.toml` 里写入自己的钩子来显示“工作中、等待中、已完成”。公司规则要求修改其他工具的配置前先征得同意，所以 GL Work 首次启动时把 `agentStatusHooksEnabled` 设为关闭，成员在「命令行工具」页点「开启…」、看过要改的文件并确认后才打开（走 Orca 原有的开关，关闭时 Orca 会移除钩子）。
- **只启用 GL Work 的工具**：首次启动时把 Claude Code、Codex、Qwen Code、Qoder 以外的 Orca 代理设为停用，成员可以在「智能体」里自己再打开。
- **代理先问再动手**：Orca 默认让每个代理跳过所有权限确认（Claude Code `--dangerously-skip-permissions`、Codex `--dangerously-bypass-approvals-and-sandbox` 等，见 `tui-agent-permissions.ts`）。GL Work 首次启动时用 Orca 的 `applyAgentPermissionMode({ mode: 'manual' })` 改成手动：代理执行命令、改文件前先问成员；成员自己加的其他参数保留。成员可以在「智能体」里改回全部允许。

两项都只在某个数据目录第一次以 GL Work 启动时执行一次（`<userData>/glwork-first-run.json`），之后完全按成员自己的设置。

## 检测方式

| 工具 | 是否安装 | 是否登录 | 安装命令 | 登录命令 |
| --- | --- | --- | --- | --- |
| Claude Code | `claude` 在成员的 shell PATH 上 | `claude auth status` 退出码（0 已登录，1 未登录） | `curl -fsSL https://claude.ai/install.sh \| bash` | `claude auth login` |
| Codex | `codex` | `codex login status` 退出码 | `npm install -g @openai/codex` | `codex login` |
| Qoder | `qodercli` 或 `qoder` | `qodercli status -o json` 的 `logged_in` 字段（它的退出码登没登录都是 0；其余字段包括账号、邮箱直接丢弃） | `curl -fsSL https://qoder.com/install \| bash` | `qodercli login` |

退出码和 `logged_in` 都是用临时的空配置目录实测过的（Claude Code 2.1.293、Codex 0.157.1、qodercli 1.1.65；官方文档没写 qodercli 的 `status`、`login` 子命令，是 `qodercli --help` 里有的）。Qoder 的安装器装两个命令：`~/.local/bin/qodercli`，以及写进 `~/.zshrc`、`~/.zprofile` 的 `~/.qoder/entry/qoder`，所以两个名字都认，登录用一定在 PATH 上的 `qodercli`。「重新检测」会强制重新读取登录 shell 的 PATH（同 Orca「智能体」页的刷新），刚装完的工具不用重启 GL Work 就能检测到。状态命令的输出不读取、不保存。PATH 用 Orca 的 `hydrateShellPathForAgentDetection` 和 `isCommandOnPath`，和 Orca 自己的代理检测一致。

## 代码位置

### 新增文件

| 位置 | 内容 |
| --- | --- |
| `src/main/glwork/glwork-cli-tools.ts` | 三个工具的官方命令、检测 |
| `src/main/glwork/glwork-first-run.ts` | 首次启动的默认（钩子关闭、只启用 GL Work 的工具、代理权限改为手动） |
| `src/main/glwork/glwork-cli-tools.test.ts` | 检测（只跑状态命令、未安装不跑任何命令）、首次启动只执行一次、Orca 构建不受影响 |
| `src/renderer/src/components/settings/glwork/GlWorkCliTools.tsx` | 工具卡片：状态、安装（确认对话框）、登录、停用开关 |
| `src/renderer/src/components/settings/glwork/GlWorkAgentHooksConsent.tsx` | 代理状态钩子的说明和同意 |
| `src/renderer/src/components/settings/glwork/glwork-terminal-command.ts` | 在浮动终端新开标签页执行命令（复用 Orca 的快捷命令 `runQuickCommandInNewTab`，必要时打开浮动终端） |

`glwork-account-settings-section.tsx` 里新增「命令行工具」一节（id `glwork-cli-tools`），导航项由 `glWorkSettingsNavSections()` 一起给出；IPC 加 `glwork:cliTools`。

### 对官方文件的改动（同步时的冲突热点）

| 文件 | 改动 | 原因 |
| --- | --- | --- |
| `src/main/startup/main-process-ready-runtime.ts` | `initializeReadyRuntimeServices` 开头调用 `applyGlWorkFirstRunSettings(store)`，加一行 import | 在 Orca 启动时安装钩子之前写入默认 |
| `src/renderer/src/hooks/settings-navigation-capability-sections.ts` | 已有的 GL 接入点改为 `glWorkSettingsNavSections()`（返回公司账号和命令行工具两项） | 导航 |
| `src/renderer/src/i18n/locales/*.json` | `glwork.cli.*`、`glwork.hooks.*` | 界面文案 |

## 已知限制

- Qoder 作为 Orca 代理是基础级别（能新建会话、带初始提示、停用），没有状态钩子和会话恢复，见 [qoder-agent.md](./qoder-agent.md)。卡片的停用开关对 Qoder 也生效（`agent: 'qoder'`）。
- `glwork-cli-tools` 不在 Orca 的设置跳转名单（`SETTINGS_NAV_TARGETS`）里：侧边导航能到达，但 `openSettingsTarget({ pane: 'glwork-cli-tools' })` 会被拒绝，要跳转请用 `pane: 'orca-account'`。
- Codex 的安装命令需要 Node.js（npm）。
- 安装、登录是否成功以终端里的输出为准；完成后点「重新检测」。

## 同步后重点检查

- `pnpm test src/main/glwork`
- 后台启动开发版（`GLWORK_BUILD=1 ORCA_BACKGROUND_LAUNCH=1 REMOTE_DEBUGGING_PORT=9333 pnpm dev`），用 CDP 打开设置的「命令行工具」：三张卡片的状态正确；新数据目录第一次启动后 `agentStatusHooksEnabled` 为 false、除 Claude Code/Codex/Qwen Code/Qoder 外都停用。
- 官方如果改了 `initializeReadyRuntimeServices` 里安装钩子的时机（比如提前到这之前），首次启动的默认要跟着提前，否则会先写入钩子。
