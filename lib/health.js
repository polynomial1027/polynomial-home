const os = require('node:os');
const crypto = require('node:crypto');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { dataDir } = require('./store');

const dayKey = (date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

function generateReport(state, save, now = new Date(), force = false) {
  const day = dayKey(now);
  if (!force && state.healthReports.some(item => item.day === day)) return state.healthReports.find(item => item.day === day);
  const since = now.getTime() - 24 * 3600_000;
  const logs = state.auditLogs.filter(item => new Date(item.at).getTime() >= since && new Date(item.at).getTime() <= now.getTime());
  const failed = logs.filter(item => item.action === 'login-failed');
  const success = logs.filter(item => item.action === 'login');
  const byAddress = new Map();
  for (const item of failed) byAddress.set(item.address || '未知', (byAddress.get(item.address || '未知') || 0) + 1);
  const suspicious = [...byAddress].filter(([, count]) => count >= 5).map(([address, count]) => ({ address, count }));
  const memory = { totalMB: Math.round(os.totalmem() / 1048576), freeMB: Math.round(os.freemem() / 1048576) };
  let disk = null;
  try { const stat = fs.statfsSync(dataDir); disk = { totalGB: Number((stat.blocks * stat.bsize / 1073741824).toFixed(1)), freeGB: Number((stat.bavail * stat.bsize / 1073741824).toFixed(1)) }; } catch {}
  let systemLogin = { status: 'unavailable', accepted: 0, failed: 0 };
  if (process.platform === 'linux') {
    const journalctl = ['/usr/bin/journalctl', '/bin/journalctl'].find(file => fs.existsSync(file));
    if (journalctl) try {
      const output = execFileSync(journalctl, ['-u', 'ssh.service', '-u', 'sshd.service', '--since', new Date(since).toISOString(), '--until', now.toISOString(), '--no-pager', '-o', 'cat'], { encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
      systemLogin = { status: output.trim() ? 'available' : 'no_entries', accepted: (output.match(/Accepted (?:password|publickey)/g) || []).length, failed: (output.match(/Failed password|Invalid user/g) || []).length };
    } catch { systemLogin = { status: 'unavailable', accepted: 0, failed: 0 }; }
  }
  const report = { id: crypto.randomUUID(), day, createdAt: now.toISOString(), windowHours: 24, windowStart: new Date(since).toISOString(), windowEnd: now.toISOString(), loginSuccess: success.length, loginFailed: failed.length, systemLogin, suspicious, memory, disk, expiredSessions: state.sessions.filter(item => new Date(item.expiresAt).getTime() <= now.getTime()).length, loadAverage: os.loadavg().map(value => Number(value.toFixed(2))), uptimeHours: Math.round(os.uptime() / 3600), severity: suspicious.length || systemLogin.failed >= 5 || disk && disk.totalGB && disk.freeGB / disk.totalGB < 0.1 ? 'warning' : 'normal', notes: suspicious.length ? '发现同一地址多次站内登录失败，请核查登录记录。' : systemLogin.failed >= 5 ? '发现多次 SSH 登录失败，请核查系统日志。' : disk && disk.totalGB && disk.freeGB / disk.totalGB < 0.1 ? '数据盘可用空间低于 10%，请检查存储。' : '未发现集中登录失败；系统日志可见性见报告状态。' };
  if (force) state.healthReports = state.healthReports.filter(item => item.day !== day);
  state.healthReports.unshift(report);
  state.healthReports = state.healthReports.slice(0, 90);
  save(state);
  return report;
}

module.exports = { generateReport, dayKey };
