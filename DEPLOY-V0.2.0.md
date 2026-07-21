# Polynomial Server 0.2.0 Demo 完整部署手册

本文覆盖以下完整路径：

1. 在 VS Code 中把 0.2.0 代码合入现有仓库。
2. 验证、提交并推送到 `main`。
3. Ubuntu/Debian 服务器安装 Node.js、Nginx、systemd 和可选 KataGo。
4. 从 0.1.5 安全迁移数据。
5. 上线验证、备份、排错和回滚。

文中的域名、仓库地址和密码都是占位符，执行前必须替换。推荐约定：

```text
仓库：git@github.com:YOUR_ORG/YOUR_REPO.git
服务账号：polynomial1027
代码目录：/var/www/polynomial-home
数据目录：/var/lib/polynomial-server
KataGo 目录：/var/lib/polynomial-katago
systemd：polynomial-home.service
Node 监听：127.0.0.1:3000
```

## 一、发布前必须知道的边界

- 代码最低兼容 Node.js 20；Node.js 20 已结束支持，生产环境请使用 Node.js 24 LTS。
- KataGo 和神经网络模型没有放进源码压缩包：它们体积大、与 CPU/GPU 后端有关，必须在服务器单独安装。
- KataGo 未安装时，只有“人机对弈”不可用；研究、题库、联机和共享棋盘不受影响。
- 0.2.0 仍是单进程 + JSON 文件存储 Demo，适合小型账号群，不支持多个 Node 实例同时写同一数据目录。
- 管理员只配置预设、权限和题库并处理异步反馈；后台没有实时改棋、改结果或替用户裁决的功能。

## 二、在 VS Code 中合入 0.2.0

### 1. 先确认当前仓库干净

在 VS Code 打开现有服务器仓库，然后打开“终端”：

```bash
git status
git branch --show-current
git remote -v
```

先提交或另行保存你自己的未完成改动。不要覆盖 `.git/`、生产 `data/`、`.env` 或 `node_modules/`。

### 2. 建发布分支

```bash
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c release/0.2.0-demo
```

将交付压缩包解压在仓库外部。把 `polynomial-server-v0.2.0/` 里面的内容覆盖到仓库根目录；不要复制解压目录本身，也不要复制 `node_modules/` 或 `data/`。命令行可使用：

```bash
rsync -av \
  --exclude='.git/' \
  --exclude='node_modules/' \
  --exclude='data/' \
  /你解压的位置/polynomial-server-v0.2.0/ \
  /你的现有仓库/
```

本版本没有要求删除既有用户数据。复制后检查：

```bash
git status --short
git diff --stat
```

### 3. 本地安装与验证

```bash
node --version
npm --version
npm ci
npm run check
npm test
```

`node --version` 必须显示 `v20` 或更高。可选本地启动：

```bash
POLYNOMIAL_DATA_DIR=/tmp/polynomial-v020-local \
ADMIN_USERNAME=polynomial \
ADMIN_PASSWORD='Local-Only-Strong-Password' \
HOST=127.0.0.1 PORT=3000 \
npm start
```

访问 `http://127.0.0.1:3000/games/go.html`，确认页面可打开。此临时数据目录不要提交。

### 4. 提交发布分支

```bash
git add .
git status --short
git commit -m "feat: release Polynomial Server 0.2.0 go demo"
git fetch origin
git rebase origin/main
npm run check
npm test
git push -u origin release/0.2.0-demo
```

### 5. 推到 main

如果仓库启用了分支保护，在 GitHub/GitLab 创建从 `release/0.2.0-demo` 到 `main` 的 Pull Request，检查通过后合并。这是最稳妥的方式。

如果仓库明确允许你直接更新 `main`：

```bash
git switch main
git pull --ff-only origin main
git merge --ff-only release/0.2.0-demo
git push origin main
git tag -a v0.2.0-demo -m "Polynomial Server 0.2.0 Demo"
git push origin v0.2.0-demo
```

若 `--ff-only` 失败，不要强推。返回发布分支重新 `git rebase origin/main`，处理冲突、重跑测试后再合并。

## 三、服务器基础环境

以下命令以 Ubuntu/Debian 为例。

### 1. 安装系统包

```bash
sudo apt update
sudo apt install -y ca-certificates curl git nginx rsync unzip xz-utils
```

先检查 Node：

```bash
node --version
npm --version
```

