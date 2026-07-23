'use strict';

const crypto = require('node:crypto');
const {
  GoRuleError, applyMove, gameToSgf, opposite, replay, sgfToStudy, standardHandicap
} = require('./go-engine');

const nowIso = () => new Date().toISOString();
const uniqueStrings = values => [...new Set((Array.isArray(values) ? values : []).map(String))];
const clampInt = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isSafeInteger(number) ? Math.max(min, Math.min(max, number)) : fallback;
};

class GoService {
  constructor({ state, save, can, publicUser, kataGo, broadcast }) {
    this.state = state;
    this.saveState = save;
    this.can = can;
    this.publicUser = publicUser;
    this.kataGo = kataGo;
    this.broadcast = broadcast || (() => {});
  }

  settings() {
    return this.state.settings;
  }

  requireAccess(user) {
    if (!user || !this.can(user, 'accessGames') || !this.can(user, 'accessGo')) throw new GoRuleError('此账号没有围棋功能权限', 'FORBIDDEN');
    if (this.settings().goEnabled === false) throw new GoRuleError('围棋功能正在维护', 'GO_DISABLED');
  }

  user(id) {
    return this.state.users.find(item => item.id === id && item.active) || null;
  }

  requirePermission(user, permission, message = '此账号没有围棋功能权限') {
    this.requireAccess(user);
    if (!this.can(user, permission)) throw new GoRuleError(message, 'FORBIDDEN');
  }

  save(event = null, targets = null) {
    this.saveState(this.state);
    if (event) this.broadcast(event, targets);
  }

  userSettings(userId) {
    let item = this.state.goUserSettings.find(entry => entry.userId === userId);
    if (!item) {
      item = {
        userId, boardSkin: this.settings().goDefaultBoardSkin || 'walnut', stoneSkin: this.settings().goDefaultStoneSkin || 'classic',
        coordinates: true, sound: true, showMoveNumbers: false, invitable: true, updatedAt: nowIso()
      };
      this.state.goUserSettings.push(item);
    }
    return item;
  }

  updateUserSettings(user, data) {
    this.requireAccess(user);
    const item = this.userSettings(user.id), allowedBoards = this.settings().goBoardSkins || ['walnut', 'bamboo', 'midnight'], allowedStones = this.settings().goStoneSkins || ['classic', 'slate', 'flat'];
    if (allowedBoards.includes(data.boardSkin)) item.boardSkin = data.boardSkin;
    if (allowedStones.includes(data.stoneSkin)) item.stoneSkin = data.stoneSkin;
    for (const key of ['coordinates', 'sound', 'showMoveNumbers', 'invitable']) if (typeof data[key] === 'boolean') item[key] = data[key];
    item.updatedAt = nowIso();
    this.save();
    return item;
  }

  publicConfig() {
    const settings = this.settings();
    const engine = this.kataGo.status();
    return {
      enabled: settings.goEnabled !== false,
      boardSizes: settings.goAllowedBoardSizes || [9, 13, 19],
      rules: settings.goAllowedRules || ['chinese'],
      defaultBoardSize: settings.goDefaultBoardSize || 19,
      defaultRules: settings.goDefaultRules || 'chinese',
      koRules: settings.goAllowedKoRules || ['positional-superko'],
      defaultKoRule: settings.goDefaultKoRule || 'positional-superko',
      defaultKomi: Number(settings.goDefaultKomi ?? 7.5),
      maxHandicap: Number(settings.goMaxHandicap ?? 9),
      timeSystems: settings.goAllowedTimeSystems || ['none', 'absolute', 'byoyomi'],
      maxMainMinutes: Number(settings.goMaxMainMinutes || 180),
      defaultMainMinutes: Number(settings.goDefaultMainMinutes || 30),
      defaultByoYomiSeconds: Number(settings.goDefaultByoYomiSeconds || 30),
      defaultByoYomiPeriods: Number(settings.goDefaultByoYomiPeriods || 3),
      undoDefault: settings.goUndoDefault || 'request',
      maxUndoRequests: Number(settings.goMaxUndoRequests ?? 3),
      boardSkins: settings.goBoardSkins || ['walnut', 'bamboo', 'midnight'],
      stoneSkins: settings.goStoneSkins || ['classic', 'slate', 'flat'],
      recordDefaultVisibility: settings.goRecordDefaultVisibility || 'participants',
      handicapKomi: Number(settings.goHandicapKomi ?? 0),
      sharedMaxParticipants: Number(settings.goSharedMaxParticipants || 2),
      aiProfiles: (settings.goAiProfiles || []).map(item => ({ id: item.id, name: item.name, description: item.description || '' })),
      scoreForcedAfter: Math.max(1, Number(settings.goScoreForcedAfter || 3)),
      ai: { enabled: engine.enabled, available: engine.available, running: engine.running, hasError: Boolean(engine.lastError) }
    };
  }

  normalizeConfig(input = {}, mode = 'online') {
    const settings = this.settings(), allowedSizes = settings.goAllowedBoardSizes || [9, 13, 19], allowedRules = settings.goAllowedRules || ['chinese'];
    const boardSize = allowedSizes.includes(Number(input.boardSize)) ? Number(input.boardSize) : Number(settings.goDefaultBoardSize || allowedSizes[0] || 19);
    const rules = allowedRules.includes(input.rules) ? input.rules : (settings.goDefaultRules || allowedRules[0] || 'chinese');
    const allowedKoRules = settings.goAllowedKoRules || ['positional-superko'];
    const koRule = allowedKoRules.includes(input.koRule) ? input.koRule : (settings.goDefaultKoRule || allowedKoRules[0] || 'positional-superko');
    const maxHandicap = Math.max(0, Number(settings.goMaxHandicap ?? 9)), handicap = mode === 'shared' ? 0 : clampInt(input.handicap, 0, maxHandicap, 0);
    const timeSystems = settings.goAllowedTimeSystems || ['none', 'absolute', 'byoyomi'];
    const timeSystem = mode === 'shared' ? 'none' : timeSystems.includes(input.timeSystem) ? input.timeSystem : 'none';
    const maxMain = Number(settings.goMaxMainMinutes || 180), mainMinutes = clampInt(input.mainMinutes, 1, maxMain, Number(settings.goDefaultMainMinutes || 30));
    const byoYomiSeconds = clampInt(input.byoYomiSeconds, 5, 300, Number(settings.goDefaultByoYomiSeconds || 30));
    const byoYomiPeriods = clampInt(input.byoYomiPeriods, 1, 10, Number(settings.goDefaultByoYomiPeriods || 3));
    const undoValues = mode === 'shared' ? ['unlimited'] : mode === 'ai' ? ['none', 'unlimited'] : ['none', 'request'];
    const undoPolicy = undoValues.includes(input.undoPolicy) ? input.undoPolicy : (mode === 'ai' ? 'unlimited' : mode === 'shared' ? 'unlimited' : (settings.goUndoDefault === 'none' ? 'none' : 'request'));
    const colors = ['creator_black', 'creator_white', 'random'];
    const config = {
      boardSize, rules, koRule, allowSuicide: false,
      komi: Number.isFinite(Number(input.komi)) ? Math.max(-50, Math.min(50, Number(input.komi))) : Number(settings.goDefaultKomi ?? 7.5),
      handicap, colorChoice: colors.includes(input.colorChoice) ? input.colorChoice : 'random', timeSystem,
      mainMinutes, byoYomiSeconds, byoYomiPeriods, undoPolicy,
      maxUndoRequests: clampInt(input.maxUndoRequests, 0, Number(settings.goMaxUndoRequests ?? 3), Number(settings.goMaxUndoRequests ?? 3)),
      disconnectPolicy: ['continue', 'forfeit', 'void'].includes(input.disconnectPolicy) ? input.disconnectPolicy : (settings.goDisconnectPolicy || 'continue'),
      disconnectGraceSeconds: clampInt(input.disconnectGraceSeconds, 10, 3600, Number(settings.goDisconnectGraceSeconds || 180)),
      recordVisibility: ['private', 'participants', 'public'].includes(input.recordVisibility) ? input.recordVisibility : (settings.goRecordDefaultVisibility || 'participants'),
      boardSkin: (settings.goBoardSkins || []).includes(input.boardSkin) ? input.boardSkin : (settings.goDefaultBoardSkin || 'walnut'),
      stoneSkin: (settings.goStoneSkins || []).includes(input.stoneSkin) ? input.stoneSkin : (settings.goDefaultStoneSkin || 'classic')
    };
    if (handicap >= 2 && input.komi === undefined) config.komi = Number(settings.goHandicapKomi ?? 0);
    if (mode === 'ai') {
      const profiles = settings.goAiProfiles || [];
      config.aiProfileId = profiles.some(item => item.id === input.aiProfileId) ? input.aiProfileId : (profiles[0]?.id || 'beginner');
    }
    return config;
  }

