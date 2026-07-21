'use strict';

const LETTERS = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';

class GoRuleError extends Error {
  constructor(message, code = 'ILLEGAL_MOVE') {
    super(message);
    this.name = 'GoRuleError';
    this.code = code;
  }
}

const pointKey = (x, y) => `${x},${y}`;
const boardHash = board => board.map(value => value || '.').join('');
const opposite = color => color === 'B' ? 'W' : 'B';

function assertSize(size) {
  if (!Number.isInteger(size) || size < 5 || size > 25) throw new GoRuleError('棋盘大小必须在 5–25 路之间', 'INVALID_SIZE');
}

function createBoard(size) {
  assertSize(size);
  return Array(size * size).fill(null);
}

function indexOf(size, x, y) {
  return y * size + x;
}

function inBounds(size, x, y) {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < size && y < size;
}

function neighbors(size, x, y) {
  return [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].filter(([nx, ny]) => inBounds(size, nx, ny));
}

function getGroup(board, size, x, y) {
  if (!inBounds(size, x, y)) return { color: null, stones: [], liberties: [] };
  const color = board[indexOf(size, x, y)];
  if (!color) return { color: null, stones: [], liberties: [] };
  const stones = [], liberties = new Set(), seen = new Set([pointKey(x, y)]), queue = [[x, y]];
  while (queue.length) {
    const [cx, cy] = queue.pop();
    stones.push([cx, cy]);
    for (const [nx, ny] of neighbors(size, cx, cy)) {
      const value = board[indexOf(size, nx, ny)];
      if (!value) liberties.add(pointKey(nx, ny));
      else if (value === color && !seen.has(pointKey(nx, ny))) {
        seen.add(pointKey(nx, ny));
        queue.push([nx, ny]);
      }
    }
  }
  return { color, stones, liberties: [...liberties].map(value => value.split(',').map(Number)) };
}

function placeSetupStones(board, size, stones = []) {
  for (const stone of stones) {
    const color = stone?.color === 'W' ? 'W' : 'B', x = Number(stone?.x), y = Number(stone?.y);
    if (!inBounds(size, x, y)) continue;
    board[indexOf(size, x, y)] = color;
  }
  return board;
}

function initialPosition({ size = 19, initialStones = [], nextPlayer = 'B' } = {}) {
  const board = placeSetupStones(createBoard(size), size, initialStones);
  return {
    size,
    board,
    toPlay: nextPlayer === 'W' ? 'W' : 'B',
    captures: { B: 0, W: 0 },
    history: [boardHash(board)],
    consecutivePasses: 0,
    moveNumber: 0
  };
}

function applyMove(position, move, rules = {}) {
  const size = position.size, color = move?.color === 'W' ? 'W' : move?.color === 'B' ? 'B' : position.toPlay;
  if (color !== position.toPlay && rules.enforceTurn !== false) throw new GoRuleError('现在不是该颜色落子', 'WRONG_TURN');
  if (move?.pass) {
    return {
      ...position,
      board: position.board.slice(),
      toPlay: opposite(color),
      // A pass is still a turn for simple-ko purposes. Keeping the repeated
      // board in history allows a ko recapture after intervening passes while
      // positional superko continues to reject an actual repeated placement.
      history: [...position.history, boardHash(position.board)],
      consecutivePasses: position.consecutivePasses + 1,
      moveNumber: position.moveNumber + 1,
      lastMove: { color, pass: true }
    };
  }
  const x = Number(move?.x), y = Number(move?.y);
  if (!inBounds(size, x, y)) throw new GoRuleError('落子位置超出棋盘', 'OUT_OF_BOUNDS');
  const targetIndex = indexOf(size, x, y);
  if (position.board[targetIndex]) throw new GoRuleError('这个位置已经有棋子', 'OCCUPIED');
  const board = position.board.slice();
  board[targetIndex] = color;
  const captured = [];
  const inspected = new Set();
  for (const [nx, ny] of neighbors(size, x, y)) {
    if (board[indexOf(size, nx, ny)] !== opposite(color) || inspected.has(pointKey(nx, ny))) continue;
    const group = getGroup(board, size, nx, ny);
    group.stones.forEach(([gx, gy]) => inspected.add(pointKey(gx, gy)));
    if (!group.liberties.length) {
      group.stones.forEach(([gx, gy]) => {
        board[indexOf(size, gx, gy)] = null;
        captured.push([gx, gy]);
      });
    }
  }
  const ownGroup = getGroup(board, size, x, y);
  if (!ownGroup.liberties.length) {
    if (!rules.allowSuicide) throw new GoRuleError('这里是禁入点', 'SUICIDE');
    ownGroup.stones.forEach(([gx, gy]) => { board[indexOf(size, gx, gy)] = null; });
  }
  const hash = boardHash(board);
  const koRule = rules.koRule || 'positional-superko';
  if (koRule === 'positional-superko' && position.history.includes(hash)) throw new GoRuleError('此手会造成全局同形重复', 'SUPERKO');
  if (koRule === 'simple-ko' && position.history.at(-2) === hash) throw new GoRuleError('此处形成打劫，不能立即提回', 'KO');
  const captures = { ...position.captures };
  captures[color] += captured.length;
  return {
    ...position,
    board,
    toPlay: opposite(color),
    captures,
    history: [...position.history, hash],
    consecutivePasses: 0,
    moveNumber: position.moveNumber + 1,
    lastMove: { color, x, y, captured }
  };
}

