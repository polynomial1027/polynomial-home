'use strict';

const $ = id => document.getElementById(id);
const h = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const goState = { user: null, lobby: null, game: null, study: null, puzzle: null, puzzleSequence: [], mode: null, busy: false, dead: new Set(), sharedColor: 'B', socket: null, refreshTimer: null, clockReceivedAt: 0, dismissedScoreId: null };
const skinNames = { walnut: '胡桃木', bamboo: '竹色', midnight: '夜色', classic: '经典云子', slate: '磨砂棋子', flat: '扁平棋子' };

async function goApi(url, options = {}) {
  return request(url, options);
}

function setBoardMessage(message, error = false) {
  $('boardMessage').textContent = message;
  $('boardMessage').style.color = error ? 'var(--go-danger)' : '';
}

function setBusy(value, label = '等待服务器…') {
  goState.busy = value;
  $('boardBusy').classList.toggle('hidden', !value);
  $('boardBusy').querySelector('strong').textContent = label;
}

function formatMode(mode) {
  return ({ study: '自由研究', puzzle: '题库', ai: '人机对弈', online: '联机对战', shared: '共享棋盘' })[mode] || mode;
}

function formatStatus(status) {
  return ({ active: '进行中', scoring: '数目确认', finished: '已结束', void: '无效局' })[status] || status;
}

