const sessions = require('./ai-sessions'), tools = require('./ai-tools');
function createAiApi({ state, save, requireUser, allowed, body, json }) {
  return async (req, res, url) => {
    const path = url.pathname; if (!path.startsWith('/api/account/ai/')) return false;
    const user = requireUser(req, res); if (!user) return true;
    try {
      const requireAccess = () => { if (!allowed(user, 'accessAssistant')) throw tools.error('此账号未获 AI 使用权限', 403); };
      if (path === '/api/account/ai/sessions' && req.method === 'GET') { if (sessions.ensure(state, user)) save(state); json(res, 200, { sessions: sessions.list(state, user), tools: tools.visibleCatalog(user), templates: tools.list(state, user) }); return true; }
      if (path === '/api/account/ai/sessions' && req.method === 'POST') { requireAccess(); const row = sessions.create(state, user, await body(req)); save(state); json(res, 201, sessions.view(state, user, row.id)); return true; }
      const match = path.match(/^\/api\/account\/ai\/sessions\/([a-f0-9-]{36})$/);
      if (match && req.method === 'GET') { const view = sessions.view(state, user, match[1]); json(res, 200, { ...view, messages: view.messages.map(({ role, content, at, attachmentName }) => ({ role, content, at, attachmentName })) }); return true; }
      if (match && req.method === 'PATCH') { sessions.update(state, user, match[1], await body(req)); save(state); json(res, 200, { session: sessions.list(state, user).find(row => row.id === match[1]) }); return true; }
      if (match && req.method === 'DELETE') { sessions.remove(state, user, match[1], url.searchParams.get('version')); save(state); json(res, 200, { ok: true }); return true; }
      if (path === '/api/account/ai/templates' && req.method === 'POST') { requireAccess(); const templates = tools.saveTemplate(state, user, await body(req)); save(state); json(res, 201, { templates }); return true; }
      const template = path.match(/^\/api\/account\/ai\/templates\/([a-f0-9-]{36})$/);
      if (template && req.method === 'PATCH') { requireAccess(); const templates = tools.saveTemplate(state, user, await body(req), template[1]); save(state); json(res, 200, { templates }); return true; }
      if (template && req.method === 'DELETE') { const row = state.assistantTemplates.find(row => row.id === template[1] && row.userId === user.id); if (!row) throw tools.error('模板不存在', 404); if (url.searchParams.get('version') !== row.updatedAt) throw tools.error('模板已更新，请刷新', 409); state.assistantTemplates = state.assistantTemplates.filter(item => item !== row); save(state); json(res, 200, { ok: true }); return true; }
      json(res, 404, { error: 'AI 功能接口不存在' });
    } catch (error) { json(res, error.status || 400, { error: error.message }); }
    return true;
  };
}
module.exports = { createAiApi };
