# 升级到 Polynomial Server 0.2.4

本版本为围棋棋局管理更新，不改变现有数据结构，不需要重新安装 KataGo 配置。

## 更新

在 Mac 本地项目覆盖新版本文件、提交并推送 `main` 后，在服务器以普通用户运行：

```bash
cd /var/www/polynomial-home
update-polynomial-home
```

不要在更新命令前添加 `sudo`。

## 验证

```bash
node -p "require('./package.json').version"
npm test
sudo systemctl is-active polynomial-home
```

预期看到版本 `0.2.4`、21 项测试通过以及服务状态 `active`。
