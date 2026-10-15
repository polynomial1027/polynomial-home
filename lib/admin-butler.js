const crypto = require('node:crypto');
const assistant = require('./assistant');
const aiRecords = require('./ai-records');

const permissionLabels = {
  accessAssistant: ['AI 助手', 'AI', '智能助手'],
  accessChat: ['聊天', '团队聊天'],
  driveEnabled: ['网盘', '文件网盘'],
  accessLearning: ['学习', '网络学习'],
  accessPlanner: ['计划', '日程']
};

function mentionedUser(message, users) {
  const lower = message.toLowerCase();
  const explicit = [...lower.matchAll(/@([a-z0-9_-]+)/g)].map(match => match[1]);
  const found = users.filter(user => explicit.length ? explicit.includes(user.username.toLowerCase()) : new RegExp(`(^|[^a-z0-9_-])${user.username.toLowerCase()}([^a-z0-9_-]|$)`).test(lower) || user.displayName && lower.includes(user.displayName.toLowerCase()));
  return found.length === 1 ? found[0] : null;
}

function loginSummary(state, now = new Date()) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const start = new Date(`${day}T00:00:00+08:00`);
  const logs = state.auditLogs.filter(item => new Date(item.at) >= start && new Date(item.at) <= now);
  const successful = logs.filter(item => item.action === 'login');
  const names = user => `${user.displayName}（@${user.username}）`;
  const logged = state.users.filter(user => successful.some(item => item.userId === user.id));
  const absent = state.users.filter(user => user.active && !successful.some(item => item.userId === user.id));
  const time = value => new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hourCycle: 'h23' });
  return `【今日站内登录报告】\n统计区间：${time(start)} 至 ${time(now)}（北京时间）\n成功登录：${successful.length} 次；失败登录：${logs.filter(item => item.action === 'login-failed').length} 次\n已登录账号：${logged.map(user => `${names(user)} · 最近 ${time(successful.filter(item => item.userId === user.id).at(-1).at)}`).join('；') || '无'}\n未登录的启用账号：${absent.map(names).join('；') || '无'}\n说明：按保留的成功登录记录统计；已登录会话继续使用网站不算重新登录。`;
}

function answerLocally({ message, state, onlineCount, admin, report, now = new Date() }) {
  const user = mentionedUser(message, state.users);
  if (/密码/.test(message)) return { reply: user ? `已找到 ${user.displayName}（@${user.username}）。请点击下方入口，在新密码栏填写并保存。密码通过账号接口保存，不会发送给 AI。` : '请在账号管理中选择要修改密码的用户，再填写新密码并保存。不要在管家对话中输入密码。', link: user ? `/admin.html?editUser=${encodeURIComponent(user.id)}&focus=password#admin-accounts` : '/admin.html#admin-accounts' };
  if (/登录/.test(message) && /今天|今日|谁|哪些|统计|报告/.test(message)) return { reply: loginSummary(state, now) };
  if (/在线|几个人.*(?:使用|网站)|多少.*(?:用户|人在用)/.test(message)) {
    return { reply: `最近 2 分钟内有 ${onlineCount} 个账号活动。这是按账号去重的近期活动数，打开页面但没有向服务器发请求的访客不计入。` };
  }
  if (/上次.*登录|最近.*登录|最后.*登录/.test(message)) {
    if (!user) return { reply: '请告诉我准确的登录账号或唯一显示名称，我会查询该用户的上次成功登录时间。' };
    const last = state.auditLogs.filter(item => item.action === 'login' && item.userId === user.id).sort((a, b) => a.at.localeCompare(b.at)).at(-1);
    return { reply: last ? `${user.displayName}（@${user.username}）上次成功登录：${new Date(last.at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}（北京时间）。` : `${user.displayName}（@${user.username}）目前没有可查询的成功登录记录。` };
  }
  if (/费用|花费|花了|多少钱|token|用量|额度/i.test(message)) {
    const rows = state.assistantUsage.filter(row => row.day === assistant.dayKey(now) && (!user || row.userId === user.id));
    const known = rows.map(aiRecords.cost).filter(Boolean), amount = known.reduce((sum, row) => sum + row.total, 0);
    return { reply: `【今日 AI 用量】\n范围：${user ? `${user.displayName}（@${user.username}）` : '全站'}\n调用 ${rows.length} 次；额度 Token ${rows.reduce((sum, row) => sum + row.tokens, 0)}\n已知估算费用：¥${amount.toFixed(6)}；实际费用未知的调用 ${rows.length - known.length} 次。\n费用根据保存的调用报价和接口用量估算。`, link: '/ai-records.html' };
  }
  if (/服务器|内存|磁盘|负载|异常|巡检|状况/.test(message) && report) {
    return { reply: `【服务器基础检查】\n报告生成：${new Date(report.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hourCycle: 'h23' })}（北京时间）\n状态：${report.severity === 'warning' ? '需要留意' : '基础指标正常'}\n${report.notes}\n磁盘：${report.disk ? `剩余 ${report.disk.freeGB} / ${report.disk.totalGB} GB` : '暂无数据'}\n登录统计：成功 ${report.loginSuccess} 次，失败 ${report.loginFailed} 次。\n说明：这是基础指标检查；AI 巡检请点击“AI 巡检”。`, windowStart: report.windowStart, windowEnd: report.windowEnd };
  }
  if (/删除|清理.*(?:文件|网盘|内容)/.test(message)) return { reply: '请先打开文件管理，核对文件名和所属用户后执行删除。', link: '/drive.html' };
  if (/权限|开通|授予|禁用|关闭|允许|撤销/.test(message)) {
    if (!user) return { reply: '请写出准确账号，例如“给 @alice 开通聊天权限”。也可以打开账号管理页手动修改。', link: '/admin.html#admin-accounts' };
    const key = Object.keys(permissionLabels).find(name => permissionLabels[name].some(label => message.toLowerCase().includes(label.toLowerCase())));
    const url = `/admin.html?editUser=${encodeURIComponent(user.id)}#admin-accounts`;
    if (user.role === 'admin') return { reply: '管理员账号的功能权限由角色决定。请到账号管理页查看。', link: url };
    const enable = /开通|开启|允许|授予|启用/.test(message);
    const disable = /关闭|禁用|撤销|收回|取消|不允许/.test(message);
    if (!key || enable === disable) return { reply: `已找到 ${user.displayName}（@${user.username}）。请在账号管理页核对并修改具体权限，或明确说“开通/关闭”哪项功能。`, link: url };
    const value = enable;
    const label = permissionLabels[key][0];
    if (user.permissions?.[key] === value) return { reply: `${user.displayName} 的${label}权限已经是${value ? '开放' : '关闭'}状态。`, link: url };
    const action = { id: crypto.randomUUID(), adminId: admin.id, targetId: user.id, permission: key, value, expectedValue: user.permissions?.[key] === true, createdAt: new Date().toISOString(), status: 'pending' };
    state.adminButlerActions.push(action);
    state.adminButlerActions = state.adminButlerActions.slice(-100);
    return { reply: `我已准备把 ${user.displayName}（@${user.username}）的${label}权限${value ? '开放' : '关闭'}。请在下方核对后确认执行。`, action, link: url };
  }
  if (/打开.*(?:管理|后台|页面|账号)/.test(message)) return { reply: '已准备好账号管理页面，点击下方链接即可打开。', link: '/admin.html#admin-accounts' };
  return null;
}

