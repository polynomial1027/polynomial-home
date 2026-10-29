// Explicit live API evaluation through the running, budget-enforcing admin API.
// Authentication is provided in GENSHIN_TEST_COOKIE; never print credentials.
const fs = require('node:fs');
const { cases, evaluate } = require('../lib/genshin-benchmark');
function localAdminCookie(base, directory) {
  const u = new URL(base);
  if (u.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)) throw new Error('自动使用本机管理员会话只允许HTTP回环地址');
  const path = require('node:path'), { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(path.join(directory, 'store.sqlite'), { readOnly: true });
  try {
    const read = name => db.prepare('SELECT payload FROM records WHERE collection=? ORDER BY position').all(name).map(row => JSON.parse(row.payload));
    const admins = new Set(read('users').filter(u => u.active && u.role === 'admin').map(u => u.id));
    const session = read('sessions').find(s => admins.has(s.userId) && new Date(s.expiresAt).getTime() > Date.now());
    if (!session) throw new Error('没有有效的管理员登录会话；请先在网站登录管理员后重试');
    return 'session=' + encodeURIComponent(session.token);
  } finally { db.close(); }
}
async function run() {
  const base = process.env.GENSHIN_TEST_BASE || 'http://127.0.0.1:3000';
  const cookie = process.argv.includes('--use-local-admin-session') ? localAdminCookie(base, process.env.POLYNOMIAL_DATA_DIR || require('node:path').join(__dirname, '..', 'data')) : process.env.GENSHIN_TEST_COOKIE;
  if (!cookie) throw new Error('需要管理员登录会话 GENSHIN_TEST_COOKIE；没有调用任何模型');
  const output = process.env.GENSHIN_TEST_REPORT || '/tmp/genshin-live-report.json';
  const call = async (route, data) => {
    const response = await fetch(new URL('/api/admin/labs/genshin/' + route, base), { method: data ? 'POST' : 'GET', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, ...(data ? { body: JSON.stringify(data) } : {}), signal: AbortSignal.timeout(90000) });
    let value; try { value = await response.json(); } catch { throw new Error(`HTTP ${response.status}：非JSON响应`); }
    return { status: response.status, value };
  };
  const initial = await call('status');
  if (initial.status !== 200) throw new Error('管理员认证失败，未开始测试');
  const report = { startedAt: new Date().toISOString(), base, initialBudget: initial.value.budget, cases: [], realProvider: true };
  const persist = () => fs.writeFileSync(output, JSON.stringify(report, null, 2), { mode: 0o600 });
  persist();
  const selected = process.env.GENSHIN_TEST_CASES ? new Set(process.env.GENSHIN_TEST_CASES.split(',')) : null;
  for (const item of cases.filter(c => !selected || selected.has(c.id))) {
    const { value, status } = await call('ask', { question: item.question, search: item.search, ...(item.calculation ? { calculation: item.calculation } : {}) });
    const row = { id: item.id, question: item.question, expected: item.expected, input: item.calculation || null, httpStatus: status, actual: value, evaluation: status === 200 ? evaluate(item, value) : { pass: false, error: value.error } };
    report.cases.push(row); persist(); console.log(`${item.id}: HTTP ${status}, ${row.evaluation.pass ? '初筛通过' : '需复核'}`);
    if (status !== 200) { report.stoppedReason = value.error; break; }
  }
  const final = await call('status'); report.finalBudget = final.value.budget; report.finishedAt = new Date().toISOString(); persist();
  console.log(JSON.stringify({ report: output, completed: report.cases.length, passedInitialScreen: report.cases.filter(x => x.evaluation.pass).length, budget: report.finalBudget }));
}
if (require.main === module) run().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { localAdminCookie };