  makeClocks(config, nextPlayer) {
    if (config.timeSystem === 'none') return null;
    const make = () => ({ mainMs: config.mainMinutes * 60_000, periodsLeft: config.timeSystem === 'byoyomi' ? config.byoYomiPeriods : 0 });
    return { B: make(), W: make(), activeColor: nextPlayer, turnStartedAt: Date.now() };
  }

  clockSnapshot(game, at = Date.now()) {
    if (!game.clocks) return null;
    const snapshot = JSON.parse(JSON.stringify(game.clocks)), color = snapshot.activeColor;
    if (game.status !== 'active' || !color || !snapshot.turnStartedAt) return snapshot;
    const elapsed = Math.max(0, at - Number(snapshot.turnStartedAt)), clock = snapshot[color], config = game.config;
    if (config.timeSystem === 'absolute') clock.displayMs = Math.max(0, clock.mainMs - elapsed);
    else {
      const overflow = Math.max(0, elapsed - clock.mainMs);
      clock.displayMainMs = Math.max(0, clock.mainMs - elapsed);
      if (overflow <= 0) clock.periodDisplayMs = config.byoYomiSeconds * 1000;
      else {
        const periodMs = config.byoYomiSeconds * 1000, lost = Math.floor(Math.max(0, overflow - 1) / periodMs);
        clock.displayPeriodsLeft = Math.max(0, clock.periodsLeft - lost);
        clock.periodDisplayMs = Math.max(0, periodMs - (overflow % periodMs));
      }
    }
    return snapshot;
  }

  consumeClock(game, color, at = Date.now()) {
    if (!game.clocks || game.clocks.activeColor !== color) return false;
    const clock = game.clocks[color], elapsed = Math.max(0, at - Number(game.clocks.turnStartedAt || at)), config = game.config;
    if (config.timeSystem === 'absolute') {
      clock.mainMs -= elapsed;
      if (clock.mainMs <= 0) return true;
    } else {
      const originalMain = clock.mainMs;
      clock.mainMs = Math.max(0, clock.mainMs - elapsed);
      const overflow = Math.max(0, elapsed - originalMain), periodMs = config.byoYomiSeconds * 1000;
      if (overflow > 0) {
        const lost = Math.floor(Math.max(0, overflow - 1) / periodMs);
        if (lost >= clock.periodsLeft) return true;
        clock.periodsLeft -= lost;
      }
    }
    return false;
  }

  startTurn(game, color, at = Date.now()) {
    if (!game.clocks) return;
    game.clocks.activeColor = color;
    game.clocks.turnStartedAt = at;
  }

  playerColor(game, userId) {
    if (game.blackPlayer?.userId === userId) return 'B';
    if (game.whitePlayer?.userId === userId) return 'W';
    return null;
  }

  isParticipant(game, user) {
    return game.participantIds?.includes(user.id) || this.playerColor(game, user.id);
  }

  canViewRecord(game, user) {
    if (game.config?.recordVisibility === 'public') return true;
    if (game.config?.recordVisibility === 'private') return game.createdBy === user.id;
    return this.isParticipant(game, user);
  }

  gameFor(id, user) {
    this.requireAccess(user);
    const game = this.state.goGames.find(item => item.id === id);
    const active = game && !['finished', 'void'].includes(game.status);
    if (!game || (active ? !this.isParticipant(game, user) : !this.canViewRecord(game, user))) throw new GoRuleError('棋局不存在或无权查看', 'NOT_FOUND');
    return game;
  }

  position(game) {
    return replay({ size: game.config.boardSize, initialStones: game.initialStones, nextPlayer: game.nextPlayer, moves: game.moves, rules: { allowSuicide: game.config.allowSuicide === true, koRule: game.config.koRule || 'positional-superko' } });
  }

  gameView(game, viewer) {
    const position = this.position(game), users = this.state.users;
    const player = value => value ? { ...value, displayName: value.type === 'engine' ? value.name : (users.find(item => item.id === value.userId)?.displayName || '已删除用户') } : null;
    return {
      id: game.id, mode: game.mode, status: game.status, config: game.config, createdBy: game.createdBy, participantIds: game.participantIds,
      blackPlayer: player(game.blackPlayer), whitePlayer: player(game.whitePlayer), initialStones: game.initialStones, nextPlayer: game.nextPlayer,
      board: position.board, toPlay: position.toPlay, captures: position.captures, consecutivePasses: position.consecutivePasses,
      moves: game.moves, events: game.events.slice(-100).map(event => event.type === 'engine-error' ? { type: event.type, at: event.at } : event), revision: game.revision, pendingUndo: game.pendingUndo || null,
      scoring: game.scoring || null, resignation: game.resignation || null,
      decisionCount: Number(game.decisionCount || game.scoring?.adjudicationCount || 0),
      result: game.result || null, resultDetail: game.resultDetail || null,
      clocks: this.clockSnapshot(game), shared: game.shared || null, disconnects: game.disconnects || {},
      engineThinking: Boolean(game.engineThinking), engineError: game.engineError ? '引擎暂时未能完成落子' : null,
      createdAt: game.createdAt, startedAt: game.startedAt, updatedAt: game.updatedAt, endedAt: game.endedAt || null,
      ownColor: viewer ? this.playerColor(game, viewer.id) : null, canEdit: viewer ? this.isParticipant(game, viewer) : false
    };
  }

  lobby(user) {
    this.requireAccess(user);
    this.expireInvitations();
    const ownSettings = this.userSettings(user.id), capabilities = {
      study: this.can(user, 'goStudy'), puzzles: this.can(user, 'goPuzzles'), ai: this.can(user, 'goAi'),
      multiplayer: this.can(user, 'goMultiplayer'), invite: this.can(user, 'goInvite'), shared: this.can(user, 'goShared'),
      sgfImport: this.can(user, 'goSgfImport'), sgfExport: this.can(user, 'goSgfExport')
    };
    const activeUsers = capabilities.multiplayer ? this.state.users.filter(item => item.active && item.id !== user.id && this.can(item, 'accessGames') && this.can(item, 'accessGo') && this.can(item, 'goMultiplayer')) : [];
    return {
      config: this.publicConfig(), capabilities, userSettings: ownSettings,
      users: activeUsers.filter(item => this.userSettings(item.id).invitable).map(item => ({ id: item.id, username: item.username, displayName: item.displayName, canShared: this.can(item, 'goShared') })),
      invitations: capabilities.multiplayer ? this.state.goInvitations.filter(item => item.status === 'pending' && (item.fromUserId === user.id || item.toUserId === user.id)).slice(-50).reverse().map(item => this.invitationView(item)) : [],
      games: this.state.goGames.filter(item => this.isParticipant(item, user) && !['finished', 'void'].includes(item.status)).slice(-20).reverse().map(item => this.gameView(item, user)),
      records: this.listRecords(user, true).slice(0, 20), studies: capabilities.study ? this.state.goStudies.filter(item => item.ownerId === user.id).map(item => this.studySummary(item)) : [],
      puzzles: capabilities.puzzles ? this.listPuzzles(user) : []
    };
  }

