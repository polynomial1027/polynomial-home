'use strict';

const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { fromGtp, toGtp } = require('./go-engine');

function numericField(text, name) {
  const match = String(text || '').match(new RegExp(`(?:^|\\s)${name}\\s+(-?(?:\\d+(?:\\.\\d+)?|\\.\\d+)(?:e[+-]?\\d+)?)`, 'i'));
  return match ? Number(match[1]) : null;
}

function parseKataSearchAnalysis(response, boardSize) {
  const text = String(response || '').trim();
  const playMatch = text.match(/(?:^|\s)play\s+(\S+)/i);
  const rootMatch = text.match(/(?:^|\s)rootInfo\s+([\s\S]*?)(?=(?:\s+ownership(?:Stdev)?\s+)|(?:\s+play\s+)|$)/i);
  const root = rootMatch?.[1] || '';
  const candidates = [];
  const pattern = /(?:^|\s)info\s+move\s+(\S+)\s+([\s\S]*?)(?=(?:\s+info\s+move\s+)|(?:\s+rootInfo\s+)|(?:\s+ownership(?:Stdev)?\s+)|(?:\s+play\s+)|$)/gi;
  let match;
  while ((match = pattern.exec(text))) {
    const move = fromGtp(match[1], boardSize);
    if (!move.resign) candidates.push({
      move,
      visits: numericField(match[2], 'visits'),
      winrate: numericField(match[2], 'winrate'),
      scoreLead: numericField(match[2], 'scoreLead'),
      prior: numericField(match[2], 'prior'),
      order: numericField(match[2], 'order')
    });
  }
  candidates.sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER));
  return {
    move: playMatch ? fromGtp(playMatch[1], boardSize) : candidates[0]?.move,
    candidates,
    analysis: {
      visits: numericField(root, 'visits'),
      winrate: numericField(root, 'winrate') ?? candidates[0]?.winrate ?? null,
      scoreLead: numericField(root, 'scoreLead') ?? candidates[0]?.scoreLead ?? null
    }
  };
}

class KataGoManager {
  constructor(configProvider) {
    this.configProvider = configProvider;
    this.child = null;
    this.buffer = '';
    this.pending = new Map();
    this.sequence = 0;
    this.queue = Promise.resolve();
    this.signature = '';
    this.lastError = null;
  }

  config() {
    const raw = this.configProvider?.() || {};
    return {
      enabled: raw.enabled !== false,
      binary: String(raw.binary || '/usr/local/bin/katago'),
      model: String(raw.model || '/var/lib/polynomial-katago/model.bin.gz'),
      config: String(raw.config || '/var/lib/polynomial-katago/gtp.cfg'),
      timeoutMs: Math.max(5_000, Math.min(120_000, Number(raw.timeoutMs) || 30_000))
    };
  }

  status() {
    const config = this.config();
    const executable = file => { try { fs.accessSync(file, fs.constants.X_OK); return true; } catch { return false; } };
    const checks = {
      binary: executable(config.binary),
      model: fs.existsSync(config.model),
      config: fs.existsSync(config.config)
    };
    return {
      enabled: config.enabled,
      available: config.enabled && checks.binary && checks.model && checks.config,
      running: Boolean(this.child && !this.child.killed),
      checks,
      lastError: this.lastError,
      paths: { binary: config.binary, model: config.model, config: config.config }
    };
  }

  async ensureStarted() {
    const config = this.config(), signature = `${config.binary}\n${config.model}\n${config.config}`;
    const status = this.status();
    if (!status.available) {
      const missing = Object.entries(status.checks).filter(([, ok]) => !ok).map(([name]) => name).join('、');
      throw new Error(`KataGo 尚未就绪，缺少：${missing || '有效配置'}`);
    }
    if (this.child && !this.child.killed && this.signature === signature) return;
    await this.stop();
    this.signature = signature;
    this.buffer = '';
    this.child = spawn(config.binary, ['gtp', '-model', config.model, '-config', config.config], {
      stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true
    });
    this.child.stdout.setEncoding('utf8');
    this.child.stderr.setEncoding('utf8');
    this.child.stdout.on('data', chunk => this.handleOutput(chunk));
    this.child.stderr.on('data', chunk => {
      const line = String(chunk).trim().split(/\r?\n/).filter(Boolean).at(-1);
      if (line) this.lastError = line.slice(0, 500);
    });
    this.child.on('error', error => { this.child = null; this.failAll(error); });
    this.child.on('exit', (code, signal) => {
      const error = new Error(`KataGo 已停止（${signal || code || 0}）`);
      this.child = null;
      this.failAll(error);
    });
    await this.command('name');
    this.lastError = null;
  }

