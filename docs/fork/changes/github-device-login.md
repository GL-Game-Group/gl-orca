# GitHub 组织登录

## 目的

团队在一台对外暴露的 `orca serve` 上协作，成员用手机、笔记本或 Orca 桌面版连接。登录方式从“管理员逐台发配对码”改为“**用 GitHub 登录，自动完成配对**”。

- 只有指定 GitHub 组织（可再按团队限制）的成员能接入。
- 每台设备都绑定一个 GitHub 身份。
- 成员离开组织后，服务端定时重查成员资格，自动撤销他的设备。
- **按人注入 git 身份**：成员通过自己的设备创建的终端和 Agent，以及在 Orca 界面上执行的提交、推送，都算到他本人的 GitHub 账号名下。

## 流程

```
客户端 ──POST /auth/github/device {client, deviceName}──► orca serve ──► GitHub 设备授权
       ◄─ {loginId, userCode, verificationUri, interval}
用户在 github.com/login/device 输入 userCode 并授权
客户端 ──POST /auth/github/poll {loginId}（按 interval 轮询）──► orca serve
       ◄─ {status:"paired", pairingUrl}   服务端：确认是组织成员 → 创建绑定 GitHub 身份的设备 → 生成配对信息
客户端把 pairingUrl 交给官方原有的配对流程（手机：/pair-confirm；桌面/CLI：验证并添加服务器）
```

安全前提：

- **客户端只接受 `https://`**（本机回环地址除外）。主机的端到端加密公钥是通过这条 HTTPS 连接拿到的，所以信任基础是服务器域名的 TLS 证书。部署时前面必须有 Nginx 或 Caddy 提供正规证书。
- GitHub 返回的 `device_code` 只保存在服务端，客户端只拿到 `loginId`。每次授权只能生成一台设备。

## 配置（服务端环境变量）

| 变量 | 说明 |
| --- | --- |
| `ORCA_GITHUB_LOGIN_CLIENT_ID` | GitHub App 的 Client ID（需勾选 Enable Device Flow，组织权限 Members: Read）（必填） |
| `ORCA_GITHUB_LOGIN_ORG` | 组织名（必填） |
| `--pairing-address` 或 `ORCA_GITHUB_LOGIN_PAIRING_ADDRESS` | 对外地址，比如 `wss://orca.example.com`（必填） |
| `ORCA_GITHUB_LOGIN_TEAMS` | 可选：只允许这些团队的成员登录，多个用逗号分隔 |
| `ORCA_GITHUB_LOGIN_RUNTIME_TEAMS` | 可选：只有这些团队的成员能生成桌面端 / CLI（完整权限）配对 |
| `ORCA_GITHUB_LOGIN_ORG_TOKEN` | 可选：每小时重查成员资格用的组织令牌；不设置就不会自动撤销设备 |
| `ORCA_GITHUB_LOGIN_REQUIRED=0` | 可选：允许没有绑定 GitHub 身份的设备（比如扫码配对的）继续使用 |
| `ORCA_GITHUB_LOGIN_GIT_IDENTITY` | `off`、`author`（默认）或 `full`，见下方“按人注入 git 身份” |
| `ORCA_GITHUB_LOGIN_CLIENT_SECRET` | 可选：`full` 模式下刷新会过期的 GitHub App 用户令牌时需要 |

补充说明：

- 配置不完整时启动会直接报错，不会在没有登录保护的情况下继续运行。
- 手机端可以在打包时设置 `EXPO_PUBLIC_ORCA_LOGIN_SERVER`，预填服务器地址。

## 按人注入 git 身份

原理：请求入口把设备绑定的 GitHub 身份放进 AsyncLocalStorage（`github-caller-context.ts`）。这个请求里后续所有的 `createTerminal` 和本地 git 调用（`gitExecFileAsync`）都会读取它，并附加对应的环境变量。创建终端的入口有十几处，都汇聚到这两个统一入口，所以官方文件只需要改两处。

