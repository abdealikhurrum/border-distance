import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pointToPoint } from '../js/distance.js';

test('pointToPoint ~30 miles for McKinney↔Dallas centers', () => {
  const r = pointToPoint({ lat: 33.1972, lon: -96.6398 }, { lat: 32.7767, lon: -96.7970 });
  assert.ok(r.miles > 28 && r.miles < 34, `miles=${r.miles}`);
  assert.ok(r.km > 45 && r.km < 55, `km=${r.km}`);
});