function formatTime(ms) {
  if (!Number.isFinite(ms)) return '—';
  const safe = Math.max(0, Math.ceil(ms / 1000)), minutes = Math.floor(safe / 60), seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function connectGoSocket() {
  if (!goState.user) return;
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const socket = new WebSocket(`${protocol}://${location.host}/go-socket`); goState.socket = socket;
  socket.onopen = () => { $('goConnection').textContent = '实时连接'; $('goConnection').classList.add('online'); };
  socket.onmessage = event => {
    const data = JSON.parse(event.data);
    if (data.type === 'go-game-updated' && data.gameId === goState.game?.id) scheduleGameRefresh();
    if (['go-invitation', 'go-game-created', 'go-maintenance', 'go-presence'].includes(data.type)) scheduleLobbyRefresh();
  };
  socket.onclose = () => {
    $('goConnection').textContent = '连接中断'; $('goConnection').classList.remove('online');
    if (goState.user) setTimeout(connectGoSocket, 2500);
  };
}

function scheduleGameRefresh() {
  clearTimeout(goState.refreshTimer);
  goState.refreshTimer = setTimeout(() => refreshGame().catch(error => setBoardMessage(error.message, true)), 120);
}

function scheduleLobbyRefresh() {
  clearTimeout(goState.refreshTimer);
  goState.refreshTimer = setTimeout(() => loadLobby().catch(console.error), 180);
}

async function loadLobby() {
  goState.lobby = await goApi('/api/go/lobby');
  renderLobby();
}

function renderLobby() {
  const { config, capabilities, userSettings, users, invitations, games, records, studies, puzzles } = goState.lobby;
  $('engineLight').classList.toggle('ready', config.ai.available);
  $('engineStatus').textContent = config.ai.available ? (config.ai.running ? '正在运行' : '已安装，等待对局') : '尚未就绪';
  $('engineDescription').textContent = config.ai.available ? '人机对弈已开放，首次加载模型可能稍慢。' : '其余围棋模式可正常使用；管理员完成 KataGo 环境安装后自动开放。';
  const invitationRows = invitations.filter(item => item.status === 'pending').map(item => {
    const incoming = item.toUserId === goState.user.id, person = incoming ? item.fromUser : item.toUser;
    return `<div class="go-list-item"><div><strong>${incoming ? '收到' : '发出'} · ${h(formatMode(item.mode))}</strong><small>${h(person?.displayName || '已删除用户')} · ${item.config.boardSize} 路 · ${item.config.rules === 'japanese' ? '日本规则' : '中国规则'} · ${item.status === 'pending' ? '等待处理' : '已接受'}</small></div><div class="go-list-actions">${item.gameId ? `<button data-open-game="${item.gameId}" class="accept">进入</button>` : incoming ? `<button data-invite-action="accept" data-invite-id="${item.id}" class="accept">接受</button><button data-invite-action="decline" data-invite-id="${item.id}">拒绝</button>` : `<button data-invite-action="cancel" data-invite-id="${item.id}">取消</button>`}</div></div>`;
  }).join('');
  $('invitationList').innerHTML = invitationRows || '<div class="go-list-empty">暂时没有待处理邀请</div>';
  $('activeGameList').innerHTML = games.map(game => `<div class="go-list-item"><div><strong>${h(formatMode(game.mode))} · ${h(formatStatus(game.status))}</strong><small>${game.config.boardSize} 路 · ${game.blackPlayer?.displayName || '协作'} / ${game.whitePlayer?.displayName || '棋盘'}${game.engineThinking ? ' · KataGo 思考中' : ''}</small></div><div class="go-list-actions"><button data-open-game="${game.id}" class="accept">继续</button></div></div>`).join('') || '<div class="go-list-empty">没有进行中的棋局</div>';
  $('recordList').innerHTML = records.map(record => `<div class="go-list-item"><div><strong>${h(record.result || '已结束')} · ${h(formatMode(record.mode))}</strong><small>${record.config.boardSize} 路 · ${record.moveCount} 手 · ${new Date(record.endedAt).toLocaleDateString()}</small></div><div class="go-list-actions"><button data-open-game="${record.id}">回放</button>${capabilities.sgfExport ? `<a href="/api/go/games/${record.id}/sgf">SGF</a>` : ''}</div></div>`).join('') || '<div class="go-list-empty">还没有完成的棋谱</div>';
  $('studyList').innerHTML = capabilities.study ? (studies.map(study => `<div class="go-list-item"><div><strong data-i18n-user>${h(study.title)}</strong><small>${study.boardSize} 路 · ${new Date(study.updatedAt).toLocaleString()}</small></div><div class="go-list-actions"><button data-open-study="${study.id}" class="accept">打开</button><button data-delete-study="${study.id}">删除</button></div></div>`).join('') || '<div class="go-list-empty">还没有保存研究棋谱</div>') : '<div class="go-list-empty">管理员尚未为此账号开放研究权限</div>';
  $('puzzleList').innerHTML = capabilities.puzzles ? (puzzles.map(puzzle => `<button class="puzzle-item" data-open-puzzle="${puzzle.id}"><span>${h(puzzle.difficulty)} · ${puzzle.boardSize} 路</span><strong>${h(puzzle.title)}</strong><p>${h(puzzle.objective)}</p></button>`).join('') || '<div class="go-list-empty">管理员尚未发布题目</div>') : '<div class="go-list-empty">管理员尚未为此账号开放题库权限</div>';
  const modePermission = { study: capabilities.study, puzzle: capabilities.puzzles, ai: capabilities.ai && config.ai.available, online: capabilities.multiplayer && capabilities.invite, shared: capabilities.multiplayer && capabilities.invite && capabilities.shared };
  document.querySelectorAll('[data-start-mode]').forEach(button => { const enabled = Boolean(modePermission[button.dataset.startMode]); button.disabled = !enabled; button.title = enabled ? '' : button.dataset.startMode === 'ai' && capabilities.ai ? 'KataGo 环境尚未就绪' : '此账号尚未开放该模式'; });
  $('importSgf').classList.toggle('hidden', !capabilities.study || !capabilities.sgfImport);
  fillSelect($('prefBoardSkin'), config.boardSkins, userSettings.boardSkin, value => skinNames[value] || value);
  fillSelect($('prefStoneSkin'), config.stoneSkins, userSettings.stoneSkin, value => skinNames[value] || value);
  $('prefCoordinates').checked = userSettings.coordinates; $('prefMoveNumbers').checked = userSettings.showMoveNumbers; $('prefSound').checked = userSettings.sound; $('prefInvitable').checked = userSettings.invitable;
  bindDynamicLobbyActions();
}

function fillSelect(select, values, selected, label = value => value) {
  select.innerHTML = values.map(value => `<option value="${h(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${h(label(value))}</option>`).join('');
}

function bindDynamicLobbyActions() {
  document.querySelectorAll('[data-open-game]').forEach(button => button.onclick = () => openGame(button.dataset.openGame));
  document.querySelectorAll('[data-invite-action]').forEach(button => button.onclick = async () => {
    button.disabled = true;
    try {
      const data = await goApi(`/api/go/invitations/${button.dataset.inviteId}/respond`, { method: 'POST', body: JSON.stringify({ action: button.dataset.inviteAction }) });
      if (data.game) openGame(data.game.id); else await loadLobby();
    } catch (error) { alert(error.message); button.disabled = false; }
  });
  document.querySelectorAll('[data-open-study]').forEach(button => button.onclick = () => openStudy(button.dataset.openStudy));
  document.querySelectorAll('[data-delete-study]').forEach(button => button.onclick = async () => { if (!confirm('确定删除这份研究棋谱吗？')) return; await goApi(`/api/go/studies/${button.dataset.deleteStudy}`, { method: 'DELETE' }); await loadLobby(); });
  document.querySelectorAll('[data-open-puzzle]').forEach(button => button.onclick = () => openPuzzle(button.dataset.openPuzzle));
}

function openCreateDialog(mode) {
  const permissions = goState.lobby.capabilities;
  if ((mode === 'study' && !permissions.study) || (mode === 'ai' && (!permissions.ai || !goState.lobby.config.ai.available)) || (mode === 'online' && (!permissions.multiplayer || !permissions.invite)) || (mode === 'shared' && (!permissions.multiplayer || !permissions.invite || !permissions.shared))) return alert('此账号尚未开放该模式，或所需服务尚未就绪。');
  const config = goState.lobby.config; $('createMode').value = mode; $('createDialogTitle').textContent = mode === 'study' ? '新建研究棋盘' : mode === 'ai' ? '创建人机对局' : mode === 'shared' ? '邀请共享棋盘' : '邀请联机对战';
  document.querySelector('.target-field').classList.toggle('hidden', ['study', 'ai'].includes(mode));
  document.querySelector('.ai-field').classList.toggle('hidden', mode !== 'ai');
  const eligibleUsers = goState.lobby.users.filter(user => mode !== 'shared' || user.canShared);
  $('targetUser').innerHTML = eligibleUsers.map(user => `<option value="${user.id}">${h(user.displayName)} · @${h(user.username)}</option>`).join('');
  fillSelect($('setupBoardSize'), config.boardSizes, config.defaultBoardSize, value => `${value} 路`);
  fillSelect($('setupRules'), config.rules, config.defaultRules, value => value === 'japanese' ? '日本规则' : '中国规则');
  fillSelect($('setupKoRule'), config.koRules, config.defaultKoRule, value => value === 'simple-ko' ? '简单劫' : '全局同形禁着');
  fillSelect($('setupTimeSystem'), config.timeSystems, config.timeSystems.includes('none') ? 'none' : config.timeSystems[0], value => ({ none: '不限时', absolute: '包干时间', byoyomi: '基本时间＋读秒' })[value] || value);
  fillSelect($('setupAiProfile'), config.aiProfiles.map(item => item.id), config.aiProfiles[0]?.id, value => config.aiProfiles.find(item => item.id === value)?.name || value);
  $('setupKomi').value = config.defaultKomi; $('setupHandicap').max = config.maxHandicap; $('setupHandicap').value = 0; $('setupMainMinutes').value = config.defaultMainMinutes;
  ensureByoYomiFields(); $('setupByoSeconds').value = config.defaultByoYomiSeconds; $('setupByoPeriods').value = config.defaultByoYomiPeriods;
  $('setupUndo').innerHTML = mode === 'online' ? '<option value="request">需对方同意</option><option value="none">不可悔棋</option>' : mode === 'ai' ? '<option value="unlimited">允许</option><option value="none">不可悔棋</option>' : '<option value="unlimited">允许</option>';
  $('setupUndo').value = mode === 'study' || mode === 'ai' || mode === 'shared' ? 'unlimited' : config.undoDefault;
  $('createSubmit').disabled = ['online', 'shared'].includes(mode) && !eligibleUsers.length;
  $('setupVisibility').value = config.recordDefaultVisibility; $('createSubmit').textContent = mode === 'study' ? '开始研究' : mode === 'ai' ? '开始人机对局' : '发送邀请'; $('createNotice').textContent = '';
  $('createDialog').showModal();
}

function ensureByoYomiFields() {
  if ($('setupByoSeconds')) return;
  const main = $('setupMainMinutes').closest('label');
  main.insertAdjacentHTML('afterend', '<label class="field byo-field"><span>每次读秒（秒）</span><input id="setupByoSeconds" type="number" min="5" value="30"></label><label class="field byo-field"><span>读秒次数</span><input id="setupByoPeriods" type="number" min="1" value="3"></label>');
}

function createPayload() {
  return {
    boardSize: Number($('setupBoardSize').value), rules: $('setupRules').value, koRule: $('setupKoRule').value, colorChoice: $('setupColor').value,
    handicap: Number($('setupHandicap').value), komi: Number($('setupKomi').value), timeSystem: $('setupTimeSystem').value,
    mainMinutes: Number($('setupMainMinutes').value), byoYomiSeconds: Number($('setupByoSeconds').value), byoYomiPeriods: Number($('setupByoPeriods').value),
    undoPolicy: $('setupUndo').value, aiProfileId: $('setupAiProfile').value, recordVisibility: $('setupVisibility').value,
    boardSkin: goState.lobby.userSettings.boardSkin, stoneSkin: goState.lobby.userSettings.stoneSkin
  };
}

async function submitCreate(event) {
  event.preventDefault(); const mode = $('createMode').value, button = $('createSubmit'); button.disabled = true; $('createNotice').textContent = '';
  try {
    const payload = createPayload();
    if (mode === 'study') { $('createDialog').close(); startStudy({ boardSize: payload.boardSize, rules: payload.rules, koRule: payload.koRule, komi: payload.komi }); }
    else if (mode === 'ai') { const data = await goApi('/api/go/ai-games', { method: 'POST', body: JSON.stringify(payload) }); $('createDialog').close(); showGame(data.game); }
    else { await goApi('/api/go/invitations', { method: 'POST', body: JSON.stringify({ mode, toUserId: $('targetUser').value, config: payload }) }); $('createDialog').close(); await loadLobby(); }
  } catch (error) { $('createNotice').textContent = error.message; } finally { button.disabled = false; }
}

async function openGame(id) {
  setBusy(true, '载入棋局…');
  try { const data = await goApi(`/api/go/games/${id}`); showGame(data.game); }
  catch (error) { alert(error.message); }
  finally { setBusy(false); }
}

function showGame(game) {
  goState.game = game; goState.mode = game.mode; goState.study = null; goState.puzzle = null; goState.clockReceivedAt = Date.now();
  goState.dead = new Set(game.scoring?.proposals?.[goState.user.id] || []);
  $('goHome').classList.add('hidden'); $('goRoom').classList.remove('hidden'); $('roomTitle').textContent = formatMode(game.mode); $('roomSubtitle').textContent = `${game.config.boardSize} 路 · ${game.config.rules === 'japanese' ? '日本规则' : '中国规则'} · 贴目 ${game.config.komi}`;
  $('saveStudy').classList.add('hidden'); $('downloadSgf').classList.toggle('hidden', !goState.lobby.capabilities.sgfExport || !['finished', 'void'].includes(game.status)); $('downloadSgf').href = `/api/go/games/${game.id}/sgf`;
  renderGame();
}

async function refreshGame() {
  if (!goState.game) return;
  const data = await goApi(`/api/go/games/${goState.game.id}`); showGame(data.game);
}

function renderGame() {
  const game = goState.game, board = game.board;
  $('modeBadge').textContent = formatMode(game.mode); $('turnStatus').textContent = game.status === 'active' ? `${game.toPlay === 'B' ? '黑' : '白'}方落子` : game.status === 'scoring' ? '双方数目' : game.result || formatStatus(game.status);
  $('blackCaptures').textContent = game.captures.B; $('whiteCaptures').textContent = game.captures.W; $('moveCount').textContent = game.moves.filter(move => !move.undoneAt).length;
  setPlayerStrip('blackPlayer', game.blackPlayer, 'B', game); setPlayerStrip('whitePlayer', game.whitePlayer, 'W', game);
  $('studyTools').classList.add('hidden'); $('puzzleTools').classList.add('hidden'); $('sharedTools').classList.toggle('hidden', game.mode !== 'shared'); $('gameTools').classList.toggle('hidden', !['online', 'ai'].includes(game.mode)); $('scoringTools').classList.toggle('hidden', game.status !== 'scoring');
  $('undoRequest').classList.toggle('hidden', !game.pendingUndo || game.pendingUndo.requestedBy === goState.user.id);
  $('requestUndo').disabled = game.config.undoPolicy === 'none' || game.status !== 'active';
  const engineColor = game.blackPlayer?.type === 'engine' ? 'B' : 'W';
  $('retryAi').classList.toggle('hidden', !(game.mode === 'ai' && game.status === 'active' && game.engineError && game.toPlay === engineColor));
  $('passMove').disabled = game.status !== 'active' || game.ownColor !== game.toPlay; $('resignGame').disabled = !['active', 'scoring'].includes(game.status);
  $('sharedLock').textContent = game.shared?.locked ? '解除锁定' : '锁定';
  $('boardShell').dataset.boardSkin = game.config.boardSkin || goState.lobby.userSettings.boardSkin; $('boardShell').dataset.stoneSkin = game.config.stoneSkin || goState.lobby.userSettings.stoneSkin;
  renderBoard(board, game.config.boardSize, { lastMove: [...game.moves].reverse().find(move => !move.undoneAt && move.type === 'move'), moves: game.moves, dead: goState.dead });
  renderHistory(game.moves, game.events);
  if (game.status === 'scoring') renderScoreTools();
  renderScoreResult(game);
  const ownTurn = game.status === 'active' && game.ownColor === game.toPlay;
  setBoardMessage(game.engineThinking ? 'KataGo 正在思考…' : game.status === 'scoring' ? (game.scoring?.error ? `KataGo 自动结算失败：${game.scoring.error}。请点击“重试自动结算”。` : 'KataGo 正在统一判断目数与胜负…') : game.engineError ? `KataGo 本次落子失败：${game.engineError}。可点击“重试机器人”。` : game.status === 'finished' || game.status === 'void' ? `棋局结束：${game.result}` : game.mode === 'shared' ? (game.shared?.locked ? '棋盘已锁定。' : '双方可以自由摆棋。') : ownTurn ? '轮到你落子。' : '等待对方落子。', Boolean(game.engineError || game.scoring?.error));
}

function setPlayerStrip(id, player, color, game) {
  const root = $(id), name = player?.displayName || (game.mode === 'shared' ? '共享编辑' : '—'); root.querySelector('strong').textContent = name;
  root.classList.toggle('active-player', game.status === 'active' && game.toPlay === color); updateClockElement(root.querySelector('time'), color, game);
}

function updateClockElement(element, color, game) {
  if (!game.clocks) return void (element.textContent = '不限时');
  const clock = game.clocks[color], active = game.clocks.activeColor === color && game.status === 'active', elapsed = active ? Date.now() - goState.clockReceivedAt : 0;
  if (game.config.timeSystem === 'absolute') element.textContent = formatTime((clock.displayMs ?? clock.mainMs) - elapsed);
  else {
    const main = (clock.displayMainMs ?? clock.mainMs) - elapsed;
    if (main > 0) element.textContent = formatTime(main);
    else element.textContent = `${clock.displayPeriodsLeft ?? clock.periodsLeft}×${formatTime(Math.max(0, (clock.periodDisplayMs ?? game.config.byoYomiSeconds * 1000) - Math.max(0, -main)))}`;
  }
}

function renderScoreTools() {
  const scoring = goState.game.scoring || {};
  const status = scoring.thinking || scoring.pending ? '计算中' : scoring.error ? '等待重试' : scoring.assessment ? '等待双方确认' : '准备结算';
  $('scorePreview').innerHTML = `<div class="score-preview-line"><span>判定来源</span><b>KataGo</b></div><div class="score-preview-line"><span>当前状态</span><b>${status}</b></div><div class="score-preview-line"><span>本局裁决次数</span><b>${Number(scoring.adjudicationCount || 0)} / ${Number(scoring.forcedAfter || goState.lobby.config.scoreForcedAfter || 3)}</b></div>`;
  $('retryScore').disabled = Boolean(scoring.thinking);
  $('retryScore').classList.toggle('hidden', !scoring.error);
}

function renderScoreResult(game) {
  const dialog = $('scoreResultDialog'), scoring = game.scoring || {};
  const shouldShow = Boolean(scoring.assessment && (game.status === 'scoring' || goState.dismissedScoreId !== game.id));
  if (!shouldShow) { if (dialog.open) dialog.close(); return; }
  const winner = scoring.winner;
  $('scoreResultMark').textContent = winner === 'W' ? '○' : winner === 'B' ? '●' : '◐';
  $('scoreResultMark').className = `score-result-mark ${winner === 'W' ? 'white-win' : winner === 'B' ? 'black-win' : 'draw'}`;
  $('scoreResultTitle').textContent = winner === 'B' ? '黑棋获胜' : winner === 'W' ? '白棋获胜' : '本局和棋';
  const margin = Number(scoring.margin || 0);
  $('scoreResultMargin').textContent = winner ? `胜 ${margin.toFixed(margin % 1 ? 1 : 0)} 目` : '双方目数相同';
  const ownConfirmed = Boolean(scoring.confirmations?.[goState.user.id]), forced = Boolean(scoring.forced);
  $('scoreResultStatus').textContent = forced ? '已达到强制裁决次数，本次结果立即生效' : ownConfirmed ? '你已确认，正在等待对方确认' : '请确认 KataGo 的结算结果';
  const players = [{ color: '黑方', player: game.blackPlayer }, { color: '白方', player: game.whitePlayer }];
  $('scoreConfirmations').innerHTML = players.map(({ color, player }) => {
    const key = player?.type === 'engine' ? `engine:${player.name || 'katago'}` : player?.userId;
    const confirmed = Boolean(scoring.confirmations?.[key]) || forced;
    return `<div><span>${color} · ${h(player?.displayName || '—')}</span><b class="${confirmed ? 'confirmed' : ''}">${confirmed ? '✓ 已确认' : '等待确认'}</b></div>`;
  }).join('');
  $('confirmScore').disabled = ownConfirmed || forced || game.status !== 'scoring';
  $('confirmScore').textContent = ownConfirmed ? '你已确认' : forced ? '结果已生效' : '确认结果';
  $('rejectScore').classList.toggle('hidden', forced || ownConfirmed || game.status !== 'scoring');
  $('closeScoreResult').classList.toggle('hidden', game.status === 'scoring');
  $('scoreForceNote').textContent = forced
    ? `这是本局第 ${scoring.adjudicationCount} 次 KataGo 裁决，已按后台规则强制结束。`
    : `这是本局第 ${scoring.adjudicationCount} 次裁决；达到第 ${scoring.forcedAfter || goState.lobby.config.scoreForcedAfter || 3} 次后将不能拒绝。`;
  if (!dialog.open) dialog.showModal();
}

function renderHistory(moves = [], events = []) {
  const active = moves.filter(item => !item.undoneAt);
  $('moveHistory').innerHTML = active.map((move, index) => `<div class="move-row"><span>${index + 1}</span><span>${move.color === 'B' ? '●' : move.color === 'W' ? '○' : '·'}</span><span>${move.type === 'pass' ? '停一手' : move.type === 'erase' ? `擦除 ${coordinateName(move.x, move.y, goState.game?.config.boardSize || goState.study?.boardSize)}` : `${coordinateName(move.x, move.y, goState.game?.config.boardSize || goState.study?.boardSize)}`}</span></div>`).join('') + events.slice(-8).map(event => `<div class="move-row"><span>·</span><span>↳</span><span>${h(eventLabel(event))}</span></div>`).join('');
}

function eventLabel(event) {
  return ({ started: '棋局开始', 'undo-requested': '申请悔棋', 'undo-accepted': '悔棋已同意', 'undo-declined': '悔棋被拒绝', finished: `棋局结束 ${event.result || ''}`, 'engine-error': 'KataGo 暂时不可用', 'engine-score-error': 'KataGo 自动结算失败' })[event.type] || event.type;
}

function coordinateName(x, y, size) {
  const letters = 'ABCDEFGHJKLMNOPQRSTUVWXYZ'; return `${letters[Number(x)] || '?'}${Number(size || 19) - Number(y)}`;
}

async function gameAction(payload, label = '提交操作…') {
  if (!goState.game || goState.busy) return; setBusy(true, label);
  try { const data = await goApi(`/api/go/games/${goState.game.id}/actions`, { method: 'POST', body: JSON.stringify(payload) }); showGame(data.game); playStoneSound(); }
  catch (error) { setBoardMessage(error.message, true); try { await refreshGame(); } catch {} }
  finally { setBusy(false); }
}

function handleBoardPoint(x, y) {
  if (goState.busy) return;
  if (goState.mode === 'study') return studyPoint(x, y);
  if (goState.mode === 'puzzle') return puzzlePoint(x, y);
  if (!goState.game) return;
  if (goState.game.status === 'scoring') return;
  if (goState.game.mode === 'shared') return gameAction({ type: goState.sharedColor === 'erase' ? 'erase' : 'setup', color: goState.sharedColor, x, y }, '同步棋盘…');
  if (goState.game.status === 'active' && goState.game.ownColor === goState.game.toPlay) gameAction({ type: 'move', x, y }, goState.game.mode === 'ai' ? '落子并等待 KataGo…' : '确认落子…');
}

function toggleDeadGroup(x, y) {
  const game = goState.game, color = game.board[y * game.config.boardSize + x]; if (!color) return;
  const group = localGroup(game.board, game.config.boardSize, x, y).stones, allSelected = group.every(([gx, gy]) => goState.dead.has(`${gx},${gy}`));
  group.forEach(([gx, gy]) => allSelected ? goState.dead.delete(`${gx},${gy}`) : goState.dead.add(`${gx},${gy}`));
  renderGame();
}

function renderBoard(board, size, options = {}) {
  const coordinates = goState.lobby?.userSettings.coordinates !== false, moveNumbers = goState.lobby?.userSettings.showMoveNumbers === true, pad = coordinates ? 0.85 : 0.55, svg = $('goBoard');
  svg.setAttribute('viewBox', `${-pad} ${-pad} ${size - 1 + pad * 2} ${size - 1 + pad * 2}`);
  const lines = [], stars = [], coords = [], stones = [], hits = [], numberByPoint = new Map();
  for (let n = 0; n < size; n++) { lines.push(`<line class="board-line" x1="0" y1="${n}" x2="${size - 1}" y2="${n}"/><line class="board-line" x1="${n}" y1="0" x2="${n}" y2="${size - 1}"/>`); }
  const starLow = size === 9 ? 2 : 3, starHigh = size - 1 - starLow, mid = Math.floor(size / 2), starPoints = size === 9 ? [[starLow, starLow], [starHigh, starLow], [mid, mid], [starLow, starHigh], [starHigh, starHigh]] : [[starLow, starLow], [mid, starLow], [starHigh, starLow], [starLow, mid], [mid, mid], [starHigh, mid], [starLow, starHigh], [mid, starHigh], [starHigh, starHigh]];
  starPoints.forEach(([x, y]) => stars.push(`<circle class="board-star" cx="${x}" cy="${y}" r=".12"/>`));
  if (coordinates) for (let n = 0; n < size; n++) { const label = 'ABCDEFGHJKLMNOPQRSTUVWXYZ'[n]; coords.push(`<text class="board-coordinate" x="${n}" y="-.5" text-anchor="middle">${label}</text><text class="board-coordinate" x="-.5" y="${n + .16}" text-anchor="middle">${size - n}</text>`); }
  (options.moves || []).filter(move => !move.undoneAt && move.type === 'move').forEach((move, index) => numberByPoint.set(`${move.x},${move.y}`, index + 1));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const color = board[y * size + x], key = `${x},${y}`;
    if (color) {
      const dead = options.dead?.has(key) ? ' dead-stone' : '';
      stones.push(`<circle class="go-stone ${color === 'B' ? 'black' : 'white'}${dead}" cx="${x}" cy="${y}" r=".44"/>`);
      if (moveNumbers && numberByPoint.has(key)) stones.push(`<text class="move-number ${color === 'B' ? 'on-black' : 'on-white'}" x="${x}" y="${y}">${numberByPoint.get(key)}</text>`);
    }
    hits.push(`<circle data-point="1" data-x="${x}" data-y="${y}" cx="${x}" cy="${y}" r=".48" fill="transparent"/>`);
  }
  const last = options.lastMove && !options.lastMove.undoneAt ? `<circle class="last-move" cx="${options.lastMove.x}" cy="${options.lastMove.y}" r=".16"/>` : '';
  svg.innerHTML = `<defs><radialGradient id="blackStone" cx="35%" cy="28%"><stop offset="0" stop-color="#59645e"/><stop offset=".45" stop-color="#1d2521"/><stop offset="1" stop-color="#070a08"/></radialGradient><radialGradient id="whiteStone" cx="35%" cy="25%"><stop offset="0" stop-color="#fff"/><stop offset=".6" stop-color="#eee8d9"/><stop offset="1" stop-color="#b8b0a0"/></radialGradient></defs>${lines.join('')}${stars.join('')}${coords.join('')}${stones.join('')}${last}${hits.join('')}`;
}

