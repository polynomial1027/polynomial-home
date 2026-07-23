'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { GoService } = require('../lib/go-service');

const permissions = overrides => ({
  accessGames: true, accessGo: true, goStudy: true, goPuzzles: true, goAi: true,
  goMultiplayer: true, goInvite: true, goShared: true, goSgfImport: true, goSgfExport: true,
  ...overrides
});

function fixture(userOverrides = {}) {
  const users = [
    { id: 'admin', username: 'admin', displayName: '管理员棋手', role: 'admin', active: true, permissions: permissions() },
    { id: 'u2', username: 'white', displayName: '白棋手', role: 'member', active: true, permissions: permissions() },
    { id: 'observer', username: 'observer', displayName: '旁观管理员', role: 'admin', active: true, permissions: permissions() }
  ];
  Object.assign(users[1], userOverrides);
  const state = {
    users,
    settings: {
      goEnabled: true, goAllowedBoardSizes: [9, 13, 19], goDefaultBoardSize: 9,
      goAllowedRules: ['chinese', 'japanese'], goDefaultRules: 'chinese',
      goAllowedKoRules: ['positional-superko', 'simple-ko'], goDefaultKoRule: 'positional-superko',
      goDefaultKomi: 0, goHandicapKomi: 0, goMaxHandicap: 9,
      goAllowedTimeSystems: ['none', 'absolute', 'byoyomi'], goDefaultMainMinutes: 30, goMaxMainMinutes: 180,
      goDefaultByoYomiSeconds: 30, goDefaultByoYomiPeriods: 3, goUndoDefault: 'request', goMaxUndoRequests: 3,
      goInviteExpiryMinutes: 10, goMaxPendingInvites: 5, goDisconnectPolicy: 'continue', goDisconnectGraceSeconds: 180,
      goRecordDefaultVisibility: 'participants', goSharedMaxParticipants: 2, goStudyMaxCount: 50, goStudyMaxKB: 512,
      goAiEnabled: true, goAiMoveTimeoutSeconds: 30,
      goAiResignWinrateThreshold: 0.5, goAiResignConsecutiveTurns: 12, goScoreMaxVisits: 160, goScoreMaxTime: 6, goScoreForcedAfter: 3,
      goAiProfiles: [{ id: 'beginner', name: '入门', maxVisits: 8, maxTime: 0.1 }],
      goBoardSkins: ['walnut'], goStoneSkins: ['classic'], goDefaultBoardSkin: 'walnut', goDefaultStoneSkin: 'classic'
    },
    goInvitations: [], goGames: [], goStudies: [], goPuzzles: [{
      id: 'p1', title: '测试题', description: '', objective: '黑先', boardSize: 9, difficulty: '入门', tags: [], status: 'published',
      initialStones: [], nextPlayer: 'B', userColor: 'B', hints: [], solutionTree: [{ color: 'B', x: 0, y: 0, solved: true, children: [] }]
    }], goPuzzleAttempts: [], goUserSettings: []
  };
  let saves = 0;
  const kataGo = {
    status: () => ({ enabled: true, available: true, running: false, lastError: null }),
    generateMove: async () => ({ move: { x: 0, y: 0 }, analysis: { winrate: 0.75, scoreLead: 3 } }),
    scorePosition: async () => ({ visits: 160, winrate: 0.8, scoreLead: 3.2 })
  };
  const can = (user, permission) => user.role === 'admin' || user.permissions?.[permission] === true;
  const service = new GoService({ state, save: () => { saves++; }, can, publicUser: user => ({ id: user.id, username: user.username, displayName: user.displayName }), kataGo, broadcast: () => {} });
  return { service, state, users, kataGo, saves: () => saves };
}

test('大厅按子权限降级，不会因没有研究权限而阻断题库或联机', () => {
  const { service, users } = fixture({ permissions: permissions({ goStudy: false }) });
  const lobby = service.lobby(users[1]);
  assert.equal(lobby.capabilities.study, false);
  assert.equal(lobby.capabilities.puzzles, true);
  assert.deepEqual(lobby.studies, []);
  assert.equal(lobby.puzzles.length, 1);
});

