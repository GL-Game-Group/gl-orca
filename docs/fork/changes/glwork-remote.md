# GL Work 手机远程（经公司服务中转）

## 目的

成员在手机上的 GL Work（Orca 手机端）用 GitHub 登录公司服务，看到自己开着 GL Work 的电脑，点一下就连上：不扫码、不需要同一个局域网、不用 Orca 官方云中转（GL Work 构建里关掉了）。

## 连接路径

```
手机 ──wss + Authorization: Bearer <手机令牌>──► 公司服务 /agent-work/remote/<隧道 id>/orca
     ──► frps（vhost，按 r<随机>.remote.internal 路由）──► 电脑上的 frpc ──► 127.0.0.1:<Orca 运行时端口>
```

- 手机和电脑之间仍是 Orca 自己的端到端加密（电脑公钥由配对信息固定，设备令牌在加密帧里），公司服务、frps 只转发字节。
- 公司服务校验手机令牌、隧道属于同一成员、电脑在线、没被管理员关闭，打开的连接每分钟复查（agent-work `gateway/src/server.ts`，和 DSH 版手机远程共用）；它把 `Authorization` 去掉再转发，电脑看不到手机令牌。
- 配对：手机 `POST /agent-work/remote/<id>/orca/pair` → 公司服务转发到电脑的 `/glwork/remote/pair`。frpc 给经它转发的每个请求加上 `x-glwork-remote: <本机密钥>`，只有带对密钥的请求才配对（局域网、浏览器页面一律 403），所以配对请求一定经过了公司服务的成员校验。电脑新建一个 `mobile` 设备，配对信息里的地址是公司中转地址，交给手机端原有的 `/pair-confirm`。
- 新设备的 `pairingReach` 是 `this-computer`：手机经 frpc 从本机回环地址进来，配对后 Orca 下次启动不会因此改为监听 `0.0.0.0`。配对过的手机在「设置 → 移动端」里，可以单独移除。

## 电脑端

- 「设置 → 公司账号」里的“手机远程”开关，默认关闭；打开前弹出说明（会和公司服务保持连接、能打开哪些东西、端到端加密、在哪里移除手机）。
- 打开后：用设备令牌 `GET/POST /agent-work/tunnels` 拿到（没有就登记）这台设备的 `remote` 隧道和 frps 地址，按 Orca 当前的运行时端口生成 frpc 配置（`<userData>/glwork-frpc.toml`，0600；设备令牌经环境变量传入，不写进文件），启动随应用附带的 frpc。frpc 退出后按 5 秒起、最长 60 秒退避重启；每 60 秒核对一次设置、登录、公司状态和端口（端口变了就按新端口重启 frpc）。退出登录、关闭开关、GL Work 退出时停掉 frpc；上次异常退出留下的 frpc（`<userData>/glwork-frpc.pid`，核对命令行确实是这个 frpc）启动时先结束。
- frpc：版本和 sha256 固定在 `resources/glwork/frpc-release.json`（和 agent-work `plugins/tunnel` 及公司 frps 同版本 0.71.0），`config/scripts/glwork-fetch-frpc.mjs` 下载核对后放到 `resources/glwork/frpc/darwin-<arch>/`（不入库）；`glwork-build-mac.mjs` 打包前自动执行，`glwork-builder.config.cjs` 用 `extraResources` 放到 `Contents/Resources/glwork/frpc/`（在 asar 外，可以执行，随应用签名）。开发版用 `resources/glwork/frpc/darwin-<arch>/frpc`，先执行一次 `node config/scripts/glwork-fetch-frpc.mjs`。

## 手机端

- 扫码页多一个入口“Or use your GL Work company account”（`/glwork`）：输入公司服务地址（默认 `https://agent.glwork.net`）→ 系统网页登录窗口（`expo-web-browser` 的 `openAuthSessionAsync`，ASWebAuthenticationSession，PKCE，回调 `glwork://auth`）→ 手机令牌存钥匙串（仅本机）→ 列出开了手机远程的电脑 → 点在线的那台配对 → Orca 的 `/pair-confirm`。
- 点一台电脑时，如果手机已经保存了指向同一中转地址的电脑，直接打开它，不再新建设备。
- 请求超时用 `AbortController` 加定时器：Hermes 没有 `AbortSignal.timeout`（Node 测试里有，模拟器上才暴露出来）。
- Orca 的 WebSocket 改由 `openWebSocket` 创建：只有地址是公司服务的 `wss://<同一主机>/agent-work/remote/...` 时才带 `Authorization`，其他主机（局域网电脑、别的域名、`ws://`）一律不带（`company-socket.test.ts`）。这个文件不引用原生模块，Orca 的传输层测试不受影响；读取钥匙串的 `company-session.ts` 在 `_layout.tsx` 里随应用启动加载。
- 文案目前是英文（Orca 手机端没有多语言），品牌和中文随 R3 后续一起做。

## 代码位置

### 新增文件