function localGroup(board, size, x, y) {
  const color = board[y * size + x], stones = [], liberties = new Set(), seen = new Set([`${x},${y}`]), queue = [[x, y]];
  if (!color) return { stones, liberties: [] };
  while (queue.length) { const [cx, cy] = queue.pop(); stones.push([cx, cy]); for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]]) { if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue; const value = board[ny * size + nx], key = `${nx},${ny}`; if (!value) liberties.add(key); else if (value === color && !seen.has(key)) { seen.add(key); queue.push([nx, ny]); } } }
  return { stones, liberties: [...liberties] };
}

function applyLocalMove(board, size, color, x, y) {
  if (x < 0 || y < 0 || x >= size || y >= size || board[y * size + x]) throw new Error('这里不能落子');
  const next = board.slice(); next[y * size + x] = color; const opponent = color === 'B' ? 'W' : 'B', captured = [];
  for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) { if (nx < 0 || ny < 0 || nx >= size || ny >= size || next[ny * size + nx] !== opponent) continue; const group = localGroup(next, size, nx, ny); if (!group.liberties.length) group.stones.forEach(([gx, gy]) => { next[gy * size + gx] = null; captured.push([gx, gy]); }); }
  if (!localGroup(next, size, x, y).liberties.length) throw new Error('这里是禁入点');
  return { board: next, captured };
}

