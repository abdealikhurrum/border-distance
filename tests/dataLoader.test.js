import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLoader } from '../js/dataLoader.js';

const topo = {
  type: 'Topology',
  objects: { layer: { type: 'GeometryCollection', geometries: [{ type: 'Polygon', arcs: [[0]], properties: { NAME: 'P' } }] } },
  arcs: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
};

test('getPlaces requests the per-state path and returns a FeatureCollection', async () => {
  const calls = [];
  const fakeFetch = async (url) => { calls.push(url); return { ok: true, json: async () => topo }; };
  const loader = createLoader('./data', fakeFetch);
  const fc = await loader.getPlaces('48');
  assert.equal(calls[0], './data/places/48.topo.json');
  assert.equal(fc.type, 'FeatureCollection');
  assert.equal(fc.features[0].properties.NAME, 'P');
});

test('loader caches: second call does not re-fetch', async () => {
  let n = 0;
  const fakeFetch = async () => { n++; return { ok: true, json: async () => topo }; };
  const loader = createLoader('./data', fakeFetch);
  await loader.getStates();
  await loader.getStates();
  assert.equal(n, 1);
});

test('loader throws on non-ok response', async () => {
  const fakeFetch = async () => ({ ok: false, status: 404 });
  const loader = createLoader('./data', fakeFetch);
  await assert.rejects(() => loader.getCounties(), /404/);
});