| 模式 | 注入内容 | 效果 |
| --- | --- | --- |
| `off` | 无 | 全部使用主机的 git 配置 |
| `author`（默认） | `GIT_AUTHOR_*` / `GIT_COMMITTER_*`，邮箱用 `<id>+<login>@users.noreply.github.com` | 提交作者是本人；推送和 PR 仍使用主机的账号 |
| `full` | 在 `author` 基础上：只对 `https://github.com` 清空主机的凭证助手，改为读取这个用户的令牌文件；设置 `GH_CONFIG_DIR` 让 `gh` 使用他的令牌 | 提交、推送、`gh` 创建 PR 都是本人 |

`full` 模式的要求：

- GitHub App 要有 Contents: Read & write 和 Pull requests: Read & write 权限；如果用 OAuth App，`ORCA_GITHUB_LOGIN_SCOPE` 要包含 `repo`。
- 用户令牌保存在 `<userData>/github-user-credentials.json`，另外每人一个令牌文件和 gh 配置，放在 `<userData>/github-users/<id>/`，权限只对当前系统用户开放。
- GitHub App 的用户令牌 8 小时过期。配置了 client secret 时，服务端每 10 分钟刷新一次即将过期的令牌。令牌是在使用时从文件读取的，所以已经打开很久的终端也能拿到新令牌。
- 远程地址必须是 HTTPS（`https://github.com/...`）。用 SSH 地址时，仍然使用主机的 SSH 密钥。
- 凭证配置依赖 `GIT_CONFIG_COUNT`（git 2.31 及以上）。更老的 git 会忽略它，继续使用主机凭证（安全降级）；作者身份在任何版本上都能生效。
- 成员因为离开组织被撤销设备时，他的令牌文件也会一起删除。

没有覆盖到的：

- 结构化会话（Claude Agent SDK、Codex app-server）不经过 `createTerminal`，其中的 git 操作仍然使用主机身份。
- WSL 和 SSH 远程主机上执行的 git 不注入。
- 用户令牌放在环境变量和文件里，同一个系统用户下的其他进程可以读到（见下方“已知限制”）。

## 代码位置

### 新增文件（官方同步基本不会冲突）

| 位置 | 内容 |
| --- | --- |
| `src/shared/github-device-login-contract.ts` | 三端共用的请求和响应格式（zod） |
| `src/shared/github-device-login-http-client.ts` | 客户端逻辑：HTTPS 校验、开始登录、轮询、错误文案；手机端和 CLI 共用 |
| `src/shared/github-remote-host-login-types.ts` | 桌面端 IPC 的返回类型 |
| `src/main/runtime/github-auth/` | 服务端：配置读取、GitHub 客户端、登录会话、HTTP 接口、生成配对信息、定时重查成员资格、接入逻辑 |
| `src/main/runtime/device-github-identity.ts` | 设备记录里的 GitHub 身份类型和解析 |
| `src/main/runtime/rpc/http-request-routing.ts` | HTTP 服务挂载额外请求处理的逻辑 |
| `src/main/runtime/github-auth/github-caller-context.ts` | 按请求携带调用者身份的 AsyncLocalStorage |
| `src/main/runtime/github-auth/github-caller-git-env.ts` | 按模式生成要注入的环境变量 |
| `src/main/runtime/github-auth/github-user-credential-store.ts`、`github-user-token-refresh.ts`、`github-git-identity-installation.ts` | 用户令牌的存储、刷新和接入 |
| `src/main/ipc/runtime-environment-github-login.ts` | 桌面端：主进程里的登录流程和 3 个 IPC 通道 |
| `src/renderer/src/components/sidebar/AddRemoteHostGithubLoginPanel.tsx`、`use-github-remote-host-login.ts` | 桌面端“添加远程服务器”对话框里的 GitHub 登录面板 |
| `src/cli/handlers/environment-github-login.ts` | `orca environment login` 命令 |
| `mobile/src/eva/github-login/`、`mobile/app/github-login.tsx` | 手机端登录页面 |
| `mobile/src/components/GithubIcon.tsx` | 从 About 页抽出的 GitHub 图标（lucide 1.x 没有品牌图标） |

### 对官方文件的改动（同步时的冲突热点）

