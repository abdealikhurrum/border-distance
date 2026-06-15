import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as turf from '@turf/turf';
import { findContaining, resolvePoint } from '../js/resolve.js';

const square = (x0, y0, props) =>
  turf.polygon([[[x0, y0], [x0 + 1, y0], [x0 + 1, y0 + 1], [x0, y0 + 1], [x0, y0]]], props);

test('findContaining returns the containing polygon', () => {
  const features = [square(0, 0, { NAME: 'A' }), square(1, 0, { NAME: 'B' })];
  assert.equal(findContaining({ lon: 1.5, lat: 0.5 }, features).properties.NAME, 'B');
});

test('findContaining returns null when none contains', () => {
  assert.equal(findContaining({ lon: 9, lat: 9 }, [square(0, 0, {})]), null);
});

test('resolvePoint resolves state/county/place via loader', async () => {
  const loader = {
    getStates: async () => turf.featureCollection([square(0, 0, { STATEFP: '48', NAME: 'Texas' })]),
    getCounties: async () => turf.featureCollection([square(0, 0, { NAME: 'Collin' })]),
    getPlaces: async () => turf.featureCollection([square(0, 0, { NAME: 'Dallas' })]),
  };
  const r = await resolvePoint({ lon: 0.5, lat: 0.5 }, loader);
  assert.equal(r.outsideUS, false);
  assert.equal(r.state.properties.NAME, 'Texas');
  assert.equal(r.county.properties.NAME, 'Collin');
  assert.equal(r.place.properties.NAME, 'Dallas');
});

test('resolvePoint flags outside-US points', async () => {
  const loader = {
    getStates: async () => turf.featureCollection([square(0, 0, {})]),
    getCounties: async () => turf.featureCollection([]),
    getPlaces: async () => turf.featureCollection([]),
  };
  const r = await resolvePoint({ lon: 50, lat: 50 }, loader);
  assert.equal(r.outsideUS, true);
  assert.equal(r.place, null);
});

test('resolvePoint returns null place for unincorporated point', async () => {
  const loader = {
    getStates: async () => turf.featureCollection([square(0, 0, { STATEFP: '48' })]),
    getCounties: async () => turf.featureCollection([square(0, 0, { NAME: 'X' })]),
    getPlaces: async () => turf.featureCollection([]),
  };
  const r = await resolvePoint({ lon: 0.5, lat: 0.5 }, loader);
  assert.equal(r.place, null);
});