test('关闭小游戏总权限的账号不会出现在邀请目标中，也不能通过接口接收邀请', () => {
  const { service, users } = fixture({ permissions: permissions({ accessGames: false }) });
  assert.equal(service.lobby(users[0]).users.some(item => item.id === users[1].id), false);
  assert.throws(() => service.createInvitation(users[0], { toUserId: users[1].id, mode: 'online', config: { boardSize: 9 } }), error => error.code === 'INVITE_UNAVAILABLE');
});

test('管理员把让子和悔棋次数设为零时不会被默认值覆盖', () => {
  const { service, state } = fixture();
  state.settings.goMaxHandicap = 0; state.settings.goMaxUndoRequests = 0;
  assert.equal(service.publicConfig().maxHandicap, 0);
  assert.equal(service.publicConfig().maxUndoRequests, 0);
  const config = service.normalizeConfig({ handicap: 9, maxUndoRequests: 9 }, 'online');
  assert.equal(config.handicap, 0);
  assert.equal(config.maxUndoRequests, 0);
});

test('管理员可作为普通参与者下棋，但旁观管理员没有实时介入权限', () => {
  const { service, state, users } = fixture();
  const invitation = service.createInvitation(users[0], { toUserId: users[1].id, mode: 'online', config: { boardSize: 9, komi: 0, colorChoice: 'creator_black', timeSystem: 'none', undoPolicy: 'request' } });
  const accepted = service.respondInvitation(users[1], invitation.id, 'accept');
  const game = accepted.game;
  assert.equal(game.ownColor, 'W');
  assert.equal(service.gameView(state.goGames[0], users[0]).ownColor, 'B');
  assert.throws(() => service.gameFor(game.id, users[2]), error => error.code === 'NOT_FOUND');

  service.move(users[0], game.id, { x: 0, y: 0 });
  service.move(users[1], game.id, { x: 1, y: 0 });
  const pending = service.requestUndo(users[0], game.id);
  assert.equal(pending.pendingUndo.requestedBy, users[0].id);
  service.respondUndo(users[1], game.id, true);
  assert.equal(service.position(state.goGames[0]).toPlay, 'B');
});

test('接受邀请后邀请立即消失，KataGo 点目需双方确认才结束', async () => {
  const { service, state, users } = fixture();
  const invitation = service.createInvitation(users[0], { toUserId: users[1].id, mode: 'online', config: { boardSize: 9, komi: 0, colorChoice: 'creator_black', timeSystem: 'none' } });
  const gameId = service.respondInvitation(users[1], invitation.id, 'accept').game.id;
  assert.equal(service.lobby(users[0]).invitations.length, 0);
  assert.equal(service.lobby(users[1]).invitations.length, 0);
  service.pass(users[0], gameId);
  service.pass(users[1], gameId);
  assert.equal(state.goGames[0].status, 'scoring');
  await service.finalizeWithKataGo(state.goGames[0]);
  assert.equal(state.goGames[0].status, 'scoring');
  assert.equal(state.goGames[0].scoring.proposedResult, 'B+3');
  service.respondScoring(users[0], gameId, true);
  assert.equal(state.goGames[0].status, 'scoring');
  service.respondScoring(users[1], gameId, true);
  assert.equal(state.goGames[0].status, 'finished');
  assert.equal(state.goGames[0].result, 'B+3');
  assert.equal(state.goGames[0].resultDetail.source, 'katago');
  assert.match(service.exportSgf(users[0], gameId), /RE\[B\+3\]/);
});

test('拒绝结算可继续下棋，第三次 KataGo 裁决按后台参数强制生效', async () => {
  const { service, state, users } = fixture();
  const invitation = service.createInvitation(users[0], { toUserId: users[1].id, mode: 'online', config: { boardSize: 9, komi: 0, colorChoice: 'creator_black', timeSystem: 'none' } });
  const gameId = service.respondInvitation(users[1], invitation.id, 'accept').game.id;
  for (let round = 1; round <= 3; round++) {
    service.pass(users[0], gameId);
    service.pass(users[1], gameId);
    await service.finalizeWithKataGo(state.goGames[0]);
    assert.equal(state.goGames[0].scoring.adjudicationCount, round);
    if (round < 3) {
      service.respondScoring(users[round % 2], gameId, false);
      assert.equal(state.goGames[0].status, 'active');
    }
  }
  assert.equal(state.goGames[0].status, 'finished');
  assert.equal(state.goGames[0].scoring.forced, true);
  assert.throws(() => service.respondScoring(users[0], gameId, false), error => ['NOT_FOUND', 'INVALID_STATE', 'SCORE_FORCED'].includes(error.code));
});

