# GL Work 公司账号

## 目的

GL Work 的成员用 GitHub 登录公司服务（`https://agent.glwork.net`，产品仓库 `GL-Game-Group/agent-work` 的 `gateway/`），拿到这台电脑的设备令牌。设备令牌是公司模型网关的 Key（每人一个、可以吊销、有限额，厂商的真实 Key 不到客户端），以后也用于手机连接这台电脑。

这一项做的是「设置 → 公司账号」：登录、退出、显示成员和分配给他的公司模型，以及每个命令行工具的“模型来源”。在 GL Work 里它替换「Orca 账号」那一节（同一个 id `orca-account`，指向 Orca 账号的链接也落到这里）；Orca 自己的构建不受影响。

## 流程

和旧版 GL Work（DeepSeek Harness）的桌面登录相同，公司服务不用改：

```
GL Work ── 在本机回环地址开一个一次性端口，生成 PKCE
        ── 浏览器打开 /agent-work/auth/desktop/start?port&code_challenge&state ──► GitHub 登录
浏览器  ◄── 公司服务 303 到 http://127.0.0.1:<port>/oauth/callback?code&state
GL Work ── 校验 state，把浏览器转到 /agent-work/auth/desktop/done（“登录成功”页）
        ── POST /agent-work/auth/desktop/token {code, code_verifier, device_name} ──► 设备令牌
```

- 设备令牌用 Orca 的加密存储（macOS 钥匙串）封装后写在 `<userData>/glwork-account.enc`，不进设置文件。
- 公司模型：`GET /agent-work/models`（设备令牌）。令牌过期或被吊销（401）时清掉本地登录，提示重新登录。
- 退出登录：先删本地文件，再请公司服务吊销令牌（离线也能退出）。
- 公司服务地址：默认 `https://agent.glwork.net`；本地开发用 `GLWORK_SERVER`，只接受 https 或本机的 http。

## 模型来源

「公司账号」页里，Claude Code 和 Qwen Code 各有一个“模型来源”：

- **我自己的订阅 / 设置**（默认）：不做任何事，工具用成员自己的登录。
- **某个公司模型**：GL Work 在本机启动这个工具的终端时，往环境变量里加上公司网关地址、设备令牌（作为 Key）和模型。
  - Claude Code（Anthropic 协议的厂商）：`ANTHROPIC_BASE_URL`、`ANTHROPIC_AUTH_TOKEN`、`ANTHROPIC_MODEL`，`ANTHROPIC_DEFAULT_{OPUS,SONNET,HAIKU}_MODEL`、`ANTHROPIC_SMALL_FAST_MODEL`、`CLAUDE_CODE_SUBAGENT_MODEL` 都设为同一个模型（否则后台和子代理会请求网关拒绝的 Anthropic 模型），`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`（不往 Anthropic 发遥测、错误报告、更新检查）。用公司模型的这次启动会跳过 Orca 的 Claude 账号处理（`applyGlWorkCompanyModel` 返回真，`ctx.claudeAuth` 为空）：否则成员选了 Orca 托管的 Claude 账号时，Orca 会清掉 `ANTHROPIC_AUTH_TOKEN` 等认证变量。
  - Qwen Code（OpenAI 兼容协议的厂商）：`OPENAI_BASE_URL`、`OPENAI_API_KEY`、`OPENAI_MODEL`。

选择保存在 `<userData>/glwork-model-sources.json`（只有厂商、模型和网关地址，没有令牌；令牌在启动时从加密存储读出）。选择时主进程按公司服务当前的模型清单核对，网关地址取自公司服务，不信任界面传来的地址。

注入只在这些条件都满足时发生：GL Work 构建、本机终端（不是 SSH 远程主机）、启动命令是 `claude` 或 `qwen`、选了公司模型、已登录。成员在普通终端里自己敲 `claude` 不受影响。

实测：用 Claude Code 2.1.293 带上这组变量运行 `claude -p`，指向一个模拟的公司网关，它只发了 1 个请求：`POST <网关>/v1/messages?beta=true`，`Authorization: Bearer <设备令牌>`，模型是所选的模型。Qwen Code 没有实测（本机没装）。

## 代码位置

### 新增文件

