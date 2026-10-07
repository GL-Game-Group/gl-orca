# GL Work 公司账号

## 目的

GL Work 的成员用 GitHub 登录公司服务（`https://agent.glwork.net`，产品仓库 `GL-Game-Group/agent-work` 的 `gateway/`），拿到这台电脑的设备令牌。设备令牌是公司模型网关的 Key（每人一个、可以吊销、有限额，厂商的真实 Key 不到客户端），以后也用于手机连接这台电脑。

这一项做的是「设置 → 公司账号」：登录、退出、显示成员和分配给他的公司模型。在 GL Work 里它替换「Orca 账号」那一节（同一个 id `orca-account`，指向 Orca 账号的链接也落到这里）；Orca 自己的构建不受影响。

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

### 对官方文件的改动（同步时的冲突热点）

| 文件 | 改动 | 原因 |
| --- | --- | --- |
| `src/main/startup/main-process-ipc-bootstrap.ts` | 调用 `registerGlWorkAccountIpcHandlers()`，一行 | 注册 IPC |
| `src/preload/index.ts` | `api` 加 `glwork: glworkApi` | 暴露给界面 |
| `src/preload/api-types.ts` | `PreloadApi` 加可选的 `glwork?: GlWorkApi` | 类型；Web 客户端没有它（兜底对象读出来是假） |
| `src/renderer/src/components/settings/settings-setup-workflow-section-renderers.tsx` | `renderOrcaAccountSettingsSection` 开头：GL Work 时改渲染公司账号 | 替换设置节 |
| `src/renderer/src/hooks/settings-navigation-capability-sections.ts` | `buildSetupSettingsSections`：GL Work 时用公司账号的导航项 | 替换导航项 |
| `src/renderer/src/i18n/locales/*.json` | 末尾加 `glwork.account.*`（6 种语言） | 界面文案 |

## 已知限制

- 主进程返回的错误信息（超时、非公司成员等）还是英文，界面原样显示。
- 公司模型目前只是列出来；让 Claude Code、Qwen Code 用上它们（“模型来源”开关、启动时注入网关地址和令牌）是下一步。

## 同步后重点检查

- `pnpm test src/main/glwork`
- `GLWORK_BUILD=1 ORCA_BACKGROUND_LAUNCH=1 pnpm dev`，用 CDP 打开设置（`window.__store.getState().openSettingsTarget({ pane: 'orca-account', repoId: null })` 加 `openSettingsPage()`），确认显示的是「公司账号」；不带 `GLWORK_BUILD` 时仍是「Orca 账号」。
- 官方如果改了设置导航或 `orca-account` 这一节的结构，重新挂两个接入点。