function localAnswer(args) {
  const now = args.now || new Date(), date = assistant.dayKey(now);
  const result = answerLocally({ ...args, now }); if (!result) return null;
  result.factsAt = now.toISOString(); result.source = '服务器保存的记录与当前指标';
  result.windowStart ||= /今天|今日|费用|token|用量/i.test(args.message) ? new Date(`${date}T00:00:00+08:00`).toISOString() : /在线|几个人|多少.*用户/.test(args.message) ? new Date(now.getTime() - 120000).toISOString() : null;
  result.windowEnd ||= now.toISOString();
  const time = value => new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hourCycle: 'h23' });
  if (!result.reply.includes('统计区间：')) result.reply += `\n${result.windowStart ? `统计区间：${time(result.windowStart)} 至 ${time(result.windowEnd)}` : `截至：${time(now)}`}（北京时间）`;
  result.reply += `\n数据来源：${result.source}`;
  return result;
}

function actionView(action, users, now = Date.now()) {
  const target = users.find(user => user.id === action.targetId);
  return { id: action.id, targetId: action.targetId, targetName: target ? `${target.displayName}（@${target.username}）` : '已删除用户', permission: action.permission, label: permissionLabels[action.permission]?.[0] || action.permission, before: action.expectedValue, value: action.value, createdAt: action.createdAt, expiresAt: new Date(Date.parse(action.createdAt) + 600000).toISOString(), status: action.status === 'pending' && now - Date.parse(action.createdAt) >= 600000 ? 'expired' : action.status };
}

async function answerWithAi({ state, save, admin, message, context, key, model, complete = assistant.complete }) {
  const maxOutput = Math.max(1, Math.min(4096, Number(state.settings.assistantMaxOutputTokens || 512)));
  const messages = [
    { role: 'system', content: '你是 Polynomial Server 管理员的服务器管家。只能根据提供的站点状态摘要回答，不要声称读取了原始日志、执行了命令或修改了权限。若数据未提供，应明确说明。简洁中文回答。' },
    { role: 'user', content: `当前站点状态：${JSON.stringify(context)}\n管理员问题：${message}` }
  ];
  const reservation = assistant.reserve(state, save, admin, assistant.estimateReservation(messages, maxOutput), { source: 'butler', model, messages, maxOutput });
  try {
    const result = await complete({ key, model, messages, maxOutput });
    assistant.finish(state, save, reservation, result.tokens ?? reservation.tokens, 'completed', result);
    if (!result.content?.trim()) throw new Error('AI 管家没有返回回答，请重试');
    return { reply: result.content.trim() };
  } catch (error) {
    if (reservation.status === 'reserved') assistant.finish(state, save, reservation, 0, 'failed', { error: String(error.message).slice(0, 160) });
    throw error;
  }
}

module.exports = { permissionLabels, loginSummary, localAnswer, answerWithAi, actionView };
