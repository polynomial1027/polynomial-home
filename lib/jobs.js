const crypto = require('node:crypto');
const { safeOffPeakStart } = require('./pricing');
const definitions = {
  health: { title: '服务器基础检查', frequency: 'daily', hour: 2, minute: 0 },
  backup: { title: '数据与文件备份', frequency: 'daily', hour: 2, minute: 40 },
  review: { title: 'AI 服务器巡检', frequency: 'daily', hour: 2, minute: 15 }
};
function nextTime(kind, frequency, now = Date.now(), includeToday = false) {
  const local = new Date(now + 8 * 3600_000), def = definitions[kind];
  let value = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), def.hour, def.minute) - 8 * 3600_000;
  if (frequency === 'weekly') value -= ((local.getUTCDay() + 6) % 7) * 86400_000;
  if (!includeToday || frequency === 'weekly' && local.getUTCDay() !== 1) {
    while (value <= now) value += (frequency === 'weekly' ? 7 : 1) * 86400_000;
  }
  return new Date(value).toISOString();
}
class JobScheduler {
  constructor({ state, save, handlers, model, audit = () => {}, now = () => Date.now() }) {
    this.state = state; this.save = save; this.handlers = handlers; this.model = model; this.audit = audit; this.now = now; this.running = false;
    state.scheduledJobs ||= []; state.jobRuns ||= [];
    this.configure();
    for (const job of state.scheduledJobs) if (job.status === 'running') {
      job.status = job.kind === 'review' ? 'interrupted' : 'retrying';
      job.error = '服务重启中断任务；AI 调用可能已计费，需手动核对后重试。';
      job.nextAttemptAt = job.kind === 'review' ? null : new Date(now() + 60_000).toISOString();
      for (const run of state.jobRuns.filter(row => row.jobId === job.id && row.status === 'running')) Object.assign(run, { status: 'interrupted', finishedAt: new Date(now()).toISOString(), error: job.error });
    }
    this.persist();
  }
  persist() { this.save(this.state); }
  configure() {
    let changed = false;
    for (const [kind, def] of Object.entries(definitions)) {
      const frequency = kind === 'review' ? this.state.settings.assistantReviewFrequency || 'off' : 'daily';
      const enabled = kind === 'backup' ? this.state.settings.automaticBackup !== false : frequency !== 'off';
      let job = this.state.scheduledJobs.find(row => row.kind === kind);
      if (!job) { job = { id: kind, kind, title: def.title, frequency, enabled, paused: false, status: 'idle', attempts: 0, nextRunAt: nextTime(kind, frequency, this.now(), true) }; this.state.scheduledJobs.push(job); changed = true; }
      if (job.frequency !== frequency) { job.frequency = frequency; job.nextRunAt = nextTime(kind, frequency, this.now(), true); job.attempts = 0; job.nextAttemptAt = null; changed = true; }
      if (job.enabled !== enabled) { job.enabled = enabled; changed = true; }
    }
    if (changed) this.persist();
  }
  overview() { return { timezone: 'Asia/Shanghai', jobs: this.state.scheduledJobs, runs: this.state.jobRuns.slice(-40).reverse() }; }
  async tick({ id = null, manual = false } = {}) {
    if (this.running) return null;
    this.configure();
    const now = this.now();
    const job = id ? this.state.scheduledJobs.find(row => row.id === id) : this.state.scheduledJobs.find(row => row.enabled && !row.paused && row.status !== 'interrupted' && Date.parse(row.nextAttemptAt || row.nextRunAt) <= now && (!row.nextAttemptAt || row.status === 'retrying'));
    if (!job || (!manual && (!job.enabled || job.paused))) return null;
    if (!manual && !safeOffPeakStart(new Date(now), this.model)) return null;
    if (!this.handlers[job.kind]?.ready()) { if (manual) throw new Error('任务所需服务尚未启用'); return null; }
    this.running = true;
    const run = { id: crypto.randomUUID(), jobId: job.id, title: job.title, status: 'running', startedAt: new Date(now).toISOString(), source: manual ? 'manual' : 'auto', attempt: Number(job.attempts || 0) + 1 };
    this.state.jobRuns.push(run); this.state.jobRuns = this.state.jobRuns.slice(-200);
    Object.assign(job, { status: 'running', attempts: run.attempt, lastStartedAt: run.startedAt, error: null });
    this.persist();
    try {
      const result = await this.handlers[job.kind].run({ manual, run });
      if (result?.status === 'failed') throw new Error(result.error || '任务失败');
      Object.assign(run, { status: 'completed', finishedAt: new Date(this.now()).toISOString(), summary: String(result?.summary || '已完成').slice(0, 300) });
      Object.assign(job, { status: 'completed', lastFinishedAt: run.finishedAt, lastResult: run.summary, attempts: 0, nextAttemptAt: null, nextRunAt: nextTime(job.kind, job.frequency, this.now()) });
    } catch (error) {
      Object.assign(run, { status: 'failed', finishedAt: new Date(this.now()).toISOString(), error: String(error.message || '任务失败').slice(0, 300) });
      // AI failures may have been billed. Never automatically repeat an AI call.
      const retry = job.kind !== 'review' && job.attempts < 3;
      Object.assign(job, { status: retry ? 'retrying' : 'failed', error: run.error, lastFinishedAt: run.finishedAt, nextAttemptAt: retry ? new Date(this.now() + job.attempts * 5 * 60_000).toISOString() : null, nextRunAt: retry ? job.nextRunAt : nextTime(job.kind, job.frequency, this.now()), attempts: retry ? job.attempts : 0 });
      this.audit({ action: 'scheduled-job-failed', success: false, detail: `${job.kind}: ${run.error}` });
    } finally { this.running = false; this.persist(); }
    return run;
  }
  async control(id, action) {
    const job = this.state.scheduledJobs.find(row => row.id === id);
    if (!job) throw new Error('任务不存在');
    if (job.status === 'running' || this.running) throw new Error('任务正在运行，请等待完成');
    if (action === 'pause') job.paused = true;
    else if (action === 'resume') { job.paused = false; if (job.status === 'interrupted') job.status = 'idle'; }
    else if (action === 'skip') { job.nextRunAt = nextTime(job.kind, job.frequency, this.now()); job.nextAttemptAt = null; job.attempts = 0; job.status = 'skipped'; }
    else if (action === 'run') return this.tick({ id, manual: true });
    else throw new Error('未知任务操作');
    this.persist(); return job;
  }
}
module.exports = { JobScheduler, nextTime };