  invitationView(item) {
    return {
      ...item,
      fromUser: this.user(item.fromUserId) ? this.publicUser(this.user(item.fromUserId)) : null,
      toUser: this.user(item.toUserId) ? this.publicUser(this.user(item.toUserId)) : null
    };
  }

  createInvitation(user, data) {
    this.requirePermission(user, 'goMultiplayer', '此账号不能参加围棋联机');
    if (!this.can(user, 'goInvite')) throw new GoRuleError('此账号不能发送围棋邀请', 'FORBIDDEN');
    const mode = data.mode === 'shared' ? 'shared' : 'online';
    if (mode === 'shared' && !this.can(user, 'goShared')) throw new GoRuleError('此账号不能创建共享棋盘', 'FORBIDDEN');
    const target = this.user(String(data.toUserId || ''));
    if (!target || target.id === user.id || !this.can(target, 'accessGames') || !this.can(target, 'accessGo') || !this.can(target, 'goMultiplayer') || !this.userSettings(target.id).invitable) throw new GoRuleError('对方当前不能接收围棋邀请', 'INVITE_UNAVAILABLE');
    if (mode === 'shared' && !this.can(target, 'goShared')) throw new GoRuleError('对方账号未开放共享棋盘权限', 'INVITE_UNAVAILABLE');
    const pending = this.state.goInvitations.filter(item => item.fromUserId === user.id && item.status === 'pending' && new Date(item.expiresAt) > new Date());
    if (pending.length >= Number(this.settings().goMaxPendingInvites || 5)) throw new GoRuleError('待处理邀请数量已达到上限', 'INVITE_LIMIT');
    const duplicate = pending.find(item => item.toUserId === target.id && item.mode === mode);
    if (duplicate) throw new GoRuleError('已经向该用户发送过同类邀请', 'INVITE_EXISTS');
    const createdAt = nowIso(), invitation = {
      id: crypto.randomUUID(), fromUserId: user.id, toUserId: target.id, mode, config: this.normalizeConfig(data.config, mode), status: 'pending',
      createdAt, expiresAt: new Date(Date.now() + Number(this.settings().goInviteExpiryMinutes || 10) * 60_000).toISOString()
    };
    this.state.goInvitations.push(invitation);
    this.save({ type: 'go-invitation', invitationId: invitation.id }, [user.id, target.id]);
    return this.invitationView(invitation);
  }

  respondInvitation(user, id, action) {
    this.requireAccess(user);
    const invitation = this.state.goInvitations.find(item => item.id === id && (item.toUserId === user.id || item.fromUserId === user.id));
    if (!invitation) throw new GoRuleError('邀请不存在', 'NOT_FOUND');
    if (invitation.status !== 'pending' || new Date(invitation.expiresAt) <= new Date()) throw new GoRuleError('邀请已经失效', 'INVITE_EXPIRED');
    if (action === 'cancel' && invitation.fromUserId === user.id) invitation.status = 'cancelled';
    else if (action === 'decline' && invitation.toUserId === user.id) invitation.status = 'declined';
    else if (action === 'accept' && invitation.toUserId === user.id) {
      this.requirePermission(user, 'goMultiplayer', '此账号不能参加围棋联机');
      const creator = this.user(invitation.fromUserId);
      if (!creator || !this.can(creator, 'accessGames') || !this.can(creator, 'accessGo') || !this.can(creator, 'goMultiplayer')) throw new GoRuleError('邀请方当前已不能参加围棋联机', 'INVITE_UNAVAILABLE');
      if (invitation.mode === 'shared' && (!this.can(user, 'goShared') || !this.can(creator, 'goShared'))) throw new GoRuleError('双方账号均需开放共享棋盘权限', 'FORBIDDEN');
      invitation.status = 'accepted';
      const game = this.createMultiplayerGame(invitation);
      invitation.gameId = game.id;
      invitation.respondedAt = nowIso();
      this.save({ type: 'go-game-created', gameId: game.id }, game.participantIds);
      return { invitation: this.invitationView(invitation), game: this.gameView(game, user) };
    } else throw new GoRuleError('不能执行这个邀请操作', 'FORBIDDEN');
    invitation.respondedAt = nowIso();
    this.save({ type: 'go-invitation', invitationId: invitation.id }, [invitation.fromUserId, invitation.toUserId]);
    return { invitation: this.invitationView(invitation) };
  }

  createMultiplayerGame(invitation) {
    const creatorBlack = invitation.config.colorChoice === 'creator_black' || (invitation.config.colorChoice === 'random' && Math.random() < 0.5);
    const blackId = creatorBlack ? invitation.fromUserId : invitation.toUserId, whiteId = creatorBlack ? invitation.toUserId : invitation.fromUserId;
    const createdAt = nowIso(), shared = invitation.mode === 'shared';
    const initialStones = shared ? [] : standardHandicap(invitation.config.boardSize, invitation.config.handicap), nextPlayer = initialStones.length ? 'W' : 'B';
    const game = {
      id: crypto.randomUUID(), mode: invitation.mode, status: 'active', config: invitation.config, createdBy: invitation.fromUserId,
      participantIds: [invitation.fromUserId, invitation.toUserId],
      blackPlayer: shared ? null : { type: 'user', userId: blackId }, whitePlayer: shared ? null : { type: 'user', userId: whiteId },
      initialStones, nextPlayer, moves: [], events: [{ type: 'started', at: createdAt }], revision: 1,
      clocks: shared ? null : this.makeClocks(invitation.config, nextPlayer),
      shared: shared ? { hostId: invitation.fromUserId, locked: false, editorIds: [invitation.fromUserId, invitation.toUserId] } : null,
      disconnects: {}, createdAt, startedAt: createdAt, updatedAt: createdAt
    };
    this.state.goGames.push(game);
    return game;
  }

  createAiGame(user, data) {
    this.requirePermission(user, 'goAi', '此账号不能使用围棋人机对弈');
    if (!this.settings().goAiEnabled || !this.kataGo.status().available) throw new GoRuleError('KataGo 当前不可用，请稍后重试', 'ENGINE_UNAVAILABLE');
    const config = this.normalizeConfig(data, 'ai'), humanBlack = config.colorChoice === 'creator_black' || (config.colorChoice === 'random' && Math.random() < 0.5), createdAt = nowIso();
    const initialStones = standardHandicap(config.boardSize, config.handicap), nextPlayer = initialStones.length ? 'W' : 'B';
    const profile = (this.settings().goAiProfiles || []).find(item => item.id === config.aiProfileId) || this.settings().goAiProfiles?.[0] || { id: 'beginner', name: '入门' };
    const game = {
      id: crypto.randomUUID(), mode: 'ai', status: 'active', config, createdBy: user.id, participantIds: [user.id],
      blackPlayer: humanBlack ? { type: 'user', userId: user.id } : { type: 'engine', name: `KataGo · ${profile.name}` },
      whitePlayer: humanBlack ? { type: 'engine', name: `KataGo · ${profile.name}` } : { type: 'user', userId: user.id },
      initialStones, nextPlayer, moves: [], events: [{ type: 'started', at: createdAt }], revision: 1,
      clocks: this.makeClocks(config, nextPlayer), disconnects: {}, createdAt, startedAt: createdAt, updatedAt: createdAt
    };
    game.engineLowWinrateTurns = 0;
    this.state.goGames.push(game);
    this.save({ type: 'go-game-created', gameId: game.id }, [user.id]);
    return game;
  }

  assertPlayable(game, user, expectedColor = null) {
    if (!this.isParticipant(game, user)) throw new GoRuleError('只有对局参与者可以操作', 'FORBIDDEN');
    if (game.status !== 'active') throw new GoRuleError('当前棋局不在落子阶段', 'INVALID_STATE');
    const color = expectedColor || this.playerColor(game, user.id);
    if (!color) throw new GoRuleError('当前模式没有固定执子颜色', 'INVALID_STATE');
    const position = this.position(game);
    if (position.toPlay !== color) throw new GoRuleError('还没有轮到你落子', 'WRONG_TURN');
    return { color, position };
  }

