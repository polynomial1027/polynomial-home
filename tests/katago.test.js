'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseKataSearchAnalysis } = require('../lib/katago');

test('解析 kata-search_analyze 的落子、候选点、胜率和目数', () => {
  const response = 'info move D4 visits 12 winrate 0.42 scoreLead -3.1 prior 0.2 order 0 pv D4 E5 info move E5 visits 3 winrate 0.39 scoreLead -3.8 prior 0.1 order 1 pv E5 rootInfo visits 16 winrate 0.4 scoreLead -3.25 play D4';
  const parsed = parseKataSearchAnalysis(response, 9);
  assert.deepEqual(parsed.move, { x: 3, y: 5 });
  assert.equal(parsed.candidates.length, 2);
  assert.equal(parsed.analysis.visits, 16);
  assert.equal(parsed.analysis.winrate, 0.4);
  assert.equal(parsed.analysis.scoreLead, -3.25);
});
