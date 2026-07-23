# 升级到 0.2.5

覆盖项目代码并推送到 `main` 后，在服务器运行：

```bash
cd /var/www/polynomial-home
update-polynomial-home
```

验证：

```bash
node -p "require('./package.json').version"
npm test
sudo systemctl is-active polynomial-home
```

预期版本为 `0.2.5`，测试为 `24 pass / 0 fail`，服务状态为 `active`。

本次不需要重新安装 KataGo 配置，也不会清除现有数据。
