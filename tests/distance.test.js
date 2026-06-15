import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as turf from '@turf/turf';
import { pointToPoint, polygonDistance } from '../js/distance.js';

test('pointToPoint ~30 miles for McKinney↔Dallas centers', () => {
  const r = pointToPoint({ lat: 33.1972, lon: -96.6398 }, { lat: 32.7767, lon: -96.7970 });
  assert.ok(r.miles > 28 && r.miles < 34, `miles=${r.miles}`);
  assert.ok(r.km > 45 && r.km < 55, `km=${r.km}`);
});

const square = (x0, y0) => turf.polygon([[[x0, y0], [x0 + 1, y0], [x0 + 1, y0 + 1], [x0, y0 + 1], [x0, y0]]]);

test('polygonDistance is 0 for edge-touching polygons', () => {
  const r = polygonDistance(square(0, 0), square(1, 0));
  assert.equal(r.miles, 0);
  assert.equal(r.km, 0);
});

test('polygonDistance is 0 for overlapping polygons', () => {
  const r = polygonDistance(square(0, 0), square(0.5, 0));
  assert.equal(r.miles, 0);
  assert.equal(r.nearestPair, null);
});

test('polygonDistance positive for separated polygons + returns nearestPair', () => {
  const r = polygonDistance(square(0, 0), square(3, 0)); // ~2° lon gap near equator ≈ 138 mi
  assert.ok(r.miles > 110 && r.miles < 160, `miles=${r.miles}`);
  assert.ok(Array.isArray(r.nearestPair) && r.nearestPair.length === 2, 'nearestPair');
});
