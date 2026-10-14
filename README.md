# Polynomial Server 0.2.1 Demo

Polynomial Server 是一个单体 Node.js 门户，包含账号、聊天、网盘、网络学习、JupyterLab、小游戏与管理后台。0.2.1 修复围棋人机难度与终局判定。

## 0.2.1 围棋修复

- 入门机器人从 KataGo 前 10 个合法候选点中随机落子；初级为 5 个、中级为 2 个，高级固定首选点。
- KataGo 胜率连续 12 个机器人回合低于 50% 时，由服务器自动判机器人认输。
- 人机和联机正式棋局双方连续停一手后，统一使用 KataGo 的 `scoreLead` 目数反馈判定结果。
- 玩家不再选择死子；自动结算失败时只提供“重试自动结算”。

## 0.2.0 基础功能

- 围棋单人模式：自由研究、管理员题库、本地 KataGo 人机对弈。
- 围棋多人模式：账号邀请联机对战、双人共享棋盘。
- 正式规则：提子、禁入点、简单劫/全局同形禁着、让子、让先、贴目、计时、认输、悔棋约定、双停后数目。
- 终局处理：双方连续停一手后由 KataGo 统一反馈目数并判定胜负，玩家不能自行选择死子。
- 棋谱：人机与联机棋局自动记录，可查看终局和完整步骤并导出 SGF；自由研究可保存分支和评论并导入 SGF。
- 管理后台：围棋权限、规则/计时/邀请/断线/皮肤/KataGo 预设、题库编辑、引擎状态和统计。
- 全站反馈：每个页面底部统一提交，后台按状态、优先级、搜索和备注集中处理。

完整范围与参数见 [docs/FEATURES-V0.2.0.md](docs/FEATURES-V0.2.0.md)。完整部署、从 VS Code 推送到 `main`、升级和回滚见 [DEPLOY-V0.2.0.md](DEPLOY-V0.2.0.md)，本次验证结果见 [RELEASE-VERIFICATION-0.2.0.md](RELEASE-VERIFICATION-0.2.0.md)。

## 运行要求

- Node.js 20 或更高版本；生产环境使用仍受支持的 Node.js 24 LTS
- Linux 服务器建议使用 Nginx + systemd
- KataGo 为人机落子和正式棋局终局判定所需；未安装时，研究、题库和共享棋盘仍可使用，联机棋局无法完成自动点目
- 当前 Demo 使用单机 JSON 数据存储，适合小型受控账号环境，不适合多实例横向扩容

## 本地启动

```bash
npm ci
npm run check
npm test
ADMIN_USERNAME=polynomial \
ADMIN_PASSWORD='请替换为至少4位密码' \
HOST=127.0.0.1 PORT=3000 \
npm start
```

打开 `http://127.0.0.1:3000/login.html`。不要直接双击 HTML：账号、实时聊天、联机围棋、保存和反馈都依赖 `server.js`。

## 数据目录

默认数据保存在项目的 `data/`：

- `data/store.json`：账号、会话、聊天索引、围棋棋局/研究/题库、反馈和设置
- `data/uploads/`：聊天附件
- `data/drive/`：网盘文件

生产环境建议设置 `POLYNOMIAL_DATA_DIR=/var/lib/polynomial-server`，将数据与代码分离。备份时必须整体备份数据目录，不能只复制 `store.json`。

## 个人空间与 DeepSeek 接入

登录后访问 `/workspace.html`。页面包含个人待办和到期提示、AI 对话入口、用量显示，以及管理员的全站与逐用户用量设置。DeepSeek 密钥尚未配置时，对话请求会拒绝，待办和巡检仍可使用。

