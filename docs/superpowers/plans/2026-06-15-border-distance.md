# Border Distance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static web tool where two US points are resolved to their containing state/county/place polygons and the distance between them is shown at four levels (point-to-point, city/place, county, state).

**Architecture:** Pure static site (vanilla ES-module JS) plus a one-time data-build script. Endpoints are points (from address geocoding or a draggable map pin). At query time each point is resolved by point-in-polygon to its containing units; distances are computed locally with Turf.js. Boundary data ships as simplified TopoJSON: states + counties upfront, places lazily per state.

**Tech Stack:** Vanilla JS (ES modules), Leaflet (map), Turf.js (geometry), topojson-client (TopoJSON→GeoJSON), mapshaper (build-time simplification), Node's built-in test runner (`node --test`), Census cartographic boundary files. Browser loads libs via an import map (CDN ESM); Node tests resolve the same bare specifiers from `node_modules`.

---

## File Structure

- `package.json` — scripts + dev deps (`@turf/turf`, `topojson-client`, `mapshaper`).
- `index.html` — single page: import map, Leaflet CSS, two endpoint cards, level selector, results panel, map container.
- `js/distance.js` — pure geometry: `pointToPoint`, `polygonDistance`.
- `js/resolve.js` — pure resolution: `findContaining`, `resolvePoint`.
- `js/geocode.js` — address → point (Census primary, Nominatim fallback); `fetch` injectable for tests.
- `js/dataLoader.js` — fetch + cache TopoJSON, convert to GeoJSON; `fetch` injectable for tests.
- `js/map.js` — Leaflet wiring (browser only).
- `js/app.js` — orchestration + rendering (browser only).
- `build/prepare-data.sh` — download Census files, simplify, emit TopoJSON into `data/`.
- `data/states.topo.json`, `data/counties.topo.json`, `data/places/<STATEFIPS>.topo.json` — generated.
- `tests/*.test.js` — Node tests for the pure/injectable modules.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `js/.gitkeep`, `tests/.gitkeep`
- Create: `index.html`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "border-distance",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test",
    "serve": "python3 -m http.server 8000",
    "build:data": "bash build/prepare-data.sh"
  },
  "devDependencies": {
    "@turf/turf": "^7.1.0",
    "topojson-client": "^3.1.0",
    "mapshaper": "^0.6.95"
  }
}
```

- [ ] **Step 2: Install dev dependencies**

Run: `cd ~/border-distance && npm install`
Expected: `node_modules/` created; `@turf/turf`, `topojson-client`, `mapshaper` present. (`npm install` also writes `package-lock.json`.)

- [ ] **Step 3: Create placeholder dirs**

Run: `mkdir -p js tests data/places && touch js/.gitkeep tests/.gitkeep`
Expected: directories exist.

- [ ] **Step 4: Write `index.html` skeleton with import map**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Border Distance</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css" />
  <script type="importmap">
  {
    "imports": {
      "@turf/turf": "https://cdn.jsdelivr.net/npm/@turf/turf@7.1.0/+esm",
      "topojson-client": "https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/+esm",
      "leaflet": "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/+esm"
    }
  }
  </script>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; display: grid; grid-template-columns: 360px 1fr; height: 100vh; }
    #panel { padding: 16px; overflow: auto; border-right: 1px solid #ddd; }
    #map { height: 100vh; }
    .card { border: 1px solid #ddd; border-radius: 8px; padding: 12px; margin-bottom: 12px; }
    .card.active { border-color: #2563eb; box-shadow: 0 0 0 2px #2563eb22; }
    input[type=text] { width: 100%; box-sizing: border-box; padding: 6px; }
    button { padding: 6px 10px; cursor: pointer; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    td, th { text-align: left; padding: 6px 4px; border-bottom: 1px solid #eee; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .muted { color: #888; }
  </style>
</head>
<body>
  <div id="panel">
    <h2>Border Distance</h2>
    <p class="muted">Set two points by address or by clicking the map. See how the distance changes by administrative level.</p>

    <div class="card" id="cardA">
      <strong>Point A</strong>
      <div style="display:flex; gap:6px; margin-top:6px;">
        <input type="text" id="addrA" placeholder="Address or place, e.g. Dallas, TX" />
        <button id="geoA">Find</button>
      </div>
      <button id="pinA" style="margin-top:6px;">Set on map</button>
      <div class="muted" id="labelA"></div>
    </div>

    <div class="card" id="cardB">
      <strong>Point B</strong>
      <div style="display:flex; gap:6px; margin-top:6px;">
        <input type="text" id="addrB" placeholder="Address or place" />
        <button id="geoB">Find</button>
      </div>
      <button id="pinB" style="margin-top:6px;">Set on map</button>
      <div class="muted" id="labelB"></div>
    </div>

    <div style="margin:8px 0;">
      <label>Show borders for:
        <select id="level">
          <option value="state">State</option>
          <option value="county" selected>County</option>
          <option value="place">City / Place</option>
        </select>
      </label>
      <label style="margin-left:10px;">Units:
        <select id="units">
          <option value="miles" selected>Miles</option>
          <option value="km">Kilometers</option>
        </select>
      </label>
    </div>

    <table id="results"><tbody></tbody></table>
    <div id="status" class="muted"></div>
  </div>
  <div id="map"></div>

  <script type="module" src="./js/app.js"></script>
</body>
</html>
```

