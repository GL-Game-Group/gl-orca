# Qoder 代理（基础级别）

## 目的

GL Work 让成员用自己的订阅登录 Qoder（见 [glwork-cli-tools.md](./glwork-cli-tools.md)），但之前 Orca 不认识 Qoder：不能在代理选择器里选它新建会话，也没有停用开关。这次把 Qoder 加进 Orca 的代理目录，级别和 Rovo Dev、Kimi、Qwen Code 一样，只做“认识、启动、显示、停用”。

改动本身是通用的（不依赖 GL Work），第一个提交可以原样作为 PR 提给官方；GL Work 的接入单独一个提交。

## Qoder 在 Orca 里

| 能做 | 说明 |
| --- | --- |
| 检测 | PATH 上有 `qodercli`，或者安装器的 `qoder` 分发脚本（`~/.qoder/entry/qoder`，无参数时 `exec qodercli`）。npm 包 `@qoder-ai/qodercli` 同样装这两个命令 |
| 新建会话 | 选择器、新建工作区里选 Qoder；启动命令固定是 `qodercli`（`qoder` 带某些参数会转去打开 Qoder IDE） |
| 初始提示 | `qodercli --prompt-interactive '<提示>'`（`-i`，执行提示后保持交互）。不用位置参数：qodercli 用 Commander 解析，一个词的提示如 `login`、`update`、`commit` 会被当成子命令执行，`--` 也挡不住（1.1.65 上用 `qodercli -- hooks` 实测，打印的是 hooks 子命令的帮助） |
| 权限 | 和其他代理一样，默认参数是跳过权限确认的 `--dangerously-skip-permissions`；在 Settings → Agents 改成手动后不带 |
| 前台进程识别 | macOS 上 `~/.local/bin/qodercli` 是指向 `~/.qoder/bin/qodercli/qodercli-<版本>` 的符号链接，内核报告的进程名是 `qodercli-1.1.65`（`ps -o ucomm` 实测），所以按 `qodercli-<数字>` 前缀识别；npm 安装在 Windows 上以 `node …/@qoder-ai/qodercli/bundle/qodercli.js` 运行，也按包路径识别 |
| 图标、名称 | `src/shared/agent-icons/qoder.png`（64×64，来自 `https://www.google.com/s2/favicons?domain=qoder.com&sz=64`，与 qoder.com 的 apple-touch-icon 同一图案）；显示名 `Qoder`，6 种语言的目录里都是 `Qoder` |
| 停用 | Settings → Agents 的开关；GL Work「命令行工具」卡片的停用开关也对 Qoder 生效 |
| 手机端 | 和其他基础代理一样出现在代理列表里，带图标 |

| 不做 | 原因 |
| --- | --- |
| 状态钩子（工作中、等待中） | 基础级别；qodercli 有 `hooks` 子命令，以后可以单独接 |
| 会话恢复、AI Vault 会话解析、提交信息生成 | 同上 |
| skills CLI 的 `--agent` 键 | skills CLI 分 `qoder` 和 `qoder-cn`，两个版本的命令都叫 `qodercli`，分不清就按该文件的规则写 `null` |
| 草稿粘贴的就绪信号 | 提示走启动参数，不需要 |

## 代码位置

### 新增文件

| 位置 | 内容 |
| --- | --- |
| `src/shared/agent-icons/qoder.png` | 图标（桌面端和手机端共用） |
| `src/shared/qoder-agent.test.ts` | 检测命令和别名、显示名、遥测类型、自动选择顺序、启动命令（`say hi`）、进程识别 |

### 对官方文件的改动（同步时的冲突热点）

每个文件都是按代理逐一列举的表，加一行 `qoder`：

