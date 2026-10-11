'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const DEFAULT_TTL_MS = 15 * 60_000;
const MAX_ATTEMPTS = 5;

const normalizeUsername = username => String(username || '').trim().toLowerCase();
const normalizeCode = code => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const codeDigest = (username, code) => crypto.createHash('sha256').update(`${normalizeUsername(username)}\0${normalizeCode(code)}`).digest('hex');
const requestFile = (recoveryDir, username) => path.join(recoveryDir, `${crypto.createHash('sha256').update(normalizeUsername(username)).digest('hex')}.json`);

function randomCode(length = 12) {
  let code = '';
  while (code.length < length) {
    const bytes = crypto.randomBytes(length - code.length);
    for (const byte of bytes) {
      if (byte >= Math.floor(256 / CODE_ALPHABET.length) * CODE_ALPHABET.length) continue;
      code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
      if (code.length === length) break;
    }
  }
  return code.match(/.{1,4}/g).join('-');
}

function createRecoveryRequest(recoveryDir, username, options = {}) {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) throw new Error('账号不能为空');
  const now = Number(options.now ?? Date.now());
  const code = options.code || randomCode();
  const request = {
    version: 1,
    username: normalizedUsername,
    codeHash: codeDigest(normalizedUsername, code),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + Number(options.ttlMs || DEFAULT_TTL_MS)).toISOString(),
    attemptsRemaining: MAX_ATTEMPTS
  };
  fs.mkdirSync(recoveryDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(recoveryDir, 0o700);
  const target = requestFile(recoveryDir, normalizedUsername);
  const temp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(request, null, 2), { mode: 0o600 });
  fs.renameSync(temp, target);
  return { code, expiresAt: request.expiresAt };
}

function consumeRecoveryRequest(recoveryDir, username, code, options = {}) {
  const normalizedUsername = normalizeUsername(username);
  const target = requestFile(recoveryDir, normalizedUsername);
  let request;
  try { request = JSON.parse(fs.readFileSync(target, 'utf8')); }
  catch { return { ok: false, reason: 'invalid' }; }
  const now = Number(options.now ?? Date.now());
  if (request.username !== normalizedUsername || new Date(request.expiresAt).getTime() <= now || Number(request.attemptsRemaining) <= 0) {
    try { fs.unlinkSync(target); } catch {}
    return { ok: false, reason: 'invalid' };
  }
  const actual = Buffer.from(codeDigest(normalizedUsername, code), 'hex');
  const expected = Buffer.from(String(request.codeHash || ''), 'hex');
  const matches = actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  if (!matches) {
    request.attemptsRemaining = Number(request.attemptsRemaining) - 1;
    if (request.attemptsRemaining <= 0) {
      try { fs.unlinkSync(target); } catch {}
    } else {
      fs.writeFileSync(target, JSON.stringify(request, null, 2), { mode: 0o600 });
    }
    return { ok: false, reason: 'invalid' };
  }
  try { fs.unlinkSync(target); } catch {}
  return { ok: true };
}

module.exports = {
  DEFAULT_TTL_MS,
  MAX_ATTEMPTS,
  createRecoveryRequest,
  consumeRecoveryRequest,
  normalizeCode,
  normalizeUsername,
  requestFile
};
