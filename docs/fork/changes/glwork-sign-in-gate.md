# GL Work 先登录再使用

## 目的

GL Work 打开后，没有登录公司账号时只显示登录页；登录后才进入工作台。退出登录、公司服务吊销或令牌失效时回到登录页。与 DSH 版补丁 0005 的体验一致。

## 做法

- `src/renderer/src/main.tsx` 把 `<App />` 包在 `GlWorkSignInGate` 里（官方文件改一行、加一行 import）。官方 Orca 版和网页端里 `window.api.glwork` 不是 GL Work，组件原样渲染 `App`。
- 窗口加载时用同步 IPC `glwork:signedInSync` 读一次是否已登录（preload 里的 `signedInAtLoad`），先于首次绘制决定显示登录页还是工作台：已登录的成员不会看到登录页一闪。
- 主进程在登录、退出登录、公司服务返回令牌失效（清掉本机登录）时，向所有窗口发 `glwork:accountChanged`；登录页重新读状态。
- 登录页：GL Work 图标、“用 GitHub 登录”（复用 `glwork:signIn`，走浏览器）、等待时可以取消、失败原因、公司服务地址。顶部 40px 可拖动窗口（工作台的标题栏这时还没挂载）。
- 离线：本机保存的登录没过期就进入工作台，不要求每次联网；公司服务明确返回令牌失效时才回到登录页。

这是界面上的门，不是安全边界：成员的电脑由成员掌控，有约束力的控制（模型网关、手机中转）都在公司服务按令牌校验。主进程里的 Orca 服务照常启动。

## 代码位置

| 位置 | 内容 |
| --- | --- |
| `src/renderer/src/components/glwork/GlWorkSignInGate.tsx`（新） | 登录页和门 |
| `src/renderer/src/components/glwork/GlWorkSignInGate.test.tsx`（新） | Orca 版不受影响、已登录直接进入、未登录只显示登录页 |
| `src/main/glwork/glwork-account-ipc.ts` | `glwork:signedInSync`、`glwork:accountChanged` |
| `src/preload/api/glwork-bridge.ts` | `signedInAtLoad`、`onAccountChanged` |
| `src/renderer/src/main.tsx`（官方） | 包一层 `GlWorkSignInGate` |
| `src/renderer/src/i18n/locales/*.json` | `glwork.gate.*` |

## 验证

2026-10-08 开发版（`GLWORK_BUILD=1`，本地公司服务）用 CDP：退出登录后立即显示登录页；登录后自动进入工作台；重新加载窗口，第一时间就是工作台，没有闪登录页。

## 同步后重点检查

- 官方改了 `main.tsx` 的根组件结构时，`GlWorkSignInGate` 仍要包住 `App`。
- 官方加了“不经过 App 的窗口”（弹出窗口 `popout.tsx` 等）：它们由已登录的工作台打开，不需要门。
