# Qoder 代理（已撤回，改用官方实现）

我们曾自己把 Qoder 加进 Orca 的代理目录（基础级别：检测、带提示启动、图标、停用、手机端列表）。官方随后自己做了更完整的支持：

- `feat: add first-class Qoder CLI support (#23581)`：检测（`qodercli`，别名 `qoder`）、启动、状态钩子（`~/.qoder/settings.json`）、会话恢复、预检信任；
- #24616：Qoder 中国版（`qoder-cn`，`qoderclicn`）。

2026-10-08 和官方 main（a551aa5）同步时，按 README“官方已经实现了类似功能，优先改用官方实现”的原则撤回了我们的实现（提交 11a640b855），只保留 GL Work 的接入：

| 文件 | 内容 |
| --- | --- |
| `src/main/glwork/glwork-cli-tools.ts` | Qoder 卡片（`agent: 'qoder'`），检测、安装、登录命令见 [glwork-cli-tools.md](./glwork-cli-tools.md) |
| `src/main/glwork/glwork-first-run.ts` | `GLWORK_AGENTS` 含 `qoder`：新数据目录首次启动时不停用 Qoder |

官方的状态钩子会写 `~/.qoder/settings.json`，所以「命令行工具」页的钩子同意对话框也列出了这个文件。

## 同步后重点检查

- 官方如果改了 Qoder 的 id（`qoder`）或检测命令，`glwork-cli-tools.ts` 和 `GLWORK_AGENTS` 跟着改。