- [ ] **Step 5: Verify the test runner works (no tests yet)**

Run: `cd ~/border-distance && npm test`
Expected: exits 0 with "tests 0" (no test files found is not an error for `node --test`).

- [ ] **Step 6: Commit**

```bash
cd ~/border-distance
git add package.json package-lock.json index.html js/.gitkeep tests/.gitkeep
git commit -m "scaffold: package.json, import-map index.html, dirs"
```

---

### Task 2: `distance.js` — point-to-point

**Files:**
- Create: `js/distance.js`
- Test: `tests/distance.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/distance.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pointToPoint } from '../js/distance.js';

test('pointToPoint ~30 miles for McKinney↔Dallas centers', () => {
  const r = pointToPoint({ lat: 33.1972, lon: -96.6398 }, { lat: 32.7767, lon: -96.7970 });
  assert.ok(r.miles > 28 && r.miles < 34, `miles=${r.miles}`);
  assert.ok(r.km > 45 && r.km < 55, `km=${r.km}`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/border-distance && node --test tests/distance.test.js`
Expected: FAIL — cannot resolve `../js/distance.js` / `pointToPoint` not exported.

- [ ] **Step 3: Write minimal implementation**

```js
// js/distance.js
import * as turf from '@turf/turf';

const KM_PER_MILE = 1.609344;

export function pointToPoint(a, b) {
  const km = turf.distance(turf.point([a.lon, a.lat]), turf.point([b.lon, b.lat]), { units: 'kilometers' });
  return { km, miles: km / KM_PER_MILE };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/border-distance && node --test tests/distance.test.js`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
cd ~/border-distance
git add js/distance.js tests/distance.test.js
git commit -m "feat: pointToPoint great-circle distance"
```

---

### Task 3: `distance.js` — polygon-to-polygon

**Files:**
- Modify: `js/distance.js`
- Modify: `tests/distance.test.js`

- [ ] **Step 1: Add failing tests**

Append to `tests/distance.test.js`:

```js
import * as turf from '@turf/turf';
import { polygonDistance } from '../js/distance.js';

const square = (x0, y0) => turf.polygon([[[x0, y0], [x0 + 1, y0], [x0 + 1, y0 + 1], [x0, y0 + 1], [x0, y0]]]);

test('polygonDistance is 0 for edge-touching polygons', () => {
  const r = polygonDistance(square(0, 0), square(1, 0));
  assert.equal(r.miles, 0);
  assert.equal(r.km, 0);
});

test('polygonDistance is 0 for overlapping polygons', () => {
  const r = polygonDistance(square(0, 0), square(0.5, 0));
  assert.equal(r.miles, 0);
});

