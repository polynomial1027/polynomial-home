# 0.2.0 Demo 发布验证记录

验证日期：2026-07-20  
验证环境：Linux、Node.js 24.14.0、npm 11.9.0

## 已通过

- `npm run check`：服务器、围棋服务、KataGo 适配器和前端脚本语法全部通过。
- `npm test`：14 / 14 通过，覆盖提子、禁入、简单劫、全局同形禁着、让子、数目、SGF、权限、邀请、管理员边界、共享棋盘、题库和人机适配流程。
- HTTP / WebSocket 双账号冒烟：登录、邀请、接受、双方停一手、双方确认数目、自动结束、SGF 下载、统一反馈、后台汇总和 `/go-socket` 全部通过。
- `npm audit --omit=dev`：0 个已知漏洞；发布时依赖无过期版本。
- `bash -n ops/polynomial-notebookctl`：Notebook 特权控制脚本语法通过。
- 所有 HTML 页面都通过直接或动态加载 `site.js` 获得统一反馈入口；页面内没有重复 `id`。

## 必须在目标服务器验证

- KataGo 程序、所选 CPU/GPU 后端、模型和 `gtp.cfg` 必须按实际硬件执行 `version`、`benchmark` 和 GTP 测试。
- 全新 Notebook Docker 镜像需要在目标服务器构建，并验证 Docker 内部网络、个人存档挂载和 JupyterLab 启动。
- Nginx 配置必须用真实域名执行 `nginx -t`，再验证 HTTPS 下的 `/chat-socket`、`/go-socket` 和 `/python/session/`。
- 升级生产数据前必须完成一致性备份，并按部署手册执行一次双账号人工验收。

这些项目依赖目标服务器的硬件、域名、证书和既有数据，不适合在源码构建环境中伪造通过结果。

