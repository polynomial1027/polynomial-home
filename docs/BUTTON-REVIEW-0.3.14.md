# 按钮与功能回归 · 0.3.14

日期：2026-10-16（北京时间）。本地隔离账号与 SQLite 数据库，真实 Chromium 浏览器操作，测试不修改线上账号、消息或文件。

## 结果

- 本报告汇总浏览器场景；后端与静态检查结果请查看同次运行的 npm test / npm run check 日志。
- 浏览器：31 项场景通过。
- 自动记录 301 次点击，涉及 12 个页面路径。次数包括重复操作、链接和折叠区，不代表每种隐藏状态均已穷举。双账号测试的额外浏览器上下文没有全部计入该点击计数。
- 模型使用隔离进程预加载的模拟响应；真实 DeepSeek 网络请求被拦截，不使用真实密钥、不消耗真实额度。

## 点击记录分布

| 页面 | 记录的点击 |
| --- | ---: |
| / | 5 |
| /admin.html | 44 |
| /ai-records.html | 6 |
| /app.html | 125 |
| /chat.html | 17 |
| /download.html | 10 |
| /drive.html | 10 |
| /games/go.html | 22 |
| /games/match3.html | 5 |
| /learning.html | 14 |
| /login.html | 32 |
| /workspace.html | 11 |

## 场景

- 通过：AI sessions keep drafts separate and support rename, pin, archive, export and delete
- 通过：AI toolbox stores private reusable prompts and reviews a text attachment before any model request
- 通过：administrator MFA requires a factor after password and uses recovery codes once
- 通过：calendar edits detect stale revisions and device opt-in provides read-only offline calendar
- 通过：desktop and mobile navigation keep admin controls private and show real task status
- 通过：download can be tracked and cancelled after changing filters and categories
- 通过：download shows progress and verifies actual installer bytes before saving
- 通过：messages reach another account and recover after a lost socket without duplication
- 通过：narrow forms, task status and detailed pages stay usable with shared appearance
- 通过：own history is searchable and paginated without AI calls or admin content
- 通过：personal home syncs across devices, keeps favorite order and detects a stale save
- 通过：profile photo and preferences persist and member cannot change role
- 通过：public home exposes installation and preserves a calendar destination through login
- 通过：slow admin data does not delay the ordinary workspace
- 通过：AI send, formulas, planning, tools and admin record detail use the isolated model stub
- 通过：Android notification buttons call the correct native bridge methods
- 通过：Go study buttons, preferences and SGF import retain the position
- 通过：admin account buttons save passwords and quotas; announcement close never publishes
- 通过：admin report refresh and puzzle create/edit/delete buttons preserve intended changes
- 通过：all AI tool entries and template edit/delete buttons retain correct ownership
- 通过：backup and scheduler controls produce durable operation results
- 通过：calendar lifecycle, quick commands, daily brief, notification controls and account sessions
- 通过：chat group create/cancel, reply/edit/delete, attachments and mobile back buttons
- 通过：drive upload, share cancel, confirmed share, download and delete follow button intent
- 通过：learning notes, completion, assignment drafts and exports are durable without a notebook
- 通过：legacy AI control buttons save limits and run read-only reviews through stub
- 通过：match3 game controls save, pause, resume, hint and create a new board
- 通过：public navigation, local links, feedback submit and admin feedback actions
- 通过：resource publish/unpublish and release status save buttons update their lists
- 通过：administrator creates a sealed guest with private calendar, drive, games and limited AI
- 通过：changing a member to guest revokes sessions and old public sharing

## 本轮变更

详见 CHANGELOG-0.3.14.md。

## 验证边界

- 线上只读检查确认 KataGo 二进制、模型、配置及 Python 环境管理脚本存在；这属于就绪检查，不等同于实际引擎或容器运行成功。
- Android 的开启提醒、测试、关闭和消息权限按钮验证了原生桥接调用；通知实际弹出、系统权限页面、被系统终止后的行为需真机复核。
- Python 容器 / Jupyter、KataGo 实际引擎在隔离环境不可用；课程只读权限与草稿流程、围棋规则与共享操作有独立测试，但不把模拟响应当作真实外部服务通过。
- 隐藏的结算、引擎失败重试等条件按钮，以及禁用的分页和无权限按钮，不强行点击，也不计为真实外部执行成功。
- 账号安全、额度、并发、备份恢复等后端场景由 tests/*.test.js 验证。
- 访客创建、权限强制隔离、AI 次数限制与角色转换使用独立浏览器上下文和临时数据验证。
- 每次测试的机器可读点击记录保存于 test-results/*/button-actions.json；失败时 Playwright 另存截图与 trace。

## 复现

```sh
npm run check
npm test
npm run test:browser
node scripts/button-audit-report.js
```