  appendMove(game, color, data, actorId = null) {
    const position = this.position(game), at = Date.now();
    // Validate against an immutable replay before consuming time. Otherwise an
    // illegal request could mutate the in-memory clock and be counted again on
    // the next legal attempt even though no move was accepted.
    const next = applyMove(position, { color, x: data.x, y: data.y, pass: data.pass }, { allowSuicide: game.config.allowSuicide === true, koRule: game.config.koRule || 'positional-superko' });
    if (this.consumeClock(game, color, at)) {
      this.finish(game, `${opposite(color)}+T`, 'timeout', opposite(color));
      return { timeout: true };
    }
    const move = {
      id: crypto.randomUUID(), type: data.pass ? 'pass' : 'move', color,
      ...(data.pass ? {} : { x: Number(data.x), y: Number(data.y), captured: next.lastMove.captured }),
      actorId, at: new Date(at).toISOString(), moveNumber: next.moveNumber
    };
    game.moves.push(move); game.pendingUndo = null; game.revision++; game.updatedAt = move.at;
    if (next.consecutivePasses >= 2) {
      game.status = 'scoring';
      game.scoring = {
        source: 'katago', pending: true, startedAt: move.at, error: null,
        adjudicationCount: Number(game.scoringHistoryCount || 0), confirmations: {}
      };
      if (game.clocks) { game.clocks.activeColor = null; game.clocks.turnStartedAt = null; }
    } else this.startTurn(game, next.toPlay, at);
    return { move, position: next };
  }

  move(user, id, data) {
    const game = this.gameFor(id, user), { color } = this.assertPlayable(game, user);
    const result = this.appendMove(game, color, data, user.id);
    this.save({ type: 'go-game-updated', gameId: game.id }, game.participantIds);
    return { game, ...result };
  }

  engineTurn(game) {
    if (game.mode !== 'ai' || game.status !== 'active') return Promise.resolve(game);
    if (game.engineThinking) return Promise.resolve(game);
    const position = this.position(game), engineColor = game.blackPlayer?.type === 'engine' ? 'B' : 'W';
    if (position.toPlay !== engineColor) return Promise.resolve(game);
    const profile = (this.settings().goAiProfiles || []).find(item => item.id === game.config.aiProfileId) || { id: 'beginner', maxVisits: 12, maxTime: 0.4 };
    const defaultPools = { beginner: 10, easy: 5, medium: 2, strong: 1 };
    const candidatePool = clampInt(profile.candidatePool, 1, 20, defaultPools[profile.id] || 1);
    game.engineThinking = true; game.engineError = null; game.updatedAt = nowIso();
    this.save({ type: 'go-game-updated', gameId: game.id }, game.participantIds);
    return this.kataGo.generateMove({
      boardSize: game.config.boardSize, komi: game.config.komi, rules: game.config.rules,
      initialStones: game.initialStones, moves: game.moves, color: engineColor,
      maxVisits: profile.maxVisits, maxTime: profile.maxTime, candidatePool
    }).then(async response => {
      game.engineThinking = false;
      const move = response?.move || response;
      const winrate = Number(response?.analysis?.winrate);
      const threshold = Number(this.settings().goAiResignWinrateThreshold ?? 0.5);
      if (Number.isFinite(winrate) && winrate < threshold) game.engineLowWinrateTurns = Number(game.engineLowWinrateTurns || 0) + 1;
      else game.engineLowWinrateTurns = 0;
      game.engineLastAnalysis = response?.analysis || null;
      const resignTurns = Math.max(1, Number(this.settings().goAiResignConsecutiveTurns || 12));
      if (game.engineLowWinrateTurns >= resignTurns) {
        this.finish(game, `${opposite(engineColor)}+R`, 'engine-low-winrate', opposite(engineColor), {
          source: 'katago', winrate, threshold, consecutiveTurns: game.engineLowWinrateTurns
        });
      }
      if (game.status === 'active' && move.resign) this.finish(game, `${opposite(engineColor)}+R`, 'resign', opposite(engineColor));
      else if (game.status === 'active') this.appendMove(game, engineColor, move, 'katago');
      if (game.status === 'scoring') await this.finalizeWithKataGo(game);
      this.save({ type: 'go-game-updated', gameId: game.id }, game.participantIds);
      return game;
    }).catch(error => {
      game.engineThinking = false;
      game.engineError = String(error.message || error).slice(0, 500);
      game.events.push({ type: 'engine-error', message: game.engineError, at: nowIso() });
      game.updatedAt = nowIso();
      this.save({ type: 'go-game-updated', gameId: game.id }, game.participantIds);
      return game;
    });
  }

  retryEngine(user, id) {
    const game = this.gameFor(id, user);
    if (!this.isParticipant(game, user) || game.mode !== 'ai' || game.status !== 'active') throw new GoRuleError('当前不能重试机器人落子', 'INVALID_STATE');
    const engineColor = game.blackPlayer?.type === 'engine' ? 'B' : 'W';
    if (this.position(game).toPlay !== engineColor) throw new GoRuleError('当前不是机器人回合', 'INVALID_STATE');
    return game;
  }

  pass(user, id) {
    return this.move(user, id, { pass: true });
  }

  resign(user, id) {
    const game = this.gameFor(id, user), color = this.playerColor(game, user.id);
    if (!color || !['active', 'scoring'].includes(game.status)) throw new GoRuleError('当前不能认输', 'INVALID_STATE');
    const forcedAfter = Math.max(1, Number(this.settings().goScoreForcedAfter || 3));
    game.decisionCount = Number(game.decisionCount || game.scoring?.adjudicationCount || 0) + 1;
    game.resignation = { requestedBy: user.id, loser: color, winner: opposite(color), confirmations: { [user.id]: true }, decisionCount: game.decisionCount, forcedAfter, forced: game.decisionCount >= forcedAfter, at: nowIso() };
    game.events.push({ type: 'resign-requested', requestedBy: user.id, decisionCount: game.decisionCount, at: nowIso() });
    if (game.resignation.forced || game.mode === 'ai') this.finish(game, `${opposite(color)}+R`, 'resign', opposite(color), { decisionCount: game.decisionCount, forced: game.resignation.forced });
    else { game.status = 'resigning'; game.updatedAt = nowIso(); game.revision++; }
    this.save({ type: 'go-game-updated', gameId: game.id }, game.participantIds);
    return game;
  }

  respondResignation(user, id, accept) {
    const game = this.gameFor(id, user), request = game.resignation;
    if (game.status !== 'resigning' || !request || request.requestedBy === user.id || !this.isParticipant(game, user)) throw new GoRuleError('没有需要你处理的认输请求', 'INVALID_STATE');
    if (accept) {
      request.confirmations[user.id] = true;
      this.finish(game, `${request.winner}+R`, 'resign-confirmed', request.winner, { decisionCount: request.decisionCount });
    } else {
      game.events.push({ type: 'resign-rejected', rejectedBy: user.id, decisionCount: request.decisionCount, at: nowIso() });
      game.status = 'active'; game.resignation = null; game.updatedAt = nowIso(); game.revision++;
      this.startTurn(game, this.position(game).toPlay);
    }
    this.save({ type: 'go-game-updated', gameId: game.id }, game.participantIds);
    return game;
  }

  restartGame(user, id) {
    const game = this.gameFor(id, user);
    if (!['finished', 'void'].includes(game.status) || !this.isParticipant(game, user)) throw new GoRuleError('当前棋局不能重新开始', 'INVALID_STATE');
    game.status = 'active'; game.moves = []; game.events = [{ type: 'restarted', by: user.id, at: nowIso() }];
    game.result = null; game.resultDetail = null; game.endedAt = null; game.scoring = null; game.resignation = null; game.decisionCount = 0;
    game.pendingUndo = null; game.engineError = null; game.engineThinking = false; game.revision++; game.updatedAt = nowIso(); game.startedAt = game.updatedAt;
    game.clocks = this.makeClocks(game.config, game.nextPlayer || 'B');
    this.save({ type: 'go-game-updated', gameId: game.id }, game.participantIds);
    return game;
  }

