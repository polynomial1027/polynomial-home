# 升级到 0.2.3

1. 在 Mac 本地项目中覆盖本压缩包的全部内容并提交到 `main`。
2. 在服务器以普通用户运行 `update-polynomial-home`，不要在命令前加 `sudo`。
3. 安装本版本修正后的 KataGo 配置：

```bash
cd /var/www/polynomial-home

sudo install \
  -o polynomial1027 \
  -g polynomial1027 \
  -m 0640 \
  ops/katago-gtp-demo.cfg \
  /var/lib/polynomial-katago/gtp.cfg

sudo systemctl restart polynomial-home
```

4. 验证：

```bash
node -p "require('./package.json').version"
npm run check
npm test
sudo systemctl is-active polynomial-home
```

预期版本为 `0.2.3`，测试为 `20 pass / 0 fail`，服务状态为 `active`。

升级不会删除 `/var/lib/polynomial-server` 中的账号、网盘、聊天、课程进度或围棋棋谱。
