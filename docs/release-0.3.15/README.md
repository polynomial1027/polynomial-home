# 0.3.15 发布检查

- `evidence.json`：隔离账号的浏览器场景、点击记录、页面/控件盘点、站内目标、安装包校验及线上验证结果。
- `build-report.py`：从证据生成中文 PDF，要求线上检查已通过。
- PDF 输出：`output/pdf/Polynomial-0.3.15-发布前检查清单.pdf`。

复现功能检查：`npm run check`、`npm test`、`npm run test:browser`、`node scripts/button-audit-report.js`。

生成 PDF 需要 Python `reportlab`。默认使用 macOS Arial Unicode；其他平台使用 ReportLab 的 STSong-Light。生成后用 Poppler 渲染并检查版面。

测试使用临时数据库和测试账号。模型响应在隔离进程中模拟，不使用真实 API 密钥。控件“已盘点”不等于已独立点击执行；真机安装、系统实际通知和外部服务执行的剩余项目在报告中单列。

下载中心保留服务器主下载，并为当前七个安装包提供经过大小与 SHA-256 比对的 GitHub 备用下载。新版本仅在确认对应资产后追加 `lib/client-download-mirrors.json`，版本或摘要不匹配时不显示备用入口。
