# Polynomial Server Home 0.1.2

完整门户包含：首页、项目、小游戏、网盘、账号系统、实时聊天，以及集课程、代码实验、随机作业评测和按账号隔离的 JupyterLab 于一体的网络学习中心。

0.1.2 是完整功能首次整合后的新版本基线。网络学习先显示课程选择卡片，进入 Python 基础后恢复“左侧目录、中间正文与作业、右侧实验区”的稳定三栏布局；课程仍包含 11 章、64 个课节、129 个独立示例和 15 道随机评测作业。已有进度、草稿和提交记录保持兼容，后续自动更新公告标题将统一带版本号。

解压后，`index.html` 就在第一层目录。请注意：账号和实时聊天需要运行 `server.js`，不能只双击 HTML 或只把 HTML 当作纯静态文件上传。

## 首次部署

```bash
cd /var/www
sudo mkdir -p /var/www/polynomial-home
sudo unzip polynomial-server-home-v2-flat.zip -d /var/www/polynomial-home
cd /var/www/polynomial-home
sudo npm install --omit=dev
```

创建 systemd 服务：

```bash
sudo nano /etc/systemd/system/polynomial-home.service
```

粘贴以下内容，并务必修改 `ADMIN_PASSWORD`：

```ini
[Unit]
Description=Polynomial Server Home
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/var/www/polynomial-home
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOST=127.0.0.1
Environment=COOKIE_SECURE=false
Environment=ADMIN_USERNAME=polynomial
Environment=ADMIN_PASSWORD=请换成至少16位的强密码
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

然后运行：

```bash
sudo chown -R www-data:www-data /var/www/polynomial-home
sudo systemctl daemon-reload
sudo systemctl enable --now polynomial-home
```

## Nginx 配置

站点配置中的 `server` 段使用：

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location /chat-socket {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}

location ^~ /python/session/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    proxy_buffering off;
}
```

检查并重载：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

首次打开 `/login.html`，使用 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD` 登录。管理员可以在 `/admin.html` 创建其他账号。

## 修改内容

- 作者与邮箱：`index.html`
- 项目与 GitHub 链接：`projects.html`
- 小游戏入口：`games.html`
- 样式：`assets/site.css`

## 安全提醒

- 正式公开前配置 HTTPS，并将 `COOKIE_SECURE=true`。
- 不要使用 README 示例密码。
- `data/store.json` 含账号哈希和聊天记录，不要提交到公开 GitHub 仓库。
- 建议定期备份 `data/store.json`。
- 网盘实际文件位于 `data/drive/`，聊天上传位于 `data/uploads/`；备份时必须连同 `data/store.json` 一起保存，否则文件索引与内容无法对应。

## 网盘与网络学习

- `/drive.html`：私人网盘、公共共享盘和用户间分享。
- `/learning.html`：两章 Python 课程、课节笔记、内置代码编辑器、隐藏随机测试作业、资源记录和完整 JupyterLab 入口。
- `/python.html`：兼容旧链接，自动跳转到网络学习的代码实验区。
- 管理员可在 `/admin.html` 设置网盘额度、课程访问权限、代码运行与作业权限、同时运行人数、容器内存、CPU、Notebook 存档额度、硬配额和闲置停止时间。

## Notebook 主机配置

仓库不包含 1 GB 以上的本地 Docker 镜像。部署前需要在服务器准备好 `polynomial-notebook:local` 和内部网络 `polynomial-notebook-internal`。

安装已经审核的受限管理脚本。4.0 版增加了课程代码评测动作，升级时必须重新安装该脚本：

```bash
sudo install -o root -g root -m 0755 ops/polynomial-notebookctl /usr/local/sbin/polynomial-notebookctl
sudo install -o root -g root -m 0440 ops/polynomial-notebook.sudoers /etc/sudoers.d/polynomial-notebook
sudo visudo -c
```

`ops/polynomial-notebook.sudoers` 默认服务用户为 `polynomial1027`。如果 systemd 使用其他用户，安装前需要同步修改该文件。

将 `ops/nginx-notebook-location.conf` 中的 `location` 放入现有 Nginx `server` 块，然后检查并重载 Nginx。Node 服务只通过受限脚本管理带有固定镜像、固定内部网络、只读根文件系统和资源上限的 Notebook 容器，不应加入 `docker` 用户组。

默认参数适用于4核、约3.2 GiB内存的服务器：2人并发、每个容器512 MB内存、1核CPU、1 GB存档硬配额、30分钟闲置停止。安全范围由后端和 root 脚本共同验证。

## 默认敏感词库

后台“默认开源词库”使用 [konsheng/Sensitive-lexicon](https://github.com/konsheng/Sensitive-lexicon)。该项目采用 MIT License；原始版权与许可文本保存在 `third_party/Sensitive-lexicon/LICENSE`。词库只在服务启动时从本地加载，运行期间不会请求 GitHub。
