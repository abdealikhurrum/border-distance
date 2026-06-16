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
  assert.deepEqual(REGION_IDS.slice().sort(), ['birmingham', 'ca', 'hyderabad', 'london', 'mumbai', 'paris', 'stuttgart', 'us']);
});

test('Canada is a full-country region: csd→cd→province, detectKey province, csd lazy by province', () => {
  const ca = REGIONS.ca;
  assert.equal(ca.kind, 'country');
  assert.equal(ca.detectKey, 'province');
  assert.deepEqual(ca.levels.map((l) => l.key), ['csd', 'cd', 'province']);
  const csd = ca.levels.find((l) => l.key === 'csd');
  assert.deepEqual(csd.file, { lazyDir: 'ca/csd', parent: 'province' });
  assert.equal(ca.levels.find((l) => l.key === 'province').file.path, 'ca/provinces.topo.json');
});

test('each metro has a district level with a data file', () => {
  for (const id of ['birmingham', 'stuttgart', 'paris', 'mumbai', 'hyderabad']) {
    const r = REGIONS[id];
    assert.equal(r.kind, 'urban');
    assert.equal(r.detectKey, 'district');
    assert.equal(r.metroRadiusKm, 50);
    const district = r.levels.find((l) => l.key === 'district');
    assert.equal(district.file.path, `metros/${id}/districts.topo.json`);
  }
});
