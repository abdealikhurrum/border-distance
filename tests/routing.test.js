import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRoute } from '../js/routing.js';

const okResp = (routes) => ({ ok: true, json: async () => ({ code: 'Ok', routes }) });
const lineGeom = { type: 'LineString', coordinates: [[-96.6, 33.1], [-96.8, 32.8]] };

test('getRoute builds a 2-coordinate URL with alternatives and parses routes', async () => {
  let calledUrl = '';
  const fakeFetch = async (url) => { calledUrl = url; return okResp([
    { distance: 48280, geometry: lineGeom },
    { distance: 51500, geometry: lineGeom },
  ]); };
  const routes = await getRoute(
    [{ lat: 33.1972, lon: -96.6398 }, { lat: 32.7767, lon: -96.797 }],
    fakeFetch, { alternatives: true });
  assert.match(calledUrl, /\/driving\/-96\.6398,33\.1972;-96\.797,32\.7767/);
  assert.match(calledUrl, /alternatives=3/);
  assert.match(calledUrl, /geometries=geojson/);
  assert.equal(routes.length, 2);
  assert.ok(Math.abs(routes[0].distanceMiles - 30) < 1, `miles=${routes[0].distanceMiles}`);
  assert.ok(Math.abs(routes[0].distanceKm - 48.28) < 0.1, `km=${routes[0].distanceKm}`);
  assert.equal(routes[0].geometry.type, 'LineString');
});

test('getRoute with a waypoint omits alternatives and includes all coordinates in order', async () => {
  let calledUrl = '';
  const fakeFetch = async (url) => { calledUrl = url; return okResp([{ distance: 1000, geometry: lineGeom }]); };
  const routes = await getRoute(
    [{ lat: 1, lon: 1 }, { lat: 2, lon: 2 }, { lat: 3, lon: 3 }],
    fakeFetch, { alternatives: false });
  assert.match(calledUrl, /\/driving\/1,1;2,2;3,3\?/);
  assert.doesNotMatch(calledUrl, /alternatives/);
  assert.equal(routes.length, 1);
});

test('getRoute returns [] when no route is found', async () => {
  const fakeFetch = async () => ({ ok: true, json: async () => ({ code: 'NoRoute', routes: [] }) });
  const routes = await getRoute([{ lat: 1, lon: 1 }, { lat: 2, lon: 2 }], fakeFetch, { alternatives: true });
  assert.deepEqual(routes, []);
});

test('getRoute throws on non-ok HTTP response', async () => {
  const fakeFetch = async () => ({ ok: false, status: 503 });
  await assert.rejects(
    () => getRoute([{ lat: 1, lon: 1 }, { lat: 2, lon: 2 }], fakeFetch, {}),
    /503/);
});