function replay({ size = 19, initialStones = [], nextPlayer = 'B', moves = [], rules = {} } = {}) {
  let position = initialPosition({ size, initialStones, nextPlayer });
  for (const move of moves.filter(item => !item.undoneAt)) {
    if (move.type === 'setup' || move.type === 'erase') {
      const board = position.board.slice(), idx = indexOf(size, Number(move.x), Number(move.y));
      if (inBounds(size, Number(move.x), Number(move.y))) board[idx] = move.type === 'erase' ? null : (move.color === 'W' ? 'W' : 'B');
      position = { ...position, board, history: [...position.history, boardHash(board)], moveNumber: position.moveNumber + 1 };
      continue;
    }
    if (move.type !== 'move' && move.type !== 'pass') continue;
    position = applyMove(position, { color: move.color, x: move.x, y: move.y, pass: move.type === 'pass' }, rules);
  }
  return position;
}

function standardHandicap(size, count) {
  const amount = Math.max(0, Math.min(9, Number(count) || 0));
  if (amount < 2) return [];
  const low = size >= 13 ? 3 : 2, high = size - 1 - low, mid = Math.floor(size / 2);
  const sequence = [
    [high, low], [low, high], [high, high], [low, low],
    [low, mid], [high, mid], [mid, low], [mid, high], [mid, mid]
  ];
  const orderByCount = {
    2: [0, 1], 3: [0, 1, 2], 4: [0, 1, 2, 3], 5: [0, 1, 2, 3, 8],
    6: [0, 1, 2, 3, 4, 5], 7: [0, 1, 2, 3, 4, 5, 8],
    8: [0, 1, 2, 3, 4, 5, 6, 7], 9: [0, 1, 2, 3, 4, 5, 6, 7, 8]
  };
  return (orderByCount[amount] || []).map(index => ({ color: 'B', x: sequence[index][0], y: sequence[index][1] }));
}

function normalizeDead(dead = [], size) {
  return [...new Set(dead.map(item => Array.isArray(item) ? pointKey(Number(item[0]), Number(item[1])) : String(item)))]
    .map(value => value.split(',').map(Number))
    .filter(([x, y]) => inBounds(size, x, y));
}