| 文件 | 改动 | 原因 |
| --- | --- | --- |
| `src/main/runtime/device-registry.ts` | 设备记录加 `githubIdentity` 字段；新增 `addGithubBoundDevice()`；读取注册表时解析该字段 | 设备要绑定 GitHub 身份 |
| `src/main/runtime/rpc/ws-transport.ts` | 新增 `requestInterceptor` 选项 | 登录接口复用同一个端口 |
| `src/main/runtime/runtime-rpc/runtime-rpc-state.ts` | 新增 `httpRequestInterceptor`、`requireGithubIdentity` 两个字段 | 保存上面两项配置 |
| `src/main/runtime/runtime-rpc/runtime-rpc-lifecycle.ts` | 创建 WebSocket 传输时传入 `requestInterceptor` | 同上 |
| `src/main/runtime/runtime-rpc.ts` | 新增 `setHttpRequestInterceptor()`、`setRequireGithubIdentity()` | 给接入逻辑调用 |
| `src/main/runtime/runtime-rpc/runtime-rpc-websocket-dispatch.ts` | 设备令牌校验之后，拒绝没有 GitHub 身份的设备；把 `dispatchStreaming` 用 `bindGithubCaller` 包一层（只改一行调用） | 准入控制（**这是安全边界**）和身份传递 |
| `src/main/runtime/orca-runtime-create-mobile-session-terminal.ts` | 父类的 import 改为我们的 `github-auth/orca-runtime-github-caller-terminal.ts`（`OrcaRuntimeWithGithubCallerTerminal as OrcaRuntimeWithCreateTerminal`），一行 | 终端和 Agent 按人注入身份：我们的子类覆盖 `createTerminal`，合并调用者的环境变量后调用父类。官方的 `orca-runtime-create-terminal.ts` 已经顶到 300 行上限，接入点不能放在里面（2026-10-08 同步时挪出） |
| `src/main/git/command-runner/git-exec-file.ts` | `gitExecFileAsync` 里合并调用者的环境变量（跳过 WSL） | 界面上的提交、推送按人注入身份 |
| `src/main/startup/main-process-runtime-launch.ts` | 调用 `installGithubDeviceLogin()`，一行 | 启动时接入 |
| `src/main/ipc/runtime-environment-connectivity-handlers.ts` | 把“验证并添加服务器”提取成函数 `verifyAndAdd`，并注册 GitHub 登录的 IPC 通道 | 两种添加方式走同一套逻辑 |
| `src/main/ipc/runtime-environment-handler-channels.ts` | 通道列表加入 3 个 GitHub 登录通道 | 重新注册时要先清理旧的 |
| `src/preload/api/runtime-api.ts`、`runtime-environments-bridge.ts` | 新增 `githubLoginStart`、`githubLoginComplete`、`githubLoginCancel` | 渲染进程调用 |
| `src/renderer/src/web/preload-api/web-runtime-environments-api.ts` | 上面 3 个方法在网页端返回“不支持” | 满足接口类型；网页端没有主进程 |
| `src/renderer/src/components/sidebar/AddRemoteHostDialog.tsx` | 新增 `serverView` 视图切换；把保存完成后的收尾提取成 `completeServerAdded` | 接入 GitHub 面板 |
| `src/renderer/src/components/sidebar/AddRemoteHostServerFormPanel.tsx` | 页脚左侧加 “Sign in with GitHub instead” 按钮（`onUseGithub`） | 入口 |
| `src/renderer/src/i18n/locales/*.json` | `AddRemoteHostDialog.github*` 12 条、`webPreloadApi.githubLoginUnavailable` 1 条 | 6 种语言 |
| `src/cli/specs/environment.ts`、`handlers/environment.ts`、`handler-group-manifest.ts`、`flag-help-text.ts`、`root-help-text-*.ts` | 登记 `environment login` 命令和 `--server` 参数 | CLI 命令 |
| `mobile/app/pair-scan.tsx` | 两处加 “Sign in with GitHub” 入口 | 手机端入口 |
| `mobile/app/_layout.tsx` | 登记 `github-login` 页面，一行 | 路由 |
| `mobile/src/storage/preferences.ts` | 新增 `bundledGithubLoginServer()` | 规则测试要求构建时环境变量只能在这个文件里读取 |
| `mobile/src/settings/about-screen.tsx` | 改为引用公共的 `GithubIcon` | 复用图标 |
| `src/main/ipc/runtime-environments-pairing.test.ts` | 期望的通道列表加入 3 个新通道 | 跟着通道列表更新 |

