# GL Work 手机 App（Orca 手机端的 GL Work 版）

## 目的

Orca 手机端构建出 GL Work 的手机 App：GL Work 的名称、图标、Bundle ID（`com.glgwork.work`，替换原来的原生 GL Work for iOS），打开就是公司登录和“我的电脑”（[glwork-remote.md](./glwork-remote.md)），不经过 Orca 的扫码配对。

## 怎么切换

构建时设置 `EXPO_PUBLIC_GLWORK_BUILD=1`，一个变量管两件事：

- **配置**：`mobile/glwork.config.js` 在 Orca 的 Expo 配置上覆盖：名称 `GL Work`、`ios.bundleIdentifier = com.glgwork.work`、图标和启动图（`assets/glwork/`）、iOS 权限说明和插件文案里的 “Orca” 换成 “GL Work”；去掉 `expo-notifications` 插件和推送权限（`aps-environment`，Expo 只要装了这个包就会自动加上，所以用一个配置插件在最后删掉）。Orca 的推送走 Orca 云，GL Work 没有用，推送以后单独做。
- **运行时**：`EXPO_PUBLIC_*` 会被 Expo 打进 JS（开发模式由 Metro 进程提供），按 Orca 的规则只在 `src/storage/preferences.ts` 读取（`bundledGlWorkBuild()`），`src/eva/glwork/glwork-app.ts` 包一层：
  - 首页没有配对过的电脑时，显示公司登录 / 我的电脑（`GlWorkCompanyScreen embedded`）；有电脑时仍是 Orca 的首页列表；
  - “配对电脑”的入口（首页 3 处、工作区列表的“重新配对”）都去 `/glwork`；
  - `OrcaLogo` 画 GL Work 的标志，首页顶栏、引导页、关于页的名称写 “GL Work”。

不设这个变量时，`app.config.js` 输出的配置和官方逐字节相同（2026-10-08 对比过），所有运行时判断都走 Orca 原来的分支。

图标、启动图和标志由 agent-work 的 `pnpm brand` 生成（`assets/glwork/icon.png` 不透明全幅 1024、`assets/glwork/splash-icon.png` 400×255、`src/eva/glwork/glwork-logo-mark.ts`），不手改。

## 装到 iPhone

agent-work 的 `pnpm try:ios:orca`（`scripts/try-ios-orca.mjs`）：`EXPO_PUBLIC_GLWORK_BUILD=1 expo prebuild --platform ios --clean` 生成 `mobile/ios/`（不入库，需要 CocoaPods）→ `xcodebuild` Release（JS 打进 App，不需要 Metro），用原生 GL Work 工程的开发团队自动签名 → `devicectl` 装到数据线连着的 iPhone 并打开。Xcode 27 不接受低于 iOS 15 的部署版本，几个第三方 Pod 还写着 9.0/12.4/13.4，构建时统一指定 `IPHONEOS_DEPLOYMENT_TARGET=17.0`。

## 代码位置

### 新增文件

| 位置 | 内容 |
| --- | --- |
| `mobile/glwork.config.js` | GL Work 版的 Expo 配置覆盖 |
| `mobile/assets/glwork/` | 图标、启动图（`pnpm brand` 生成） |
| `mobile/src/eva/glwork/glwork-app.ts` | `isGlWorkApp`、`pairDesktopRoute`、`appDisplayName` |
| `mobile/src/eva/glwork/GlWorkLogo.tsx`、`glwork-logo-mark.ts` | GL Work 标志（后者由 `pnpm brand` 生成） |

### 对官方文件的改动（同步时的冲突热点）

| 文件 | 改动 |
| --- | --- |
| `mobile/app.config.js` | 末尾两行：`module.exports = require('./glwork.config').wrapExpoConfig(module.exports)` |
| `mobile/src/storage/preferences.ts` | `bundledGlWorkBuild()`（构建期变量只能在这里读） |
| `mobile/src/components/OrcaLogo.tsx` | GL Work 版画 `GlWorkLogo`，3 行 |
| `mobile/src/home/MobileHomeScreen.tsx` | 空首页显示公司页；3 处配对入口走 `pairDesktopRoute()` |
| `mobile/src/host-screen/host-workspace-list.tsx` | “重新配对”走 `pairDesktopRoute()` |
| `mobile/src/home/MobileHomeTopBar.tsx`、`mobile/app/mobile-onboarding.tsx`、`mobile/src/settings/about-screen.tsx` | 名称写 `appDisplayName()` |

## 测试

```bash
(cd mobile && pnpm typecheck && pnpm test)
node -e "…"   # 不设 EXPO_PUBLIC_GLWORK_BUILD 时 app.config.js 的输出与改动前相同
```

模拟器（2026-10-08）：`EXPO_PUBLIC_GLWORK_BUILD=1` 生成工程、Debug 构建、Metro 也带这个变量，XCUITest 从全新安装开始：首页是 GL Work 标志和名称、中文公司登录 → 本地公司服务的假 GitHub 选成员 → 我的电脑 → 配对 → 连上电脑 → 重开 App 仍是 GL Work。

## 已知限制

- Orca 自己的界面（首页列表、工作区、终端、设置、引导页正文）还是英文：Orca 手机端没有多语言框架。
- 没有推送。
- 装了这个版本会替换手机上原生的 GL Work for iOS（同一个 Bundle ID），原来的登录和设置不保留。

## 同步后重点检查

- 官方给 `app.config.js` 换了导出方式（比如不再是函数），`wrapExpoConfig` 跟着改；对比不设变量时的输出。
- 官方新增了扫码配对的入口，GL Work 版要让它走 `pairDesktopRoute()`。
- 官方新增了自动加推送权限的插件，`withoutPushEntitlement` 是否仍能删掉。
