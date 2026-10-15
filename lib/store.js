const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { StateDatabase } = require('./database');

const configuredDataDir = String(process.env.POLYNOMIAL_DATA_DIR || '').trim();
if (configuredDataDir && !path.isAbsolute(configuredDataDir)) throw new Error('POLYNOMIAL_DATA_DIR 必须是绝对路径');
const dataDir = configuredDataDir || path.join(__dirname, '..', 'data');
const file = path.join(dataDir, 'store.json');
let database;
function getDatabase() { return database ||= new StateDatabase(dataDir); }

const defaultPermissions = {
  accessChat: true, createGroups: true, createDirect: true, postLobby: true,
  viewUsers: true, driveEnabled: true, viewPublicDrive: true,
  uploadPublicDrive: false, downloadPublicDrive: true, accessLearning: true, accessGames: true,
  accessNotebook: false,
  accessAssistant: false, accessPlanner: true,
  accessGo: true, goStudy: true, goPuzzles: true, goAi: true,
  goMultiplayer: true, goInvite: true, goShared: true, goSgfImport: true, goSgfExport: true
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
  notebookIdleMinutes: 30,
  goEnabled: true,
  goAllowedBoardSizes: [9, 13, 19],
  goDefaultBoardSize: 19,
  goAllowedRules: ['chinese'],
  goDefaultRules: 'chinese',
  goAllowedKoRules: ['positional-superko', 'simple-ko'],
  goDefaultKoRule: 'positional-superko',
  goDefaultKomi: 7.5,
  goHandicapKomi: 0,
  goMaxHandicap: 9,
  goAllowedTimeSystems: ['none', 'absolute', 'byoyomi'],
  goDefaultMainMinutes: 30,
  goMaxMainMinutes: 180,
  goDefaultByoYomiSeconds: 30,
  goDefaultByoYomiPeriods: 3,
  goUndoDefault: 'request',
  goMaxUndoRequests: 3,
  goInviteExpiryMinutes: 10,
  goMaxPendingInvites: 5,
  goDisconnectPolicy: 'continue',
  goDisconnectGraceSeconds: 180,
  goRecordDefaultVisibility: 'participants',
  goSharedMaxParticipants: 2,
  goStudyMaxCount: 50,
  goStudyMaxKB: 512,
  goAiEnabled: true,
  goAiMaxConcurrent: 1,
  goAiMoveTimeoutSeconds: 30,
  goAiResignWinrateThreshold: 0.5,
  goAiResignConsecutiveTurns: 12,
  goScoreMaxVisits: 160,
  goScoreMaxTime: 6,
  goScoreForcedAfter: 3,
  goKataGoBinary: process.env.KATAGO_BIN || '/usr/local/bin/katago',
  goKataGoModel: process.env.KATAGO_MODEL || '/var/lib/polynomial-katago/model.bin.gz',
  goKataGoConfig: process.env.KATAGO_CONFIG || '/var/lib/polynomial-katago/gtp.cfg',
  goAiProfiles: [
    { id: 'beginner', name: '入门', description: '在多个候选点中随机落子，适合刚学规则', maxVisits: 12, maxTime: 0.4, candidatePool: 10 },
    { id: 'easy', name: '初级', description: '保留明显随机性，允许常见失误', maxVisits: 40, maxTime: 1.5, candidatePool: 5 },
    { id: 'medium', name: '中级', description: '在少量优选点中选择', maxVisits: 160, maxTime: 4, candidatePool: 2 },
    { id: 'strong', name: '高级', description: '选择 KataGo 首选落点', maxVisits: 600, maxTime: 10, candidatePool: 1 }
  ],
  goBoardSkins: ['walnut', 'bamboo', 'midnight'],
  goStoneSkins: ['classic', 'slate', 'flat'],
  goDefaultBoardSkin: 'walnut',
  goDefaultStoneSkin: 'classic',
  feedbackEnabled: true,
  feedbackAnonymousEnabled: true,
  feedbackMaxPerHour: 5,
  feedbackRetentionDays: 365,
  assistantEnabled: false,
  assistantDailyTokens: 100000, assistantMonthlyTokens: 1000000,
  assistantDailyRequests: 200, assistantMonthlyRequests: 2000,
  assistantDefaultUserDailyTokens: 10000, assistantDefaultUserMonthlyTokens: 100000,
  assistantDefaultUserDailyRequests: 20, assistantDefaultUserMonthlyRequests: 200,
  assistantMaxOutputTokens: 512,
  assistantAutoReview: false, assistantReviewFrequency: 'off', assistantAutoMaintenance: false,
  automaticBackup: true, backupRetention: 7, aiRecordRetentionDays: 90, auditRetentionDays: 365
};

