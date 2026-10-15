# 服务、数据与恢复

运行环境为 Node.js 24。业务状态保存在 `POLYNOMIAL_DATA_DIR/store.sqlite`；上传附件及公共/私人网盘分别保存在 `uploads/` 和 `drive/`。首次从 JSON 迁移时保留 `store-before-sqlite.json`，该文件是迁移时间的快照，之后不再更新。

## 自动任务

任务在同一个服务实例内调度，执行状态持久化。基础检查每天北京时间 02:00，AI 巡检每天或周一 02:15，备份每天 02:40。错过时间会在下一个低峰补执行。非 AI 任务最多三次尝试；AI 失败不自动重复调用，服务中断后需核对用量再手动重试。管理员在客户端“服务器管理”内控制。

## 备份

自动备份默认开启并保留七份；手动备份单独保留。备份包括 SQLite 数据、drive、uploads 和 push-vapid.json，并附 SHA-256 文件清单。创建完成后在独立临时目录实际恢复、检查每个文件及 SQLite 完整性。备份包含账号密码哈希及通知私钥，应仅由管理员保管。

默认备份目录为数据目录下的 backups，也可设置绝对路径 `POLYNOMIAL_BACKUP_DIR`。本机备份仍共用磁盘，需定期下载到另一设备或另外配置外部备份位置。备份期间暂时拒绝修改请求；现有读取不受影响。环境文件 `/etc/polynomial-server.env` 和独立 Notebook 容器卷不在备份内。

## 恢复到空目录

同时下载备份 `.tar.gz` 和“校验信息” `.json`，放在同一目录。用本版本代码运行：

```sh
node scripts/restore-backup.js /absolute/backup-name.tar.gz /absolute/new-empty-data
```

工具拒绝覆盖已有目录，先校验归档、路径、内容及数据库，再输出成功。保留原数据目录，停止服务，把环境变量 POLYNOMIAL_DATA_DIR 指向验证后的目录，再启动、检查健康接口并用实际账号验证。环境文件和独立容器卷从它们自己的备份恢复。新目录应保持原服务用户所有，权限 0700。

## 代码回退到 JSON 版本

在切换分支前停止服务，保留完整备份，然后在 0.3.8 代码目录导出：

```sh
POLYNOMIAL_DATA_DIR=/var/lib/polynomial-server POLYNOMIAL_OFFLINE_IMPORT=1 node scripts/export-legacy-store.js
git switch codex/before-v038-improvements
```

再启动旧版本并验证。SQLite 继续保留。若之后从旧 JSON 版本升级回 SQLite，要先备份两种数据，并把旧 SQLite 移至留存目录后再迁移最新 JSON，避免忽略回退期间新增的记录。旧版本不支持 TOTP；回退期间仅由旧版本的密码机制保护账号。

## 提醒与设备

Web Push 有限重试并补发 24 小时内的事项；推送成功表示通知服务接受，不能证明用户已看到。新订阅不补发订阅前的事项。Android 提醒受系统省电限制。桌面 0.3.8 在原生线程维护已同步任务，关闭窗口时托盘继续运行；明确退出/关机后不运行，重启客户端补发 24 小时内未发出的提醒。账号退出会清除本地提醒。

离线日程为用户选择的设备副本，保存 30 天内的最后快照，不包含聊天、管理员报告或密钥。只能查看，重新联网后以服务器为准。多设备日程编辑通过修改时间检查冲突。iOS 原生签名安装需 Apple 开发者账号，当前仍提供 Safari 主屏幕版本。

## 发布检查与自动重启

生产使用用户级 systemd 服务 polynomial-home.service，配置见 deploy/polynomial-home-user.service；用户启用 linger 后，SSH 断开和重启后服务仍可启动。进程异常退出会有限重启，启动日志使用 journalctl --user -u polynomial-home.service。

发布运行 bash scripts/deploy-server.sh codex/ai-framework /absolute/installers-directory。脚本先在临时源码目录安装、检查和测试，再停服务、备份原数据、更新代码、导入安装包、迁移和恢复验证备份，最后启动并检查公告、版本、下载哈希与数据库。失败时切回原代码，并在需要时导出兼容 JSON；发布前的数据归档另行保留。回退后应检查服务和实际账号。浏览器交互检查在 GitHub Actions 中执行。