  requestUndo(user, id) {
    const game = this.gameFor(id, user);
    if (game.config.undoPolicy === 'none') throw new GoRuleError('本局开始前已设置为不可悔棋', 'UNDO_DISABLED');
    if (!this.isParticipant(game, user) || game.status !== 'active') throw new GoRuleError('当前不能申请悔棋', 'INVALID_STATE');
    if (game.mode === 'ai') return this.undoAi(user, game);
    if (game.mode !== 'online') throw new GoRuleError('当前模式请使用撤销操作', 'INVALID_STATE');
    if (game.pendingUndo) throw new GoRuleError('已有一项悔棋请求等待处理', 'INVALID_STATE');
    const used = game.events.filter(item => item.type === 'undo-accepted' && item.requestedBy === user.id).length;
    if (used >= game.config.maxUndoRequests) throw new GoRuleError('本局悔棋次数已经用完', 'UNDO_LIMIT');
    const ownIndex = game.moves.findLastIndex(item => !item.undoneAt && item.color === this.playerColor(game, user.id) && (item.type === 'move' || item.type === 'pass'));
    if (ownIndex < 0) throw new GoRuleError('还没有可以撤回的落子', 'NOTHING_TO_UNDO');
    game.pendingUndo = { id: crypto.randomUUID(), requestedBy: user.id, fromMoveIndex: ownIndex, at: nowIso() };
    game.events.push({ type: 'undo-requested', requestedBy: user.id, at: game.pendingUndo.at });
    game.revision++; game.updatedAt = nowIso();
    this.save({ type: 'go-game-updated', gameId: game.id }, game.participantIds);
    return game;
  }

  respondUndo(user, id, accept) {
    const game = this.gameFor(id, user), pending = game.pendingUndo;
    if (!pending || pending.requestedBy === user.id || !this.isParticipant(game, user)) throw new GoRuleError('没有需要你处理的悔棋请求', 'INVALID_STATE');
    if (accept) {
      const at = nowIso();
      game.moves.slice(pending.fromMoveIndex).filter(item => !item.undoneAt).forEach(item => { item.undoneAt = at; item.undoneBy = user.id; });
      game.events.push({ type: 'undo-accepted', requestedBy: pending.requestedBy, acceptedBy: user.id, at });
      game.status = 'active'; game.scoring = null; this.startTurn(game, this.position(game).toPlay);
    } else game.events.push({ type: 'undo-declined', requestedBy: pending.requestedBy, declinedBy: user.id, at: nowIso() });
    game.pendingUndo = null; game.revision++; game.updatedAt = nowIso();
    this.save({ type: 'go-game-updated', gameId: game.id }, game.participantIds);
    return game;
  }

  undoAi(user, game) {
    const humanColor = this.playerColor(game, user.id), active = game.moves.filter(item => !item.undoneAt && (item.type === 'move' || item.type === 'pass'));
    const humanMove = [...active].reverse().find(item => item.color === humanColor);
    if (!humanMove) throw new GoRuleError('没有可以撤回的落子', 'NOTHING_TO_UNDO');
    const start = game.moves.indexOf(humanMove), at = nowIso();
    game.moves.slice(start).filter(item => !item.undoneAt).forEach(item => { item.undoneAt = at; item.undoneBy = user.id; });
    game.events.push({ type: 'ai-undo', requestedBy: user.id, at });
    game.status = 'active'; game.scoring = null; game.engineLowWinrateTurns = 0; game.engineLastAnalysis = null;
    game.revision++; game.updatedAt = at; this.startTurn(game, this.position(game).toPlay);
    this.save({ type: 'go-game-updated', gameId: game.id }, game.participantIds);
    return game;
  }

  async finalizeWithKataGo(game) {
    if (game.status !== 'scoring' || game.scoring?.thinking || game.scoring?.assessment) return game;
    game.scoring = { ...(game.scoring || {}), source: 'katago', pending: true, thinking: true, error: null };
    game.updatedAt = nowIso();
    this.save({ type: 'go-game-updated', gameId: game.id }, game.participantIds);
    try {
      const position = this.position(game), analyzedFor = position.toPlay;
      const analysis = await this.kataGo.scorePosition({
        boardSize: game.config.boardSize, komi: game.config.komi, rules: game.config.rules,
        initialStones: game.initialStones, moves: game.moves, color: analyzedFor,
        maxVisits: Number(this.settings().goScoreMaxVisits || 160), maxTime: Number(this.settings().goScoreMaxTime || 6)
      });
      const lead = Number(analysis.scoreLead), absoluteLead = analyzedFor === 'B' ? lead : -lead;
      const rounded = Math.round(Math.abs(absoluteLead) * 2) / 2;
      const winner = rounded < 0.25 ? null : absoluteLead > 0 ? 'B' : 'W';
      const result = winner ? `${winner}+${Math.max(0.5, rounded)}` : '0';
      const detail = {
        source: 'katago', analyzedFor, scoreLead: lead, blackLead: absoluteLead,
        winrate: Number.isFinite(Number(analysis.winrate)) ? Number(analysis.winrate) : null,
        visits: Number.isFinite(Number(analysis.visits)) ? Number(analysis.visits) : null
      };
      const adjudicationCount = Number(game.decisionCount || game.scoring?.adjudicationCount || game.scoringHistoryCount || 0) + 1;
      const forcedAfter = Math.max(1, Number(this.settings().goScoreForcedAfter || 3));
      const confirmations = {};
      for (const player of [game.blackPlayer, game.whitePlayer]) {
        if (player?.type === 'engine') confirmations[`engine:${player.name || 'katago'}`] = true;
      }
      game.scoringHistoryCount = adjudicationCount;
      game.decisionCount = adjudicationCount;
      game.scoring = {
        ...game.scoring, pending: false, thinking: false, assessment: detail, proposedResult: result,
        winner, margin: winner ? Math.max(0.5, rounded) : 0, adjudicationCount, forcedAfter,
        forced: adjudicationCount >= forcedAfter, confirmations, error: null
      };
      game.engineError = null;
      game.events.push({ type: 'score-proposed', result, winner, adjudicationCount, forced: game.scoring.forced, at: nowIso() });
      if (game.scoring.forced) this.finish(game, result, 'katago-score-forced', winner, detail);
    } catch (error) {
      game.scoring.pending = false; game.scoring.thinking = false;
      game.scoring.error = String(error.message || error).slice(0, 500);
      game.engineError = game.scoring.error;
      game.events.push({ type: 'engine-score-error', at: nowIso() });
      game.updatedAt = nowIso();
    }
    this.save({ type: 'go-game-updated', gameId: game.id }, game.participantIds);
    return game;
  }

  retryScoring(user, id) {
    const game = this.gameFor(id, user);
    if (game.status !== 'scoring' || !this.isParticipant(game, user)) throw new GoRuleError('当前没有可重试的自动结算', 'INVALID_STATE');
    return game;
  }