如果 Node 低于 20 或已经是停止支持的版本，安装 Node.js 24 LTS。可以使用发行版支持的 Node 24 包，或从 [Node.js 官方下载页](https://nodejs.org/en/download)安装。使用 NodeSource 时，建议先阅读脚本再执行：

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x -o /tmp/nodesource_setup.sh
less /tmp/nodesource_setup.sh
sudo -E bash /tmp/nodesource_setup.sh
sudo apt install -y nodejs
node --version
npm --version
command -v node
```

随包的 systemd unit 默认使用 `/usr/bin/node`。如果 `command -v node` 显示其他路径，请先确认该路径来自受维护的 Node.js 24 安装，再把 `ops/polynomial-home.service` 中的 `ExecStart` 改成对应的绝对路径；不要依赖交互式 shell 的 `nvm` 环境。

### 2. 创建服务账号和目录

若现有 0.1.5 已使用其他 systemd 用户，请继续使用原账号，并同步替换下文用户名。

```bash
sudo useradd --system --user-group --create-home --home-dir /var/lib/polynomial1027 --shell /usr/sbin/nologin polynomial1027
sudo install -d -o polynomial1027 -g polynomial1027 -m 0750 /var/www/polynomial-home
sudo install -d -o polynomial1027 -g polynomial1027 -m 0750 /var/lib/polynomial-server
sudo install -d -o polynomial1027 -g polynomial1027 -m 0750 /var/lib/polynomial-katago
sudo install -d -o polynomial1027 -g polynomial1027 -m 0750 /var/log/polynomial-katago
```

若 `useradd` 报“用户已存在”，跳过该条即可。

### 3. 全新服务器安装 Docker Engine（已有 0.1.5 环境可跳过）

学习区运行代码和 JupyterLab 需要 Docker。若原 0.1.5 的 `polynomial-notebook:local` 镜像、`polynomial-notebook-internal` 网络和 `/opt/polynomial-notebook/users/` 已经正常工作，不要重建或删除它们。

全新 Ubuntu 服务器按 [Docker 官方 Ubuntu 安装说明](https://docs.docker.com/engine/install/ubuntu/)配置仓库。不要使用不经检查的 convenience script，也不要把 Node 服务账号加入 `docker` 组：

```bash
sudo apt update
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
. /etc/os-release
ARCH="$(dpkg --print-architecture)"
CODENAME="${UBUNTU_CODENAME:-$VERSION_CODENAME}"
sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${CODENAME}
Components: stable
Architectures: ${ARCH}
Signed-By: /etc/apt/keyrings/docker.asc
EOF
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker run --rm hello-world
```

### 4. 首次拉取 main

私有仓库应为服务账号配置只读 Deploy Key。然后：

```bash
sudo -u polynomial1027 git clone git@github.com:YOUR_ORG/YOUR_REPO.git /var/www/polynomial-home
cd /var/www/polynomial-home
sudo -u polynomial1027 git switch main
sudo -u polynomial1027 git pull --ff-only origin main
sudo -u polynomial1027 npm ci --omit=dev
sudo -u polynomial1027 npm run check
sudo -u polynomial1027 npm test
```

如果代码目录已经存在，不要再次 `git clone`，直接使用后面的升级流程。

### 5. 构建 Notebook 隔离镜像（已有正常镜像可跳过）

代码拉取完成后，使用随包 Dockerfile 构建固定为 JupyterLab 4.6.1 的本地镜像，并创建不向公网发布端口的内部网络：

```bash
cd /var/www/polynomial-home
sudo docker build -t polynomial-notebook:local ops/notebook-image
sudo docker network inspect polynomial-notebook-internal >/dev/null 2>&1 || \
  sudo docker network create --internal polynomial-notebook-internal
sudo docker image inspect polynomial-notebook:local >/dev/null
sudo docker network inspect polynomial-notebook-internal >/dev/null
```

镜像内使用 UID/GID 1000，和 `polynomial-notebookctl` 创建的个人存档目录一致。Jupyter 容器只连接内部 Docker 网络，不发布宿主机端口；Node 通过每位用户的容器地址反向代理。

## 四、从 0.1.5 迁移数据

全新安装且没有旧数据时，跳过本节。只有从既有版本升级时才执行下面的复制命令。

0.2.0 首次读取旧 `store.json` 时会自动补齐围棋、反馈、权限、设置、更新公告和示例题。迁移前仍必须备份。

假设旧代码和数据位于 `/var/www/polynomial-home/data`：

```bash
sudo systemctl stop polynomial-home
sudo install -d -o root -g root -m 0700 /var/backups/polynomial-server
STAMP=$(date +%Y%m%d-%H%M%S)
sudo tar -C /var/www/polynomial-home -czf "/var/backups/polynomial-server/data-before-v020-${STAMP}.tar.gz" data
sudo rsync -a /var/www/polynomial-home/data/ /var/lib/polynomial-server/
sudo chown -R polynomial1027:polynomial1027 /var/lib/polynomial-server
sudo find /var/lib/polynomial-server -type d -exec chmod 0750 {} \;
sudo find /var/lib/polynomial-server -type f -exec chmod 0600 {} \;
```

如果旧数据在其他位置，只替换源路径。不要把旧 `data/` 删除；确认上线和备份均正常后再决定是否归档。

## 五、配置运行环境

安装示例环境文件：

```bash
sudo install -o root -g polynomial1027 -m 0640 \
  /var/www/polynomial-home/ops/polynomial-server.env.example \
  /etc/polynomial-server.env
sudo nano /etc/polynomial-server.env
```

必须修改：

- `ADMIN_PASSWORD`：首次创建全新数据时使用的强密码。
- `COOKIE_SECURE=true`：公网 HTTPS 必须为 `true`。
- 三个 `KATAGO_*` 路径：若使用文档默认目录可保持不变。

注意：`ADMIN_PASSWORD` 不会覆盖已有管理员密码。对于升级数据，登录后台修改密码。KataGo 环境变量只负责给全新数据提供初始路径；升级后的既有数据应在“管理后台 → 围棋预设与引擎”保存实际路径。

## 六、安装 KataGo（可选但人机模式必需）

截至 2026-07-20，KataGo 官方最新版本为 v1.16.5。始终从 [官方 Release](https://github.com/lightvector/KataGo/releases) 选择与你的硬件匹配的 Linux 包，并从 [KataGo Training](https://katagotraining.org/) 下载兼容的 `.bin.gz` 神经网络模型。官方说明提供四种后端：

| 服务器硬件 | 建议后端 | 说明 |
|---|---|---|
| 没有可用 GPU | Eigen / Eigen AVX2 | 最容易部署，但思考速度较慢；CPU 不支持 AVX2 时不要选 AVX2 |
| Intel/AMD/NVIDIA 通用 GPU | OpenCL | 通用性较高，需要正确厂商驱动 |
| NVIDIA 且已有对应 CUDA | CUDA | 性能较好，下载包与 CUDA 主版本必须匹配 |
| NVIDIA 且已有 TensorRT | TensorRT | 通常最快，TensorRT/CUDA 版本必须与发布包匹配 |

### 1. 可选 OpenCL 环境

```bash
sudo apt install -y ocl-icd-libopencl1 clinfo
clinfo
sudo usermod -aG render,video polynomial1027
```

还必须安装 GPU 厂商驱动。`clinfo` 看不到设备时，不要继续假设 KataGo 能使用 GPU；先改用 Eigen 或修复驱动。

### 2. 安装程序和模型

从官方 Release 下载压缩包到 `/tmp` 后解压。不同后端的压缩包文件名不同，下面的 `KATAGO_ARCHIVE` 替换为实际文件：

```bash
cd /tmp
KATAGO_ARCHIVE=/tmp/你下载的-katago-linux-x64.zip
unzip "$KATAGO_ARCHIVE" -d /tmp/katago-release
find /tmp/katago-release -type f -name katago -print
sudo install -o root -g root -m 0755 /tmp/katago-release/实际路径/katago /usr/local/bin/katago
sudo install -o polynomial1027 -g polynomial1027 -m 0640 \
  /你下载的模型/your-model.bin.gz \
  /var/lib/polynomial-katago/model.bin.gz
```

不要把模型解压；应用直接使用 `.bin.gz`。

### 3. 安装 GTP 配置

本项目附带低并发 Demo 起点：

```bash
sudo install -o polynomial1027 -g polynomial1027 -m 0640 \
  /var/www/polynomial-home/ops/katago-gtp-demo.cfg \
  /var/lib/polynomial-katago/gtp.cfg
```

更推荐让 KataGo根据实际硬件生成配置，再与示例中的日志、`ponderingEnabled=false` 和内存限制合并：

```bash
sudo -u polynomial1027 /usr/local/bin/katago genconfig \
  -model /var/lib/polynomial-katago/model.bin.gz \
  -output /var/lib/polynomial-katago/gtp-generated.cfg
```

项目通过 GTP `kata-set-param` 为每个难度动态覆盖 `maxVisits` 和 `maxTime`。不要在配置中启用无限 pondering。

### 4. 独立验证 KataGo

```bash
/usr/local/bin/katago version
sudo -u polynomial1027 /usr/local/bin/katago benchmark \
  -model /var/lib/polynomial-katago/model.bin.gz \
  -config /var/lib/polynomial-katago/gtp.cfg
printf 'name\nversion\nquit\n' | sudo -u polynomial1027 /usr/local/bin/katago gtp \
  -model /var/lib/polynomial-katago/model.bin.gz \
  -config /var/lib/polynomial-katago/gtp.cfg
```

三项都成功后，再在后台确认程序、模型、配置路径完全一致。后台应显示“KataGo 已就绪”；模型只有在第一局人机对弈时才会常驻加载。

## 七、安装 systemd 服务

```bash
sudo install -o root -g root -m 0644 \
  /var/www/polynomial-home/ops/polynomial-home.service \
  /etc/systemd/system/polynomial-home.service
sudo systemctl daemon-reload
sudo systemctl enable polynomial-home
sudo systemctl start polynomial-home
sudo systemctl status polynomial-home --no-pager
```

本机健康检查：

```bash
curl -i http://127.0.0.1:3000/
curl -i http://127.0.0.1:3000/games/go.html
curl -s http://127.0.0.1:3000/api/feedback/config
sudo journalctl -u polynomial-home -n 100 --no-pager
```

### 安装或保留 Notebook 功能

若已有 Notebook 环境，重新安装仓库中的受限脚本并确认 sudoers 用户与 systemd 的 `User=` 一致：

```bash
sudo install -o root -g root -m 0755 /var/www/polynomial-home/ops/polynomial-notebookctl /usr/local/sbin/polynomial-notebookctl
sudo install -o root -g root -m 0440 /var/www/polynomial-home/ops/polynomial-notebook.sudoers /etc/sudoers.d/polynomial-notebook
sudo visudo -c
sudo bash -n /usr/local/sbin/polynomial-notebookctl
```

不要把服务账号加入 `docker` 组。若是全新服务器，还应确认前文构建的镜像与内部网络存在；若是升级服务器，现有 `/opt/polynomial-notebook/users/` 存档不会被本次代码迁移移动。

## 八、配置 Nginx 与 HTTPS

复制示例：

```bash
sudo cp /var/www/polynomial-home/ops/nginx-polynomial-v0.2.0.conf /etc/nginx/sites-available/polynomial-home
sudo nano /etc/nginx/sites-available/polynomial-home
sudo ln -s /etc/nginx/sites-available/polynomial-home /etc/nginx/sites-enabled/polynomial-home
sudo nginx -t
sudo systemctl reload nginx
```

必须把 `server_name example.com;` 改成真实域名。若已有站点配置，只需要合并 `/go-socket`，并保留 `/chat-socket`、`/python/session/` 和 `/`。

申请 HTTPS 可使用 Certbot：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d 你的域名
sudo nginx -t
sudo systemctl reload nginx
```

HTTPS 成功后确认 `/etc/polynomial-server.env` 中 `COOKIE_SECURE=true`，再重启 Node 服务。

## 九、以后从 main 更新服务器

每次上线前都备份数据：

```bash
sudo systemctl stop polynomial-home
STAMP=$(date +%Y%m%d-%H%M%S)
sudo tar -C /var/lib -czf "/var/backups/polynomial-server/data-${STAMP}.tar.gz" polynomial-server
cd /var/www/polynomial-home
sudo -u polynomial1027 git fetch origin
sudo -u polynomial1027 git status --short
sudo -u polynomial1027 git switch main
sudo -u polynomial1027 git pull --ff-only origin main
sudo -u polynomial1027 npm ci --omit=dev
sudo -u polynomial1027 npm run check
sudo -u polynomial1027 npm test
sudo systemctl start polynomial-home
```

若 `git status --short` 有服务器本地改动，先停止，不要直接覆盖。把环境差异移到 `/etc/polynomial-server.env`、后台设置或独立运维文件中。

## 十、上线验收清单

用管理员和普通用户两个浏览器会话完成：

- [ ] 首页、聊天、网盘、学习、小游戏、围棋和后台均可打开。
- [ ] 管理员能给用户分别开关 9 个围棋权限。
- [ ] 用户 A 邀请用户 B；B 能接受、拒绝，A 能取消。
- [ ] 联机双方落子实时刷新，提子、禁入、劫有效。
- [ ] “不可悔棋”局无法申请；“需同意”局必须由对方决定。
- [ ] 计时局显示双方时间；测试环境可用短时间验证超时结果。
- [ ] 双方停一手后进入数目；相同方案自动结束；不同方案不出现管理员裁决入口。
- [ ] 人机对弈可选难度；引擎失败时能点击“重试机器人”。
- [ ] 已结束人机/联机棋局可查看终局和完整步骤，并下载 `.sgf`。
- [ ] 自由研究可自动换色、指定颜色、自由摆棋、保存分支并导入 SGF。
- [ ] 共享棋盘双方可编辑，房主可锁定和清空。
- [ ] 每个页面底部有反馈区；提交后进入后台“问题反馈汇总”。
- [ ] 后台只显示围棋预设、题库和汇总统计，没有修改实时棋局的入口。

## 十一、常见故障

### 页面正常，但围棋实时刷新失败

```bash
sudo nginx -T | grep -n 'go-socket'
sudo journalctl -u polynomial-home -f
```

确认 Nginx 为 `/go-socket` 传递 `Upgrade` 和 `Connection` 请求头。

### KataGo 显示环境不完整

```bash
sudo -u polynomial1027 test -x /usr/local/bin/katago && echo binary-ok
sudo -u polynomial1027 test -r /var/lib/polynomial-katago/model.bin.gz && echo model-ok
sudo -u polynomial1027 test -r /var/lib/polynomial-katago/gtp.cfg && echo config-ok
sudo journalctl -u polynomial-home -n 200 --no-pager
```

升级旧数据后，还要在后台保存这三个绝对路径。OpenCL 版本需检查 `clinfo` 和服务用户的 `render`/`video` 组。

### HTTPS 后反复回到登录页

确认 Nginx 传递 `X-Forwarded-Proto`，环境为 `COOKIE_SECURE=true`，浏览器访问的确实是 `https://`。

### 反馈用户都被一起限流

应用只在 Node 连接来自本机回环代理时信任 `X-Forwarded-For`。确认 Nginx 的 `/` 配置包含：

```nginx
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
```

### 数据写入失败

```bash
sudo chown -R polynomial1027:polynomial1027 /var/lib/polynomial-server
sudo -u polynomial1027 test -w /var/lib/polynomial-server && echo writable
sudo journalctl -u polynomial-home -n 100 --no-pager
```

## 十二、回滚到 0.1.5

代码和数据一起回滚最安全：

```bash
sudo systemctl stop polynomial-home
cd /var/www/polynomial-home
sudo -u polynomial1027 git fetch --tags origin
sudo -u polynomial1027 git switch --detach 你的0.1.5标签或提交号
sudo -u polynomial1027 npm ci --omit=dev
sudo mv /var/lib/polynomial-server "/var/lib/polynomial-server-v020-failed-$(date +%Y%m%d-%H%M%S)"
if [ -d /var/www/polynomial-home/data ]; then
  sudo mv /var/www/polynomial-home/data "/var/www/polynomial-home/data-before-rollback-$(date +%Y%m%d-%H%M%S)"
fi
sudo tar -C /var/www/polynomial-home -xzf /var/backups/polynomial-server/data-before-v020-时间戳.tar.gz
sudo chown -R polynomial1027:polynomial1027 /var/www/polynomial-home/data
sudo systemctl start polynomial-home
```

0.1.5 不识别新增的 `POLYNOMIAL_DATA_DIR`，所以旧数据必须恢复到旧代码使用的 `/var/www/polynomial-home/data`。完成后检查登录、聊天、网盘和课程数据；确认恢复正常前，不要删除 `polynomial-server-v020-failed-*` 或 `data-before-rollback-*`。

## 十三、备份建议

- 每日整体备份 `/var/lib/polynomial-server`。
- 每次部署前停服务做一致性备份。
- KataGo 模型可以重新下载，但自定义 `gtp.cfg` 应纳入运维备份。
- 定期在另一台机器实际解压并验证备份，而不是只检查压缩包存在。
- `store.json`、附件、网盘文件必须处于同一备份时间点。

环境与引擎官方参考：[Node.js 发布周期](https://nodejs.org/en/about/previous-releases)、[Docker Engine for Ubuntu](https://docs.docker.com/engine/install/ubuntu/)、[JupyterLab 安装](https://jupyterlab.readthedocs.io/en/latest/getting_started/installation.html)、[KataGo 主仓库与使用说明](https://github.com/lightvector/KataGo)、[KataGo Releases](https://github.com/lightvector/KataGo/releases)、[GTP 配置示例](https://github.com/lightvector/KataGo/blob/master/cpp/configs/gtp_example.cfg)、[GTP 扩展](https://github.com/lightvector/KataGo/blob/master/docs/GTP_Extensions.md)。
