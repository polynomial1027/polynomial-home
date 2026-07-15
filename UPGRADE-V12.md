# 升级到 Polynomial Server Home 0.13.0

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
- 修复旧 Notebook 容器仍在运行但令牌文件缺失时的启动错误，并在下次使用时自动重建容器且保留存档。
- 全站页脚加入站点说明、导航、问题联系邮箱和右下角版本号；
- 主页联系区只保留开发者 polynomial 和测试人员 dxinren；
- 作业使用独立函数编辑器，支持按账号保存草稿；
- 页面测试通过前提交按钮保持灰色，通过后变绿；
- 提交按钮右侧菜单控制成绩公开或隐藏，正式提交使用新的隐藏随机数据。
- 所有作业统一使用 `class Solution` 和指定的方法签名，服务器不再接受顶层函数代替答案；
- 每道作业显示调用、返回值与解题要求示例；
- “查看其他人的结果”会打开公开答案列表，只展示用户主动公开的代码、成绩、耗时和内存。
- 页面测试逐条显示实际返回值；返回 `None` 时明确提示“没有返回值”，隐藏正式测试不回传实际数据。
- 用户可以一键恢复完整的 `class Solution` 初始模板、清空当前作业的个人提交记录，并逐条切换记录为公开或隐藏；
- 管理员可以在公开答案窗口中删除其他用户主动公开的提交。

## 0.13.0 课程内容更新

- 课程扩展为 11 章、64 个课节和 15 道 `class Solution` 作业；
- 第一章以大量示例讲解对象、类型、类、实例、属性、方法和点号语法；
- 后续章节按顺序覆盖变量与简单类型、列表、操作列表、if、字典、输入与 while、函数、类、文件与异常、测试；
- 附件目录列出的全部知识点均有对应的可见小节，Python 2 内容标记为历史差异；
- 129 个示例均经过独立运行验证，点击任意“在右侧运行”都不依赖前一个代码块；
- 保留现有课程 ID以及主要课节和作业 ID，已有学习数据不会因课程扩展被主动清空。

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
