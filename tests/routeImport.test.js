import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectFormat, parseRoute } from '../js/routeImport.js';

test('detectFormat by extension and by content sniff', () => {
  assert.equal(detectFormat('a.gpx', ''), 'gpx');
  assert.equal(detectFormat('a.kml', ''), 'kml');
  assert.equal(detectFormat('a.geojson', ''), 'geojson');
  assert.equal(detectFormat('a.json', ''), 'geojson');
  assert.equal(detectFormat('', '<gpx version="1.1">'), 'gpx');
  assert.equal(detectFormat('', '<kml xmlns="...">'), 'kml');
  assert.equal(detectFormat('', '{"type":"Feature"}'), 'geojson');
  assert.equal(detectFormat('', '_p~iF~ps|U'), 'polyline');
});

test('geojson Feature LineString → coords + distance', () => {
  const text = JSON.stringify({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [0, 1]] } });
  const r = parseRoute(text, 'geojson');
  assert.equal(r.geometry.type, 'LineString');
  assert.equal(r.geometry.coordinates.length, 2);
  assert.ok(r.distanceKm > 110 && r.distanceKm < 112, `km=${r.distanceKm}`);
});

test('geojson FeatureCollection and bare geometry both work', () => {
  const fc = JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 0]] } }] });
  assert.equal(parseRoute(fc, 'geojson').geometry.coordinates.length, 2);
  const bare = JSON.stringify({ type: 'LineString', coordinates: [[0, 0], [1, 0], [2, 0]] });
  assert.equal(parseRoute(bare, 'geojson').geometry.coordinates.length, 3);
});

test('gpx concatenates trkpt across segments; rtept fallback', () => {
  const gpx = `<gpx><trk><trkseg><trkpt lat="51.5" lon="-0.1"></trkpt><trkpt lat="51.6" lon="-0.2"></trkpt></trkseg><trkseg><trkpt lat="51.7" lon="-0.3"></trkpt></trkseg></trk></gpx>`;
  const r = parseRoute(gpx, 'gpx');
  assert.equal(r.geometry.coordinates.length, 3);
  assert.deepEqual(r.geometry.coordinates[0], [-0.1, 51.5]);
  const rte = `<gpx><rte><rtept lat="40.0" lon="-70.0"/><rtept lat="41.0" lon="-71.0"/></rte></gpx>`;
  assert.equal(parseRoute(rte, 'gpx').geometry.coordinates.length, 2);
});

test('kml LineString coordinates', () => {
  const kml = `<kml><Placemark><LineString><coordinates>-0.1,51.5,0 -0.2,51.6,0 -0.3,51.7,0</coordinates></LineString></Placemark></kml>`;
  const r = parseRoute(kml, 'kml');
  assert.equal(r.geometry.coordinates.length, 3);
  assert.deepEqual(r.geometry.coordinates[1], [-0.2, 51.6]);
});

test('encoded polyline decodes to known coordinates', () => {
  const r = parseRoute('_p~iF~ps|U_ulLnnqC_mqNvxq`@', 'polyline');
  const c = r.geometry.coordinates;
  assert.equal(c.length, 3);
  assert.ok(Math.abs(c[0][0] - -120.2) < 0.001 && Math.abs(c[0][1] - 38.5) < 0.001, JSON.stringify(c[0]));
  assert.ok(Math.abs(c[2][0] - -126.453) < 0.001 && Math.abs(c[2][1] - 43.252) < 0.001, JSON.stringify(c[2]));
});

test('invalid / empty / single-point inputs throw', () => {
  assert.throws(() => parseRoute('', 'geojson'), /empty/i);
  assert.throws(() => parseRoute(JSON.stringify({ type: 'LineString', coordinates: [[0, 0]] }), 'geojson'), /at least 2/i);
  assert.throws(() => parseRoute('<gpx></gpx>', 'gpx'), /at least 2/i);
});
