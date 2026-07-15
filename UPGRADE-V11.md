# 升级到 Polynomial Server Home 3.1

本压缩包是完整源码，可以直接覆盖 GitHub `main` 分支中的程序文件。服务器上的 `data/`、环境变量、Docker 镜像、Notebook 用户存档和主机脚本配置不包含在压缩包中，也不应被 Git 覆盖。

## 本次更新

- 管理后台参数按照聊天、网盘、小游戏和 Python 实验室折叠分组；
- 用户基本设置和权限按照功能分组，每个设置独占一行；
- 网盘上传区域重新排版，文件、保存位置与上传按钮清晰对齐；
- 网盘文件列表针对长文件名和手机屏幕重新布局；
- 修复聊天上传与网盘上传的中文文件名解析；
- 服务启动时自动修复旧数据中可识别的 UTF-8/Latin-1 文件名乱码；
- 包含上一版按账号隔离的 JupyterLab Python 实验室功能。

## 自动同步后的检查

```bash
cd /var/www/polynomial-home
npm install --omit=dev
npm run check
sudo systemctl restart polynomial-home
sudo systemctl status polynomial-home --no-pager
```

随后以管理员身份打开 `/admin.html`，并分别在聊天和网盘上传一个中文文件名的测试文件。
