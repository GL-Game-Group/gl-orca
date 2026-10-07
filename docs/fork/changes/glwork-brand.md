# GL Work 品牌与打包

## 目的

GL Work 是公司基于本仓库打包的桌面端（产品仓库 `GL-Game-Group/agent-work` 把本仓库作为子仓库 `orca/`）。这一项只负责“它是 GL Work，不是 Orca”：

- 应用名 **GL Work**、Bundle ID `com.glgwork.work`、GL Work 图标；系统权限提示里的 “Orca” 换成 “GL Work”。
- 数据目录独立：打包版 `~/Library/Application Support/glwork`，开发版 `glwork-dev`。不和旧版 GL Work（`GL Work`）、官方 Orca（`orca`、`orca-dev`）混用，三者可以同时运行。
- 不检查 Orca 的发布源：否则会提示“升级”成官方 Orca。公司的发布源以后再接。
- 不使用 Orca 云账号（`login.onorca.dev`）：成员登录公司服务。

遥测和崩溃上报不用改：遥测只在官方 CI 注入写入密钥的构建里发送，崩溃报告本来就不上传。

## 怎么判断是 GL Work

`src/main/glwork/glwork-build.ts` 的 `isGlWorkBuild()`：

- 打包版：`config/glwork-builder.config.cjs` 在应用自带的 `package.json` 里写入 `glwork: true`，启动时读取并缓存。
  - 为什么不用 `app.getName()`：打包后它先返回 `orca`（electron-builder 不把 productName 写进应用的 `package.json`），启动完成后 Orca 又把它改成 `Orca`，两次都不是 GL Work。
- 开发版：用 `GLWORK_BUILD=1 pnpm dev` 启动。

官方测试和官方构建都没有这个标记，所以行为不变。

## 构建

```bash
pnpm install && (cd mobile && pnpm install)      # build:desktop 会打包手机端的网页版，要有手机端依赖
node config/scripts/glwork-build-mac.mjs --dir   # 只打本机架构的 GL Work.app（dist/mac-arm64/），用于本机试用
node config/scripts/glwork-build-mac.mjs         # dmg + zip，arm64 和 x64（先 pnpm install:release）
GLWORK_BUILD=1 ORCA_BACKGROUND_LAUNCH=1 pnpm dev # 开发版
```

签名用钥匙串里找到的 Developer ID（与 `pnpm build:mac` 相同）；目录版不公证。图标由产品仓库的 `pnpm brand` 从 `overlay/apps/desktop/branding/` 生成到 `resources/glwork/`，不要手改。

## 代码位置

### 新增文件

| 位置 | 内容 |
| --- | --- |
| `src/main/glwork/glwork-build.ts` | `isGlWorkBuild()`、产品名、Bundle ID、数据目录名 |
| `src/main/glwork/glwork-build.test.ts` | 判断方式、应用身份、Orca 云账号关闭 |
| `config/glwork-builder.config.cjs` | 引用官方打包配置，覆盖应用身份、图标、权限提示、`publish`，写入标记 |
| `config/scripts/glwork-build-mac.mjs` | 与 `pnpm build:mac` 相同的步骤，换用上面的配置；`--dir` 只打本机架构 |
| `resources/glwork/icon.icns`、`icon.png` | 由产品仓库的 `pnpm brand` 生成 |

### 对官方文件的改动（同步时的冲突热点）

| 文件 | 改动 | 原因 |
| --- | --- | --- |
| `src/main/startup/configure-process.ts` | 打包版是 GL Work 时把 userData 设为 `glwork`；开发版用 `glwork-dev` | 数据目录独立 |
| `src/main/startup/dev-instance-identity.ts` | 打包版是 GL Work 时，`name`/`appName` 为 GL Work、`appUserModelId` 为 `com.glgwork.work` | 菜单、关于窗口显示 GL Work |
| `src/main/updater/updater-setup.ts` | GL Work 直接返回，不设置更新源 | 不提示升级成 Orca |
| `src/main/orca-profiles/profile-cloud-auth-config.ts` | GL Work 视为“未配置” | 不连 Orca 云 |
| `config/scripts/build-computer-macos.mjs` | 用 `swift build --show-bin-path` 找每个架构的产物并先复制出来 | Swift 6.4（Xcode 27）把所有架构都输出到 `.build/out/Products/Release`，原脚本在 Xcode 27 上打包失败。**通用修复，可以向官方提 PR** |

## 已知限制

- `~/.orca`（命令行、语音模型等）仍和官方 Orca 共用。
- 深链协议仍是 `orca://`，和官方 Orca 共用，系统只会交给其中一个；需要用到深链的功能（Orca 云登录回调等）在 GL Work 里不用。
- 界面文案里的 “Orca” 还没有换（数量很多、分散在 6 种语言里），之后单独处理。
- Orca 启动时会往 Claude Code、Codex 的配置里写入自己的钩子（用于显示代理状态）。公司规则要求修改其他工具配置前先征得成员同意，这一项放在“命令行工具”那一步处理。

## 同步后重点检查

- `pnpm test src/main/glwork src/main/startup src/main/orca-profiles/profile-cloud-auth-config.test.ts`
- 打一次目录版，确认：`Info.plist` 的 Bundle ID 和名称；`Contents/Resources` 里没有 `app-update.yml`；启动后数据在 `glwork`；和官方 Orca 同时运行不冲突。
- 官方如果改了 `dev-instance-identity.ts` 的身份结构或 `configureDevUserDataPath` 的流程，重新挂接入点。
