const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const dataDir = path.join(__dirname, '..', 'data');
const file = path.join(dataDir, 'store.json');

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
  return {
    users: [{ id: crypto.randomUUID(), username, displayName: 'Polynomial', role: 'admin', active: true, passwordHash: hashPassword(password), createdAt: new Date().toISOString() }],
    sessions: [],
    messages: [],
    conversations: [],
    files: [],
    settings: { maxUploadMB: 10, editWindowMinutes: 60, maxGroupMembers: 20, maxMessageLength: 1000, maxAttachmentsPerMessage: 5, messageHistoryLimit: 200, maxConversationsPerUser: 30, maxGameSaveKB: 256, allowFileUploads: true, sensitiveWordSource: 'custom', sensitiveWords: [], sensitiveWordMode: 'mask' },
    announcements: [{ id: 'update-v6', title: '聊天、游戏存档与管理功能更新', content: '新增账号游戏存档接口、更新公告、聊天记录分页管理、敏感词屏蔽，并扩展服务器参数设置。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
    gameSaves: []
  };
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
  state.sessions ||= [];
  state.messages ||= [];
  state.conversations ||= [];
  state.files ||= [];
  state.settings = { maxUploadMB: 10, editWindowMinutes: 60, maxGroupMembers: 20, maxMessageLength: 1000, maxAttachmentsPerMessage: 5, messageHistoryLimit: 200, maxConversationsPerUser: 30, maxGameSaveKB: 256, allowFileUploads: true, sensitiveWordSource: 'custom', sensitiveWords: [], sensitiveWordMode: 'mask', ...(state.settings || {}) };
  state.announcements ||= [{ id: 'update-v6', title: '聊天、游戏存档与管理功能更新', content: '新增账号游戏存档接口、更新公告、聊天记录分页管理、敏感词屏蔽，并扩展服务器参数设置。', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
  state.gameSaves ||= [];
  state.messages.forEach(message => { message.conversationId ||= 'lobby'; });
  return state;
}

function save(state) {
  fs.mkdirSync(dataDir, { recursive: true });
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(temp, file);
}

module.exports = { load, save, hashPassword, verifyPassword };
