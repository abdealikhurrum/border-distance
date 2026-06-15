import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REGIONS, REGION_IDS } from '../js/regions.js';

test('US region has place/county/state, detectKey state', () => {
  assert.deepEqual(REGIONS.us.levels.map((l) => l.key), ['place', 'county', 'state']);
  assert.equal(REGIONS.us.detectKey, 'state');
  assert.equal(REGIONS.us.kind, 'us');
});

test('London region: district = real local authorities, region = OSM relation', () => {
  assert.deepEqual(REGIONS.london.levels.map((l) => l.key), ['district', 'region']);
  assert.equal(REGIONS.london.detectKey, 'district');
  assert.equal(REGIONS.london.kind, 'urban');
  assert.equal(REGIONS.london.metroRadiusKm, 50);
  assert.deepEqual(REGIONS.london.metroCenter, [-0.1276, 51.5072]);
  assert.equal(REGIONS.london.levels[0].file.path, 'metros/london/districts.topo.json');
  assert.equal(REGIONS.london.levels[1].relId, 58447);
  assert.equal(REGIONS.london.levels[1].file.path, 'metros/london/region.topo.json');
});

test('US level file layout matches the flat data paths', () => {
  const byKey = Object.fromEntries(REGIONS.us.levels.map((l) => [l.key, l.file]));
  assert.deepEqual(byKey.place, { lazyDir: 'places', parent: 'state' });
  assert.equal(byKey.county.path, 'counties.topo.json');
  assert.equal(byKey.state.path, 'states.topo.json');
});

test('every level has a file (path or lazyDir+parent); REGION_IDS lists ids', () => {
  for (const id of REGION_IDS) {
    for (const lvl of REGIONS[id].levels) {
      const f = lvl.file;
      assert.ok(f.path || (f.lazyDir && f.parent), `${id}.${lvl.key} file`);
    }
  }
  assert.deepEqual(REGION_IDS.sort(), ['london', 'us']);
});