  respondScoring(user, id, accept) {
    const game = this.gameFor(id, user);
    if (game.status !== 'scoring' || !this.isParticipant(game, user) || !game.scoring?.assessment || game.scoring?.thinking) {
      throw new GoRuleError('当前没有等待确认的结算结果', 'INVALID_STATE');
    }
    if (game.scoring.forced) throw new GoRuleError('本局已达到强制裁决次数，不能拒绝结果', 'SCORE_FORCED');
    if (!accept) {
      const rejectedAt = nowIso();
      const terminalPasses = game.moves.filter(item => !item.undoneAt && item.type === 'pass').slice(-2);
      terminalPasses.forEach(item => { item.undoneAt = rejectedAt; item.undoneBy = user.id; item.undoReason = 'score-rejected'; });
      game.events.push({ type: 'score-rejected', rejectedBy: user.id, result: game.scoring.proposedResult, at: rejectedAt });
      game.status = 'active';
      game.scoring = {
        source: 'katago', pending: false, thinking: false, error: null,
        adjudicationCount: Number(game.scoring.adjudicationCount || 0), rejectedAt, rejectedBy: user.id
      };
      game.revision++; game.updatedAt = nowIso();
      this.startTurn(game, this.position(game).toPlay);
      this.save({ type: 'go-game-updated', gameId: game.id }, game.participantIds);
      return game;
    }
    game.scoring.confirmations = { ...(game.scoring.confirmations || {}), [user.id]: true };
    game.events.push({ type: 'score-confirmed', confirmedBy: user.id, result: game.scoring.proposedResult, at: nowIso() });
    const requiredUsers = [game.blackPlayer, game.whitePlayer].filter(player => player?.type === 'user').map(player => player.userId);
    if (requiredUsers.every(userId => game.scoring.confirmations[userId])) {
      this.finish(game, game.scoring.proposedResult, 'katago-score-confirmed', game.scoring.winner, game.scoring.assessment);
    } else {
      game.revision++; game.updatedAt = nowIso();
    }
    this.save({ type: 'go-game-updated', gameId: game.id }, game.participantIds);
    return game;
  }

  finish(game, result, reason, winner = null, detail = null) {
    game.status = reason === 'void' ? 'void' : 'finished'; game.result = result; game.resultDetail = detail;
    game.endedAt = nowIso(); game.updatedAt = game.endedAt; game.pendingUndo = null; game.scoring = game.scoring || null;
    game.events.push({ type: 'finished', result, reason, winner, at: game.endedAt });
    if (game.clocks) { game.clocks.activeColor = null; game.clocks.turnStartedAt = null; }
  }