| 位置 | 内容 |
| --- | --- |
| `src/shared/glwork-account-types.ts` | 主进程和界面共用的状态、模型清单类型 |
| `src/main/glwork/glwork-company-client.ts` | 公司服务地址、换令牌、吊销、读取模型清单 |
| `src/main/glwork/glwork-sign-in.ts` | 本机回环回调、PKCE、打开浏览器、超时和取消 |
| `src/main/glwork/glwork-account-store.ts` | 加密保存和读取登录 |
| `src/main/glwork/glwork-account-ipc.ts` | IPC：`glwork:isBuildSync`（同步，设置导航要用）、`status`、`signIn`、`cancelSignIn`、`signOut`、`models` |
| `src/main/glwork/glwork-sign-in.test.ts` | 登录往返（模拟公司服务和浏览器）、state 校验、取消、非成员、模型清单、服务器地址 |
| `src/preload/api/glwork-bridge.ts` | `window.api.glwork` |
| `src/renderer/src/components/settings/glwork/GlWorkAccountPane.tsx` | 设置页内容 |
| `src/renderer/src/components/settings/glwork/glwork-account-settings-section.tsx` | `isGlWorkClient()`、导航项、设置节 |
| `src/renderer/src/components/settings/glwork/GlWorkModelSources.tsx` | “模型来源”选择 |
| `src/main/glwork/glwork-model-sources.ts` | 选择的保存、识别启动的是哪个工具、要注入的环境变量 |
| `src/main/glwork/glwork-model-sources.test.ts` | 识别命令、注入内容、远程主机和 Orca 构建不注入、未登录不注入 |

### 对官方文件的改动（同步时的冲突热点）

| 文件 | 改动 | 原因 |
| --- | --- | --- |
| `src/main/startup/main-process-ipc-bootstrap.ts` | 调用 `registerGlWorkAccountIpcHandlers()`，一行 | 注册 IPC |
| `src/preload/index.ts` | `api` 加 `glwork: glworkApi` | 暴露给界面 |
| `src/preload/api-types.ts` | `PreloadApi` 加可选的 `glwork?: GlWorkApi` | 类型；Web 客户端没有它（兜底对象读出来是假） |
| `src/renderer/src/components/settings/settings-setup-workflow-section-renderers.tsx` | `renderOrcaAccountSettingsSection` 开头：GL Work 时改渲染公司账号 | 替换设置节 |
| `src/renderer/src/hooks/settings-navigation-capability-sections.ts` | `buildSetupSettingsSections`：GL Work 时用公司账号的导航项 | 替换导航项 |
| `src/renderer/src/i18n/locales/*.json` | 末尾加 `glwork.account.*`（6 种语言） | 界面文案 |
| `src/main/ipc/pty/ipc/spawn-preflight.ts` | 准备 Claude 账号的条件前加 `!applyGlWorkCompanyModel(args) &&`，加一行 import | 界面发起的终端启动 |
| `src/main/ipc/pty/runtime/spawn-preflight.ts` | 同上 | 手机、自动化等经运行时发起的终端启动 |

## 已知限制

- 主进程返回的错误信息（超时、非公司成员等）还是英文，界面原样显示。
- 只覆盖 GL Work 启动的终端。Orca 用 Claude 做的其他事（生成提交说明、查用量）仍用成员自己的登录。

## 同步后重点检查

- `pnpm test src/main/glwork src/main/ipc/pty`
- 官方如果改了两个 `spawn-preflight.ts` 里 `ctx.claudeAuth = …` 那一句，重新挂接入点；漏挂不会报错，只会让公司模型不生效。两个文件都贴着 300 行上限，接入点只能占一个条件加一行 import。
- `pty-runtime-hidden-at-spawn-mark.test.ts` 在整套 `src/main/ipc/pty` 一起跑时偶发失败，官方代码本身也一样（单独跑通过），不是这项改动引起的。
- `GLWORK_BUILD=1 ORCA_BACKGROUND_LAUNCH=1 pnpm dev`，用 CDP 打开设置（`window.__store.getState().openSettingsTarget({ pane: 'orca-account', repoId: null })` 加 `openSettingsPage()`），确认显示的是「公司账号」；不带 `GLWORK_BUILD` 时仍是「Orca 账号」。
- 官方如果改了设置导航或 `orca-account` 这一节的结构，重新挂两个接入点。
