# Polynomial Server Home

一个无需 Node.js、数据库或第三方 CDN 的纯静态服务器主页。

## 文件结构

```text
polynomial-server-home/
├── index.html
├── assets/
│   ├── css/style.css
│   └── js/main.js
└── README.md
```

## 部署到 Nginx

将压缩包上传到服务器后执行：

```bash
sudo mkdir -p /var/www/polynomial-home
sudo cp -r polynomial-server-home/* /var/www/polynomial-home/
sudo chown -R www-data:www-data /var/www/polynomial-home
sudo find /var/www/polynomial-home -type d -exec chmod 755 {} \;
sudo find /var/www/polynomial-home -type f -exec chmod 644 {} \;
sudo nginx -t
sudo systemctl reload nginx
```

如果你已经在 `/var/www/polynomial-home` 中解压，以上复制命令可以跳过。

## 部署前建议修改

- 在 `index.html` 中把 `hello@example.com` 换成你的邮箱。
- 项目卡目前是展示卡；需要跳转时，把对应 `article` 改成带 `href` 的链接或在卡片内添加链接。
- `assets/js/main.js` 中的时区是 `America/Toronto`，可以改成其他 IANA 时区。
- 静态页面无法安全读取服务器 CPU、内存等指标，因此主页只显示服务结构。真实监控应通过经过鉴权的 API 或独立监控面板接入。
