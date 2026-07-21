# 从 0.2.0 升级到 0.2.1

本次升级不会删除账号、聊天、网盘、课程、围棋棋谱或其他数据。生产数据应继续保存在 `/var/lib/polynomial-server`，不要将该目录替换为压缩包中的内容。

## 1. 替换网站代码

将压缩包解压后的文件同步到：

```text
/var/www/polynomial-home
```

不要复制压缩包内不存在的 `data/`，也不要删除 `/var/lib/polynomial-server`。

## 2. 更新 KataGo 配置

在网站目录执行：

```bash
sudo install \
  -o polynomial1027 \
  -g polynomial1027 \
  -m 0640 \
  ops/katago-gtp-demo.cfg \
  /var/lib/polynomial-katago/gtp.cfg
```

这会关闭 KataGo 自带的提前认输，并明确要求胜率和目数从当前落子方视角返回。若现有 systemd 服务使用其他账号，请把命令中的用户和用户组换成原账号。

## 3. 安装依赖并验证

```bash
npm ci --omit=dev
npm run check
npm test
```

## 4. 重启服务

```bash
sudo systemctl restart polynomial-home
sudo systemctl status polynomial-home --no-pager -l
curl -sS -o /dev/null -w '首页 HTTP %{http_code}\n' http://127.0.0.1:3000/
```

预期服务为 `active (running)`，首页为 `HTTP 200`。

## 5. 网页验证

1. 强制刷新围棋页面。
2. 创建 9 路入门人机棋局，确认机器人落点不再总是最佳点。
3. 双方各停一手，确认页面直接显示 KataGo 自动结算结果，不出现死子选择界面。
4. 查看导出的 SGF，确认 `RE[...]` 与网页胜负一致。