| 位置 | 内容 |
| --- | --- |
| `src/main/glwork/glwork-remote.ts` | 开关、核对循环、配对时新建设备、状态、IPC（`glwork:remoteStatus`、`glwork:setRemote`） |
| `src/main/glwork/glwork-remote-company.ts` | 公司服务的隧道接口、中转地址 |
| `src/main/glwork/glwork-remote-pair.ts` | `/glwork/remote/pair`：核对 frpc 的密钥头、读设备名、返回配对信息 |
| `src/main/glwork/glwork-frpc-config.ts` | frpc 配置和日志解析（从 agent-work `plugins/tunnel/frpc.js` 移植） |
| `src/main/glwork/glwork-frpc-process.ts` | 启动、重启、停止 frpc，清理上次留下的 frpc |
| `src/main/runtime/fork-runtime-rpc-extensions.ts` | 把 GitHub 组织登录和手机远程挂到运行时服务上（一行接入） |
| `src/renderer/src/components/settings/glwork/GlWorkRemoteAccess.tsx` | 开关、状态、开启前的说明 |
| `resources/glwork/frpc-release.json`、`resources/glwork/.gitignore`、`config/scripts/glwork-fetch-frpc.mjs` | frpc 的版本、下载 |
| `mobile/src/eva/glwork/`、`mobile/app/glwork.tsx` | 手机端登录、电脑列表、配对、WebSocket 请求头 |

### 对官方文件的改动（同步时的冲突热点）

| 文件 | 改动 | 原因 |
| --- | --- | --- |
| `src/main/startup/main-process-runtime-launch.ts` | 原来 GitHub 组织登录的 5 行接入改为一行 `installForkRuntimeRpcExtensions(...)` 加一行 import | 这个文件在 300 行上限边上（同步后已超出 3 行） |
| `mobile/src/transport/rpc-client-socket-session.ts` | `new WebSocket(endpoint)` 改为 `openWebSocket(endpoint)`，加一行 import | 给公司中转带请求头 |
| `mobile/app/_layout.tsx` | 登记 `glwork` 页面；import `company-session`（启动时读钥匙串） | 路由 |
| `mobile/app/pair-scan.tsx` | 扫码页加入口 | 入口 |
| `mobile/package.json`、`mobile/pnpm-lock.yaml` | 新增 `expo-web-browser` 55.0.20 | 系统网页登录窗口。pnpm 12 改依赖时会重算整个锁文件的 peer 后缀（约 2600 行），内容没变，同步冲突时重新生成即可 |
| `config/glwork-builder.config.cjs`、`config/scripts/glwork-build-mac.mjs` | 附带 frpc | 打包 |
| `src/renderer/src/i18n/locales/*.json` | `glwork.remote.*` | 6 种语言 |

## 测试

```bash
pnpm test src/main/glwork          # 含 frpc 配置和日志、配对接口（密钥、方法、大小、路径）
(cd mobile && pnpm typecheck && pnpm test src/eva)
```

本机全链路（2026-10-08 跑过）：本地公司服务（agent-work `gateway/src/dev-runtime.ts`，挂上 WebSocket 中转，`AGENT_WORK_DEV_FRPS_PORT=7100`，macOS 的隔空播放占着 7000）+ 本地 frps 0.71.0（`vhostHTTPPort = 8080`，server plugin 指向公司服务）+ 开发版 GL Work（`GLWORK_BUILD=1 GLWORK_SERVER=http://127.0.0.1:8787`）。打开手机远程后 frps 登记 `wuming.tun_…`；脚本模拟手机：公司登录 → 列表里有这台电脑 → 配对 → 经中转完成 Orca 的 E2EE 握手，`status.get`、`repo.list` 正常；不带或伪造手机令牌 401；直接访问本机 `/glwork/remote/pair`（不带或带错密钥）403；Orca 仍只监听 `127.0.0.1`；配对的手机出现在「设置 → 移动端」；界面上关闭、重新打开（弹出说明）都正常。

iOS 模拟器（2026-10-08 跑过）：同样的本地环境，模拟器里的 Orca 手机端开发版（`npx expo prebuild` 生成 `mobile/ios/`，Xcode 27 下第三方 Pod 的部署版本低于 15 会报错，构建时加 `IPHONEOS_DEPLOYMENT_TARGET=17.0`；本机的 Xcode 27 没有模拟器窗口程序，用一个只在本地生成工程里的 XCUITest 目标点按，`mobile/ios/` 不入库）：系统网页登录窗口 → 假 GitHub 选成员 → 回到 App 列出电脑（这台在线）→ 点它 → Orca 的配对确认 → 连上电脑（绿点）；电脑「设置 → 移动端」里出现 “iPhone 17”，Orca 仍只监听 `127.0.0.1`；再点一次直接打开，电脑上的设备数不变。

## 已知限制

- 真机还没有跑过，要等公司服务部署后经 `agent.glwork.net` 走一遍。
- 拿到配对信息后在确认页点“取消”，电脑上会留下一个没用过的设备，要在「设置 → 移动端」里移除。
- 运行时端口变化（6768 被占用时 Orca 换端口）最长 60 秒后 frpc 才跟上。
- 只做了 macOS 的 frpc。

## 同步后重点检查

- `main-process-runtime-launch.ts` 里 `installForkRuntimeRpcExtensions` 还在，且在 `registerMobileHandlers` 之前。
- 官方如果改了 `createPairingOffer`、`DeviceRegistry.addDevice` 或 `pairingReach` 的含义，`mintRelayedPairing` 跟着改。
- 官方如果改了手机端建立 WebSocket 的位置，`openWebSocket` 跟着挪。
- 官方如果开始在运行时端口上检查 Host、来源地址或路径，经 frpc 进来的连接会被拒绝。