test('polygonDistance positive for separated polygons + returns nearestPair', () => {
  const r = polygonDistance(square(0, 0), square(3, 0)); // ~2° lon gap near equator ≈ 138 mi
  assert.ok(r.miles > 110 && r.miles < 160, `miles=${r.miles}`);
  assert.ok(Array.isArray(r.nearestPair) && r.nearestPair.length === 2, 'nearestPair');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd ~/border-distance && node --test tests/distance.test.js`
Expected: FAIL — `polygonDistance` not exported.

- [ ] **Step 3: Implement `polygonDistance`**

Append to `js/distance.js`:

```js
function lineFeatures(polyToLineResult) {
  return polyToLineResult.type === 'FeatureCollection' ? polyToLineResult.features : [polyToLineResult];
}

export function polygonDistance(a, b) {
  if (turf.booleanIntersects(a, b)) {
    return { km: 0, miles: 0, nearestPair: null };
  }
  const aLines = lineFeatures(turf.polygonToLine(a));
  const bLines = lineFeatures(turf.polygonToLine(b));
  let bestKm = Infinity;
  let bestPair = null;

  const scan = (srcLines, dstLines) => {
    for (const src of srcLines) {
      for (const coord of turf.coordAll(src)) {
        const pt = turf.point(coord);
        for (const dst of dstLines) {
          const snapped = turf.nearestPointOnLine(dst, pt, { units: 'kilometers' });
          if (snapped.properties.dist < bestKm) {
            bestKm = snapped.properties.dist;
            bestPair = [coord, snapped.geometry.coordinates];
          }
        }
      }
    }
  };

  scan(aLines, bLines);
  scan(bLines, aLines);
  return { km: bestKm, miles: bestKm / KM_PER_MILE, nearestPair: bestPair };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd ~/border-distance && node --test tests/distance.test.js`
Expected: PASS (4 tests total).

- [ ] **Step 5: Commit**

```bash
cd ~/border-distance
git add js/distance.js tests/distance.test.js
git commit -m "feat: polygonDistance (0 if touching, else min boundary distance)"
```

---

### Task 4: `resolve.js` — point-in-polygon resolution

**Files:**
- Create: `js/resolve.js`
- Test: `tests/resolve.test.js`

- [ ] **Step 1: Write failing tests**

```js
// tests/resolve.test.js
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
```

- [ ] **Step 2: Run to verify failure**

Run: `cd ~/border-distance && node --test tests/resolve.test.js`
Expected: FAIL — module/exports missing.

- [ ] **Step 3: Implement `resolve.js`**

```js
// js/resolve.js
import * as turf from '@turf/turf';

export function findContaining(point, features) {
  const pt = turf.point([point.lon, point.lat]);
  for (const f of features) {
    if (turf.booleanPointInPolygon(pt, f)) return f;
  }
  return null;
}

export async function resolvePoint(point, loader) {
  const states = await loader.getStates();
  const state = findContaining(point, states.features);
  if (!state) return { outsideUS: true, state: null, county: null, place: null };

  const counties = await loader.getCounties();
  const county = findContaining(point, counties.features);

  const stateFips = state.properties.STATEFP;
  const places = await loader.getPlaces(stateFips);
  const place = findContaining(point, places.features);

  return { outsideUS: false, state, county, place };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd ~/border-distance && node --test tests/resolve.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd ~/border-distance
git add js/resolve.js tests/resolve.test.js
git commit -m "feat: resolve point to state/county/place via point-in-polygon"
```

---

### Task 5: `geocode.js` — address → point

**Files:**
- Create: `js/geocode.js`
- Test: `tests/geocode.test.js`

- [ ] **Step 1: Write failing tests**

```js
// tests/geocode.test.js
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
```

- [ ] **Step 2: Run to verify failure**

Run: `cd ~/border-distance && node --test tests/geocode.test.js`
Expected: FAIL — module/exports missing.

- [ ] **Step 3: Implement `geocode.js`**

```js
// js/geocode.js
const defaultFetch = (...args) => fetch(...args);

export async function geocode(address, fetchImpl = defaultFetch) {
  const q = encodeURIComponent(address);

  // Primary: US Census Geocoder (no API key).
  try {
    const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${q}&benchmark=Public_AR_Current&format=json`;
    const res = await fetchImpl(url);
    if (res.ok) {
      const data = await res.json();
      const m = data?.result?.addressMatches?.[0];
      if (m) return { lat: m.coordinates.y, lon: m.coordinates.x, matchedLabel: m.matchedAddress, source: 'census' };
    }
  } catch {
    // fall through to Nominatim (covers CORS/network failures)
  }

  // Fallback: Nominatim (OSM).
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q=${q}`;
  const res = await fetchImpl(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Geocoding failed: ${res.status}`);
  const arr = await res.json();
  if (!arr.length) return null;
  return { lat: parseFloat(arr[0].lat), lon: parseFloat(arr[0].lon), matchedLabel: arr[0].display_name, source: 'nominatim' };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd ~/border-distance && node --test tests/geocode.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd ~/border-distance
git add js/geocode.js tests/geocode.test.js
git commit -m "feat: geocode address via Census with Nominatim fallback"
```

---

### Task 6: `dataLoader.js` — TopoJSON fetch + cache

**Files:**
- Create: `js/dataLoader.js`
- Test: `tests/dataLoader.test.js`

- [ ] **Step 1: Write failing tests**

```js
// tests/dataLoader.test.js
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
```

- [ ] **Step 2: Run to verify failure**

Run: `cd ~/border-distance && node --test tests/dataLoader.test.js`
Expected: FAIL — module/exports missing.

- [ ] **Step 3: Implement `dataLoader.js`**

```js
// js/dataLoader.js
import { feature } from 'topojson-client';

const defaultFetch = (...args) => fetch(...args);

export function createLoader(base = './data', fetchImpl = defaultFetch) {
  const cache = new Map();

  async function loadTopo(path) {
    if (cache.has(path)) return cache.get(path);
    const res = await fetchImpl(path);
    if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
    const topo = await res.json();
    const objName = Object.keys(topo.objects)[0];
    const geo = feature(topo, topo.objects[objName]);
    cache.set(path, geo);
    return geo;
  }

  return {
    getStates: () => loadTopo(`${base}/states.topo.json`),
    getCounties: () => loadTopo(`${base}/counties.topo.json`),
    getPlaces: (stateFips) => loadTopo(`${base}/places/${stateFips}.topo.json`),
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd ~/border-distance && node --test tests/dataLoader.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the whole suite**

Run: `cd ~/border-distance && npm test`
Expected: PASS — distance (4), resolve (5), geocode (3), dataLoader (3).

- [ ] **Step 6: Commit**

```bash
cd ~/border-distance
git add js/dataLoader.js tests/dataLoader.test.js
git commit -m "feat: dataLoader fetches + caches TopoJSON as GeoJSON"
```

---

### Task 7: Data build script + Texas spot-check

**Files:**
- Create: `build/prepare-data.sh`

This task also resolves both spec risks: the Texas place file size, and (later, in Task 9) Census Geocoder CORS in-browser. If the GENZ2023 vintage is missing at build time, change `YEAR` to the latest year present at `https://www2.census.gov/geo/tiger/`.

- [ ] **Step 1: Write `build/prepare-data.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

YEAR=2023
TMP=data/tmp
BASE="https://www2.census.gov/geo/tiger/GENZ${YEAR}/shp"
MS="npx -y mapshaper"
SIMPLIFY="6%"
PRECISION="0.0001"

mkdir -p data/places "$TMP"

fetch_unzip() { # url destdir
  local url="$1" dest="$2"
  local zip="$TMP/$(basename "$url")"
  [ -f "$zip" ] || curl -fSL "$url" -o "$zip"
  mkdir -p "$dest"
  unzip -o -q "$zip" -d "$dest"
}

# States (upfront layer)
fetch_unzip "$BASE/cb_${YEAR}_us_state_500k.zip" "$TMP/state"
$MS "$TMP/state/cb_${YEAR}_us_state_500k.shp" \
  -filter-fields STATEFP,STUSPS,NAME \
  -simplify "$SIMPLIFY" keep-shapes \
  -o format=topojson precision="$PRECISION" data/states.topo.json

# Counties (upfront layer)
fetch_unzip "$BASE/cb_${YEAR}_us_county_500k.zip" "$TMP/county"
$MS "$TMP/county/cb_${YEAR}_us_county_500k.shp" \
  -filter-fields STATEFP,COUNTYFP,NAME,NAMELSAD \
  -simplify "$SIMPLIFY" keep-shapes \
  -o format=topojson precision="$PRECISION" data/counties.topo.json

# Places (per state, lazy layer). Pass FIPS args to limit (e.g. `48` for TX), else all 50 + DC.
STATES="${*:-01 02 04 05 06 08 09 10 11 12 13 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 41 42 44 45 46 47 48 49 50 51 53 54 55 56}"
for fips in $STATES; do
  url="$BASE/cb_${YEAR}_${fips}_place_500k.zip"
  if ! fetch_unzip "$url" "$TMP/place_$fips"; then
    echo "WARN: no place file for FIPS $fips, skipping"
    continue
  fi
  $MS "$TMP/place_$fips/cb_${YEAR}_${fips}_place_500k.shp" \
    -filter-fields STATEFP,PLACEFP,NAME,NAMELSAD \
    -simplify "$SIMPLIFY" keep-shapes \
    -o format=topojson precision="$PRECISION" "data/places/${fips}.topo.json"
  echo "built data/places/${fips}.topo.json"
done

echo "done"
```

- [ ] **Step 2: Make it executable**

Run: `cd ~/border-distance && chmod +x build/prepare-data.sh`
Expected: no output.

- [ ] **Step 3: Build states, counties, and Texas places only (spot-check)**

Run: `cd ~/border-distance && bash build/prepare-data.sh 48`
Expected: creates `data/states.topo.json`, `data/counties.topo.json`, `data/places/48.topo.json`; prints "built data/places/48.topo.json" then "done".

- [ ] **Step 4: Verify file sizes are reasonable**

Run: `cd ~/border-distance && ls -lh data/states.topo.json data/counties.topo.json data/places/48.topo.json`
Expected: states well under ~1 MB, counties roughly 1–3 MB, Texas places roughly 0.3–2 MB. If a file is much larger, raise `SIMPLIFY` (e.g. `10%`) in the script and rebuild. (This is the spec's data-size risk check — passing means per-state lazy loading is viable.)

- [ ] **Step 5: Sanity-check the resolver against real Texas data**

Run:
```bash
cd ~/border-distance && node --input-type=module -e '
import { readFile } from "node:fs/promises";
import { feature } from "topojson-client";
import { findContaining } from "./js/resolve.js";
const load = async p => { const t = JSON.parse(await readFile(p)); return feature(t, t.objects[Object.keys(t.objects)[0]]); };
const counties = await load("data/counties.topo.json");
// Point in the Collin-County portion of the City of Dallas (far north Dallas).
const c = findContaining({ lon: -96.7836, lat: 33.0357 }, counties.features);
console.log("county:", c && c.properties.NAME);
'
```
Expected: prints `county: Collin` (confirms point-based county resolution works on real data; the motivating Dallas/Collin case).

- [ ] **Step 6: Commit script + generated data**

```bash
cd ~/border-distance
git add build/prepare-data.sh data/states.topo.json data/counties.topo.json data/places/48.topo.json
git commit -m "build: data prep script + states/counties/TX-places spot-check"
```

Note: `data/tmp/` and `*.zip` are git-ignored (raw downloads stay out of the repo).

---

### Task 8: `map.js` — Leaflet rendering

**Files:**
- Create: `js/map.js`

Browser-only module; verified in-browser in Task 9.

- [ ] **Step 1: Write `js/map.js`**

```js
// js/map.js
import L from 'leaflet';

let map;
let pins = { A: null, B: null };
let overlay = L.layerGroup();

export function initMap(elId, onPick) {
  map = L.map(elId).setView([39.5, -98.35], 4); // continental US
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap',
  }).addTo(map);
  overlay.addTo(map);
  map.on('click', (e) => onPick({ lat: e.latlng.lat, lon: e.latlng.lng }));
  return map;
}

export function setPin(key, point) {
  if (pins[key]) map.removeLayer(pins[key]);
  pins[key] = L.marker([point.lat, point.lon], { draggable: true }).addTo(map).bindTooltip(`Point ${key}`);
  return pins[key];
}

export function panTo(point) {
  map.setView([point.lat, point.lon], Math.max(map.getZoom(), 9));
}

export function onPinDrag(key, handler) {
  if (pins[key]) pins[key].on('dragend', (e) => {
    const ll = e.target.getLatLng();
    handler({ lat: ll.lat, lon: ll.lng });
  });
}

export function clearOverlays() {
  overlay.clearLayers();
}

export function drawLevel(featA, featB, nearestPair) {
  overlay.clearLayers();
  const style = (color) => ({ color, weight: 2, fillOpacity: 0.1 });
  if (featA) L.geoJSON(featA, { style: style('#2563eb') }).addTo(overlay);
  if (featB) L.geoJSON(featB, { style: style('#dc2626') }).addTo(overlay);
  if (nearestPair) {
    const [a, b] = nearestPair; // [lon,lat] pairs
    L.polyline([[a[1], a[0]], [b[1], b[0]]], { color: '#16a34a', dashArray: '6 4', weight: 3 }).addTo(overlay);
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd ~/border-distance
git add js/map.js
git commit -m "feat: Leaflet map module (pins, pan, level overlays, shortest line)"
```

---

### Task 9: `app.js` — orchestration, rendering, in-browser verification

**Files:**
- Create: `js/app.js`

- [ ] **Step 1: Write `js/app.js`**

```js
// js/app.js
import { createLoader } from './dataLoader.js';
import { resolvePoint } from './resolve.js';
import { pointToPoint, polygonDistance } from './distance.js';
import { geocode } from './geocode.js';
import { initMap, setPin, panTo, onPinDrag, drawLevel, clearOverlays } from './map.js';

const loader = createLoader('./data');
const state = { A: null, B: null, active: 'A', level: 'county', units: 'miles' };

const $ = (id) => document.getElementById(id);
const setStatus = (msg) => { $('status').textContent = msg || ''; };

function fmt(d, available, note) {
  if (!available) return `<span class="muted">${note || 'n/a'}</span>`;
  const v = state.units === 'miles' ? d.miles : d.km;
  const u = state.units === 'miles' ? 'mi' : 'km';
  return `${v.toFixed(1)} ${u}`;
}

function setActiveCard() {
  $('cardA').classList.toggle('active', state.active === 'A');
  $('cardB').classList.toggle('active', state.active === 'B');
}

async function setEndpoint(key, point, label) {
  setStatus(`Resolving point ${key}…`);
  try {
    const resolved = await resolvePoint(point, loader);
    state[key] = { point, resolved, label };
    setPin(key, point);
    onPinDrag(key, (p) => setEndpoint(key, p, `dragged pin (${p.lat.toFixed(4)}, ${p.lon.toFixed(4)})`));
    panTo(point);
    renderLabel(key);
    render();
  } catch (e) {
    setStatus(`Could not resolve point ${key}: ${e.message}`);
  }
}

function renderLabel(key) {
  const s = state[key];
  if (!s) return;
  const r = s.resolved;
  const parts = r.outsideUS
    ? ['Outside the US']
    : [r.place ? r.place.properties.NAME : 'unincorporated', r.county?.properties.NAME, r.state?.properties.NAME].filter(Boolean);
  $(`label${key}`).textContent = `${s.label} → ${parts.join(', ')}`;
}

function render() {
  const A = state.A, B = state.B;
  const rows = [];
  if (A && B && !A.resolved.outsideUS && !B.resolved.outsideUS) {
    const p2p = pointToPoint(A.point, B.point);
    rows.push(['Point-to-point', fmt(p2p, true)]);

    const placeOK = A.resolved.place && B.resolved.place;
    rows.push(['City / Place', placeOK
      ? fmt(polygonDistance(A.resolved.place, B.resolved.place), true)
      : fmt(null, false, 'n/a (outside any incorporated place)')]);

    rows.push(['County', fmt(polygonDistance(A.resolved.county, B.resolved.county), true)]);
    rows.push(['State', fmt(polygonDistance(A.resolved.state, B.resolved.state), true)]);
  }
  $('results').querySelector('tbody').innerHTML = rows.length
    ? rows.map(([k, v]) => `<tr><td>${k}</td><td class="num">${v}</td></tr>`).join('')
    : '<tr><td class="muted">Set both points to see distances.</td></tr>';

  drawForLevel();
  if (A && B) setStatus('');
}

function featAtLevel(s) {
  if (!s || s.resolved.outsideUS) return null;
  return { state: s.resolved.state, county: s.resolved.county, place: s.resolved.place }[state.level];
}

function drawForLevel() {
  const A = state.A, B = state.B;
  if (!A || !B) { clearOverlays(); return; }
  const fa = featAtLevel(A), fb = featAtLevel(B);
  let nearest = null;
  if (fa && fb) {
    const d = polygonDistance(fa, fb);
    nearest = d.nearestPair;
  }
  drawLevel(fa, fb, nearest);
}

async function handleGeocode(key) {
  const addr = $(`addr${key}`).value.trim();
  if (!addr) return;
  setStatus(`Looking up "${addr}"…`);
  try {
    const hit = await geocode(addr);
    if (!hit) { setStatus(`No match for "${addr}". Try "Set on map" instead.`); return; }
    await setEndpoint(key, { lat: hit.lat, lon: hit.lon }, hit.matchedLabel);
  } catch (e) {
    setStatus(`Geocoding failed: ${e.message}. Try "Set on map" instead.`);
  }
}

function init() {
  initMap('map', (point) => setEndpoint(state.active, point, `map pin (${point.lat.toFixed(4)}, ${point.lon.toFixed(4)})`));
  $('geoA').onclick = () => handleGeocode('A');
  $('geoB').onclick = () => handleGeocode('B');
  $('addrA').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleGeocode('A'); });
  $('addrB').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleGeocode('B'); });
  $('pinA').onclick = () => { state.active = 'A'; setActiveCard(); setStatus('Click the map to set Point A.'); };
  $('pinB').onclick = () => { state.active = 'B'; setActiveCard(); setStatus('Click the map to set Point B.'); };
  $('level').onchange = (e) => { state.level = e.target.value; drawForLevel(); };
  $('units').onchange = (e) => { state.units = e.target.value; render(); };
  setActiveCard();
  render();
}

init();
```

- [ ] **Step 2: Serve the site**

Run: `cd ~/border-distance && python3 -m http.server 8000`
(Leave running; open a second terminal for any further commands. Stop with Ctrl-C when done.)

- [ ] **Step 3: Verify in a browser**

Open `http://localhost:8000/`. Confirm:
- Map renders (US view), no console errors.
- Type `McKinney, TX` in Point A → Find; type `Dallas, TX` in Point B → Find. Pins drop; labels show resolved place/county/state.
- Results table shows Point-to-point ≈ 25–35 mi, and **County = 0.0 mi** (McKinney/Collin borders Dallas/Dallas... verify: McKinney is Collin Co., Dallas is Dallas Co., which are adjacent → 0).
- Switch "Show borders for" to County → the two county polygons and (if separated) a dashed shortest line draw.
- Toggle Units → values switch to km.
- Click "Set on map" under Point B, click a spot in Tarrant County (Fort Worth area) → County distance becomes > 0.

If the Census geocoder is CORS-blocked, the label `source` path falls back to Nominatim automatically; geocoding should still succeed. If both fail, "Set on map" must still work (this is the CORS risk check).

- [ ] **Step 4: Commit**

```bash
cd ~/border-distance
git add js/app.js
git commit -m "feat: app orchestration, results rendering, map wiring"
```

---

### Task 10: Full data build, README, deploy notes

**Files:**
- Create: `README.md`
- Generate: `data/places/*.topo.json` (all states)

- [ ] **Step 1: Build all states' place files**

Run: `cd ~/border-distance && bash build/prepare-data.sh`
Expected: builds place files for all 50 states + DC into `data/places/`; warns and skips any FIPS without a Census file.

- [ ] **Step 2: Check total data size**

Run: `cd ~/border-distance && du -sh data && ls data/places | wc -l`
Expected: `data/` total comfortably under a few hundred MB; ~51 place files. (If too large for GitHub Pages comfort, raise `SIMPLIFY` and rebuild.)

- [ ] **Step 3: Re-run resolver sanity over a second state**

Run:
```bash
cd ~/border-distance && node --input-type=module -e '
import { readFile } from "node:fs/promises";
import { feature } from "topojson-client";
import { findContaining } from "./js/resolve.js";
const load = async p => { const t = JSON.parse(await readFile(p)); return feature(t, t.objects[Object.keys(t.objects)[0]]); };
const places = await load("data/places/06.topo.json"); // California
const p = findContaining({ lon: -122.4194, lat: 37.7749 }, places.features); // San Francisco
console.log("place:", p && p.properties.NAME);
'
```
Expected: prints `place: San Francisco`.

- [ ] **Step 4: Write `README.md`**

```markdown
# Border Distance

A static web tool. Pick two US points (by address or by clicking the map) and
see the distance between them at four administrative levels: straight-line
(point-to-point), city/place boundary, county boundary, and state boundary.
Each point is resolved to the *specific* polygons that contain it, so a point in
the Collin-County part of Dallas is treated as Collin County — not Dallas County.

## Run locally

    npm install        # dev deps (Turf, topojson-client, mapshaper) for tests + data build
    npm run serve      # serves at http://localhost:8000

The page itself needs no build step or backend; it loads Turf/Leaflet/topojson
from a CDN via an import map.

## Rebuild the boundary data

    npm run build:data         # all states (downloads from US Census, simplifies via mapshaper)
    bash build/prepare-data.sh 48   # just one state (FIPS 48 = Texas)

Outputs simplified TopoJSON to `data/`. Requires `curl`, `unzip`, and Node (npx).

## Tests

    npm test    # node --test over the pure modules (distance, resolve, geocode, dataLoader)

## Deploy

Static — push to a GitHub Pages branch/repo and serve the root. All of
`index.html`, `js/`, and `data/` must be published together.

## Data source

US Census Bureau cartographic boundary files (GENZ vintage), 1:500k.
Geocoding: US Census Geocoder, with Nominatim (OpenStreetMap) as a fallback.
```

- [ ] **Step 5: Run full suite once more**

Run: `cd ~/border-distance && npm test`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
cd ~/border-distance
git add README.md data/places data/states.topo.json data/counties.topo.json
git commit -m "build: full US place data + README and deploy notes"
```

---

## Self-Review Notes

- **Spec coverage:** point-based resolution (Tasks 4, 9), four distance levels (Tasks 2/3 + app render in 9), address + pin input (Tasks 5, 8, 9), lazy per-state places (Tasks 6, 7), static deploy (Tasks 1, 10), all edge cases (outside-US, unincorporated, same point, geocode failure) handled in `resolve.js`/`app.js` and exercised in Task 9 verification. Both spec risks checked: data size (Task 7 Step 4), Geocoder CORS (Task 9 Step 3, with Nominatim + pin fallback).
- **Naming consistency:** `findContaining`, `resolvePoint`, `pointToPoint`, `polygonDistance`, `createLoader`/`getStates`/`getCounties`/`getPlaces`, `geocode`, map exports `initMap`/`setPin`/`panTo`/`onPinDrag`/`drawLevel`/`clearOverlays` — used identically across tasks and `app.js`.
- **No placeholders:** every code step contains full code; every run step states expected output.
```