function localBoardHash(board) { return board.map(value => value || '.').join(''); }

function startStudy(config = {}, saved = null) {
  const data = saved || {}, root = { id: 'root', children: Array.isArray(data.tree) ? data.tree : [] };
  goState.mode = 'study'; goState.game = null; goState.puzzle = null; goState.study = {
    id: data.id || null, title: data.title || '未命名研究', boardSize: Number(data.boardSize || config.boardSize || 19), rules: data.rules || config.rules || 'chinese', koRule: data.koRule || config.koRule || 'positional-superko', komi: Number(data.komi ?? config.komi ?? 7.5),
    initialStones: data.initialStones || [], nextPlayer: data.nextPlayer || 'B', comments: data.comments || '', root, currentId: 'root', method: 'play', colorTool: 'auto'
  };
  indexStudyTree();
  let node = root; while (node.children?.length) { node = node.children[0]; goState.study.currentId = node.id; }
  $('goHome').classList.add('hidden'); $('goRoom').classList.remove('hidden'); $('roomTitle').textContent = '自由研究'; $('roomSubtitle').textContent = `${goState.study.boardSize} 路 · ${goState.study.rules === 'japanese' ? '日本规则' : '中国规则'}`;
  $('saveStudy').classList.remove('hidden'); $('downloadSgf').classList.add('hidden'); $('studyTitle').value = goState.study.title; $('studyComment').value = goState.study.comments; renderStudy();
}

