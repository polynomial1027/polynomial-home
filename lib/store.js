const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const dataDir = path.join(__dirname, '..', 'data');
const file = path.join(dataDir, 'store.json');

const defaultPermissions = {
  accessChat: true, createGroups: true, createDirect: true, postLobby: true,
  viewUsers: true, driveEnabled: true, viewPublicDrive: true,
  uploadPublicDrive: false, downloadPublicDrive: true, accessLearning: true, accessGames: true,
  accessNotebook: false
};

const defaultSettings = {
  maxUploadMB: 10,
  editWindowMinutes: 60,
  maxGroupMembers: 20,
  maxMessageLength: 1000,
  maxAttachmentsPerMessage: 5,
  messageHistoryLimit: 200,
  maxConversationsPerUser: 30,
  maxGameSaveKB: 256,
  allowFileUploads: true,
  sensitiveWordSource: 'custom',
  sensitiveWords: [],
  sensitiveWordMode: 'mask',
  notebookMaxConcurrent: 2,
  notebookMemoryMB: 512,
  notebookCpuMilli: 1000,
  notebookStorageMB: 1024,
  notebookQuotaEnabled: true,
  notebookIdleMinutes: 30
};

function repairFileNameEncoding(name) {
  const value = String(name || 'file');
  if (!/[\u0080-\u00ff]/.test(value)) return value;
  const repaired = Buffer.from(value, 'latin1').toString('utf8');
  return repaired && !repaired.includes('\ufffd') ? repaired : value;
}

function normalizeUser(user) {
  user.permissions = { ...defaultPermissions, ...(user.permissions || {}) };
  user.driveQuotaMB = Number.isSafeInteger(Number(user.driveQuotaMB)) ? Math.max(0, Number(user.driveQuotaMB)) : 1024;
  return user;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, saved) {
  const [salt, expected] = String(saved).split(':');
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, 'hex');
  return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
}