test('共享棋盘允许双方自由摆棋、撤销和房主锁定', () => {
  const { service, state, users } = fixture();
  const invitation = service.createInvitation(users[0], { toUserId: users[1].id, mode: 'shared', config: { boardSize: 9 } });
  const gameId = service.respondInvitation(users[1], invitation.id, 'accept').game.id;
  service.sharedAction(users[1], gameId, { type: 'setup', color: 'W', x: 4, y: 4 });
  assert.equal(service.position(state.goGames[0]).board[4 * 9 + 4], 'W');
  service.sharedAction(users[1], gameId, { type: 'undo' });
  assert.equal(service.position(state.goGames[0]).board[4 * 9 + 4], null);
  service.sharedAction(users[0], gameId, { type: 'lock', locked: true });
  assert.throws(() => service.sharedAction(users[1], gameId, { type: 'setup', color: 'B', x: 3, y: 3 }), error => error.code === 'BOARD_LOCKED');
});

test('题库保存会验证轮次、坐标和落子合法性，失败不污染题库', () => {
  const { service, state, users } = fixture();
  const before = state.goPuzzles.length;
  assert.throws(() => service.savePuzzle(users[0], { title: '坏题', status: 'published', boardSize: 9, nextPlayer: 'B', userColor: 'B', initialStones: [], solutionTree: [{ color: 'W', x: 0, y: 0, solved: true }] }), error => error.code === 'INVALID_PUZZLE');
  assert.equal(state.goPuzzles.length, before);
  const puzzle = service.savePuzzle(users[0], { title: '合法题', status: 'published', boardSize: 9, nextPlayer: 'B', userColor: 'B', initialStones: [], solutionTree: [{ color: 'B', x: 0, y: 0, solved: true, explanation: '正确' }] });
  assert.equal(puzzle.solutionTree[0].solved, true);
  assert.throws(() => service.savePuzzle(users[0], { title: '未完成答案', status: 'published', boardSize: 9, nextPlayer: 'B', userColor: 'B', initialStones: [], solutionTree: [{ color: 'B', x: 1, y: 1, children: [] }] }), error => error.code === 'INVALID_PUZZLE');
});

test('非法落子不会提前扣除或重复计算用时', () => {
  const { service, state, users } = fixture();
  const invitation = service.createInvitation(users[0], { toUserId: users[1].id, mode: 'online', config: { boardSize: 9, komi: 0, colorChoice: 'creator_black', timeSystem: 'absolute', mainMinutes: 1 } });
  const gameId = service.respondInvitation(users[1], invitation.id, 'accept').game.id, game = state.goGames[0];
  const before = game.clocks.B.mainMs;
  game.clocks.turnStartedAt = Date.now() - 5_000;
  assert.throws(() => service.move(users[0], gameId, { x: -1, y: 0 }), error => error.code === 'OUT_OF_BOUNDS');
  assert.equal(game.clocks.B.mainMs, before);
});

test('人机对弈调用本地引擎并记录机器人落子', async () => {
  const { service, state, users } = fixture();
  const game = service.createAiGame(users[1], { boardSize: 9, komi: 0, colorChoice: 'creator_white', timeSystem: 'none', aiProfileId: 'beginner' });
  await service.engineTurn(game);
  assert.equal(state.goGames[0].moves.length, 1);
  assert.equal(state.goGames[0].moves[0].actorId, 'katago');
  assert.equal(service.position(game).toPlay, 'W');
});

test('机器人胜率连续低于阈值后由服务器自动认输', async () => {
  const { service, state, users, kataGo } = fixture();
  state.settings.goAiResignConsecutiveTurns = 2;
  let call = 0;
  kataGo.generateMove = async () => ({ move: { x: call++ * 2, y: 0 }, analysis: { winrate: 0.4, scoreLead: -2 } });
  const game = service.createAiGame(users[1], { boardSize: 9, komi: 0, colorChoice: 'creator_white', timeSystem: 'none', aiProfileId: 'beginner' });
  await service.engineTurn(game);
  service.move(users[1], game.id, { x: 1, y: 0 });
  await service.engineTurn(game);
  assert.equal(game.status, 'finished');
  assert.equal(game.result, 'W+R');
  assert.equal(game.resultDetail.consecutiveTurns, 2);
});
