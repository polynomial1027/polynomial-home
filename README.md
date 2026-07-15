# Polynomial Server Home 2.0

完整主页包含：首页、项目页、小游戏菜单、账号登录、管理员分配账号、登录后实时聊天。

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
- `/learning.html`：Python 基础示例课程，学习进度和笔记按账号保存。
- 管理员可在 `/admin.html` 为每位用户设置网盘额度和聊天、网盘、小游戏、网络学习等功能权限，并查看全部网盘文件。
- 在线 Notebook 执行环境尚未启用，后续应使用隔离容器部署，不能直接在主 Node 进程中执行用户 Python 代码。

## 默认敏感词库

后台“默认开源词库”使用 [konsheng/Sensitive-lexicon](https://github.com/konsheng/Sensitive-lexicon)。该项目采用 MIT License；原始版权与许可文本保存在 `third_party/Sensitive-lexicon/LICENSE`。词库只在服务启动时从本地加载，运行期间不会请求 GitHub。