function initialState() {
  const username = process.env.ADMIN_USERNAME || 'polynomial';
  const password = process.env.ADMIN_PASSWORD || 'change-me-now';
  const state = {
    users: [normalizeUser({ id: crypto.randomUUID(), username, displayName: 'Polynomial', role: 'admin', active: true, passwordHash: hashPassword(password), createdAt: new Date().toISOString() })],
    sessions: [],
    messages: [],
    conversations: [],
    files: [],
    settings: { ...defaultSettings },
    announcements: [{ id: 'learning-layout-v012', title: '0.1.2 · 网络学习课程入口与三栏布局更新', content: '网络学习首页新增课程选择卡片，目前可进入 Python 基础课程；课程页面恢复左侧目录、中间知识正文与作业、右侧代码实验区的布局，并针对中等屏幕和手机端提供自适应排列。0.1.2 作为完整功能首次整合后的新版本基线，后续系统更新公告标题将统一带版本号。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { id: 'draft-navigation-admin-v1', title: '作业草稿、应用导航与公告管理更新', content: '网络学习新增“我的作业草稿”，可集中查看、继续编辑以及导出单份 Python 文件或全部 JSON。顶部导航将项目、小游戏、网盘、学习和聊天收纳到“应用”，更新公告移至其右侧；管理员公告管理默认折叠，并支持搜索标题和正文。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { id: 'navigation-v1', title: '全站导航与页面标签统一', content: '统一首页、更新公告、项目、小游戏、聊天和管理后台的导航顺序、名称与当前页面高亮；新增面包屑导航，并补齐游戏内部返回入口。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { id: 'game-match3-v1', title: '01号小游戏：星轨消消乐上线', content: '新增完整消消乐游戏，包含关卡目标、步数限制、连锁计分、提示、暂停、新游戏以及按账号自动保存和读取进度。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { id: 'update-v6', title: '聊天、游戏存档与管理功能更新', content: '新增账号游戏存档接口、更新公告、聊天记录分页管理、敏感词屏蔽，并扩展服务器参数设置。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
    gameSaves: []
    ,driveFiles: [], driveShares: [], learningProgress: [], learningSubmissions: []
  };
  state.announcements.unshift({ id: 'site-language-v013', title: '0.1.3 · 全站中英文切换上线', content: '全站右上角新增共享语言选择器，可在中文与 English 之间切换。导航、页面、后台、网盘、游戏、系统提示、Python 课程、作业说明、示例注释和评测结果都会跟随语言状态；聊天消息、文件名、姓名、笔记、草稿和其他用户输入保持原文。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  state.announcements.unshift({ id: 'draft-delete-v014', title: '0.1.4 · 作业草稿与聊天名称补丁', content: '“我的作业草稿”现可由草稿本人逐条删除，删除后会立即同步到当前账号；课程笔记旁新增“等待完善”提示；全站聊天入口名称统一为“聊天 / Chat”。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  state.announcements.unshift({ id: 'python-object-memory-v015', title: '0.1.5 · Python 内存前置课与聊天布局修复', content: '第一章最前面新增教材式“名称、引用与内存身份”前置课，准确讲解 == 与 is、CPython 小整数缓存、对象共享与 id() 等知识。聊天输入区恢复占满主栏，聊天记录固定在独立滚动区域内，长文本、文件名和附件不会再撑破消息栏或越过页脚。中英文课程现有 65 个课节和 140 个可独立运行示例，已有数据保持兼容。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  return state;
}

function load() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(file)) {
    const state = initialState();
    save(state);
    return state;
  }
  const state = JSON.parse(fs.readFileSync(file, 'utf8'));
  state.users ||= [];
  state.users.forEach(normalizeUser);
  state.sessions ||= [];
  state.messages ||= [];
  state.conversations ||= [];
  state.files ||= [];
  state.settings = { ...defaultSettings, ...(state.settings || {}) };
  state.announcements ||= [{ id: 'update-v6', title: '聊天、游戏存档与管理功能更新', content: '新增账号游戏存档接口、更新公告、聊天记录分页管理、敏感词屏蔽，并扩展服务器参数设置。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
  if (!state.announcements.some(item => item.id === 'game-match3-v1')) state.announcements.push({ id: 'game-match3-v1', title: '01号小游戏：星轨消消乐上线', content: '新增完整消消乐游戏，包含关卡目标、步数限制、连锁计分、提示、暂停、新游戏以及按账号自动保存和读取进度。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  if (!state.announcements.some(item => item.id === 'navigation-v1')) state.announcements.push({ id: 'navigation-v1', title: '全站导航与页面标签统一', content: '统一首页、更新公告、项目、小游戏、聊天和管理后台的导航顺序、名称与当前页面高亮；新增面包屑导航，并补齐游戏内部返回入口。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  if (!state.announcements.some(item => item.id === 'drive-learning-v1')) state.announcements.push({ id: 'drive-learning-v1', title: '文件网盘、账号权限与网络学习上线', content: '新增私人网盘、公共共享盘、用户间文件分享、聊天网盘附件、管理员网盘总览和细粒度账号权限；新增 Python 基础课程及按账号保存的学习进度。Notebook 在线执行环境将在下一阶段接入。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  if (!state.announcements.some(item => item.id === 'python-notebook-v1')) state.announcements.push({ id: 'python-notebook-v1', title: 'Python 实验室上线', content: '新增按账号隔离的 JupyterLab 在线执行环境。管理员可以控制账号权限、并发人数、容器内存与 CPU、存档配额和闲置停止时间。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  if (!state.announcements.some(item => item.id === 'admin-drive-filename-v1')) state.announcements.push({ id: 'admin-drive-filename-v1', title: '管理后台、网盘与文件名显示更新', content: '管理后台设置和用户权限现已按照聊天、网盘、小游戏与 Python 等功能折叠分组，每项参数独占一行；重新设计网盘上传和文件列表布局；修复聊天附件及网盘文件的中文文件名乱码，并兼容修复可识别的旧记录。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  if (!state.announcements.some(item => item.id === 'learning-lab-v1')) state.announcements.push({ id: 'learning-lab-v1', title: 'Python 课程、实验环境与作业评测上线', content: 'Python 实验室现已整合到网络学习。首批课程包含 Python 基础元素、列表与循环；学习者可在知识点旁运行代码、完成章节作业，并由服务器使用随机隐藏数据评测。系统记录通过状态、运行时间和内存占用，成绩可由用户选择公开或隐藏。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  if (!state.announcements.some(item => item.id === 'footer-assignment-v1')) state.announcements.push({ id: 'footer-assignment-v1', title: '全站页脚与课程作业流程更新', content: '全站页脚新增站点信息、导航、问题联系邮箱和测试版本号；主页补全开发者与测试人员信息。课程作业改为独立函数编辑器，支持保存草稿、页面测试和隐藏随机提交；测试通过前提交按钮保持禁用，用户可通过提交按钮旁的菜单选择是否公开成绩。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  if (!state.announcements.some(item => item.id === 'solution-public-results-v1')) state.announcements.push({ id: 'solution-public-results-v1', title: '课程作业格式与公开答案更新', content: '全部 Python 作业现已统一为 class Solution 方法格式，并为每题提供调用与返回示例。作业区新增“查看其他人的结果”，可以查看其他用户主动公开的答案代码、通过状态、耗时和内存；隐藏提交仍只对本人可见。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  if (!state.announcements.some(item => item.id === 'assignment-actual-result-v1')) state.announcements.push({ id: 'assignment-actual-result-v1', title: '作业测试结果与记录管理修复', content: '页面测试现在会逐条显示参数、实际返回值和期望返回值，None 会标记为“没有返回值”。用户可以恢复初始代码、清空自己的当前作业记录，并逐条切换公开模式；管理员可以删除公开答案。正式提交使用的隐藏随机测试仍不会向页面回传实际数据。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  if (!state.announcements.some(item => item.id === 'course-curriculum-v2')) state.announcements.push({ id: 'course-curriculum-v2', title: 'Python 完整基础课程 0.13.0 上线', content: '网络学习现包含 11 章、64 个课节、129 个可独立运行的示例和 15 道随机评测作业。新增对象思维导入章，并按顺序完整覆盖变量、字符串、数字、列表、循环、条件、字典、输入、函数、类、文件、异常、JSON 和自动化测试；已有进度、草稿和提交记录继续保留。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  if (!state.announcements.some(item => item.id === 'draft-navigation-admin-v1')) state.announcements.push({ id: 'draft-navigation-admin-v1', title: '作业草稿、应用导航与公告管理更新', content: '网络学习新增“我的作业草稿”，可集中查看、继续编辑以及导出单份 Python 文件或全部 JSON。顶部导航将项目、小游戏、网盘、学习和聊天收纳到“应用”，更新公告移至其右侧；管理员公告管理默认折叠，并支持搜索标题和正文。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  // 从 0.1.2 起，系统发布的版本更新公告标题必须以版本号开头。
  if (!state.announcements.some(item => item.id === 'learning-layout-v012')) state.announcements.push({ id: 'learning-layout-v012', title: '0.1.2 · 网络学习课程入口与三栏布局更新', content: '网络学习首页新增课程选择卡片，目前可进入 Python 基础课程；课程页面恢复左侧目录、中间知识正文与作业、右侧代码实验区的布局，并针对中等屏幕和手机端提供自适应排列。0.1.2 作为完整功能首次整合后的新版本基线，后续系统更新公告标题将统一带版本号。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  if (!state.announcements.some(item => item.id === 'site-language-v013')) state.announcements.push({ id: 'site-language-v013', title: '0.1.3 · 全站中英文切换上线', content: '全站右上角新增共享语言选择器，可在中文与 English 之间切换。导航、页面、后台、网盘、游戏、系统提示、Python 课程、作业说明、示例注释和评测结果都会跟随语言状态；聊天消息、文件名、姓名、笔记、草稿和其他用户输入保持原文。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  const patch014 = { title: '0.1.4 · 作业草稿与聊天名称补丁', content: '“我的作业草稿”现可由草稿本人逐条删除，删除后会立即同步到当前账号；课程笔记旁新增“等待完善”提示；全站聊天入口名称统一为“聊天 / Chat”。' };
  const patch014Item = state.announcements.find(item => item.id === 'draft-delete-v014');
  if (!patch014Item) state.announcements.push({ id: 'draft-delete-v014', ...patch014, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  else if (patch014Item.title !== patch014.title || patch014Item.content !== patch014.content) Object.assign(patch014Item, patch014, { updatedAt: new Date().toISOString() });
  const patch015 = { title: '0.1.5 · Python 内存前置课与聊天布局修复', content: '第一章最前面新增教材式“名称、引用与内存身份”前置课，准确讲解 == 与 is、CPython 小整数缓存、对象共享与 id() 等知识。聊天输入区恢复占满主栏，聊天记录固定在独立滚动区域内，长文本、文件名和附件不会再撑破消息栏或越过页脚。中英文课程现有 65 个课节和 140 个可独立运行示例，已有数据保持兼容。' };
  const patch015Item = state.announcements.find(item => item.id === 'python-object-memory-v015');
  if (!patch015Item) state.announcements.push({ id: 'python-object-memory-v015', ...patch015, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  else if (patch015Item.title !== patch015.title || patch015Item.content !== patch015.content) Object.assign(patch015Item, patch015, { updatedAt: new Date().toISOString() });
  state.gameSaves ||= [];
  state.driveFiles ||= [];
  state.driveShares ||= [];
  state.learningProgress ||= [];
  state.learningSubmissions ||= [];
  for (const progress of state.learningProgress) {
    if (progress.courseId !== 'python-basics') continue;
    progress.courseId = 'python-foundations-v1';
    const lessonMap = { intro: 'hello-world', variables: 'variables', control: 'for-loops', functions: 'hello-world' };
    progress.completedLessons = [...new Set((progress.completedLessons || []).map(id => lessonMap[id]).filter(Boolean))];
    if (progress.notes && !progress.lessonNotes) progress.lessonNotes = { 'hello-world': String(progress.notes).slice(0, 5000) };
  }
  state.files.forEach(item => { item.originalName = repairFileNameEncoding(item.originalName); });
  state.driveFiles.forEach(item => { item.originalName = repairFileNameEncoding(item.originalName); });
  state.messages.forEach(message => { (message.attachments || []).forEach(item => { item.originalName = repairFileNameEncoding(item.originalName); }); });
  state.messages.forEach(message => { message.conversationId ||= 'lobby'; });
  return state;
}

function save(state) {
  fs.mkdirSync(dataDir, { recursive: true });
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(temp, file);
}

module.exports = { load, save, hashPassword, verifyPassword, defaultPermissions, normalizeUser };