function scorePosition(position, { rules = 'chinese', komi = 7.5, dead = [] } = {}) {
  const size = position.size, board = position.board.slice(), deadPoints = normalizeDead(dead, size);
  const removed = { B: 0, W: 0 };
  for (const [x, y] of deadPoints) {
    const value = board[indexOf(size, x, y)];
    if (value) { removed[value]++; board[indexOf(size, x, y)] = null; }
  }
  const territory = { B: 0, W: 0, neutral: 0 }, seen = new Set();
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (board[indexOf(size, x, y)] || seen.has(pointKey(x, y))) continue;
    const region = [], borders = new Set(), queue = [[x, y]];
    seen.add(pointKey(x, y));
    while (queue.length) {
      const [cx, cy] = queue.pop(); region.push([cx, cy]);
      for (const [nx, ny] of neighbors(size, cx, cy)) {
        const value = board[indexOf(size, nx, ny)];
        if (value) borders.add(value);
        else if (!seen.has(pointKey(nx, ny))) { seen.add(pointKey(nx, ny)); queue.push([nx, ny]); }
      }
    }
    if (borders.size === 1) territory[[...borders][0]] += region.length;
    else territory.neutral += region.length;
  }
  const stones = { B: board.filter(value => value === 'B').length, W: board.filter(value => value === 'W').length };
  const captures = {
    B: Number(position.captures?.B || 0) + removed.W,
    W: Number(position.captures?.W || 0) + removed.B
  };
  const black = rules === 'japanese' ? territory.B + captures.B : territory.B + stones.B;
  const whiteBeforeKomi = rules === 'japanese' ? territory.W + captures.W : territory.W + stones.W;
  const white = whiteBeforeKomi + Number(komi || 0), difference = black - white;
  return {
    rules, komi: Number(komi || 0), stones, territory, captures, removed,
    black, white, difference,
    winner: difference > 0 ? 'B' : difference < 0 ? 'W' : null,
    result: difference > 0 ? `B+${formatScore(difference)}` : difference < 0 ? `W+${formatScore(-difference)}` : '0'
  };
}

function formatScore(value) {
  return Number.isInteger(value) ? String(value) : Number(value).toFixed(1).replace(/\.0$/, '');
}

function toGtp(x, y, size) {
  if (!inBounds(size, x, y)) throw new GoRuleError('坐标超出棋盘', 'OUT_OF_BOUNDS');
  return `${LETTERS[x]}${size - y}`;
}

function fromGtp(value, size) {
  const raw = String(value || '').trim().toUpperCase();
  if (raw === 'PASS') return { pass: true };
  if (raw === 'RESIGN') return { resign: true };
  const match = raw.match(/^([A-Z])(\d{1,2})$/), x = match ? LETTERS.indexOf(match[1]) : -1, y = match ? size - Number(match[2]) : -1;
  if (!match || !inBounds(size, x, y)) throw new GoRuleError(`KataGo 返回了无效坐标：${raw}`, 'INVALID_ENGINE_MOVE');
  return { x, y };
}

function toSgfPoint(x, y) {
  return String.fromCharCode(97 + x) + String.fromCharCode(97 + y);
}

function fromSgfPoint(value) {
  if (!value || value.length < 2) return null;
  return { x: value.charCodeAt(0) - 97, y: value.charCodeAt(1) - 97 };
}

function sgfEscape(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/\]/g, '\\]').replace(/\r?\n/g, '\\n');
}

function gameToSgf(game, users = []) {
  const nameFor = player => player?.type === 'engine' ? (player.name || 'KataGo') : (users.find(user => user.id === player?.userId)?.displayName || player?.name || 'Unknown');
  const config = game.config || {}, size = Number(config.boardSize || game.boardSize || 19), rules = config.rules === 'japanese' ? 'Japanese' : 'Chinese';
  const props = [`GM[1]`, `FF[4]`, `CA[UTF-8]`, `AP[Polynomial-Server:0.2.0]`, `SZ[${size}]`, `RU[${rules}]`, `KM[${Number(config.komi || 0)}]`];
  if (game.blackPlayer) props.push(`PB[${sgfEscape(nameFor(game.blackPlayer))}]`);
  if (game.whitePlayer) props.push(`PW[${sgfEscape(nameFor(game.whitePlayer))}]`);
  if (Number(config.handicap) >= 2) props.push(`HA[${Number(config.handicap)}]`);
  if (game.initialStones?.length) props.push(`AB${game.initialStones.filter(item => item.color === 'B').map(item => `[${toSgfPoint(item.x, item.y)}]`).join('')}`);
  if (game.result) props.push(`RE[${sgfEscape(game.result)}]`);
  if (game.startedAt) props.push(`DT[${String(game.startedAt).slice(0, 10)}]`);
  const moves = (game.moves || []).filter(item => !item.undoneAt && (item.type === 'move' || item.type === 'pass'))
    .map(item => `;${item.color}[${item.type === 'pass' ? '' : toSgfPoint(item.x, item.y)}]`).join('');
  return `(;${props.join('')}${moves})`;
}

