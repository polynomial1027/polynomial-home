# 从 0.2.1 升级到 0.2.2

本次只更新网站代码，不修改 `/var/lib/polynomial-server` 中的账号、文件、课程进度或棋谱，也不需要重新安装 KataGo 配置。

## 本地 VS Code

将压缩包内全部文件覆盖到原 `polynomial-home` Git 项目根目录，然后执行：

```bash
git add -A
git commit -m "fix: persist user permissions and drive quota"
git push origin main
```

## 服务器

以 `polynomial1027` 用户运行一键更新，不要加 sudo：

```bash
cd /var/www/polynomial-home
update-polynomial-home
```

## 验证

```bash
node -p "require('./package.json').version"
npm test
sudo systemctl is-active polynomial-home
curl -sS -o /dev/null -w '首页 HTTP %{http_code}\n' http://127.0.0.1:3000/
```

预期版本为 `0.2.2`，测试 `19 pass / 0 fail`，服务为 `active`，首页为 `HTTP 200`。

网页中强制刷新管理后台后，打开同一用户两次，确认网盘额度与全部权限保持不变；再用该用户进入围棋中心并返回后台复查，权限不应发生变化。