  sharedAction(user, id, data) {
    this.requirePermission(user, 'goShared', '此账号不能使用共享棋盘');
    const game = this.gameFor(id, user);
    if (game.mode !== 'shared' || game.status !== 'active' || !game.shared.editorIds.includes(user.id)) throw new GoRuleError('你不能编辑这个共享棋盘', 'FORBIDDEN');
    if (game.shared.locked && game.shared.hostId !== user.id) throw new GoRuleError('房主暂时锁定了棋盘', 'BOARD_LOCKED');
    const type = ['setup', 'erase'].includes(data.type) ? data.type : null;
    if (type) {
      const size = game.config.boardSize, x = Number(data.x), y = Number(data.y);
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= size || y >= size) throw new GoRuleError('位置超出棋盘', 'OUT_OF_BOUNDS');
      game.moves.push({ id: crypto.randomUUID(), type, color: data.color === 'W' ? 'W' : 'B', x, y, actorId: user.id, at: nowIso() });
    } else if (data.type === 'import-sgf') {
      if (game.shared.hostId !== user.id) throw new GoRuleError('只有房主可以导入 SGF', 'FORBIDDEN');
      const study = sgfToStudy(String(data.sgf || ''));
      if (study.boardSize !== game.config.boardSize) throw new GoRuleError(`SGF 是 ${study.boardSize} 路，请创建相同大小的共享棋盘`, 'INVALID_SGF');
      const at = nowIso(); game.moves.filter(move => !move.undoneAt).forEach(move => { move.undoneAt = at; move.undoneBy = user.id; });
      for (const stone of study.initialStones || []) game.moves.push({ id: crypto.randomUUID(), type: 'setup', color: stone.color, x: stone.x, y: stone.y, actorId: user.id, at });
      let branch = study.tree || [];
      while (branch.length) {
        const node = branch[0];
        game.moves.push({ id: crypto.randomUUID(), type: node.pass ? 'pass' : (node.type || 'move'), color: node.color, ...(node.pass ? { pass: true } : { x: node.x, y: node.y }), actorId: user.id, at });
        branch = node.children || [];
      }
      game.events.push({ type: 'sgf-imported', by: user.id, at });
    } else if (data.type === 'undo') {
      const item = [...game.moves].reverse().find(move => !move.undoneAt);
      if (!item) throw new GoRuleError('没有可以撤销的操作', 'NOTHING_TO_UNDO');
      item.undoneAt = nowIso(); item.undoneBy = user.id;
    } else if (data.type === 'redo') {
      const item = [...game.moves].reverse().find(move => move.undoneAt);
      if (!item) throw new GoRuleError('没有可以重做的操作', 'NOTHING_TO_REDO');
      delete item.undoneAt; delete item.undoneBy;
    } else if (data.type === 'clear') {
      if (game.shared.hostId !== user.id) throw new GoRuleError('只有房主可以清空棋盘', 'FORBIDDEN');
      const at = nowIso(); game.moves.filter(move => !move.undoneAt).forEach(move => { move.undoneAt = at; move.undoneBy = user.id; });
    } else if (data.type === 'lock') {
      if (game.shared.hostId !== user.id) throw new GoRuleError('只有房主可以锁定棋盘', 'FORBIDDEN');
      game.shared.locked = Boolean(data.locked);
    } else throw new GoRuleError('未知共享棋盘操作', 'INVALID_ACTION');
    game.revision++; game.updatedAt = nowIso();
    this.save({ type: 'go-game-updated', gameId: game.id }, game.participantIds);
    return game;
  }

  markPresence(userId, connected) {
    let changed = false;
    for (const game of this.state.goGames.filter(item => ['active', 'scoring', 'resigning'].includes(item.status) && item.participantIds.includes(userId))) {
      game.disconnects ||= {};
      if (connected) { if (game.disconnects[userId]) { delete game.disconnects[userId]; changed = true; } }
      else if (!game.disconnects[userId]) { game.disconnects[userId] = nowIso(); changed = true; }
    }
    if (changed) this.save({ type: 'go-presence', userId }, null);
  }

  expireInvitations() {
    let changed = false;
    for (const item of this.state.goInvitations) if (item.status === 'pending' && new Date(item.expiresAt) <= new Date()) { item.status = 'expired'; changed = true; }
    if (changed) this.saveState(this.state);
  }

  maintenance() {
    this.expireInvitations(); let changed = false;
    for (const game of this.state.goGames.filter(item => ['active', 'scoring'].includes(item.status))) {
      if (game.status === 'active' && game.clocks?.activeColor) {
        const snapshot = this.clockSnapshot(game), color = game.clocks.activeColor, display = game.config.timeSystem === 'absolute' ? snapshot[color].displayMs : (snapshot[color].displayMainMs <= 0 && snapshot[color].displayPeriodsLeft <= 0 ? 0 : 1);
        if (display <= 0) { this.finish(game, `${opposite(color)}+T`, 'timeout', opposite(color)); changed = true; continue; }
      }
      for (const [userId, disconnectedAt] of Object.entries(game.disconnects || {})) {
        if (Date.now() - new Date(disconnectedAt).getTime() < game.config.disconnectGraceSeconds * 1000) continue;
        if (game.config.disconnectPolicy === 'forfeit') { const color = this.playerColor(game, userId); if (color) { this.finish(game, `${opposite(color)}+F`, 'disconnect', opposite(color)); changed = true; break; } }
        else if (game.config.disconnectPolicy === 'void') { this.finish(game, 'Void', 'void'); changed = true; break; }
      }
    }
    if (changed) this.save({ type: 'go-maintenance' }, null);
  }

  listRecords(user, accessAlreadyChecked = false) {
    if (!accessAlreadyChecked) this.requireAccess(user);
    return this.state.goGames.filter(game => ['finished', 'void'].includes(game.status) && this.canViewRecord(game, user))
      .sort((a, b) => new Date(b.endedAt || b.updatedAt) - new Date(a.endedAt || a.updatedAt))
      .map(game => ({ id: game.id, mode: game.mode, config: game.config, blackPlayer: this.gameView(game, user).blackPlayer, whitePlayer: this.gameView(game, user).whitePlayer, result: game.result, startedAt: game.startedAt, endedAt: game.endedAt, moveCount: game.moves.filter(item => !item.undoneAt && ['move', 'pass'].includes(item.type)).length }));
  }

  profile(viewer, targetId = viewer.id) {
    this.requireAccess(viewer);
    const target = this.user(String(targetId || viewer.id));
    if (!target || !target.active || !this.can(target, 'accessGames') || !this.can(target, 'accessGo')) throw new GoRuleError('用户不存在或未开放围棋', 'NOT_FOUND');
    const completed = this.state.goGames.filter(game => game.status === 'finished' && this.isParticipant(game, target));
    const outcome = (game, subject = target) => {
      const color = this.playerColor(game, subject.id), winner = /^[BW](?=\+)/.test(String(game.result || '')) ? String(game.result)[0] : null;
      if (!color || !winner) return winner ? 'loss' : 'draw';
      return color === winner ? 'win' : 'loss';
    };
    const summarize = (games, subject = target) => {
      const summary = { games: games.length, wins: 0, losses: 0, draws: 0, winRate: null };
      games.forEach(game => { const value = outcome(game, subject); summary[value === 'win' ? 'wins' : value === 'loss' ? 'losses' : 'draws']++; });
      const decided = summary.wins + summary.losses;
      summary.winRate = decided ? Number((summary.wins * 100 / decided).toFixed(1)) : null;
      return summary;
    };
    const aiGames = completed.filter(game => game.mode === 'ai');
    const onlineGames = completed.filter(game => game.mode === 'online');
    const headToHeadGames = viewer.id === target.id ? [] : onlineGames.filter(game => this.isParticipant(game, viewer));
    const records = completed.filter(game => this.canViewRecord(game, viewer))
      .sort((a, b) => new Date(b.endedAt || b.updatedAt) - new Date(a.endedAt || a.updatedAt))
      .slice(0, 50)
      .map(game => ({ id: game.id, mode: game.mode, config: game.config, blackPlayer: this.gameView(game, viewer).blackPlayer, whitePlayer: this.gameView(game, viewer).whitePlayer, result: game.result, startedAt: game.startedAt, endedAt: game.endedAt, moveCount: game.moves.filter(item => !item.undoneAt && ['move', 'pass'].includes(item.type)).length }));
    return {
      user: this.publicUser(target),
      own: viewer.id === target.id,
      stats: { singlePlayer: summarize(aiGames), multiplayer: summarize(onlineGames) },
      headToHead: viewer.id === target.id ? null : { ...summarize(headToHeadGames, viewer), viewerId: viewer.id, targetId: target.id },
      records
    };
  }

  deleteGame(user, id) {
    this.requireAccess(user);
    const index = this.state.goGames.findIndex(game => game.id === id);
    if (index < 0) throw new GoRuleError('棋局不存在', 'NOT_FOUND');
    const game = this.state.goGames[index];
    if (user.role !== 'admin' && !this.isParticipant(game, user)) throw new GoRuleError('无权删除这盘棋', 'FORBIDDEN');
    const participantIds = [...(game.participantIds || [])];
    this.state.goGames.splice(index, 1);
    this.state.goInvitations = this.state.goInvitations.filter(invitation => invitation.gameId !== id);
    this.save({ type: 'go-game-deleted', gameId: id }, participantIds);
    return { id, wasActive: !['finished', 'void'].includes(game.status) };
  }

  exportSgf(user, id) {
    this.requirePermission(user, 'goSgfExport', '此账号不能导出 SGF');
    const game = this.gameFor(id, user);
    if (!this.canViewRecord(game, user)) throw new GoRuleError('无权导出该棋谱', 'FORBIDDEN');
    return gameToSgf(game, this.state.users);
  }

  studySummary(item) {
    return { id: item.id, title: item.title, boardSize: item.boardSize, rules: item.rules, koRule: item.koRule || 'positional-superko', createdAt: item.createdAt, updatedAt: item.updatedAt };
  }

  saveStudy(user, data, id = null) {
    this.requirePermission(user, 'goStudy');
    const max = Number(this.settings().goStudyMaxCount || 50), serialized = JSON.stringify(data);
    if (Buffer.byteLength(serialized) > Number(this.settings().goStudyMaxKB || 512) * 1024) throw new GoRuleError('研究棋谱超过管理员设置的大小上限', 'STUDY_TOO_LARGE');
    let item = id ? this.state.goStudies.find(entry => entry.id === id && entry.ownerId === user.id) : null;
    if (id && !item) throw new GoRuleError('研究棋谱不存在', 'NOT_FOUND');
    if (!item) {
      if (this.state.goStudies.filter(entry => entry.ownerId === user.id).length >= max) throw new GoRuleError('研究棋谱数量已经达到上限', 'STUDY_LIMIT');
      item = { id: crypto.randomUUID(), ownerId: user.id, createdAt: nowIso() }; this.state.goStudies.push(item);
    }
    item.title = String(data.title || '未命名研究').trim().slice(0, 80); item.boardSize = [9, 13, 19].includes(Number(data.boardSize)) ? Number(data.boardSize) : 19;
    item.rules = data.rules === 'japanese' ? 'japanese' : 'chinese';
    item.koRule = data.koRule === 'simple-ko' ? 'simple-ko' : 'positional-superko'; item.komi = Number(data.komi || 0);
    item.initialStones = Array.isArray(data.initialStones) ? data.initialStones.slice(0, 625) : [];
    item.nextPlayer = data.nextPlayer === 'W' ? 'W' : 'B'; item.comments = String(data.comments || '').slice(0, 20_000);
    item.tree = Array.isArray(data.tree) ? data.tree : []; item.updatedAt = nowIso();
    this.save(); return item;
  }

  importStudy(user, sgf) {
    const parsed = sgfToStudy(sgf); return this.saveStudy(user, parsed);
  }

  getStudy(user, id) {
    this.requirePermission(user, 'goStudy');
    const item = this.state.goStudies.find(entry => entry.id === id && entry.ownerId === user.id);
    if (!item) throw new GoRuleError('研究棋谱不存在', 'NOT_FOUND');
    return item;
  }

  deleteStudy(user, id) {
    this.requirePermission(user, 'goStudy');
    const index = this.state.goStudies.findIndex(entry => entry.id === id && entry.ownerId === user.id);
    if (index < 0) throw new GoRuleError('研究棋谱不存在', 'NOT_FOUND');
    this.state.goStudies.splice(index, 1); this.save();
  }

  listPuzzles(user, admin = false) {
    if (admin) {
      if (user.role !== 'admin') throw new GoRuleError('权限不足', 'FORBIDDEN');
    } else this.requirePermission(user, 'goPuzzles');
    return this.state.goPuzzles.filter(item => admin || item.status === 'published').map(item => ({
      id: item.id, title: item.title, description: item.description, boardSize: item.boardSize, difficulty: item.difficulty, tags: item.tags,
      objective: item.objective, status: item.status, initialStones: item.initialStones, nextPlayer: item.nextPlayer, userColor: item.userColor,
      hints: item.hints || [], source: item.source || '', createdAt: item.createdAt, updatedAt: item.updatedAt,
      ...(admin ? { solutionTree: item.solutionTree } : {})
    }));
  }

  savePuzzle(admin, data, id = null) {
    if (admin.role !== 'admin') throw new GoRuleError('只有管理员可以管理题库', 'FORBIDDEN');
    const existing = id ? this.state.goPuzzles.find(entry => entry.id === id) : null;
    if (id && !existing) throw new GoRuleError('题目不存在', 'NOT_FOUND');
    const title = String(data.title || '').trim().slice(0, 100); if (!title) throw new GoRuleError('题目标题不能为空', 'INVALID_PUZZLE');
    const boardSize = [9, 13, 19].includes(Number(data.boardSize)) ? Number(data.boardSize) : 9;
    const initialByPoint = new Map();
    for (const raw of Array.isArray(data.initialStones) ? data.initialStones : []) {
      const x = Number(raw?.x), y = Number(raw?.y);
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= boardSize || y >= boardSize) throw new GoRuleError('初始棋子包含越界坐标', 'INVALID_PUZZLE');
      initialByPoint.set(`${x},${y}`, { color: raw?.color === 'W' ? 'W' : 'B', x, y });
    }
    const initialStones = [...initialByPoint.values()], nextPlayer = data.nextPlayer === 'W' ? 'W' : 'B', userColor = data.userColor === 'W' ? 'W' : 'B';
    if (nextPlayer !== userColor) throw new GoRuleError('Demo 题库要求用户一方先行', 'INVALID_PUZZLE');
    if (!Array.isArray(data.solutionTree)) throw new GoRuleError('答案树必须是数组', 'INVALID_PUZZLE');
    let nodeCount = 0, solvedCount = 0, unfinishedLeaves = 0;
    const cleanTree = (nodes, position, depth = 0) => {
      if (!Array.isArray(nodes) || depth > 200) throw new GoRuleError('答案树层级过深', 'INVALID_PUZZLE');
      return nodes.map(raw => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new GoRuleError('答案树节点格式错误', 'INVALID_PUZZLE');
        if (++nodeCount > 2000) throw new GoRuleError('答案树节点超过 2000 个', 'INVALID_PUZZLE');
        const color = raw.color === 'W' ? 'W' : raw.color === 'B' ? 'B' : null, x = Number(raw.x), y = Number(raw.y);
        if (!color || color !== position.toPlay) throw new GoRuleError('答案树必须按黑白顺序交替', 'INVALID_PUZZLE');
        if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= boardSize || y >= boardSize) throw new GoRuleError('答案树包含越界坐标', 'INVALID_PUZZLE');
        let next;
        try { next = applyMove(position, { color, x, y }, { koRule: 'positional-superko', allowSuicide: false }); }
        catch (error) { throw new GoRuleError(`答案树包含非法落子：${error.message}`, 'INVALID_PUZZLE'); }
        const children = cleanTree(Array.isArray(raw.children) ? raw.children : [], next, depth + 1);
        if (raw.solved === true && children.length) throw new GoRuleError('标记 solved 的答案节点不能再包含后续变化', 'INVALID_PUZZLE');
        if (color === userColor && children.length && !children.some(child => child.default !== false)) throw new GoRuleError('用户落子后的应手至少需要一个默认分支', 'INVALID_PUZZLE');
        if (raw.solved === true) solvedCount++;
        else if (!children.length) unfinishedLeaves++;
        return { color, x, y, solved: raw.solved === true, default: raw.default !== false, explanation: String(raw.explanation || '').slice(0, 1000), children };
      });
    };
    const start = replay({ size: boardSize, initialStones, nextPlayer, moves: [], rules: { koRule: 'positional-superko', allowSuicide: false } });
    const solutionTree = cleanTree(data.solutionTree, start);
    const status = data.status === 'published' ? 'published' : data.status === 'archived' ? 'archived' : 'draft';
    if (status === 'published' && (!solutionTree.length || !solvedCount)) throw new GoRuleError('发布题目前必须设置至少一个 solved:true 的正确答案', 'INVALID_PUZZLE');
    if (status === 'published' && unfinishedLeaves) throw new GoRuleError('发布题目的每个答案树终点都必须设置 solved:true', 'INVALID_PUZZLE');
    const item = existing || { id: crypto.randomUUID(), createdBy: admin.id, createdAt: nowIso() };
    Object.assign(item, {
      title, description: String(data.description || '').slice(0, 2000), objective: String(data.objective || '最佳落点').slice(0, 200), boardSize,
      difficulty: ['入门', '初级', '中级', '高级', '专家'].includes(data.difficulty) ? data.difficulty : '入门',
      tags: uniqueStrings(data.tags).slice(0, 20), source: String(data.source || '').slice(0, 300), status, initialStones, nextPlayer, userColor,
      hints: (Array.isArray(data.hints) ? data.hints : []).map(String).map(value => value.slice(0, 500)).slice(0, 10), solutionTree, updatedAt: nowIso()
    });
    if (!existing) this.state.goPuzzles.push(item);
    this.save(); return item;
  }

  deletePuzzle(admin, id) {
    if (admin.role !== 'admin') throw new GoRuleError('只有管理员可以管理题库', 'FORBIDDEN');
    const index = this.state.goPuzzles.findIndex(item => item.id === id); if (index < 0) throw new GoRuleError('题目不存在', 'NOT_FOUND');
    this.state.goPuzzles.splice(index, 1);
    this.state.goPuzzleAttempts = this.state.goPuzzleAttempts.filter(item => item.puzzleId !== id);
    this.save();
  }

  attemptPuzzle(user, id, sequence) {
    this.requirePermission(user, 'goPuzzles');
    const puzzle = this.state.goPuzzles.find(item => item.id === id && item.status === 'published');
    if (!puzzle) throw new GoRuleError('题目不存在', 'NOT_FOUND');
    const moves = (Array.isArray(sequence) ? sequence : []).slice(0, 200), equal = (a, b) => a && b && a.color === b.color && Number(a.x) === Number(b.x) && Number(a.y) === Number(b.y);
    let choices = puzzle.solutionTree || [], current = null;
    for (const move of moves) {
      current = choices.find(node => equal(node, move));
      if (!current) {
        this.recordPuzzleAttempt(user, puzzle, false, moves.length);
        return { state: 'wrong', message: '这一步不在正确变化中，可以重试或查看提示。' };
      }
      choices = Array.isArray(current.children) ? current.children : [];
    }
    if (current?.solved === true) {
      this.recordPuzzleAttempt(user, puzzle, true, moves.length);
      return { state: 'solved', message: current.explanation || '回答正确，题目完成。' };
    }
    const reply = choices.find(node => node.color !== puzzle.userColor && node.default !== false);
    if (reply?.solved === true) {
      this.recordPuzzleAttempt(user, puzzle, true, moves.length + 1);
      return { state: 'solved', reply: { color: reply.color, x: reply.x, y: reply.y, explanation: reply.explanation || '' }, message: reply.explanation || '回答正确，题目完成。' };
    }
    if (current && !choices.length) {
      this.recordPuzzleAttempt(user, puzzle, false, moves.length);
      return { state: 'wrong', message: '这条变化尚未配置为正确终点，请重置后尝试其他变化。' };
    }
    return { state: 'continue', reply: reply ? { color: reply.color, x: reply.x, y: reply.y, explanation: reply.explanation || '' } : null, message: current?.explanation || '这一步正确，请继续。' };
  }

  recordPuzzleAttempt(user, puzzle, solved, moveCount) {
    this.state.goPuzzleAttempts.push({ id: crypto.randomUUID(), puzzleId: puzzle.id, userId: user.id, solved, moveCount, at: nowIso() });
    this.state.goPuzzleAttempts = this.state.goPuzzleAttempts.slice(-10_000); this.saveState(this.state);
  }

  adminOverview(admin) {
    if (admin.role !== 'admin') throw new GoRuleError('权限不足', 'FORBIDDEN');
    const stats = {
      activeGames: this.state.goGames.filter(item => ['active', 'scoring'].includes(item.status)).length,
      finishedGames: this.state.goGames.filter(item => item.status === 'finished').length,
      pendingInvites: this.state.goInvitations.filter(item => item.status === 'pending').length,
      studies: this.state.goStudies.length, puzzles: this.state.goPuzzles.length,
      puzzleAttempts: this.state.goPuzzleAttempts.length
    };
    return { stats, settings: this.settings(), engine: this.kataGo.status(), puzzles: this.listPuzzles(admin, true) };
  }
}

module.exports = { GoService };
