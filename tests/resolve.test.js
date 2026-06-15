import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as turf from '@turf/turf';
import { findContaining, detectRegion, resolvePoint } from '../js/resolve.js';

const sq = (x0, y0, props) =>
  turf.polygon([[[x0, y0], [x0 + 1, y0], [x0 + 1, y0 + 1], [x0, y0 + 1], [x0, y0]]], props);

// US states at x=0; London city at x=10, England region also covering x=10
const fake = {
  getDetectLayers: async () => ({
    us: turf.featureCollection([sq(0, 0, { STATEFP: '48', NAME: 'Texas' })]),
    london: turf.featureCollection([sq(10, 0, { NAME: 'Greater London' })]),
  }),
  getLevel: async (regionId, levelKey) => {
    const f = {
      'us:county': sq(0, 0, { NAME: 'Collin' }),
      'us:place': sq(0, 0, { NAME: 'McKinney' }),
      'london:region': sq(10, 0, { NAME: 'England' }),
    }[`${regionId}:${levelKey}`];
    return turf.featureCollection(f ? [f] : []);
  },
};

test('findContaining returns containing polygon or null', () => {
  assert.equal(findContaining({ lon: 0.5, lat: 0.5 }, [sq(0, 0, { NAME: 'A' })]).properties.NAME, 'A');
  assert.equal(findContaining({ lon: 9, lat: 9 }, [sq(0, 0, {})]), null);
});

test('detectRegion picks US, London, or null', async () => {
  assert.equal(await detectRegion({ lon: 0.5, lat: 0.5 }, fake), 'us');
  assert.equal(await detectRegion({ lon: 10.5, lat: 0.5 }, fake), 'london');
  assert.equal(await detectRegion({ lon: 99, lat: 99 }, fake), null);
});

test('resolvePoint resolves US chain (place lazy by state fips)', async () => {
  const r = await resolvePoint({ lon: 0.5, lat: 0.5 }, fake);
  assert.equal(r.region, 'us');
  assert.equal(r.units.state.properties.NAME, 'Texas');
  assert.equal(r.units.county.properties.NAME, 'Collin');
  assert.equal(r.units.place.properties.NAME, 'McKinney');
});

test('resolvePoint resolves London (city + region)', async () => {
  const r = await resolvePoint({ lon: 10.5, lat: 0.5 }, fake);
  assert.equal(r.region, 'london');
  assert.equal(r.units.city.properties.NAME, 'Greater London');
  assert.equal(r.units.region.properties.NAME, 'England');
});

test('resolvePoint flags outside', async () => {
  const r = await resolvePoint({ lon: 99, lat: 99 }, fake);
  assert.equal(r.outside, true);
  assert.equal(r.region, null);
  assert.deepEqual(r.units, {});
});