| 文件 | 改动 | 原因 |
| --- | --- | --- |
| `src/shared/tui-agent.ts` | `TuiAgent` 加 `'qoder'` | 代理 id |
| `src/shared/tui-agent-config.ts` | `qoder`：`detectCmd: 'qodercli'`、别名 `qoder`、`flag-prompt-interactive` | 检测和启动 |
| `src/shared/agent-process-recognition.ts` | `qodercli-<数字>` 前缀（`agentForNormalizedProcess`、`isExpectedAgentProcess`）；`NODE_PACKAGE_SCRIPT_ENTRYPOINTS` 加 npm 包路径 | 前台进程识别 |
| `src/shared/tui-agent-display-names.ts` | `qoder: 'Qoder'` | 显示名（手机端也用） |
| `src/shared/tui-agent-selection.ts` | 自动选择顺序，放在 `rovo` 后 | 和桌面目录顺序一致 |
| `src/shared/tui-agent-permissions.ts` | `qoder: '--dangerously-skip-permissions'` | 权限开关 |
| `src/shared/agent-kind.ts`、`src/shared/telemetry-property-schemas.ts` | `qoder` | 遥测类型（测试要求两边一致） |
| `src/shared/skills-cli-agent-keys.ts` | `qoder: null` | `Record<TuiAgent, …>` 要求 |
| `src/renderer/src/lib/agent-catalog.tsx` | 目录条目，`rovo` 后 | 选择器、设置页 |
| `src/renderer/src/lib/agent-favicon-assets.ts`、`src/renderer/src/lib/agent-status.ts` | 图标、可显示图标的代理 | 桌面端图标 |
| `mobile/src/components/mobile-agent-icon-assets.ts`、`mobile/src/tasks/mobile-tui-agents.ts` | 图标、图标域名 | 手机端 |
| `src/renderer/src/i18n/locales/*.json` | `auto.lib.agent.catalog.c633d4dd92` = `Qoder` | 目录名称的翻译键 |
| `README.md` | 支持的代理列表加 Qoder 徽章 | 官方加代理时的惯例 |

GL Work 的接入（第二个提交，不提给官方）：

| 文件 | 改动 |
| --- | --- |
| `src/main/glwork/glwork-cli-tools.ts`、`src/shared/glwork-account-types.ts` | Qoder 卡片 `agent: 'qoder'`，类型放宽 |
| `src/main/glwork/glwork-first-run.ts` | `GLWORK_AGENTS` 加 `qoder`：新数据目录首次启动时不停用 Qoder |
| `src/renderer/src/components/settings/glwork/GlWorkCliTools.tsx` | `setEnabled` 的参数类型改为 `TuiAgent` |

## 测试

```bash
pnpm test src/shared/qoder-agent.test.ts src/shared/tui-agent src/shared/agent-kind src/shared/agent-process-recognition src/shared/skills-cli-agent-keys src/main/glwork
(cd mobile && pnpm typecheck && pnpm test src/tasks src/components)
```

新建工作区、提示 `say hi` 时生成的命令（`qoder-agent.test.ts` 里固定）：

```
qodercli '--dangerously-skip-permissions' --prompt-interactive 'say hi'
```

## 已知限制

- 没有在打包好的应用里实际启动过 Qoder 会话（提示会真的发给 Qoder 的模型）；`--prompt-interactive` 是否保持交互以 `qodercli --help` 的说明为准。
- 检测认 `qoder` 别名：如果某台电脑只有 Qoder IDE 装的同名 shell 命令、没有 `qodercli`，Orca 会显示 Qoder 已安装，但启动 `qodercli` 会失败。
- Linux 上的进程名、Windows 安装器装出的可执行文件名没有实测（Linux 内核按执行时的路径取名，应是 `qodercli`；`.exe` 后缀会被去掉）。

## 同步后重点检查

- `pnpm tc`：官方新增按代理列举的 `Record<TuiAgent, …>` 时会在这里报缺 `qoder`，补一行即可（基础代理一般填 `null`、`false` 或不填）。
- 官方如果自己加了 Qoder：改用官方的条目，删掉这里的改动和 `qoder-agent.test.ts` 里重复的部分，更新本记录。
- 升级 qodercli 后用 `ps -o ucomm= -p <pid>` 看一下进程名是否仍是 `qodercli-<版本>`；用 `qodercli -- hooks` 看 `--` 后的子命令是否仍被执行（不再执行的话可以改回位置参数）。
