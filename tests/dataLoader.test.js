import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLoader } from '../js/dataLoader.js';

const topo = {
  type: 'Topology',
  objects: { layer: { type: 'GeometryCollection', geometries: [{ type: 'Polygon', arcs: [[0]], properties: { NAME: 'P' } }] } },
  arcs: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
};

test('getDetectLayers loads US states + London city', async () => {
  const calls = [];
  const fakeFetch = async (url) => { calls.push(url); return { ok: true, json: async () => topo }; };
  const loader = createLoader('./data', fakeFetch);
  const layers = await loader.getDetectLayers();
  assert.ok('us' in layers && 'london' in layers);
  assert.ok(calls.includes('./data/states.topo.json'));
  assert.ok(calls.includes('./data/metros/london/districts.topo.json'));
});

test('getLevel: US place is lazy by state fips; county is fixed', async () => {
  const calls = [];
  const fakeFetch = async (url) => { calls.push(url); return { ok: true, json: async () => topo }; };
  const loader = createLoader('./data', fakeFetch);
  await loader.getLevel('us', 'place', '48');
  await loader.getLevel('us', 'county');
  assert.equal(calls[0], './data/places/48.topo.json');
  assert.equal(calls[1], './data/counties.topo.json');
});

test('getLevel: London region is a fixed metros path', async () => {
  const calls = [];
  const fakeFetch = async (url) => { calls.push(url); return { ok: true, json: async () => topo }; };
  const loader = createLoader('./data', fakeFetch);
  await loader.getLevel('london', 'region');
  assert.equal(calls[0], './data/metros/london/region.topo.json');
});

test('caches by path; throws on non-ok', async () => {
  let n = 0;
  const loader = createLoader('./data', async () => { n++; return { ok: true, json: async () => topo }; });
  await loader.getLevel('us', 'county'); await loader.getLevel('us', 'county');
  assert.equal(n, 1);
  const bad = createLoader('./data', async () => ({ ok: false, status: 404 }));
  await assert.rejects(() => bad.getLevel('us', 'state'), /404/);
});