在服务器的私有环境文件中设置 `DEEPSEEK_API_KEY`，可选 `DEEPSEEK_MODEL`（默认 `deepseek-flash`），重启服务后在个人空间的管理员区域打开 AI 开关，再逐个给成员授予“使用 AI 助手”权限。密钥不会返回浏览器或写入 `store.json`。若已有环境文件写了旧模型名 `deepseek-chat`，请一并改为当前文档中的模型名。调用使用 DeepSeek `/chat/completions`，以返回的 `usage.total_tokens` 记账；模型名和调用方式见 [DeepSeek 首次调用文档](https://api-docs.deepseek.com/zh-cn/)。

按现有 systemd 部署方案，私有环境文件是 `/etc/polynomial-server.env`（`ops/polynomial-home.service` 的 `EnvironmentFile`）。在服务器上编辑该文件，增加 `DEEPSEEK_API_KEY=...` 与 `DEEPSEEK_MODEL=deepseek-flash`，然后运行 `sudo systemctl restart polynomial-home`。不要把密钥填入网页、聊天、GitHub 提交或示例环境文件。

根据 [DeepSeek 官方计费页](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)（2026-10-14 核对），价格按百万 token 分为输入缓存命中、输入缓存未命中、输出三项。北京时间周一至周五（不含中国法定节假日）9:00–12:00、14:00–18:00 为高峰，其余时段为空闲时段；空闲价为高峰价的一半。个人空间显示当前时段、当前模型的单价和高峰结束时间。2026 年节假日表依据 [国务院办公厅通知](https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm)；未来年份节假日尚未更新时，系统将工作日按高峰保守判断。

个人空间的 AI 回答支持本地 KaTeX 渲染 `$...$`、`$$...$$`、`\\(...\\)` 与 `\\[...\\]`。用户提出带明确时间的计划或提醒时，助手会以结构化结果把最多五项日程加入站内计划与日历；若时间不明确，会先追问。每日首次进入个人空间会显示回顾弹窗，列出当天已完成事项、次日计划与管理员可见的服务器巡检状态；用户可勾选要继续安排的次日事项。回顾从站内记录即时生成，不额外消耗 API 额度；自动 AI 巡检按管理员设置的间隔只在空闲时段调用。邮箱和外部日历没有接入，相关事项只保存为计划，不读取或发送邮件。

结构化日程请求使用 DeepSeek 官方支持的 [thinking 模式开关](https://api-docs.deepseek.com/guides/thinking_mode)关闭推理，以减少 JSON 输出被推理 token 截断的概率；普通对话和服务器巡检保持原有模型行为。日程提示会明确给出北京时间今天和明天的日期。

管理员可把自动 AI 巡检设为关闭、每天或每周；每周以北京时间周一为新周期。自动巡检仅在空闲时段运行，手动“立即 AI 巡检”按当前时段调用，同样受全站和管理员额度约束。独立的服务器管家可以查询最近两分钟活跃账号数、某账号上次成功登录时间，并根据巡检摘要回答问题。明确的权限指令只支持 AI、聊天、网盘、学习和计划五项：管家先生成十分钟有效的变更卡片，管理员核对后按“确认执行”才写入权限与审计记录。其他权限可由管家打开对应用户的账号管理窗口。管家不会执行 AI 生成的命令。

高峰期的网页聊天默认进入低谷发送队列，用户也可取消勾选并立即发送；空闲时段直接发送。队列保存在 `store.json`，每个账号最多 10 条、全站最多 200 条待发送消息，进入空闲时段后每分钟最多处理 10 条。用户可取消自己的待发送消息。只有实际发送时才扣除本地额度；服务重启中断的发送会标为失败，避免自动重发导致重复计费。

用量按上海时间的自然日和月计算，管理员可以设置全站及个人的 token、请求次数上限。发请求前预留输入的保守估算量和最大输出量；上游失败也保留预留量，避免已产生费用却被本地释放。这个上限控制的是本站发出的请求，不能限制使用同一密钥的其他程序，也不是 DeepSeek 账单金额上限。建议另在 DeepSeek 控制台设置余额或消费提醒。

服务器启动时生成今日巡检报告，此后每分钟检查是否进入新的一天。管理员也可手动刷新今日报告。报告读取本站登录审计、系统内存、数据盘与负载；Linux 上尝试只读读取 `ssh.service`/`sshd.service` 的 journal 日志。无读取权限时会标明日志不可见。

管理员可在个人空间手动运行 AI 巡检，或打开“每日自动 AI 巡检”。自动巡检只在空闲时段运行；管理员手动点击会立即调用，页面显示当前价格时段。AI 只接收汇总指标，不接收原始日志、密码、Cookie 或完整 IP 地址。巡检调用与对话共用全站和管理员账号的用量上限。默认仅记录建议；若管理员另行打开“自动执行安全清理”，目前唯一允许的动作是删除已过期的登录会话。模型生成的命令、脚本或其他动作不会执行。全部结果与执行数量保存在管理员可见的巡检记录中。未来的邮件、日程等定时 AI 任务应复用同一低谷调度和用量限制；目前尚未接入邮箱或日历。

待办提醒目前在个人空间打开时显示，尚无网页关闭后的推送。邮箱读取、外部日历授权和更广泛的服务器操作尚未接入。

### GitHub 分支与回退

- `codex/pre-ai-backup-2026-10-12`：加入 AI 功能之前的代码快照。
- `codex/ai-framework-v1-backup`：第一版 AI 功能的固定备份。
- `codex/ai-framework`：持续同步个人空间、AI 对话、额度、低谷发送与巡检改动的工作分支。

试用 AI 分支前备份 `POLYNOMIAL_DATA_DIR`。如果需要退回旧功能，在服务器停服务后切回 `codex/pre-ai-backup-2026-10-12`，按现有部署流程重新安装依赖并重启服务。密钥只存放在服务器私有环境文件，GitHub 分支不会包含密钥。

## 验证命令

```bash
npm run check
npm test
```

## 管理员密码恢复

网站不保存明文密码，也没有邮件服务。管理员可以在手机的 `/recover-password.html` 输入账号并点击“在服务器屏幕显示恢复码”；4 位数字恢复码会直接写到服务器的本机文字控制台 `/dev/tty1`，不会返回给手机。恢复码有效 2 分钟且只能使用一次。

如果屏幕显示不可用，也可以在服务器本机运行：

```bash
cd /var/www/polynomial-home
POLYNOMIAL_DATA_DIR=/var/lib/polynomial-server npm run recovery-code -- --username polynomial
```

随后打开 `/recover-password.html`，输入管理员账号、恢复码和新密码。新密码至少 4 位，不限制字符组合；重置成功后，该账号的已有登录会话全部失效。

测试覆盖围棋提子、禁入、劫、让子、数目、SGF、邀请联机、悔棋、共享棋盘、题库校验和 KataGo 调用流程。发布前还应按部署文档执行登录、WebSocket、反馈和真实 KataGo 冒烟检查。

## 安全要点

- 公网部署必须启用 HTTPS，并设置 `COOKIE_SECURE=true`。
- `.env`、`data/`、KataGo 模型和备份不得提交到公开仓库。
- `ADMIN_PASSWORD` 只在首次创建数据文件时用于初始管理员；已有管理员密码应在后台修改。
- Node 服务仅监听 `127.0.0.1`，由 Nginx 对外提供服务。
- 管理员页面只提供围棋预设、题库和汇总统计，不提供介入棋局、替用户落子或实时裁决入口。

## 既有 Notebook 环境

0.2.0 保留原有 Notebook 管理方案。受限脚本、sudoers 和全新服务器可构建的 JupyterLab 镜像位于 `ops/`：

```bash
sudo install -o root -g root -m 0755 ops/polynomial-notebookctl /usr/local/sbin/polynomial-notebookctl
sudo install -o root -g root -m 0440 ops/polynomial-notebook.sudoers /etc/sudoers.d/polynomial-notebook
sudo visudo -c
```

全新服务器可先执行 `sudo docker build -t polynomial-notebook:local ops/notebook-image`，再创建内部网络 `polynomial-notebook-internal`；完整 Docker 安装与校验命令见部署手册。

默认 sudoers 服务账号为 `polynomial1027`；若实际 systemd 用户不同，必须同步修改该文件。不要把 Node 服务账号加入 `docker` 组。

默认敏感词库来自 [konsheng/Sensitive-lexicon](https://github.com/konsheng/Sensitive-lexicon)，MIT 许可文件保存在 `third_party/Sensitive-lexicon/LICENSE`。


### 0.2.7 账号与个人空间更新

- 管家支持“今天谁登录了、谁没登录”“修改 @用户名 密码”。密码修改会打开对应用户的账号编辑窗口，密码只通过账号接口提交；管家不会保存密码请求原文。
- 账号编辑的关闭按钮不再提交；保存密码后显示明确确认，撤销旧登录会话。账号更新先验证完整输入，避免失败请求留下部分修改。
- 登录报告固定显示北京时间起止时间。今日报告统计当天零点至查询时刻，巡检报告统计生成时刻之前 24 小时；已登录会话继续访问不算新的登录。
- 逐用户 AI 额度通过一个下拉框切换。非管理员界面和接口都不展示 AI 价格、流量统计或服务器管家；配额仍在服务端强制执行。
- 个人空间凌晨 00–05、早晨 05–11、中午 11–14、下午 14–18、晚上 18–24 按北京时间切换问候和配色，每分钟刷新。
- 本次公告会自动加入站点更新公告，已有账号与任务数据保留。

## 0.3.0 客户端与资源下载

新客户端入口 `/app.html`，下载中心 `/download.html`。手机、平板和电脑共用账号、权限、日程及配额。资源下载直接引用公共网盘文件，管理员可发布和下架；公开发布后可匿名下载。iOS 先使用主屏幕安装，Android / Mac / Windows / Linux 提供原生工程与分平台构建，签名发布要求和后续 TestFlight 接入见 [客户端文档](docs/CLIENTS.md)。