## 同步后重点检查

- **`runtime-rpc-websocket-dispatch.ts`**：官方如果调整了设备令牌校验或手机权限检查的顺序，我们的 GitHub 身份检查必须仍然在“设备令牌校验通过”之后、“开始执行方法”之前。对应的测试是 `runtime-rpc-github-identity-gate.test.ts`。
- **运行时的类继承链、`git-exec-file.ts`**：`OrcaRuntimeWithGithubCallerTerminal` 必须直接接在 `OrcaRuntimeWithCreateTerminal` 后面（官方如果在两者之间插了新类，或改了 `createTerminal` 的参数，要跟着调整）；官方如果把执行 git 的逻辑换到别的函数，身份注入要跟着挪过去。`orca-runtime-github-caller-terminal.test.ts` 检查终端拿到调用者的身份，`github-caller-git-env.test.ts` 用真实的 git 验证了提交作者和凭证助手，可以用它确认。
- **`device-registry.ts`**：官方如果改了注册表的读取或持久化方式，要确认 `githubIdentity` 仍然能保存下来，重启后也不会丢。
- **`ws-transport.ts`、`static-web-client-handler.ts`**：官方如果改了 HTTP 请求的处理方式，要确认 `/auth/github/*` 仍然能访问到。
- **配对信息格式**（`src/shared/pairing.ts` 的 `PairingOfferSchema`）：官方如果加了必填字段，`github-bound-pairing-offer.ts` 要跟着补上。
- **`AddRemoteHostDialog.tsx`**：官方改动比较多时，重新接上 `serverView` 和 `completeServerAdded`。注意文件行数不能超过上限。
- **手机端配对流程**（`/pair-confirm` 接受的参数）：官方如果改了，`GithubLoginScreen.tsx` 里的跳转要跟着改。
- **Git 兼容性和通信协议兼容性**：这项功能没有新增 RPC 方法，也没有新增推送消息类型，只加了 HTTP 接口，不影响官方客户端和服务端之间的兼容。**但开启 `requireIdentity` 后，官方原版 App 在配对后会被拒绝**，团队成员需要用我们自己打包的 App。

## 测试

```bash
pnpm test src/main/runtime/github-auth src/main/runtime/runtime-rpc-github-identity-gate.test.ts \
  src/shared/github-device-login-http-client.test.ts src/cli/handlers/environment-github-login.test.ts \
  src/main/ipc/runtime-environment-github-login.test.ts src/main/ipc/runtime-environments-pairing.test.ts \
  src/renderer/src/components/sidebar/AddRemoteHostGithubLoginPanel.test.tsx \
  src/main/git/command-runner
(cd mobile && pnpm typecheck && pnpm test src/mobile-web-shell/mobile-web-shell-flag-census.test.ts)
```

## 界面验证记录

- 2026-09-30：用后台 Electron（`ORCA_BACKGROUND_LAUNCH=1`）加本机假登录接口，CDP 截图检查了访问链接页、GitHub 登录页、等待授权、登录失败 4 个状态，覆盖英文、中文、法文和深色主题。发现等待授权时页脚三个按钮溢出对话框，已把“复制验证码并打开 GitHub”移到验证码下方、占满整行。
- 官方问题（未修）：`en.json` 里 `pairingHelpSuffix` 还是旧文案，访问链接页的说明只显示后半句。可以向官方提 PR。

## 已知限制和待办

- 只适用于 `orca serve`。Orca 桌面版在配对之前只监听本机，外部设备访问不到登录接口。
- 所有人的 Agent 都以同一个系统用户运行。GitHub 登录能挡住外部的人，但挡不住成员之间互相冒充。需要严格隔离的话，改成每人一个 macOS 用户、各跑一个 Orca。
- 待办：
  - 首次信任后锁定主机公钥
  - 登录失败的错误文案翻译成多种语言（目前由共用客户端返回英文）
  - 操作日志
  - 结构化会话（Claude Agent SDK、Codex app-server）的按人身份注入
