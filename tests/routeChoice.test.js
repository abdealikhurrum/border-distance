import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseRoute } from '../js/routeChoice.js';

test('no threshold -> shortest (index 0)', () => {
  assert.equal(chooseRoute([{}, {}], [50, 40], null), 0);
});
test('shortest already under threshold -> 0', () => {
  assert.equal(chooseRoute([{}, {}], [30, 45], 40), 0);
});
test('overshoot beyond 10% -> keep shortest (0)', () => {
  assert.equal(chooseRoute([{}, {}], [60, 38], 40), 0); // 60 > 44
});
test('within 10% window, an alternative qualifies -> that index', () => {
  // default route's between=43 (in window 40..44); a longer-driving alt (idx 2) has between=39 < 40
  assert.equal(chooseRoute([{}, {}, {}], [43, 50, 39], 40), 2);
});
test('within window but no alternative qualifies -> 0', () => {
  assert.equal(chooseRoute([{}, {}], [43, 47], 40), 0);
});
