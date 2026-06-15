import { test } from 'node:test';
import assert from 'node:assert/strict';
import { geocode } from '../js/geocode.js';

test('geocode parses a Nominatim match', async () => {
  let calledUrl = '';
  const fakeFetch = async (url) => {
    calledUrl = url;
    return { ok: true, json: async () => ([{ lat: '32.77', lon: '-96.79', display_name: 'Dallas, Texas' }]) };
  };
  const r = await geocode('Dallas, TX', fakeFetch);
  assert.match(calledUrl, /nominatim\.openstreetmap\.org/);
  assert.match(calledUrl, /countrycodes=us%2Cgb|countrycodes=us,gb/);
  assert.equal(r.lon, -96.79);
  assert.equal(r.lat, 32.77);
  assert.equal(r.source, 'nominatim');
  assert.equal(r.matchedLabel, 'Dallas, Texas');
});

test('geocode returns null when nothing matches', async () => {
  const fakeFetch = async () => ({ ok: true, json: async () => ([]) });
  assert.equal(await geocode('zzzz', fakeFetch), null);
});

test('geocode parses lat/lon to numbers', async () => {
  const fakeFetch = async () => ({ ok: true, json: async () => ([{ lat: '40.7128', lon: '-74.0060', display_name: 'New York' }]) });
  const r = await geocode('New York', fakeFetch);
  assert.strictEqual(typeof r.lat, 'number');
  assert.strictEqual(typeof r.lon, 'number');
  assert.equal(r.lat, 40.7128);
});

test('geocode throws on a non-ok response', async () => {
  const fakeFetch = async () => ({ ok: false, status: 503 });
  await assert.rejects(() => geocode('Dallas', fakeFetch), /503/);
});