  handleOutput(chunk) {
    this.buffer += chunk;
    let split;
    while ((split = this.buffer.search(/\r?\n\r?\n/)) >= 0) {
      const block = this.buffer.slice(0, split).trim();
      const separatorLength = this.buffer.slice(split).startsWith('\r\n\r\n') ? 4 : 2;
      this.buffer = this.buffer.slice(split + separatorLength);
      if (!block) continue;
      const match = block.match(/^([=?])(\d+)\s*([\s\S]*)$/);
      if (!match) continue;
      const pending = this.pending.get(Number(match[2]));
      if (!pending) continue;
      this.pending.delete(Number(match[2]));
      clearTimeout(pending.timer);
      if (match[1] === '=') pending.resolve(match[3].trim());
      else pending.reject(new Error(match[3].trim() || 'KataGo 拒绝了命令'));
    }
  }

  failAll(error) {
    this.lastError = String(error?.message || error).slice(0, 500);
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  command(command) {
    if (!this.child || this.child.killed || !this.child.stdin.writable) return Promise.reject(new Error('KataGo 进程未运行'));
    const id = ++this.sequence, timeoutMs = this.config().timeoutMs;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`KataGo 命令超时：${command.split(/\s+/)[0]}`));
        this.stop().catch(() => {});
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(`${id} ${command}\n`, error => {
        if (!error) return;
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      });
    });
  }

  run(task) {
    const next = this.queue.then(task, task);
    this.queue = next.catch(() => {});
    return next;
  }

  async loadPosition({ boardSize, komi, rules, initialStones = [], moves = [] }) {
    await this.ensureStarted();
    await this.command('clear_board');
    await this.command(`boardsize ${Number(boardSize)}`);
    await this.command(`komi ${Number(komi || 0)}`);
    try { await this.command(`kata-set-rules ${rules === 'japanese' ? 'japanese' : 'chinese'}`); } catch {}
    for (const stone of initialStones) await this.command(`play ${stone.color === 'W' ? 'white' : 'black'} ${toGtp(stone.x, stone.y, boardSize)}`);
    for (const move of moves.filter(item => !item.undoneAt && (item.type === 'move' || item.type === 'pass'))) {
      await this.command(`play ${move.color === 'W' ? 'white' : 'black'} ${move.type === 'pass' ? 'pass' : toGtp(move.x, move.y, boardSize)}`);
    }
  }

  async setSearchLimits(maxVisits, maxTime) {
    const params = {
      maxVisits: Math.max(1, Math.floor(Number(maxVisits) || 100)),
      maxTime: Math.max(0.05, Number(maxTime) || 5)
    };
    try { await this.command(`kata-set-params ${JSON.stringify(params)}`); }
    catch {
      await this.command(`kata-set-param maxVisits ${params.maxVisits}`);
      await this.command(`kata-set-param maxTime ${params.maxTime}`);
    }
  }

  generateMove({ boardSize, komi, rules, initialStones = [], moves = [], color, maxVisits = 100, maxTime = 5, candidatePool = 1 }) {
    return this.run(async () => {
      await this.loadPosition({ boardSize, komi, rules, initialStones, moves });
      await this.setSearchLimits(maxVisits, maxTime);
      const pool = Math.max(1, Math.min(20, Math.floor(Number(candidatePool) || 1)));
      const response = await this.command(`kata-search_analyze ${color === 'W' ? 'white' : 'black'} 100000 rootInfo true minmoves ${pool} maxmoves ${pool}`);
      const parsed = parseKataSearchAnalysis(response, boardSize);
      const choices = parsed.candidates.slice(0, pool).filter(item => !item.move.resign && (parsed.move?.pass || !item.move.pass));
      const primary = parsed.move && !parsed.move.resign ? parsed.move : choices[0]?.move;
      if (!primary) throw new Error('KataGo 没有返回可用落子');
      const move = pool > 1 && choices.length > 1 ? choices[Math.floor(Math.random() * choices.length)].move : primary;
      return { move, analysis: parsed.analysis };
    });
  }

  scorePosition({ boardSize, komi, rules, initialStones = [], moves = [], color, maxVisits = 160, maxTime = 6 }) {
    return this.run(async () => {
      await this.loadPosition({ boardSize, komi, rules, initialStones, moves });
      await this.setSearchLimits(maxVisits, maxTime);
      const response = await this.command(`kata-search_analyze ${color === 'W' ? 'white' : 'black'} 100000 rootInfo true maxmoves 1`);
      const parsed = parseKataSearchAnalysis(response, boardSize);
      if (!Number.isFinite(parsed.analysis.scoreLead)) throw new Error('KataGo 没有返回目数评估');
      return parsed.analysis;
    });
  }

  async stop() {
    const child = this.child;
    this.child = null;
    if (!child || child.killed) return;
    try { child.stdin.write('quit\n'); } catch {}
    await new Promise(resolve => {
      const timer = setTimeout(() => { try { child.kill('SIGTERM'); } catch {} resolve(); }, 1_000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
    });
  }
}

module.exports = { KataGoManager, parseKataSearchAnalysis };
