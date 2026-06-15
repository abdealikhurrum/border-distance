import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as turf from '@turf/turf';
import { betweenDistance } from '../js/routeBetween.js';

// unit square covering [x0, x0+1] x [0, 1]
const square = (x0) => turf.polygon([[[x0, 0], [x0 + 1, 0], [x0 + 1, 1], [x0, 1], [x0, 0]]]);

test('betweenDistance is ~0 for a route crossing directly between adjacent units', () => {
  const route = turf.lineString([[0.5, 0.5], [1.5, 0.5]]); // through A=[0,1] into B=[1,2]
  const r = betweenDistance(route, square(0), square(1));
  assert.ok(r.betweenMiles < 1, `betweenMiles=${r.betweenMiles}`);
  assert.equal(r.betweenLine, null);
});

test('betweenDistance equals the gap length when units are separated', () => {
  const route = turf.lineString([[0.5, 0.5], [2.5, 0.5]]); // A=[0,1], gap=[1,2], B=[2,3]
  const r = betweenDistance(route, square(0), square(2));
  // gap is ~1 deg lon at lat 0.5 ≈ 69 mi
  assert.ok(r.betweenMiles > 60 && r.betweenMiles < 75, `betweenMiles=${r.betweenMiles}`);
  assert.equal(r.betweenLine.geometry.type, 'MultiLineString');
});

test('betweenDistance accepts a raw LineString geometry (not just a Feature)', () => {
  const geom = { type: 'LineString', coordinates: [[0.5, 0.5], [1.5, 0.5]] };
  const r = betweenDistance(geom, square(0), square(1));
  assert.ok(r.betweenMiles < 1);
});
