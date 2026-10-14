# Polynomial 客户端 0.3.2

默认服务器：`https://polynomial-server.tail722ac8.ts.net`。目前该 HTTPS 地址已通过现有 Funnel 公开访问，正常访问不要求设备安装 Tailscale；若将来关闭 Funnel，可通过 Tailscale 私网连接。客户端不提供 VPN，不会绕过服务器账号权限。

## 入口与功能

- `/app.html`：独立应用界面。总览、AI 对话、北京时间日历、任务完成、工具入口、管理员管家与手动巡检。
- `/download.html`：全站导航中的资源下载分区，客户端与共享资料按平台筛选。
- 普通用户看不到管家或流量控制；所有管理操作继续由原服务器接口校验管理员身份。
- 深度功能继续打开已有的学习、网盘、聊天、围棋与管理界面；对话、日程、账号和数据共用同一服务器。
- 关闭应用后，巡检和低峰队列在服务器执行。主屏幕应用不保证后台运行或系统级提醒；到期提醒在进入个人空间时显示。
- 离线时仅展示通用重连页面，不缓存账号页面、聊天、登录信息或 API 响应。

## 安装渠道

| 系统 | 当前渠道 | 版本要求 |
|---|---|---|
| Android | 测试签名 APK；Chrome 主屏幕安装 | 原生 Android 10+，WebView 保持更新 |
| iPhone / iPad | Safari → 分享 → 添加到主屏幕 | 支持主屏幕 Web App 的系统，建议当前版本 |
| macOS | DMG / ZIP，ARM64 与 x64 | 使用所打包 Electron 支持的 macOS 版本 |
| Windows | NSIS EXE，ARM64 与 x64 | 当前 Electron 支持的 Windows 版本 |
| Linux | AppImage / Debian DEB，ARM64 与 x64 | 桌面 Linux，满足 Electron 的系统库要求 |

桌面程序未配置发布者签名或 Apple 公证。Android APK 使用测试签名，只用于试用；首次正式发布前须配置持久 keystore，避免后续更新签名不一致。iOS 工程已包含在 `apps/ios`，可以编译到模拟器；未签名构建不能直接安装到普通 iPhone。

## 工程与构建

- `apps/desktop`：Electron，远端内容关闭 Node 集成、启用沙箱与上下文隔离。只有本地连接设置页面暴露两项有限 IPC，远端页面无原生桥。
- `apps/android`：原生 Android WebView、返回/刷新/设置、文件选择与下载。只接受 HTTPS，同源站点导航，外部网页由浏览器打开，不忽略证书错误。
- `apps/ios/Polynomial.xcodeproj`：UIKit / WKWebView，原生导航、服务器连接设置、会话持久化，iPhone / iPad 自适应。原生 iOS 文件下载导出与系统通知将在 TestFlight 阶段补齐；当前 iOS 使用主屏幕版本。
- `.github/workflows/clients.yml`：验证网站后，分别构建桌面各平台、Android APK，并验证 iOS 模拟器编译；产物保存在 GitHub Actions artifacts，试用安装包由独立分发工作流发布到 GitHub 试用版 Releases，再导入公共网盘。

```sh
cd apps/desktop
npm ci
npm run start
npm run dist -- --mac --arm64    # 在 macOS
npm run dist -- --win --x64      # 在 Windows
npm run dist -- --linux --x64    # 在 Linux
# Android：JDK 17、Android SDK 35、Gradle 8.11.1
# gradle -p apps/android assembleDebug
# iOS：Xcode，先不签名验证模拟器
xcodebuild -project apps/ios/Polynomial.xcodeproj -scheme Polynomial -sdk iphonesimulator CODE_SIGNING_ALLOWED=NO build
```

## 下载存储与发布

下载中心记录 `resourceDownloads` 只引用 `driveFiles` 中的公共文件。原文件仍位于同一个数据目录的 `drive/`，没有第二份存储。管理员在下载页选择公共网盘文件并确认公开发布。发布意味着访客无需登录即可下载；私人网盘文件不能直接发布。下架保留原文件，删除/转为私人文件后下载入口自动失效。

大体积客户端从可信构建产物部署，使用下面的离线导入方式。脚本必须在服务停止时运行，避免覆盖在线数据；先备份 store.json。文件 SHA-256 用于去重和下载校验。

```sh
# 先停止服务，再运行；不要在运行中的应用旁执行导入
POLYNOMIAL_DATA_DIR=/var/lib/polynomial-server POLYNOMIAL_OFFLINE_IMPORT=1 \
  node scripts/import-client-builds.js /path/to/downloaded-artifacts
# 再启动服务，验证 /api/downloads
```

## 以后接入 TestFlight / App Store

可以在现有工程上继续接入，无需换账号系统。准备事项：

1. Apple Developer Program 账号与 App Store Connect 应用记录，确认 bundle ID `com.polynomial.server` 的归属；配置开发团队、签名证书和 provisioning profile。不要把私钥、证书密码或 profile 提交到仓库。
2. 配置签名的 Archive / Export，并上传 App Store Connect；先通过 TestFlight 测试真机、登录、文件导入导出、屏幕旋转和权限隔离。
3. 补齐原生应用图标、启动体验、辅助功能、文件导出和需要的系统提醒；当前连接式 WebView 原型不等于已经具备 App Store 审核条件。Apple 的 4.2 要求足够的应用功能，简单网站包装可能被拒。
4. 准备隐私政策与支持网址、准确的数据收集声明（包括账号信息、服务器日志及发送给 DeepSeek 的内容）、应用介绍、年龄分级与真实设备截图。
5. 给审核人员提供可访问的测试服务器和测试账号。若审核时服务器仅限 Tailscale 私网，应准备合适的审核访问方式；当前 HTTPS 公网入口仍应提供独立测试账号，并保持管理员数据隔离。
6. 根据正式功能核查账号删除流程、内容管理、权限用途声明及付费功能政策；申请不代表审核一定通过。

官方依据：[App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)、[TestFlight](https://developer.apple.com/testflight/)、[App privacy](https://developer.apple.com/help/app-store-connect/reference/app-privacy/)、[Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications)。

安全实现参考：[Electron 安全指南](https://www.electronjs.org/docs/latest/tutorial/security)、[Android WebView](https://developer.android.com/develop/ui/views/layout/webapps/webview)、[Apple WKWebView](https://developer.apple.com/documentation/webkit/wkwebview)。

## 软件版本与更新

下载中心区分计划中、构建中、试用版、稳定版和停止分发；保留历史版本的记录与已发布文件。默认推荐可下载的稳定版，其次推荐最新试用版；管理员可固定一个已发布且有文件的版本。停止分发不删除网盘文件，但下载中心不再提供此版本下载。

用户可以同时选择版本、平台和芯片。每个版本有独立更新说明、发布时间、安装包和 SHA-256 校验。客户端通过只用于显示的 User-Agent 标记报告版本及平台；此标记不用于身份验证或授权。桌面“关于”和“检查软件更新”，以及应用账号页，展示安装版本和下载入口。当前采用手动下载安装更新，尚未启用后台自动替换程序。网页/主屏幕界面联网获得最新界面版本，这与原生安装包版本分别标注；早期客户端未报告版本时，明确显示无法识别，不会冒称已安装最新版本。