function indexStudyTree() {
  const study = goState.study; study.nodes = new Map([['root', study.root]]); study.parents = new Map();
  const walk = node => (node.children || []).forEach(child => { child.id ||= cryptoId(); child.children ||= []; study.nodes.set(child.id, child); study.parents.set(child.id, node.id); walk(child); }); walk(study.root);
}

function cryptoId() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`; }

function studyPath() {
  const study = goState.study, path = []; let id = study.currentId;
  while (id && id !== 'root') { const node = study.nodes.get(id); if (!node) break; path.unshift(node); id = study.parents.get(id); }
  return path;
}

function studyPosition() {
  const study = goState.study, size = study.boardSize, board = Array(size * size).fill(null); study.initialStones.forEach(stone => { if (stone.x >= 0 && stone.y >= 0 && stone.x < size && stone.y < size) board[stone.y * size + stone.x] = stone.color; });
  let result = { board, toPlay: study.nextPlayer, captures: { B: 0, W: 0 }, history: [localBoardHash(board)] };
  for (const node of studyPath()) {
    if (node.type === 'clear') { result.board.fill(null); result.history.push(localBoardHash(result.board)); }
    else if (node.type === 'erase') { result.board[node.y * size + node.x] = null; result.history.push(localBoardHash(result.board)); }
    else if (node.type === 'setup') { result.board[node.y * size + node.x] = node.color; if (node.autoAdvance) result.toPlay = node.color === 'B' ? 'W' : 'B'; result.history.push(localBoardHash(result.board)); }
    else if (node.pass) result.toPlay = node.color === 'B' ? 'W' : 'B';
    else if (node.color) { try { const next = applyLocalMove(result.board, size, node.color, node.x, node.y), hash = localBoardHash(next.board), repeated = study.koRule === 'simple-ko' ? result.history.at(-2) === hash : result.history.includes(hash); if (repeated) continue; result.board = next.board; result.history.push(hash); result.captures[node.color] += next.captured.length; result.toPlay = node.color === 'B' ? 'W' : 'B'; } catch {} }
  }
  return result;
}

function addStudyNode(node) {
  const study = goState.study, parent = study.nodes.get(study.currentId) || study.root; node.id = cryptoId(); node.children = []; parent.children ||= []; parent.children.push(node); study.nodes.set(node.id, node); study.parents.set(node.id, parent.id); study.currentId = node.id; renderStudy(); playStoneSound();
}

function studyPoint(x, y) {
  const study = goState.study, position = studyPosition(), size = study.boardSize;
  try {
    if (study.method === 'setup') {
      const tool = study.colorTool === 'auto' ? position.toPlay : study.colorTool;
      if (tool === 'erase') addStudyNode({ type: 'erase', x, y });
      else addStudyNode({ type: 'setup', color: tool, x, y, autoAdvance: study.colorTool === 'auto' });
    } else {
      const color = study.colorTool === 'B' || study.colorTool === 'W' ? study.colorTool : position.toPlay;
      const next = applyLocalMove(position.board, size, color, x, y), hash = localBoardHash(next.board);
      const repeated = study.koRule === 'simple-ko' ? position.history.at(-2) === hash : position.history.includes(hash);
      if (repeated) throw new Error('此手会造成棋盘同形重复');
      addStudyNode({ type: 'move', color, x, y });
    }
  } catch (error) { setBoardMessage(error.message, true); }
}

function renderStudy() {
  const study = goState.study, position = studyPosition(), path = studyPath(), current = study.nodes.get(study.currentId) || study.root;
  $('modeBadge').textContent = '自由研究'; $('turnStatus').textContent = `${position.toPlay === 'B' ? '黑' : '白'}方`; $('blackCaptures').textContent = position.captures.B; $('whiteCaptures').textContent = position.captures.W; $('moveCount').textContent = path.length;
  $('blackPlayer').querySelector('strong').textContent = '研究棋盘'; $('whitePlayer').querySelector('strong').textContent = '研究棋盘'; $('blackPlayer').querySelector('time').textContent = '自由'; $('whitePlayer').querySelector('time').textContent = '自由';
  $('studyTools').classList.remove('hidden'); $('gameTools').classList.add('hidden'); $('sharedTools').classList.add('hidden'); $('scoringTools').classList.add('hidden'); $('puzzleTools').classList.add('hidden');
  $('boardShell').dataset.boardSkin = goState.lobby.userSettings.boardSkin; $('boardShell').dataset.stoneSkin = goState.lobby.userSettings.stoneSkin;
  renderBoard(position.board, study.boardSize, { lastMove: [...path].reverse().find(node => node.type === 'move'), moves: path });
  $('moveHistory').innerHTML = path.map((node, index) => `<div class="move-row"><span>${index + 1}</span><span>${node.color === 'B' ? '●' : node.color === 'W' ? '○' : '·'}</span><span>${node.pass ? '停一手' : node.type === 'erase' ? '擦除' : node.type === 'setup' ? `摆棋 ${coordinateName(node.x, node.y, study.boardSize)}` : coordinateName(node.x, node.y, study.boardSize)}</span></div>`).join('') + (current.children || []).map((child, index) => `<button class="mini-button" data-study-branch="${child.id}">变化 ${index + 1}：${child.pass ? '停一手' : coordinateName(child.x, child.y, study.boardSize)}</button>`).join('');
  document.querySelectorAll('[data-study-branch]').forEach(button => button.onclick = () => { study.currentId = button.dataset.studyBranch; renderStudy(); });
  setBoardMessage((current.children || []).length > 1 ? `当前位置有 ${current.children.length} 个变化分支。` : study.method === 'setup' ? '自由摆棋：选择黑、白或擦除。' : '规则落子：系统会执行提子和禁入检查。');
}

async function saveStudy() {
  const study = goState.study; if (!study) return;
  study.title = $('studyTitle').value.trim() || '未命名研究'; study.comments = $('studyComment').value;
  const payload = { title: study.title, boardSize: study.boardSize, rules: study.rules, koRule: study.koRule, komi: study.komi, initialStones: study.initialStones, nextPlayer: study.nextPlayer, comments: study.comments, tree: study.root.children };
  setBusy(true, '保存研究…');
  try { const data = await goApi(study.id ? `/api/go/studies/${study.id}` : '/api/go/studies', { method: study.id ? 'PUT' : 'POST', body: JSON.stringify(payload) }); study.id = data.study.id; setBoardMessage('研究棋谱已保存。'); }
  catch (error) { setBoardMessage(error.message, true); } finally { setBusy(false); }
}

async function openStudy(id) {
  try { const data = await goApi(`/api/go/studies/${id}`); startStudy({}, data.study); }
  catch (error) { alert(error.message); }
}

function openPuzzle(id) {
  const puzzle = goState.lobby.puzzles.find(item => item.id === id); if (!puzzle) return;
  $('puzzleDialog').close(); goState.mode = 'puzzle'; goState.game = null; goState.study = null; goState.puzzle = puzzle; goState.puzzleSequence = [];
  $('goHome').classList.add('hidden'); $('goRoom').classList.remove('hidden'); $('roomTitle').textContent = '题库练习'; $('roomSubtitle').textContent = `${puzzle.difficulty} · ${puzzle.boardSize} 路`;
  $('saveStudy').classList.add('hidden'); $('downloadSgf').classList.add('hidden'); resetPuzzle();
}

function puzzlePosition() {
  const puzzle = goState.puzzle, board = Array(puzzle.boardSize ** 2).fill(null); puzzle.initialStones.forEach(stone => { board[stone.y * puzzle.boardSize + stone.x] = stone.color; }); let toPlay = puzzle.nextPlayer;
  for (const move of goState.puzzleSequence) { try { const next = applyLocalMove(board, puzzle.boardSize, move.color, move.x, move.y); board.splice(0, board.length, ...next.board); toPlay = move.color === 'B' ? 'W' : 'B'; } catch {} }
  return { board, toPlay };
}

function renderPuzzle() {
  const puzzle = goState.puzzle, position = puzzlePosition(); $('modeBadge').textContent = '题库'; $('turnStatus').textContent = `${position.toPlay === 'B' ? '黑' : '白'}方`; $('blackCaptures').textContent = '—'; $('whiteCaptures').textContent = '—'; $('moveCount').textContent = goState.puzzleSequence.length;
  $('blackPlayer').querySelector('strong').textContent = puzzle.userColor === 'B' ? '你' : '题目应手'; $('whitePlayer').querySelector('strong').textContent = puzzle.userColor === 'W' ? '你' : '题目应手'; $('blackPlayer').querySelector('time').textContent = '题目'; $('whitePlayer').querySelector('time').textContent = '题目';
  $('studyTools').classList.add('hidden'); $('gameTools').classList.add('hidden'); $('sharedTools').classList.add('hidden'); $('scoringTools').classList.add('hidden'); $('puzzleTools').classList.remove('hidden'); $('puzzleTitle').textContent = puzzle.title; $('puzzleObjective').textContent = puzzle.objective;
  $('boardShell').dataset.boardSkin = goState.lobby.userSettings.boardSkin; $('boardShell').dataset.stoneSkin = goState.lobby.userSettings.stoneSkin; renderBoard(position.board, puzzle.boardSize, { moves: goState.puzzleSequence, lastMove: goState.puzzleSequence.at(-1) }); renderHistory(goState.puzzleSequence, []);
}

async function puzzlePoint(x, y) {
  const puzzle = goState.puzzle, before = [...goState.puzzleSequence], position = puzzlePosition(); if (position.toPlay !== puzzle.userColor) return;
  try { applyLocalMove(position.board, puzzle.boardSize, puzzle.userColor, x, y); } catch (error) { return setBoardMessage(error.message, true); }
  goState.puzzleSequence.push({ color: puzzle.userColor, x, y }); renderPuzzle(); setBusy(true, '检查答案…');
  try {
    const result = await goApi(`/api/go/puzzles/${puzzle.id}/attempt`, { method: 'POST', body: JSON.stringify({ sequence: goState.puzzleSequence }) });
    if (result.state === 'wrong') goState.puzzleSequence = before;
    if (result.reply) goState.puzzleSequence.push(result.reply);
    $('puzzleFeedback').textContent = result.message; $('puzzleFeedback').style.color = result.state === 'wrong' ? 'var(--go-danger)' : 'var(--go-jade)'; renderPuzzle(); setBoardMessage(result.message, result.state === 'wrong');
  } catch (error) { goState.puzzleSequence = before; renderPuzzle(); setBoardMessage(error.message, true); } finally { setBusy(false); }
}

function resetPuzzle() { goState.puzzleSequence = []; $('puzzleFeedback').textContent = ''; renderPuzzle(); setBoardMessage(goState.puzzle.description || '请找到正确落点。'); }

function leaveRoom() {
  goState.game = null; goState.study = null; goState.puzzle = null; goState.mode = null; $('goRoom').classList.add('hidden'); $('goHome').classList.remove('hidden'); loadLobby().catch(console.error);
}

function playStoneSound() {
  if (!goState.lobby?.userSettings.sound) return;
  try { const context = new (window.AudioContext || window.webkitAudioContext)(), oscillator = context.createOscillator(), gain = context.createGain(); oscillator.type = 'sine'; oscillator.frequency.value = 120; gain.gain.setValueAtTime(.035, context.currentTime); gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .06); oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + .065); } catch {}
}

function bindStaticControls() {
  document.querySelectorAll('[data-start-mode]').forEach(button => button.onclick = () => button.dataset.startMode === 'puzzle' ? $('puzzleDialog').showModal() : openCreateDialog(button.dataset.startMode));
  $('createGameForm').addEventListener('submit', submitCreate); $('closeCreateDialog').onclick = () => $('createDialog').close(); $('closePuzzles').onclick = () => $('puzzleDialog').close(); $('refreshLobby').onclick = () => loadLobby(); $('leaveRoom').onclick = leaveRoom; $('saveStudy').onclick = saveStudy;
  $('setupHandicap').addEventListener('change', () => { $('setupKomi').value = Number($('setupHandicap').value) >= 2 ? goState.lobby.config.handicapKomi : goState.lobby.config.defaultKomi; });
  $('goBoard').addEventListener('click', event => { const point = event.target.closest('[data-point]'); if (point) handleBoardPoint(Number(point.dataset.x), Number(point.dataset.y)); });
  $('passMove').onclick = () => gameAction({ type: 'pass' }, '提交停一手…'); $('requestUndo').onclick = () => gameAction({ type: 'undo-request' }, '发送悔棋请求…'); $('resignGame').onclick = () => confirm('确定认输并结束本局吗？') && gameAction({ type: 'resign' }, '结束棋局…');
  $('retryAi').onclick = () => gameAction({ type: 'retry-ai' }, '重新请求 KataGo 落子…');
  $('acceptUndo').onclick = () => gameAction({ type: 'undo-response', accept: true }); $('declineUndo').onclick = () => gameAction({ type: 'undo-response', accept: false });
  $('retryScore').onclick = () => gameAction({ type: 'retry-score' }, '重新请求 KataGo 结算…');
  $('confirmScore').onclick = () => gameAction({ type: 'score-confirm' }, '确认结算结果…');
  $('rejectScore').onclick = () => confirm('拒绝本次结果并恢复棋局继续落子吗？') && gameAction({ type: 'score-reject' }, '恢复棋局…');
  $('closeScoreResult').onclick = () => { goState.dismissedScoreId = goState.game?.id || null; $('scoreResultDialog').close(); };
  document.querySelectorAll('[data-shared-color]').forEach(button => button.onclick = () => { goState.sharedColor = button.dataset.sharedColor; document.querySelectorAll('[data-shared-color]').forEach(item => item.classList.toggle('active', item === button)); });
  $('sharedUndo').onclick = () => gameAction({ type: 'undo' }); $('sharedRedo').onclick = () => gameAction({ type: 'redo' }); $('sharedClear').onclick = () => confirm('确定清空共享棋盘吗？') && gameAction({ type: 'clear' }); $('sharedLock').onclick = () => gameAction({ type: 'lock', locked: !goState.game.shared.locked });
  document.querySelectorAll('[data-study-method]').forEach(button => button.onclick = () => { goState.study.method = button.dataset.studyMethod; document.querySelectorAll('[data-study-method]').forEach(item => item.classList.toggle('active', item === button)); renderStudy(); });
  document.querySelectorAll('[data-tool-color]').forEach(button => button.onclick = () => { goState.study.colorTool = button.dataset.toolColor; document.querySelectorAll('[data-tool-color]').forEach(item => item.classList.toggle('active', item === button)); renderStudy(); });
  $('studyUndo').onclick = () => { const id = goState.study.currentId; if (id !== 'root') { goState.study.currentId = goState.study.parents.get(id) || 'root'; renderStudy(); } };
  $('studyRedo').onclick = () => { const node = goState.study.nodes.get(goState.study.currentId); if (node?.children?.length) { goState.study.currentId = node.children.at(-1).id; renderStudy(); } };
  $('studyPass').onclick = () => { const position = studyPosition(), color = goState.study.colorTool === 'B' || goState.study.colorTool === 'W' ? goState.study.colorTool : position.toPlay; addStudyNode({ type: 'pass', color, pass: true }); };
  $('studyClear').onclick = () => confirm('确定在当前变化中清空棋盘吗？') && addStudyNode({ type: 'clear' });
  $('puzzleHint').onclick = () => { const hints = goState.puzzle.hints || []; $('puzzleFeedback').textContent = hints.length ? hints[goState.puzzleSequence.length % hints.length] : '这道题暂时没有提示。'; }; $('puzzleReset').onclick = resetPuzzle;
  $('importSgf').onclick = () => $('sgfFile').click(); $('sgfFile').onchange = async event => { const file = event.target.files[0]; if (!file) return; try { const data = await goApi('/api/go/studies/import', { method: 'POST', body: JSON.stringify({ sgf: await file.text() }) }); await loadLobby(); openStudy(data.study.id); } catch (error) { alert(error.message); } event.target.value = ''; };
  $('goPreferences').onsubmit = async event => { event.preventDefault(); const data = await goApi('/api/go/user-settings', { method: 'PATCH', body: JSON.stringify({ boardSkin: $('prefBoardSkin').value, stoneSkin: $('prefStoneSkin').value, coordinates: $('prefCoordinates').checked, showMoveNumbers: $('prefMoveNumbers').checked, sound: $('prefSound').checked, invitable: $('prefInvitable').checked }) }); goState.lobby.userSettings = data.settings; renderLobby(); };
}

async function initGo() {
  bindStaticControls(); const me = await goApi('/api/me');
  if (!me.user) { $('goLoginGate').showModal(); return; }
  goState.user = me.user; $('goPlayer').textContent = `${me.user.displayName} · @${me.user.username}`; await loadLobby(); connectGoSocket();
  const gameId = new URLSearchParams(location.search).get('game'); if (gameId) openGame(gameId);
  setInterval(() => { if (goState.game) { setPlayerStrip('blackPlayer', goState.game.blackPlayer, 'B', goState.game); setPlayerStrip('whitePlayer', goState.game.whitePlayer, 'W', goState.game); } }, 250);
}

initGo().catch(error => { console.error(error); if ($('goLoginGate') && !goState.user) $('goLoginGate').showModal(); else alert(error.message); });
