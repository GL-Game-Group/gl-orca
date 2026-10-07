# GL-Game-Group/gl-orca fork 维护说明

本仓库 fork 自 [stablyai/orca](https://github.com/stablyai/orca)。这份文档记录 fork 的分支约定、同步官方更新的步骤，以及每项自研改动的上下文，方便以后合并官方更新时快速判断冲突、补测试。

**规则：每新增或修改一项自研功能，都要同步更新 `changes/` 下对应的记录。**

## 远端与分支

| 远端 | 地址 | 用途 |
| --- | --- | --- |
| `origin` | `git@github.com:GL-Game-Group/gl-orca.git` | 我们的 fork，日常推送 |
| `upstream` | `git@github.com:stablyai/orca.git` | 官方仓库，只拉取 `main`，推送已禁用 |

| 分支 | 规则 |
| --- | --- |
| `main` | 与 `upstream/main` 保持一致，**不直接提交** |
| `my/main` | 我们的发布分支 = 官方代码 + 全部自研改动 |
| `my/<feature>` | 单个功能分支，完成后合入 `my/main` |

新克隆仓库后的一次性设置：

```bash
git remote add upstream git@github.com:stablyai/orca.git
git remote set-url --push upstream no_push
git config remote.upstream.fetch "+refs/heads/main:refs/remotes/upstream/main"
git config rerere.enabled true   # 记住解决过的冲突，下次自动复用
```

## 同步官方更新

官方更新很频繁，建议**每周同步一次**，积压越久冲突越难处理。

```bash
git fetch upstream
git switch main && git merge --ff-only upstream/main && git push origin main

git switch my/main
git tag sync-before-$(date +%Y%m%d)      # 出问题时可以回退
git merge main                            # 统一用 merge，不用 rebase，避免改写已推送的历史
```

### 解决冲突

1. 看冲突文件是否在 [自研改动清单](#自研改动清单) 的“接入点”里。在的话，先读对应的 `changes/*.md`，了解当初为什么这么改。
2. 原则：**保留官方的新逻辑，把我们的接入点重新挂上去**，不要为了省事回退官方的改动。
3. 官方如果已经实现了类似功能，优先改用官方实现，然后删掉我们的对应代码，并更新记录。

### 同步后的检查

```bash
pnpm install && (cd mobile && pnpm install)
pnpm tc                                   # 主进程 / CLI / 网页端类型检查
pnpm run check:code-quality:changed       # 改动质量检查（样式规范、类型断言、lint）
pnpm test <各功能记录里列出的测试>       # 官方改用 Bun 跑 Vitest；没装 Bun 时用 pnpm run test:node（agent-launch-*replay、instant-tab 在 Node 下官方代码也失败）
(cd mobile && pnpm typecheck && pnpm test)
```

再按各功能记录里的“同步后重点检查”逐项确认。全部通过后执行 `git push origin my/main`。

## 开发约定（减少同步冲突）

- **新代码放新文件**。官方文件里只加最少的接入点，通常是一两行 import 或调用。
- 自研代码集中放在：
  - 服务端：`src/main/runtime/github-auth/` 这类按功能命名的新目录；GL Work 专属的放 `src/main/glwork/`
  - 手机端：`mobile/src/eva/`
  - 共用协议：`src/shared/` 下按功能命名的新文件
- 仓库规则仍然适用（见 `AGENTS.md`）：
  - 单个 `.ts` 文件不超过 300 行，不能用关闭检查的方式绕过
  - 不写类型断言
  - 界面遵守 `docs/STYLEGUIDE.md`
  - 界面文案 6 种语言都要补齐
- **不要直接运行 `pnpm format`**：它会顺带重排很多无关的官方文件。只格式化自己改的文件：`pnpm exec oxfmt --write <文件>`。
- 根目录禁止新增文件（官方 CI 规则），文档放 `docs/fork/`。`CLAUDE.md` 末尾多了一行 `@docs/fork/README.md`，让 AI 助手每次都读到这份说明；同步时如果 `CLAUDE.md` 冲突，保留这一行即可。
- 提交信息加前缀 `eva:`，方便 `git log upstream/main..my/main --grep '^eva:'` 列出全部自研提交。
- 通用的修复或优化，优先向官方提 PR。合入后就不用我们自己长期维护了。

## 自研改动清单

| 功能 | 记录 | 分支 |
| --- | --- | --- |
| GitHub 组织登录（服务端、手机端、CLI、桌面端） | [changes/github-device-login.md](./changes/github-device-login.md) | `my/github-device-login` |
| GL Work 品牌与打包（应用身份、独立数据目录、关闭 Orca 更新和云账号） | [changes/glwork-brand.md](./changes/glwork-brand.md) | `my/glwork-brand` |
| GL Work 公司账号（GitHub 登录公司服务、设备令牌、公司模型清单、命令行工具的模型来源） | [changes/glwork-account.md](./changes/glwork-account.md) | `my/glwork-account` |
| GL Work 命令行工具（Claude Code、Codex、Qoder 的检测、安装、登录、停用；代理状态钩子先征得同意） | [changes/glwork-cli-tools.md](./changes/glwork-cli-tools.md) | `my/glwork-cli-tools` |
| ~~Qoder 代理~~（已由官方 #23581 取代，2026-10-08 同步时撤回） | [changes/qoder-agent.md](./changes/qoder-agent.md) | — |
