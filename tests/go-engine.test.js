'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  GoRuleError, applyMove, gameToSgf, initialPosition, parseSgf, replay,
  scorePosition, sgfToStudy, standardHandicap, toGtp, fromGtp
} = require('../lib/go-engine');

test('提子、禁入点和双方停一手由规则引擎处理', () => {
  const capture = initialPosition({
    size: 9,
    nextPlayer: 'B',
    initialStones: [
      { color: 'W', x: 1, y: 1 },
      { color: 'B', x: 0, y: 1 }, { color: 'B', x: 1, y: 0 }, { color: 'B', x: 2, y: 1 }
    ]
  });
  const afterCapture = applyMove(capture, { color: 'B', x: 1, y: 2 });
  assert.equal(afterCapture.board[1 * 9 + 1], null);
  assert.equal(afterCapture.captures.B, 1);

  const suicide = initialPosition({
    size: 9,
    nextPlayer: 'W',
    initialStones: [
      { color: 'B', x: 1, y: 0 }, { color: 'B', x: 0, y: 1 },
      { color: 'B', x: 2, y: 1 }, { color: 'B', x: 1, y: 2 }
    ]
  });
  assert.throws(() => applyMove(suicide, { color: 'W', x: 1, y: 1 }), error => error instanceof GoRuleError && error.code === 'SUICIDE');

  const passedOnce = applyMove(afterCapture, { color: 'W', pass: true });
  const passedTwice = applyMove(passedOnce, { color: 'B', pass: true });
  assert.equal(passedTwice.consecutivePasses, 2);
});

test('简单劫和全局同形禁着都阻止立即提回', () => {
  const initialStones = [
    { color: 'B', x: 1, y: 0 }, { color: 'B', x: 0, y: 1 }, { color: 'B', x: 2, y: 1 },
    { color: 'W', x: 1, y: 1 }, { color: 'W', x: 0, y: 2 }, { color: 'W', x: 2, y: 2 }, { color: 'W', x: 1, y: 3 }
  ];
  for (const koRule of ['simple-ko', 'positional-superko']) {
    const start = initialPosition({ size: 9, initialStones, nextPlayer: 'B' });
    const capture = applyMove(start, { color: 'B', x: 1, y: 2 }, { koRule });
    assert.throws(() => applyMove(capture, { color: 'W', x: 1, y: 1 }, { koRule }), error => ['KO', 'SUPERKO'].includes(error.code));
  }
});

test('简单劫在双方停一手后允许提回，全局同形禁着仍然阻止重复局面', () => {
  const initialStones = [
    { color: 'B', x: 1, y: 0 }, { color: 'B', x: 0, y: 1 }, { color: 'B', x: 2, y: 1 },
    { color: 'W', x: 1, y: 1 }, { color: 'W', x: 0, y: 2 }, { color: 'W', x: 2, y: 2 }, { color: 'W', x: 1, y: 3 }
  ];
  const afterPasses = koRule => {
    let position = initialPosition({ size: 9, initialStones, nextPlayer: 'B' });
    position = applyMove(position, { color: 'B', x: 1, y: 2 }, { koRule });
    position = applyMove(position, { color: 'W', pass: true }, { koRule });
    return applyMove(position, { color: 'B', pass: true }, { koRule });
  };
  const simple = applyMove(afterPasses('simple-ko'), { color: 'W', x: 1, y: 1 }, { koRule: 'simple-ko' });
  assert.equal(simple.board[2 * 9 + 1], null);
  assert.throws(() => applyMove(afterPasses('positional-superko'), { color: 'W', x: 1, y: 1 }, { koRule: 'positional-superko' }), error => error.code === 'SUPERKO');
});

test('让子点、坐标和中国规则数目结果稳定', () => {
  assert.deepEqual(standardHandicap(19, 4), [
    { color: 'B', x: 15, y: 3 }, { color: 'B', x: 3, y: 15 },
    { color: 'B', x: 15, y: 15 }, { color: 'B', x: 3, y: 3 }
  ]);
  assert.equal(toGtp(8, 8, 19), 'J11');
  assert.deepEqual(fromGtp('J11', 19), { x: 8, y: 8 });
  const fullBlack = initialPosition({ size: 5, initialStones: Array.from({ length: 25 }, (_, index) => ({ color: 'B', x: index % 5, y: Math.floor(index / 5) })) });
  const score = scorePosition(fullBlack, { rules: 'chinese', komi: 6.5 });
  assert.equal(score.black, 25);
  assert.equal(score.white, 6.5);
  assert.equal(score.result, 'B+18.5');
});

test('正式棋局可导出标准 SGF，SGF 变化可导入研究树', () => {
  const game = {
    config: { boardSize: 9, rules: 'chinese', komi: 6.5, handicap: 0 },
    blackPlayer: { type: 'user', userId: 'u1' }, whitePlayer: { type: 'engine', name: 'KataGo · 入门' },
    initialStones: [], moves: [
      { type: 'move', color: 'B', x: 2, y: 2 }, { type: 'pass', color: 'W' },
      { type: 'move', color: 'B', x: 3, y: 3, undoneAt: '2026-01-01T00:00:00Z' }
    ], result: 'B+R', startedAt: '2026-07-20T00:00:00Z'
  };
  const sgf = gameToSgf(game, [{ id: 'u1', displayName: '测试棋手' }]);
  assert.match(sgf, /SZ\[9\]/);
  assert.match(sgf, /PB\[测试棋手\]/);
  assert.match(sgf, /;B\[cc\];W\[\]/);
  assert.doesNotMatch(sgf, /dd/);
  assert.equal(parseSgf(sgf).length, 1);

  const study = sgfToStudy('(;GM[1]FF[4]SZ[9]GN[双变化]KM[6.5];B[cc](;W[dc])(;W[cd]))');
  assert.equal(study.title, '双变化');
  assert.equal(study.tree[0].children.length, 2);
  const position = replay({ size: 9, moves: [{ type: 'move', color: 'B', x: 2, y: 2 }] });
  assert.equal(position.board[2 * 9 + 2], 'B');
});
