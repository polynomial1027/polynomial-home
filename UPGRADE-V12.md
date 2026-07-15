# 升级到 Polynomial Server Home 4.0

本压缩包是完整源码。它保留管理后台、网盘、中文文件名修复和现有 Notebook 存档，并把 Python 实验室整合到网络学习。

## 本次更新

- 网络学习新增两章原创 Python 课程，共 15 个课节；
- 课程知识点、示例代码、代码编辑器和运行输出在同一页面；
- 提供 7 个作业，服务器每次生成不同的隐藏随机测试；
- 记录通过状态、运行时间和 Python 进程峰值内存；
- 用户可以公开或隐藏每次作业记录，公开记录不包含提交代码；
- 课程笔记和完成状态按课节、按账号保存；
- 保留完整 JupyterLab 入口，旧 `/python.html` 自动跳转到网络学习；
- 管理后台权限改为“课程访问”和“代码运行与作业评测”；
- 保留上一版后台分组、网盘布局和中文文件名修复。

## 服务器升级

先使用现有更新命令同步 GitHub：

```bash
update-polynomial-home
```

本版扩展了 root 管理脚本，必须执行一次：

```bash
cd /var/www/polynomial-home
sudo install -o root -g root -m 0755 ops/polynomial-notebookctl /usr/local/sbin/polynomial-notebookctl
sudo install -o root -g root -m 0440 ops/polynomial-notebook.sudoers /etc/sudoers.d/polynomial-notebook
sudo visudo -c
sudo systemctl restart polynomial-home
```

检查：

```bash
npm run check
sudo bash -n /usr/local/sbin/polynomial-notebookctl
sudo systemctl status polynomial-home --no-pager
```

现有 `data/`、`/opt/polynomial-notebook/users/`、Docker 镜像和 Notebook 文件不会被 Git 更新删除。
