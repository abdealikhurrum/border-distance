import { test } from 'node:test';
import assert from 'node:assert/strict';
import { geocode } from '../js/geocode.js';

test('geocode parses a Census match', async () => {
  const fakeFetch = async () => ({
    ok: true,
    json: async () => ({ result: { addressMatches: [{ coordinates: { x: -96.79, y: 32.77 }, matchedAddress: 'DALLAS, TX' }] } }),
  });
  const r = await geocode('Dallas, TX', fakeFetch);
  assert.equal(r.lon, -96.79);
  assert.equal(r.lat, 32.77);
  assert.equal(r.source, 'census');
  assert.equal(r.matchedLabel, 'DALLAS, TX');
});

test('geocode falls back to Nominatim when Census has no match', async () => {
  const fakeFetch = async (url) => {
    if (url.includes('census')) return { ok: true, json: async () => ({ result: { addressMatches: [] } }) };
    return { ok: true, json: async () => ([{ lat: '32.77', lon: '-96.79', display_name: 'Dallas, Texas' }]) };
  };
  const r = await geocode('Dallas', fakeFetch);
  assert.equal(r.source, 'nominatim');
  assert.equal(r.lat, 32.77);
  assert.equal(r.lon, -96.79);
});

test('geocode returns null when nothing matches anywhere', async () => {
  const fakeFetch = async (url) =>
    url.includes('census')
      ? { ok: true, json: async () => ({ result: { addressMatches: [] } }) }
      : { ok: true, json: async () => ([]) };
  assert.equal(await geocode('zzzz', fakeFetch), null);
});

test('geocode falls back to Nominatim when Census returns non-ok', async () => {
  const fakeFetch = async (url) => {
    if (url.includes('census')) return { ok: false, status: 500, json: async () => ({}) };
    return { ok: true, json: async () => ([{ lat: '32.77', lon: '-96.79', display_name: 'Dallas' }]) };
  };
  const r = await geocode('Dallas', fakeFetch);
  assert.equal(r.source, 'nominatim');
});

test('geocode parses Nominatim lat/lon to numbers', async () => {
  const fakeFetch = async (url) =>
    url.includes('census')
      ? { ok: true, json: async () => ({ result: { addressMatches: [] } }) }
      : { ok: true, json: async () => ([{ lat: '40.7128', lon: '-74.0060', display_name: 'New York' }]) };
  const r = await geocode('New York', fakeFetch);
  assert.strictEqual(typeof r.lat, 'number');
  assert.strictEqual(typeof r.lon, 'number');
  assert.equal(r.lat, 40.7128);
});