function parseSgf(input) {
  const source = String(input || ''), limit = source.length; let cursor = 0;
  const skip = () => { while (cursor < limit && /\s/.test(source[cursor])) cursor++; };
  const value = () => {
    if (source[cursor++] !== '[') throw new GoRuleError('SGF 属性缺少 [', 'INVALID_SGF');
    let result = '';
    while (cursor < limit) {
      const char = source[cursor++];
      if (char === ']') return result;
      if (char === '\\' && cursor < limit) { const escaped = source[cursor++]; if (escaped !== '\n' && escaped !== '\r') result += escaped; }
      else result += char;
    }
    throw new GoRuleError('SGF 属性没有结束', 'INVALID_SGF');
  };
  const node = () => {
    if (source[cursor++] !== ';') throw new GoRuleError('SGF 节点格式错误', 'INVALID_SGF');
    const properties = {};
    while (cursor < limit) {
      skip(); const match = source.slice(cursor).match(/^([A-Za-z]+)/); if (!match) break;
      cursor += match[1].length; skip(); const values = [];
      while (source[cursor] === '[') { values.push(value()); skip(); }
      if (!values.length) throw new GoRuleError(`SGF 属性 ${match[1]} 没有值`, 'INVALID_SGF');
      properties[match[1].toUpperCase()] = [...(properties[match[1].toUpperCase()] || []), ...values];
    }
    return properties;
  };
  const tree = () => {
    skip(); if (source[cursor++] !== '(') throw new GoRuleError('SGF 缺少游戏树起点', 'INVALID_SGF');
    const sequence = [], children = []; skip();
    while (source[cursor] === ';') { sequence.push(node()); skip(); }
    while (source[cursor] === '(') { children.push(tree()); skip(); }
    if (source[cursor++] !== ')') throw new GoRuleError('SGF 游戏树没有结束', 'INVALID_SGF');
    return { sequence, children };
  };
  skip(); const trees = [];
  while (cursor < limit) { trees.push(tree()); skip(); }
  if (!trees.length || !trees[0].sequence.length) throw new GoRuleError('SGF 中没有棋局', 'INVALID_SGF');
  return trees;
}

function sgfToStudy(input) {
  const parsed = parseSgf(input)[0], root = parsed.sequence[0], size = Math.max(5, Math.min(25, Number(root.SZ?.[0]) || 19));
  const initialStones = [
    ...(root.AB || []).map(fromSgfPoint).filter(Boolean).map(point => ({ color: 'B', ...point })),
    ...(root.AW || []).map(fromSgfPoint).filter(Boolean).map(point => ({ color: 'W', ...point }))
  ].filter(item => inBounds(size, item.x, item.y));
  const convertNode = properties => {
    const color = properties.B ? 'B' : properties.W ? 'W' : null, raw = color ? properties[color][0] : null, point = raw ? fromSgfPoint(raw) : null;
    return { id: null, color, ...(point || (color ? { pass: true } : {})), comment: properties.C?.[0] || '', children: [] };
  };
  const convertTree = branch => {
    let first = null, previous = null;
    for (const properties of branch.sequence.slice(branch === parsed ? 1 : 0)) {
      const current = convertNode(properties); if (!current.color && !current.comment) continue;
      if (!first) first = current; if (previous) previous.children.push(current); previous = current;
    }
    const parent = previous;
    for (const child of branch.children) {
      const converted = convertTree(child); if (!converted) continue;
      if (parent) parent.children.push(converted); else if (!first) first = converted;
    }
    return first;
  };
  const tree = convertTree(parsed), assignIds = node => { if (!node) return; node.id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`; node.children.forEach(assignIds); };
  assignIds(tree);
  return {
    title: root.GN?.[0] || '导入的 SGF 研究', boardSize: size, rules: String(root.RU?.[0] || 'Chinese').toLowerCase().includes('japan') ? 'japanese' : 'chinese',
    komi: Number(root.KM?.[0] || 0), initialStones, nextPlayer: root.PL?.[0] === 'W' ? 'W' : 'B', comments: root.C?.[0] || '', tree: tree ? [tree] : []
  };
}

module.exports = {
  GoRuleError, applyMove, boardHash, createBoard, formatScore, fromGtp, fromSgfPoint, gameToSgf,
  getGroup, inBounds, indexOf, initialPosition, neighbors, normalizeDead, opposite, parseSgf,
  placeSetupStones, pointKey, replay, scorePosition, sgfToStudy, standardHandicap, toGtp, toSgfPoint
};