function repairFileNameEncoding(name) {
  const value = String(name || 'file');
  if (!/[\u0080-\u00ff]/.test(value)) return value;
  const repaired = Buffer.from(value, 'latin1').toString('utf8');
  return repaired && !repaired.includes('\ufffd') ? repaired : value;
}

function normalizeUser(user) {
  user.permissions = { ...(user.role==='guest'?require('./account-policy').guestPermissions:defaultPermissions), ...(user.permissions || {}) };
  user.driveQuotaMB = Number.isSafeInteger(Number(user.driveQuotaMB)) ? Math.max(0, Number(user.driveQuotaMB)) : 1024;
  user.assistantLimits ||= {};
  return require('./account-policy').apply(user);
}

function updatePermissions(existing, updates) {
  const validUpdates = updates && typeof updates === 'object'
    ? Object.fromEntries(Object.entries(updates).filter(([key, value]) => Object.hasOwn(defaultPermissions, key) && typeof value === 'boolean'))
    : {};
  return { ...defaultPermissions, ...(existing || {}), ...validUpdates };
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
  if (password.length < 4) throw new Error('ADMIN_PASSWORD 必须至少 4 位');
  const state = {
    users: [normalizeUser({ id: crypto.randomUUID(), username, displayName: 'Polynomial', role: 'admin', active: true, passwordHash: hashPassword(password), createdAt: new Date().toISOString() })],
    sessions: [],
    messages: [],
    conversations: [],
    files: [],
    settings: { ...defaultSettings },
    announcements: [{ id: 'learning-layout-v012', title: '0.1.2 · 网络学习课程入口与三栏布局更新', content: '网络学习首页新增课程选择卡片，目前可进入 Python 基础课程；课程页面恢复左侧目录、中间知识正文与作业、右侧代码实验区的布局，并针对中等屏幕和手机端提供自适应排列。0.1.2 作为完整功能首次整合后的新版本基线，后续系统更新公告标题将统一带版本号。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { id: 'draft-navigation-admin-v1', title: '作业草稿、应用导航与公告管理更新', content: '网络学习新增“我的作业草稿”，可集中查看、继续编辑以及导出单份 Python 文件或全部 JSON。顶部导航将项目、小游戏、网盘、学习和聊天收纳到“应用”，更新公告移至其右侧；管理员公告管理默认折叠，并支持搜索标题和正文。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { id: 'navigation-v1', title: '全站导航与页面标签统一', content: '统一首页、更新公告、项目、小游戏、聊天和管理后台的导航顺序、名称与当前页面高亮；新增面包屑导航，并补齐游戏内部返回入口。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { id: 'game-match3-v1', title: '01号小游戏：星轨消消乐上线', content: '新增完整消消乐游戏，包含关卡目标、步数限制、连锁计分、提示、暂停、新游戏以及按账号自动保存和读取进度。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { id: 'update-v6', title: '聊天、游戏存档与管理功能更新', content: '新增账号游戏存档接口、更新公告、聊天记录分页管理、敏感词屏蔽，并扩展服务器参数设置。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
    gameSaves: [],
    driveFiles: [], driveShares: [], learningProgress: [], learningSubmissions: [],
    goInvitations: [], goGames: [], goStudies: [], goPuzzles: [], goPuzzleAttempts: [], goUserSettings: [],
    feedbackItems: [], goConfigHistory: [], auditLogs: [], assistantUsage: [], assistantChats: [], assistantQueuedChats: [], adminButlerChats: [], adminButlerActions: [], plannerItems: [], dailyBriefViews: [], healthReports: [], assistantReviews: []
  };
  state.announcements.unshift({ id: 'site-language-v013', title: '0.1.3 · 全站中英文切换上线', content: '全站右上角新增共享语言选择器，可在中文与 English 之间切换。导航、页面、后台、网盘、游戏、系统提示、Python 课程、作业说明、示例注释和评测结果都会跟随语言状态；聊天消息、文件名、姓名、笔记、草稿和其他用户输入保持原文。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  state.announcements.unshift({ id: 'draft-delete-v014', title: '0.1.4 · 作业草稿与聊天名称补丁', content: '“我的作业草稿”现可由草稿本人逐条删除，删除后会立即同步到当前账号；课程笔记旁新增“等待完善”提示；全站聊天入口名称统一为“聊天 / Chat”。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  state.announcements.unshift({ id: 'python-object-memory-v015', title: '0.1.5 · Python 内存前置课与聊天布局修复', content: '第一章最前面新增教材式“名称、引用与内存身份”前置课，准确讲解 == 与 is、CPython 小整数缓存、对象共享与 id() 等知识。聊天输入区恢复占满主栏，聊天记录固定在独立滚动区域内，长文本、文件名和附件不会再撑破消息栏或越过页脚；发起聊天窗口可随时取消，并补充私聊与聊天组区别说明。中英文课程现有 65 个课节和 140 个可独立运行示例，已有数据保持兼容。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  state.announcements.unshift({ id: 'go-demo-v020', title: '0.2.0 · 围棋中心与全站问题反馈 Demo', content: '小游戏新增围棋中心 Demo，包含自定义研究、管理员题库、人机对弈接口、账号邀请联机和共享棋盘；正式对局支持规则校验、提子、悔棋约定、计时、双方数目确认、断线恢复、棋谱回放与 SGF 导出。管理员负责规则和资源预设，不承担实时裁决；数目争议由双方调整方案或恢复对局。全站页面底部新增统一问题反馈区，反馈会集中进入管理后台。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  state.announcements.unshift({ id: 'go-katago-adjudication-v021', title: '0.2.1 · 围棋人机难度与 KataGo 自动结算修复', content: '入门、初级和中级机器人改为从不同大小的 KataGo 合法候选池中随机落子，降低低难度棋力；机器人胜率连续 12 个自身回合低于 50% 时自动认输。正式人机与联机棋局在双方连续停一手后，统一使用 KataGo 的目数反馈判定胜负，不再要求玩家自行选择死子。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  state.announcements.unshift({ id: 'user-permissions-v022', title: '0.2.2 · 用户权限与网盘额度修复', content: '修复修改用户时网盘额度未正确回填，以及不完整权限请求会关闭未提交权限的问题。管理后台现在会读取并显示服务器上的最新额度与全部权限，保存后再次核验状态；围棋访问和各子功能权限不会再因进入页面或编辑其他资料而被重置。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  state.goPuzzles.push({
    id: 'go-demo-capture-001', title: '吃掉一颗白子', description: '找到白棋最后一口气。', objective: '黑先吃白', boardSize: 9,
    difficulty: '入门', tags: ['吃子', '基础'], source: 'Polynomial Server Demo', status: 'published',
    initialStones: [{ color: 'W', x: 1, y: 1 }, { color: 'B', x: 0, y: 1 }, { color: 'B', x: 1, y: 0 }, { color: 'B', x: 2, y: 1 }],
    nextPlayer: 'B', userColor: 'B', hints: ['观察白棋还有几个气。'],
    solutionTree: [{ color: 'B', x: 1, y: 2, solved: true, explanation: '正确，这一手填住白棋最后一口气。', children: [] }],
    createdBy: state.users[0].id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  });
  return state;
}

function load() {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = getDatabase();
  let state = db.read();
  if (!state) {
    if (fs.existsSync(file)) {
      state = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!Array.isArray(state.users) || !state.settings) throw new Error('原数据文件格式错误，已停止迁移');
      const migrationBackup = path.join(dataDir, 'store-before-sqlite.json');
      if (!fs.existsSync(migrationBackup)) fs.copyFileSync(file, migrationBackup, fs.constants.COPYFILE_EXCL);
      fs.chmodSync(migrationBackup, 0o600);
    } else state = initialState();
    db.write(state);
    if (!db.check()) throw new Error('数据库迁移校验失败');
  }
  const hadReviewFrequency = Object.hasOwn(state.settings || {}, 'assistantReviewFrequency');
  state.users ||= [];
  state.users.forEach(normalizeUser);
  state.sessions ||= [];
  state.messages ||= [];
  state.conversations ||= [];
  state.files ||= [];
  state.settings = { ...defaultSettings, ...(state.settings || {}) };
  if (!hadReviewFrequency) state.settings.assistantReviewFrequency = state.settings.assistantAutoReview ? 'daily' : 'off';
  state.auditLogs ||= [];
  state.assistantUsage ||= [];
  state.assistantUsage = state.assistantUsage.filter(item => Date.now() - new Date(item.at).getTime() < 400 * 86400_000);
  for (const item of state.assistantUsage) if (item.status === 'reserved') { item.status = 'failed'; item.tokenBasis = 'reservation'; if (item.detail) item.detail.error = '服务重启中断调用，实际用量未知；保留预留额度。'; }
  state.assistantChats ||= [];
  state.assistantQueuedChats ||= [];
  require('./ai-sessions').migrate(state);
  state.adminButlerChats ||= [];
  state.adminButlerActions ||= [];
  for (const queued of state.assistantQueuedChats) if (queued.status === 'running') { queued.status = 'failed'; queued.error = '服务重启中断了本次发送，请重新提交'; }
  state.plannerItems ||= [];
  state.pushSubscriptions ||= [];
  state.reminderDeliveries ||= [];
  state.dailyBriefViews ||= [];
  state.healthReports ||= [];
  state.assistantReviews ||= [];
  state.scheduledJobs ||= [];
  state.jobRuns ||= [];
  for (const review of state.assistantReviews) if (review.status === 'running') { review.status = 'failed'; review.error = '服务重启中断了本次巡检'; }
  if (!state.announcements?.some(item => item.id === 'maintenance-ui-chat-v026')) state.announcements?.unshift({
    id: 'maintenance-ui-chat-v026', title: '0.2.6 · 界面、英文模式、聊天与课程评测修复',
    content: '删除页面中无实际信息的概述文字；统一网络学习标题边距。修复英文界面将未知文本替换成错误句、私聊标题和管理后台内容异常，以及浏览器翻译插件冲突。聊天现支持粘贴和发送多行文本，编辑按钮会遵守后台时限，历史消息数量严格按照设置重新载入并显示截断提示。修复 Python Chapter 2.5 作业测试超出本节教学范围的问题，并在字符串评测中显式标记空格、制表符与换行。',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  });
  if (!state.announcements?.some(item => item.id === 'go-audit-sgf-v025')) state.announcements?.unshift({
    id: 'go-audit-sgf-v025', title: '0.2.5 · 操作记录、SGF 协作与围棋判定更新',
    content: '管理后台新增用户在线状态、最近活动、登录地址、设备与操作记录。围棋研究可在棋盘内导入 SGF，共享棋盘房主可载入 SGF 后继续协作；结束棋局支持重新开局。联机认输改为双方确认，拒绝后继续下棋，并与 KataGo 结算共用后台可调的累计强制判定次数。',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  });
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
  const patch015 = { title: '0.1.5 · Python 内存前置课与聊天布局修复', content: '第一章最前面新增教材式“名称、引用与内存身份”前置课，准确讲解 == 与 is、CPython 小整数缓存、对象共享与 id() 等知识。聊天输入区恢复占满主栏，聊天记录固定在独立滚动区域内，长文本、文件名和附件不会再撑破消息栏或越过页脚；发起聊天窗口可随时取消，并补充私聊与聊天组区别说明。中英文课程现有 65 个课节和 140 个可独立运行示例，已有数据保持兼容。' };
  const patch015Item = state.announcements.find(item => item.id === 'python-object-memory-v015');
  if (!patch015Item) state.announcements.push({ id: 'python-object-memory-v015', ...patch015, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  else if (patch015Item.title !== patch015.title || patch015Item.content !== patch015.content) Object.assign(patch015Item, patch015, { updatedAt: new Date().toISOString() });
  const release020 = { title: '0.2.0 · 围棋中心与全站问题反馈 Demo', content: '小游戏新增围棋中心 Demo，包含自定义研究、管理员题库、人机对弈接口、账号邀请联机和共享棋盘；正式对局支持规则校验、提子、悔棋约定、计时、双方数目确认、断线恢复、棋谱回放与 SGF 导出。管理员负责规则和资源预设，不承担实时裁决；数目争议由双方调整方案或恢复对局。全站页面底部新增统一问题反馈区，反馈会集中进入管理后台。' };
  const release020Item = state.announcements.find(item => item.id === 'go-demo-v020');
  if (!release020Item) state.announcements.unshift({ id: 'go-demo-v020', ...release020, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  else if (release020Item.title !== release020.title || release020Item.content !== release020.content) Object.assign(release020Item, release020, { updatedAt: new Date().toISOString() });
  const release021 = { title: '0.2.1 · 围棋人机难度与 KataGo 自动结算修复', content: '入门、初级和中级机器人改为从不同大小的 KataGo 合法候选池中随机落子，降低低难度棋力；机器人胜率连续 12 个自身回合低于 50% 时自动认输。正式人机与联机棋局在双方连续停一手后，统一使用 KataGo 的目数反馈判定胜负，不再要求玩家自行选择死子。' };
  const release021Item = state.announcements.find(item => item.id === 'go-katago-adjudication-v021');
  if (!release021Item) state.announcements.unshift({ id: 'go-katago-adjudication-v021', ...release021, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  else if (release021Item.title !== release021.title || release021Item.content !== release021.content) Object.assign(release021Item, release021, { updatedAt: new Date().toISOString() });
  const release022 = { title: '0.2.2 · 用户权限与网盘额度修复', content: '修复修改用户时网盘额度未正确回填，以及不完整权限请求会关闭未提交权限的问题。管理后台现在会读取并显示服务器上的最新额度与全部权限，保存后再次核验状态；围棋访问和各子功能权限不会再因进入页面或编辑其他资料而被重置。' };
  const release022Item = state.announcements.find(item => item.id === 'user-permissions-v022');
  if (!release022Item) state.announcements.unshift({ id: 'user-permissions-v022', ...release022, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  else if (release022Item.title !== release022.title || release022Item.content !== release022.content) Object.assign(release022Item, release022, { updatedAt: new Date().toISOString() });
  state.gameSaves ||= [];
  state.driveFiles ||= [];
  state.driveShares ||= [];
  state.learningProgress ||= [];
  state.learningSubmissions ||= [];
  state.goInvitations ||= [];
  state.goGames ||= [];
  state.goStudies ||= [];
  state.goPuzzles ||= [];
  state.goPuzzleAttempts ||= [];
  state.goUserSettings ||= [];
  state.feedbackItems ||= [];
  state.goConfigHistory ||= [];
  if (!state.goPuzzles.some(item => item.id === 'go-demo-capture-001')) state.goPuzzles.push({
    id: 'go-demo-capture-001', title: '吃掉一颗白子', description: '找到白棋最后一口气。', objective: '黑先吃白', boardSize: 9,
    difficulty: '入门', tags: ['吃子', '基础'], source: 'Polynomial Server Demo', status: 'published',
    initialStones: [{ color: 'W', x: 1, y: 1 }, { color: 'B', x: 0, y: 1 }, { color: 'B', x: 1, y: 0 }, { color: 'B', x: 2, y: 1 }],
    nextPlayer: 'B', userColor: 'B', hints: ['观察白棋还有几个气。'],
    solutionTree: [{ color: 'B', x: 1, y: 2, solved: true, explanation: '正确，这一手填住白棋最后一口气。', children: [] }],
    createdBy: state.users.find(item => item.role === 'admin')?.id || null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  });
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
  state.resourceDownloads ||= [];
  state.clientReleases ||= [];
  if (!state.clientReleases.some(item => item.version === '0.3.3')) state.clientReleases.push({ version: '0.3.3', status: 'building', notes: '新增使用系统 WebView 的轻量桌面客户端，保留版本显示与检查更新。Windows 使用 WebView2；Linux 需要 WebKitGTK 4.1 系统依赖。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  for (const release of [{ version: '0.3.0', status: 'withdrawn', notes: '初始试用构建；建议使用后续修复版本。' }, { version: '0.3.1', status: 'testing', notes: '修复 Windows 及含空格安装路径下的连接设置；区分芯片类型。' }, { version: '0.3.2', status: 'building', notes: '新增软件版本选择、发布状态、历史版本及客户端版本显示与检查更新入口。' }]) if (!state.clientReleases.some(item => item.version === release.version)) state.clientReleases.push({ ...release, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  state.announcements ||= [];
  if (!state.announcements.some(item => item.id === 'client-design-v037')) state.announcements.unshift({ id: 'client-design-v037', title: '0.3.7 · 客户端空间设计与日程管理升级', content: '客户端重新设计首页、助手、日历与账号页，统一图标、卡片、留白和手机导航。首页新增今日待办、完成进度和接下来日程；助手新增发送等待状态、复制回复、输入草稿及低峰队列取消。日程支持编辑事项与时间、暂停恢复、删除确认、搜索和状态筛选，历史已完成记录不会再挤掉新待办；改期会重新安排提醒。每日报告可直接在客户端选择明日任务。新增快速搜索与键盘入口、浅色/深色/随时间/随系统外观及紧凑布局。管理员客户端可调整每日或每周巡检间隔、刷新基础报告，账号、服务器状态和用量仍仅管理员可见。本次界面联网自动更新，已安装的 0.3.6 客户端可直接使用。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  if (!state.announcements.some(item => item.id === 'device-reminders-v036')) state.announcements.unshift({ id: 'device-reminders-v036', title: '0.3.6 · 日程设备通知', content: '计划与日历新增设备提醒开关。网页及 iPhone 主屏幕安装版在用户授权后通过 Web Push 接收后台日程通知；Android 安装版会同步当前账号日程到设备本地提醒，重启后继续保留；Mac、Windows 和 Linux 轻量客户端接入系统通知，客户端运行时按日程时间提醒。AI 生成和手动添加的日程共用提醒，已完成、暂停及无时间的事项不会通知；关闭此设备提醒后停止发送。安卓系统可能因省电策略推迟通知，桌面安装版需要保持运行。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  if (!state.announcements.some(item => item.id === 'installers-chat-v035')) state.announcements.unshift({ id: 'installers-chat-v035', title: '0.3.5 · 安装包下载与跨设备聊天界面', content: '网站客户端下载区已接入实际构建的 Android APK、macOS DMG、Windows 安装程序与 Linux DEB，按平台、芯片和版本选择，文件与公共网盘共用存储。客户端与网站的聊天继续使用同一账号和消息；手机新增会话列表、搜索及便捷返回，电脑采用宽屏双栏、消息气泡和附件输入区。iPhone 暂使用 Safari 主屏幕安装，原生签名安装包将在开发者账号就绪后发布。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  if (!state.announcements.some(item => item.id === 'ai-records-v034')) state.announcements.unshift({ id: 'ai-records-v034', title: '0.3.4 · 管理员 AI 对话与用量记录', content: '管理员新增按用户和北京时间日期查询 AI 使用记录的入口，可查看每次提问、AI 回复、系统提示和历史上下文，以及接口返回的输入、输出、缓存和总 Token。记录即时聊天、低峰队列、管家及巡检调用，费用按调用时保存的报价估算；失败调用保留预留额度并明确标注实际用量未知。旧聊天内容仍可查看，但缺失的单次用量明细无法补回。普通用户不能访问管理记录，管理员的查询行为会写入审计日志；聊天界面新增管理员可查看记录的说明。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  if (!state.announcements.some(item => item.id === 'clients-v033')) state.announcements.unshift({ id: 'clients-v033', title: '0.3.3 · 轻量桌面客户端与分平台推荐', content: '新增使用系统 WebView 的轻量桌面客户端，减少完整浏览器内核安装包的下载体积；继续提供个人空间、助手、日历和管理入口，含关于及检查更新菜单。下载中心按平台分别推荐版本，避免 Android 用户被推荐到仅提供桌面包的新版本。Windows 安装器会检查 WebView2 运行时；Linux 使用系统 WebKitGTK 4.1 依赖。版本历史、更新说明、账号权限和 AI 额度保持共用。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  if (!state.announcements.some(item => item.id === 'clients-v032')) state.announcements.unshift({ id: 'clients-v032', title: '0.3.2 · 软件版本管理与更新状态', content: '客户端下载新增当前推荐版本、最新发布状态、软件版本及芯片筛选，并展示每个版本的更新说明。历史版本保留，可由管理员设置计划中、构建中、试用版、稳定版或停止分发；停止分发的版本不再提供下载。新版客户端显示已安装的软件版本，账号页及桌面菜单提供检查更新入口。主屏幕/网页界面版本与原生安装包版本分开标注，避免联网更新后误认已安装客户端版本。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  if (!state.announcements.some(item => item.id === 'clients-v031')) state.announcements.unshift({ id: 'clients-v031', title: '0.3.1 · 客户端连接与设备兼容修复', content: '修复桌面客户端在 Windows 和包含空格的安装路径下无法使用连接设置的问题；配置页采用标准本地 URL 校验，远端页面不会获得本地接口。智能助手新增高峰和低峰时段提示，价格和流量仍仅管理员可见。客户端下载可区分 ARM64 与 x64 芯片版本，下载中心继续共用公共网盘文件。现有服务器 HTTPS 地址已开放公网访问，正常使用无需额外安装 Tailscale。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  if (!state.announcements.some(item => item.id === 'clients-v030')) state.announcements.unshift({ id: 'clients-v030', title: '0.3.0 · 跨设备客户端与资源下载中心', content: '新增独立客户端空间，整合个人总览、智能助手、计划日历、工具入口和管理员控制；手机使用底部导航，平板与电脑使用侧边导航。提供 Android 和桌面客户端打包工程及 iPhone / iPad 主屏幕安装，默认连接现有服务器，账号权限和 AI 额度保持同步。全站导航新增资源下载，客户端下载与共享资源按平台分类；管理员可从公共网盘公开发布或下架资源，下载中心与网盘使用同一文件，不重复存储。安装包当前为试用版本；iOS TestFlight 和商店发布待开发者签名配置。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  if (!state.announcements.some(item => item.id === 'ai-workspace-v027')) state.announcements.unshift({ id: 'ai-workspace-v027', title: '0.2.7 · AI 个人空间、服务器管家与账号修复', content: '新增 AI 对话数学公式显示、日历、每日报告和可勾选的明日安排；对话中的日程会保存到计划与提醒。管理员可配置每日或每周低峰巡检、手动巡检、查询近期在线人数和用户登录记录，并确认修改功能权限。管家支持跳转到指定用户的密码编辑入口。修复账号编辑关闭按钮误提交、密码保存反馈及设置验证；登录报告明确显示北京时间统计起止区间，支持查看今日已登录和未登录账号。用户额度改为单个下拉选择编辑面板，价格、流量和服务器管理仅管理员可见。个人空间按北京时间切换凌晨、早晨、中午、下午和晚间问候与配色。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  if (!state.announcements.some(item => item.id === 'operations-v038')) state.announcements.unshift({ id: 'operations-v038', title: '0.3.8 · 数据保护、自动任务与客户端完善', content: '业务数据升级为 SQLite，首次迁移保留原始数据。管理空间新增低峰任务的状态、历史、暂停、恢复、跳过和手动执行，以及数据和网盘文件备份、下载与恢复校验。后台日程通知有限重试并补发，设备页可发送测试通知；桌面 0.3.8 增加托盘和原生提醒计时器，窗口收起后继续提醒。客户端补充更新状态、最低兼容版本、更新说明和可选择的离线只读日程副本。管家查询标明时间范围和来源，权限变更可在客户端核对、执行或取消；账号页支持设备会话、改密码和管理员验证器及恢复码。管理员可设置 AI 对话和审计保存期限。首页集中展示待处理事项与任务状态，并扩大自动发布检查。界面联网更新，原生托盘和安卓通知测试需安装 0.3.8 客户端。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  if (!state.announcements.some(item => item.id === 'interface-v039')) state.announcements.unshift({ id: 'interface-v039', title: '0.3.9 · 界面适配与状态显示修复', content: '修复手机端密码、验证器和保存期限表单过窄；下载任务独立显示，切换版本或筛选后仍可查看进度和取消。正常登录等待双重验证码不再计作失败，错误验证码仍受失败限制。服务器检查明确显示 SSH 日志已读取、无记录或无法读取；自动任务区分首次等待、正在执行、失败及暂无备份。详细管理、旧个人空间与下载页沿用客户端外观偏好，增加空间快捷导航并修复窄屏溢出，优化手机助手输入区。此为联网界面及服务更新，现有 0.3.8 安装包继续使用，无需重新安装。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  if (!state.announcements.some(item => item.id === 'button-review-v0313')) state.announcements.unshift({ id: 'button-review-v0313', title: '0.3.13 · 按钮回归检查与交互修复', content: '扩大真实浏览器按钮回归测试，覆盖账号与公告管理、网盘上传分享、聊天编辑与附件、AI 多会话工具与日程、调用记录、备份与定时任务、课程草稿及游戏控制。修复网盘分享和公告编辑窗口的关闭按钮误触发提交的问题；搜索“日程”现在可找到日历入口。课程页先绑定操作，再以有限并发读取提交历史，减少按钮等待。模拟模型测试不使用真实 API 密钥，不消耗实际额度。安卓通知的真机显示、Python 容器和 KataGo 等外部服务的真实执行，仍需对应设备与运行环境验证。本次更新网页和服务，Android 0.3.12 与桌面 0.3.8 无需重新安装。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  if (!state.announcements.some(item => item.id === 'messaging-v0312')) state.announcements.unshift({ id: 'messaging-v0312', title: '0.3.12 · 聊天送达、安卓通知与个人资料', content: '修复聊天断线后不重连、恢复连接未补收消息的问题，新增连接状态、定时补收、未读数与站内新消息提示。发送后明确显示服务器保存状态，失败保留文字，重试使用相同发送标识防止重复。个人空间先显示普通功能，管理员附加数据异步更新；静态资源启用压缩与 ETag。账号页新增照片或 Emoji 头像、昵称、简介、头像颜色、聊天间距、通知预览与提示音偏好。Android 0.3.12 增加消息系统通知与通知点击返回会话，需要在账号页开启权限。应用被系统终止后，未读消息将在下次打开时补收，不承诺强制关闭后的即时推送。更新前数据已备份，旧版客户端可先使用聊天服务修复，安卓原生通知需更新 APK。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  if (!state.announcements.some(item => item.id === 'ai-workspace-v0311')) state.announcements.unshift({ id: 'ai-workspace-v0311', title: '0.3.11 · AI 多会话与工具箱', content: '助手支持独立多会话，可新建、搜索、重命名、置顶、归档、导出与删除；原有聊天迁入历史对话，各会话上下文独立，额度和低峰队列仍统一控制。新增摘要、资料问答、翻译、写作、代码审阅、会议纪要、学习与计划等工具，以及账号私有模板。支持附加 UTF-8 文本与代码资料，发送前可预览文件名和移除；计划工具在账号权限内写入个人日历。管理员调用记录增加会话、工具和资料名称，方便追溯 Token。优化手机会话切换和草稿保留。本次更新网页与服务，0.3.8 安装包无需重新安装。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  if (!state.announcements.some(item => item.id === 'personal-space-v0310')) state.announcements.unshift({ id: 'personal-space-v0310', title: '0.3.10 · 个人门户与客户端体验优化', content: '参考 Homepage、Dashy、Open WebUI、1Panel 和 Immich 的信息组织与交互方式，优化网站首屏与个人空间。首页新增个人空间、客户端下载和常用功能入口；个人首页可勾选组件、选择并排序收藏，随账号同步并检测多设备编辑冲突。工具按用途分组，支持搜索与星标。助手新增仅检索本人已保留内容的对话记录，支持关键词、北京时间日期、分页和复制，查询不消耗模型额度。管理员顶部集中显示已有磁盘检查、备份验证、自动任务与全站 AI Token，异常状态和采集时间清晰呈现。改进手机布局、弹窗操作和页面返回链路。此为网页与服务更新，现有 0.3.8 安装包无需重新安装。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });

  if (!state.announcements.some(item => item.id === 'guest-accounts-v0314')) state.announcements.unshift({ id: 'guest-accounts-v0314', title: '0.3.14 · 访客隔离体验账户', content: '管理员可创建访客或将账户转换为访客。访客可以体验有限 AI、个人日程、休闲小游戏和原神计算器，拥有最多 32 MB 的私人小云盘；不能进入聊天、围棋、公共云盘、分享、用户通讯或管理功能。AI 上限为每日 5 次、每月 30 次，并受每日 10000 / 每月 50000 Token 与全站预算共同限制，管理员可以进一步收紧。访客区域显示剩余体验次数，聊天和分享对象中不列出访客；普通账户转为访客会使旧登录失效、撤销网盘分享并转为私有，已有超额文件保留但不能继续上传。网页与服务升级，Android 0.3.12 和桌面 0.3.8 无需重新安装。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  save(state);
  return state;
}

function save(state) {
  getDatabase().write(state);
}

module.exports = { load, save, getDatabase, hashPassword, verifyPassword, defaultPermissions, normalizeUser, updatePermissions, dataDir };
