# Urban-Area Coverage Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalize the US-only tool to a region model (US full-country + curated urban areas), add the London urban area via an OSM/Overpass pipeline, and add an optional distance threshold with OSRM-alternative route optimization.

**Architecture:** A `regions.js` registry describes each region's ordered levels and data files. `resolve.js`/`dataLoader.js` become region-aware (`detectRegion` + per-region `getLevel`). London is fetched from OSM (Greater London + England relations) via Overpass + osmtogeojson → simplified TopoJSON. `app.js` becomes region-aware, draws resolved units, and applies a threshold with a pure `chooseRoute` optimization helper. Existing `routing.js`/`routeBetween.js`/`map.js` are unchanged; US data stays at its current flat paths.

**Tech Stack:** Vanilla JS (ES modules), Turf.js, Leaflet, topojson-client, mapshaper, osmtogeojson, Overpass API, OSRM, Nominatim, Node's built-in test runner.

Implements `docs/superpowers/specs/2026-06-15-urban-area-foundation-design.md`. On branch `feature/urban-areas` (off `main`). Builds on the current live US-only code.

---

## File Structure

- `js/regions.js` — NEW. `REGIONS` registry (US + London) + `REGION_IDS`.
- `js/routeChoice.js` — NEW, pure. `chooseRoute(routes, betweenKms, thresholdKm)`.
- `js/dataLoader.js` — REWRITE. `getDetectLayers()` + `getLevel(regionId, levelKey, parentId?)`.
- `js/resolve.js` — REWRITE. `findContaining`, `detectRegion`, `resolvePoint` → `{region, outside, units}`.
- `js/geocode.js` — MODIFY. `countrycodes=us,gb`.
- `js/app.js` — REWRITE. Region-aware; threshold input + optimization; draws units.
- `index.html` — MODIFY. Threshold input, dynamic `#level`, disclaimer.
- `build/prepare-metro.sh` — NEW. Fetch one OSM relation → simplified TopoJSON.
- `data/metros/london/city.topo.json`, `region.topo.json` — generated.
- `README.md` — MODIFY. Region model, threshold, disclaimer.
- Tests: `tests/regions.test.js`, `tests/routeChoice.test.js`, rewritten `tests/resolve.test.js`, `tests/dataLoader.test.js`, updated `tests/geocode.test.js`.

US level files keep their existing flat paths (`states.topo.json`, `counties.topo.json`, `places/<STATEFP>.topo.json`). London files live under `metros/london/`.

---

### Task 1: `regions.js` — region registry

**Files:** Create `js/regions.js`, `tests/regions.test.js`

- [ ] **Step 1: Failing tests** — `tests/regions.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REGIONS, REGION_IDS } from '../js/regions.js';

test('US region has place/county/state, detectKey state', () => {
  assert.deepEqual(REGIONS.us.levels.map((l) => l.key), ['place', 'county', 'state']);
  assert.equal(REGIONS.us.detectKey, 'state');
  assert.equal(REGIONS.us.kind, 'us');
});

test('London region has city/region, detectKey city, relIds set', () => {
  assert.deepEqual(REGIONS.london.levels.map((l) => l.key), ['city', 'region']);
  assert.equal(REGIONS.london.detectKey, 'city');
  assert.equal(REGIONS.london.kind, 'urban');
  assert.equal(REGIONS.london.levels[0].relId, 175342);
  assert.equal(REGIONS.london.levels[1].relId, 58447);
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
```

- [ ] **Step 2: Run → fail.** `cd ~/border-distance && node --test tests/regions.test.js` → FAIL (missing module).

- [ ] **Step 3: Implement `js/regions.js`:**

```js
// Region registry. levels are ordered smallest -> largest. detectKey is the
// level whose polygon is used to detect the region (US: state; urban: city).
// US level files keep their existing flat paths; urban files live under metros/.
export const REGIONS = {
  us: {
    id: 'us', name: 'United States', kind: 'us', detectKey: 'state',
    levels: [
      { key: 'place', label: 'City / Place', file: { lazyDir: 'places', parent: 'state' } },
      { key: 'county', label: 'County', file: { path: 'counties.topo.json' } },
      { key: 'state', label: 'State', file: { path: 'states.topo.json' } },
    ],
  },
  london: {
    id: 'london', name: 'London', kind: 'urban', detectKey: 'city',
    levels: [
      { key: 'city', label: 'Greater London', relId: 175342, file: { path: 'metros/london/city.topo.json' } },
      { key: 'region', label: 'England', relId: 58447, file: { path: 'metros/london/region.topo.json' } },
    ],
  },
};

export const REGION_IDS = Object.keys(REGIONS);
```

- [ ] **Step 4: Run → pass** (3 tests). **Step 5: Commit** `feat: region registry (US + London)`.

---

### Task 2: `routeChoice.js` — threshold optimization rule

**Files:** Create `js/routeChoice.js`, `tests/routeChoice.test.js`

- [ ] **Step 1: Failing tests** — `tests/routeChoice.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseRoute } from '../js/routeChoice.js';

test('no threshold -> shortest (index 0)', () => {
  assert.equal(chooseRoute([{}, {}], [50, 40], null), 0);
});
test('shortest already under threshold -> 0', () => {
  assert.equal(chooseRoute([{}, {}], [30, 45], 40), 0);
});
test('overshoot beyond 10% -> keep shortest (0)', () => {
  assert.equal(chooseRoute([{}, {}], [60, 38], 40), 0); // 60 > 44
});
test('within 10% window, an alternative qualifies -> that index', () => {
  assert.equal(chooseRoute([{}, {}, {}], [43, 50, 39], 40), 2); // 43 <= 44, alt 2 under 40
});
test('within window but no alternative qualifies -> 0', () => {
  assert.equal(chooseRoute([{}, {}], [43, 47], 40), 0);
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement `js/routeChoice.js`:**

```js
// Pick a route index given each route's selected-level between-distance (km).
// With a threshold: keep the shortest if it's already under, or if it overshoots
// by more than 10%; otherwise (within [t, t*1.10]) pick the first alternative
// whose between-distance is <= threshold, else keep the shortest.
export function chooseRoute(routes, betweenKms, thresholdKm) {
  if (thresholdKm == null) return 0;
  const shortest = betweenKms[0];
  if (shortest <= thresholdKm) return 0;
  if (shortest > thresholdKm * 1.10) return 0;
  for (let i = 0; i < betweenKms.length; i++) {
    if (betweenKms[i] <= thresholdKm) return i;
  }
  return 0;
}
```

- [ ] **Step 4: Run → pass** (5 tests). **Step 5: Commit** `feat: chooseRoute threshold optimization rule`.

---

### Task 3: London OSM pipeline (`prepare-metro.sh`)

**Files:** Create `build/prepare-metro.sh`; generate `data/metros/london/{city,region}.topo.json`; add `osmtogeojson` dev dep.

Risk task: prove the Overpass → osmtogeojson → mapshaper pipeline and that a London point resolves.

- [ ] **Step 1: Add the dev dependency**

Run: `cd ~/border-distance && npm install --save-dev osmtogeojson@3.0.0-beta.5`
Expected: installs; `package.json` devDependencies gains `osmtogeojson`.

- [ ] **Step 2: Write `build/prepare-metro.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
# Fetch one OSM administrative relation as a simplified TopoJSON polygon.
# usage: prepare-metro.sh <outdir> <levelKey> <relId>
OUTDIR="$1"; KEY="$2"; REL="$3"
TMP=data/tmp; mkdir -p "$OUTDIR" "$TMP"
OVERPASS="https://overpass-api.de/api/interpreter"
q="[out:json][timeout:120];relation(${REL});(._;>;);out body;"
curl -fsS -G "$OVERPASS" --data-urlencode "data=$q" -o "$TMP/${KEY}.osm.json"
npx -y osmtogeojson "$TMP/${KEY}.osm.json" > "$TMP/${KEY}.geojson"
npx -y mapshaper "$TMP/${KEY}.geojson" \
  -filter 'this.geometry && (this.geometry.type === "Polygon" || this.geometry.type === "MultiPolygon")' \
  -each 'NAME = (typeof name !== "undefined" && name) ? name : ""' \
  -filter-fields NAME \
  -simplify 8% keep-shapes \
  -o format=topojson quantization=1e5 "$OUTDIR/${KEY}.topo.json"
echo "wrote $OUTDIR/${KEY}.topo.json"
```

- [ ] **Step 3: Make executable and build London**

Run:
```bash
cd ~/border-distance && chmod +x build/prepare-metro.sh && \
bash build/prepare-metro.sh data/metros/london city 175342 && \
bash build/prepare-metro.sh data/metros/london region 58447
```
Expected: writes `data/metros/london/city.topo.json` and `region.topo.json`. If Overpass is busy (429/504), wait and retry, or switch `OVERPASS` to `https://overpass.kumi.systems/api/interpreter`. If a relation id is wrong (the output polygon doesn't cover London), report it.

- [ ] **Step 4: Verify sizes + WGS84 + resolution**

Run:
```bash
cd ~/border-distance && ls -lh data/metros/london/*.topo.json && node --input-type=module -e '
import { readFile } from "node:fs/promises";
import { feature } from "topojson-client";
import { findContaining } from "./js/resolve.js";
const load = async p => { const t = JSON.parse(await readFile(p)); return feature(t, t.objects[Object.keys(t.objects)[0]]); };
const city = await load("data/metros/london/city.topo.json");
const region = await load("data/metros/london/region.topo.json");
const p = { lon: -0.1276, lat: 51.5072 }; // central London
console.log("city contains central London?", !!findContaining(p, city.features), "->", findContaining(p, city.features)?.properties.NAME);
console.log("region contains central London?", !!findContaining(p, region.features), "->", findContaining(p, region.features)?.properties.NAME);
const northolt = { lon: -0.3657, lat: 51.5428 };
console.log("city contains Northolt?", !!findContaining(northolt, city.features));
'
```
Expected: city contains central London (NAME ≈ "Greater London") and Northolt; region contains central London (NAME ≈ "England"). Note: `js/resolve.js` is rewritten in Task 5 but still exports `findContaining`; if this runs before Task 5, use the current `findContaining` (same signature). Report sizes (each well under a few MB).

- [ ] **Step 5: Commit**

```bash
cd ~/border-distance
git add build/prepare-metro.sh data/metros/london package.json package-lock.json
git commit -m "build: London urban area + region via OSM/Overpass"
```

---

### Task 4: `dataLoader.js` — region/level-aware

**Files:** Rewrite `js/dataLoader.js`, `tests/dataLoader.test.js`

- [ ] **Step 1: Overwrite tests** — `tests/dataLoader.test.js`:

```js
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
  assert.ok(calls.includes('./data/metros/london/city.topo.json'));
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
```

- [ ] **Step 2: Run → fail** (old loader had getStates/etc.).

- [ ] **Step 3: Rewrite `js/dataLoader.js`:**

```js
import { feature } from 'topojson-client';
import { REGIONS, REGION_IDS } from './regions.js';

const defaultFetch = (...args) => fetch(...args);

function levelPath(base, regionId, levelKey, parentId) {
  const lvl = REGIONS[regionId].levels.find((l) => l.key === levelKey);
  const f = lvl.file;
  if (f.path) return `${base}/${f.path}`;
  return `${base}/${f.lazyDir}/${parentId}.topo.json`;
}

export function createLoader(base = './data', fetchImpl = defaultFetch) {
  const cache = new Map();

  async function loadTopo(path) {
    if (cache.has(path)) return cache.get(path);
    const res = await fetchImpl(path);
    if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
    const topo = await res.json();
    const objName = Object.keys(topo.objects)[0];
    if (!objName) throw new Error(`No objects in TopoJSON at ${path}`);
    const geo = feature(topo, topo.objects[objName]);
    cache.set(path, geo);
    return geo;
  }

  return {
    getLevel: (regionId, levelKey, parentId) => loadTopo(levelPath(base, regionId, levelKey, parentId)),
    async getDetectLayers() {
      const out = {};
      for (const id of REGION_IDS) {
        out[id] = await loadTopo(levelPath(base, id, REGIONS[id].detectKey));
      }
      return out;
    },
  };
}
```

- [ ] **Step 4: Run → pass** (4 tests). **Step 5: Commit** `feat: region/level-aware dataLoader`.

---

### Task 5: `resolve.js` — region detection + resolution

**Files:** Rewrite `js/resolve.js`, `tests/resolve.test.js`

- [ ] **Step 1: Overwrite tests** — `tests/resolve.test.js`:

```js
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
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Rewrite `js/resolve.js`:**

```js
import * as turf from '@turf/turf';
import { REGIONS, REGION_IDS } from './regions.js';

export function findContaining(point, features) {
  const pt = turf.point([point.lon, point.lat]);
  for (const f of features) {
    if (turf.booleanPointInPolygon(pt, f)) return f;
  }
  return null;
}

export async function detectRegion(point, loader) {
  const layers = await loader.getDetectLayers();
  for (const id of REGION_IDS) {
    if (findContaining(point, layers[id].features)) return id;
  }
  return null;
}

/**
 * Resolve a {lat, lon} point to a region and its admin units.
 * Returns { region, outside, units } where units maps the region's level keys
 * to a feature or null.
 */
export async function resolvePoint(point, loader) {
  const region = await detectRegion(point, loader);
  if (!region) return { region: null, outside: true, units: {} };

  const cfg = REGIONS[region];
  const layers = await loader.getDetectLayers();
  const detectFeat = findContaining(point, layers[region].features);
  // US place files are keyed by state FIPS; urban levels are fixed-path.
  const parentId = region === 'us' ? detectFeat.properties.STATEFP : null;

  const units = {};
  for (const lvl of cfg.levels) {
    if (lvl.key === cfg.detectKey) { units[lvl.key] = detectFeat; continue; }
    const fc = await loader.getLevel(region, lvl.key, parentId);
    units[lvl.key] = findContaining(point, fc.features);
  }
  return { region, outside: false, units };
}
```

- [ ] **Step 4: Run → pass** (5 tests). **Step 5: Commit** `feat: region-aware resolvePoint + detectRegion`.

---

### Task 6: `geocode.js` — widen to US + UK

**Files:** Modify `js/geocode.js`, `tests/geocode.test.js`

- [ ] **Step 1:** In `tests/geocode.test.js`, change the URL assertion to:
`assert.match(calledUrl, /countrycodes=us%2Cgb|countrycodes=us,gb/);`
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3:** In `js/geocode.js`, change `countrycodes=us` to `countrycodes=us,gb`.
- [ ] **Step 4: Run → pass.** **Step 5: Commit** `feat: geocode across US + UK`.

---

### Task 7: `app.js` + `index.html` — region-aware UI, threshold, optimization, disclaimer

**Files:** Rewrite `js/app.js`; modify `index.html`.

- [ ] **Step 1: Update `index.html`**

Replace the `<select id="level"> … </select>` with `<select id="level"></select>`.

Add, immediately before the `<div style="margin:8px 0;">` that holds the level/units selects, a threshold field:

```html
    <div style="margin:8px 0;">
      <label>Threshold: <input type="number" id="threshold" min="0" step="1" style="width:80px;" placeholder="none" /> <span id="thUnit" class="muted">mi</span></label>
    </div>
```

Add, immediately after the `<div id="status" class="muted"></div>` line (if a disclaimer isn't already present):

```html
    <p class="muted" id="disclaimer" style="margin-top:16px; font-size:0.8em; line-height:1.4;">Boundary, geocoding, and routing data come from public sources (US Census, OpenStreetMap/Nominatim, OSRM). No guarantee is made of its accuracy — this is an approximation tool for the curious, not for navigation, legal, or official use.</p>
```

Update the intro `<p class="muted">` to: `Set two points by address or by clicking the map; optionally add waypoints. Covers the US and London (more cities to come). See the driving distance and how much of the route falls between their administrative units at each level.`

- [ ] **Step 2: Overwrite `js/app.js`:**

```js
import { createLoader } from './dataLoader.js';
import { resolvePoint } from './resolve.js';
import { pointToPoint } from './distance.js';
import { geocode } from './geocode.js';
import { getRoute } from './routing.js';
import { betweenDistance } from './routeBetween.js';
import { chooseRoute } from './routeChoice.js';
import { REGIONS } from './regions.js';
import { initMap, setPin, panTo, onPinDrag, setWaypoints, drawScene, clearOverlays } from './map.js';

const loader = createLoader('./data');
const state = {
  A: null, B: null, waypoints: [],
  active: 'A', level: null, units: 'miles',
  routes: [], selected: 0, routeKey: null, between: {},
};
const seq = { A: 0, B: 0 };
let routeSeq = 0;
const MI = 1.609344;

const $ = (id) => document.getElementById(id);
const setStatus = (msg) => { $('status').textContent = msg || ''; };
function fmtDist(km) {
  const v = state.units === 'miles' ? km / MI : km;
  return `${v.toFixed(1)} ${state.units === 'miles' ? 'mi' : 'km'}`;
}
const naCell = (note) => `<span class="muted">${note}</span>`;

function thresholdKm() {
  const raw = parseFloat($('threshold').value);
  if (!isFinite(raw) || raw <= 0) return null;
  return state.units === 'miles' ? raw * MI : raw;
}

function setActiveCard() {
  $('cardA').classList.toggle('active', state.active === 'A');
  $('cardB').classList.toggle('active', state.active === 'B');
}

function sharedLevels() {
  const A = state.A, B = state.B;
  if (!A || !B || A.resolved.outside || B.resolved.outside) return [];
  const aLevels = REGIONS[A.resolved.region].levels;
  const bKeys = new Set(REGIONS[B.resolved.region].levels.map((l) => l.key));
  return aLevels.filter((l) => bKeys.has(l.key));
}

async function setEndpoint(key, point, label, { pan = true } = {}) {
  const token = ++seq[key];
  setStatus(`Resolving point ${key}…`);
  try {
    const resolved = await resolvePoint(point, loader);
    if (token !== seq[key]) return;
    state[key] = { point, resolved, label };
    setPin(key, point);
    onPinDrag(key, (p) => setEndpoint(key, p, `dragged pin (${p.lat.toFixed(4)}, ${p.lon.toFixed(4)})`, { pan: false }));
    if (pan) panTo(point);
    renderLabel(key);
    await refreshRoute();
  } catch (e) {
    if (token === seq[key]) setStatus(`Could not resolve point ${key}: ${e.message}`);
  }
}

function renderLabel(key) {
  const s = state[key];
  if (!s) return;
  const r = s.resolved;
  let txt;
  if (r.outside) txt = 'Outside covered areas';
  else {
    const cfg = REGIONS[r.region];
    const parts = cfg.levels.map((l) => r.units[l.key]?.properties.NAME).filter(Boolean);
    txt = `${parts.join(', ')} (${cfg.name})`;
  }
  $(`label${key}`).textContent = `${s.label} → ${txt}`;
}

// waypoints
function syncWaypointMarkers() {
  setWaypoints(state.waypoints.map((w) => w.point), (i, p) => {
    state.waypoints[i] = { point: p, label: `pin (${p.lat.toFixed(4)}, ${p.lon.toFixed(4)})` };
    renderWaypoints(); refreshRoute();
  });
}
function addWaypoint(point, label) { state.waypoints.push({ point, label }); syncWaypointMarkers(); renderWaypoints(); refreshRoute(); }
function removeWaypoint(i) { state.waypoints.splice(i, 1); syncWaypointMarkers(); renderWaypoints(); refreshRoute(); }
function moveWaypoint(i, d) { const j = i + d; if (j < 0 || j >= state.waypoints.length) return; const [w] = state.waypoints.splice(i, 1); state.waypoints.splice(j, 0, w); syncWaypointMarkers(); renderWaypoints(); refreshRoute(); }
function renderWaypoints() {
  $('wpList').innerHTML = state.waypoints.map((w, i) => `
    <div class="wp-row"><span>${i + 1}. ${w.label}</span>
      <span><button data-act="up" data-i="${i}">▲</button><button data-act="down" data-i="${i}">▼</button><button data-act="rm" data-i="${i}">✕</button></span>
    </div>`).join('');
}

// routing
const coordKey = (coords) => coords.map((c) => `${c.lon},${c.lat}`).join(';');
async function refreshRoute() {
  const A = state.A, B = state.B;
  if (!(A && B && !A.resolved.outside && !B.resolved.outside)) {
    state.routes = []; state.routeKey = null; state.between = {}; render(); return;
  }
  const coords = [A.point, ...state.waypoints.map((w) => w.point), B.point];
  const key = coordKey(coords);
  if (key === state.routeKey && state.routes.length) { render(); return; }
  const token = ++routeSeq;
  setStatus('Finding route…');
  try {
    const routes = await getRoute(coords, undefined, { alternatives: state.waypoints.length === 0 });
    if (token !== routeSeq) return;
    state.routeKey = key; state.selected = 0; state.between = {};
    if (!routes.length) { state.routes = []; setStatus('No driving route found between these points.'); render(); return; }
    state.routes = routes; setStatus(''); render();
  } catch (e) {
    if (token === routeSeq) { state.routes = []; setStatus(`Routing failed: ${e.message}. (Public router may be busy — retry.)`); render(); }
  }
}

function betweenFor(routeIdx, levelKey) {
  const cacheKey = `${routeIdx}:${levelKey}`;
  if (cacheKey in state.between) return state.between[cacheKey];
  const ua = state.A.resolved.units[levelKey], ub = state.B.resolved.units[levelKey];
  const r = (ua && ub) ? betweenDistance(state.routes[routeIdx].geometry, ua, ub) : null;
  state.between[cacheKey] = r;
  return r;
}

function syncLevelOptions(levels) {
  const sel = $('level');
  sel.innerHTML = levels.map((l) => `<option value="${l.key}">${l.label}</option>`).join('');
  if (!levels.find((l) => l.key === state.level)) state.level = levels.length ? (levels[0].key) : null;
  if (state.level) sel.value = state.level;
}

// threshold-aware route selection on the active level
function optimizeSelection(levels) {
  const tKm = thresholdKm();
  if (tKm == null || !state.level || !levels.find((l) => l.key === state.level)) return;
  const betweens = state.routes.map((_, i) => betweenFor(i, state.level));
  if (betweens.some((b) => b == null)) return; // level not shared/available
  const idx = chooseRoute(state.routes, betweens.map((b) => b.betweenKm), tKm);
  state.selected = idx;
}

function render() {
  const A = state.A, B = state.B;
  const levels = sharedLevels();
  syncLevelOptions(levels);
  if (state.routes.length) optimizeSelection(levels);

  const rows = [];
  const tKm = thresholdKm();
  if (state.routes.length) {
    const route = state.routes[state.selected];
    rows.push(['Driving (point-to-point)', fmtDist(route.distanceKm)]);
    rows.push(['Straight-line', fmtDist(pointToPoint(A.point, B.point).km)]);
    if (levels.length) {
      for (const lvl of levels) {
        const b = betweenFor(state.selected, lvl.key);
        let cell = b ? fmtDist(b.betweenKm) : naCell('n/a');
        if (b && tKm != null && lvl.key === state.level) {
          cell += b.betweenKm <= tKm ? ' <span style="color:#16a34a">✓ under</span>' : ' <span style="color:#dc2626">over</span>';
        }
        rows.push([`${lvl.label} (between)`, cell]);
      }
    } else {
      rows.push(['Administrative levels', naCell('n/a (different region types)')]);
    }
  }
  $('results').querySelector('tbody').innerHTML = rows.length
    ? rows.map(([k, v]) => `<tr><td>${k}</td><td class="num">${v}</td></tr>`).join('')
    : '<tr><td class="muted">Set both points to see distances.</td></tr>';

  renderAlternatives();
  drawSceneNow();
}

function renderAlternatives() {
  const el = $('alts');
  if (state.waypoints.length === 0 && state.routes.length > 1) {
    el.innerHTML = '<strong>Routes:</strong> ' + state.routes.map((r, i) =>
      `<label style="margin-right:8px;"><input type="radio" name="alt" value="${i}"${i === state.selected ? ' checked' : ''}> ${fmtDist(r.distanceKm)}</label>`).join('');
  } else { el.innerHTML = ''; }
}

function unitAtLevel(s) {
  if (!s || s.resolved.outside || !state.level) return null;
  return s.resolved.units[state.level] || null;
}
function drawSceneNow() {
  const A = state.A, B = state.B;
  if (!A || !B) { clearOverlays(); return; }
  const b = (state.routes.length && state.level) ? betweenFor(state.selected, state.level) : null;
  drawScene({ unitA: unitAtLevel(A), unitB: unitAtLevel(B), routes: state.routes, selectedIndex: state.selected, betweenLine: b ? b.betweenLine : null });
}

async function handleGeocode(target) {
  const inputId = target === 'wp' ? 'addrWp' : `addr${target}`;
  const addr = $(inputId).value.trim();
  if (!addr) return;
  setStatus(`Looking up "${addr}"…`);
  try {
    const hit = await geocode(addr);
    if (!hit) { setStatus(`No match for "${addr}". Try "Add on map" / "Set on map".`); return; }
    if (target === 'wp') { addWaypoint({ lat: hit.lat, lon: hit.lon }, hit.matchedLabel); $('addrWp').value = ''; setStatus(''); }
    else await setEndpoint(target, { lat: hit.lat, lon: hit.lon }, hit.matchedLabel);
  } catch (e) { setStatus(`Geocoding failed: ${e.message}.`); }
}

function init() {
  initMap('map', (point) => {
    const label = `map pin (${point.lat.toFixed(4)}, ${point.lon.toFixed(4)})`;
    if (state.active === 'wp') addWaypoint(point, label); else setEndpoint(state.active, point, label);
  });
  $('geoA').onclick = () => handleGeocode('A');
  $('geoB').onclick = () => handleGeocode('B');
  $('addrA').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleGeocode('A'); });
  $('addrB').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleGeocode('B'); });
  $('pinA').onclick = () => { state.active = 'A'; setActiveCard(); setStatus('Click the map to set Point A.'); };
  $('pinB').onclick = () => { state.active = 'B'; setActiveCard(); setStatus('Click the map to set Point B.'); };
  $('addWp').onclick = () => { state.active = 'wp'; setActiveCard(); setStatus('Click the map to add a waypoint.'); };
  $('geoWp').onclick = () => handleGeocode('wp');
  $('addrWp').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleGeocode('wp'); });
  $('wpList').addEventListener('click', (e) => {
    const btn = e.target.closest('button'); if (!btn) return;
    const i = Number(btn.dataset.i);
    if (btn.dataset.act === 'rm') removeWaypoint(i); else if (btn.dataset.act === 'up') moveWaypoint(i, -1); else if (btn.dataset.act === 'down') moveWaypoint(i, +1);
  });
  $('alts').addEventListener('change', (e) => { if (e.target.name === 'alt') { state.selected = Number(e.target.value); render(); } });
  $('level').onchange = (e) => { state.level = e.target.value; render(); };
  $('units').onchange = (e) => { state.units = e.target.value; $('thUnit').textContent = state.units === 'miles' ? 'mi' : 'km'; render(); };
  $('threshold').addEventListener('input', () => render());
  setActiveCard();
  render();
}
init();
```

- [ ] **Step 3: Syntax check + headless cross-check**

Run: `cd ~/border-distance && node --check js/app.js && echo OK`
Run:
```bash
cd ~/border-distance && node --input-type=module -e '
import { readFile } from "node:fs/promises";
const html = await readFile("index.html","utf8");
const app = await readFile("js/app.js","utf8");
const ids = new Set();
for (const m of app.matchAll(/\$\([\x27\x22]([A-Za-z]+)[\x27\x22]\)/g)) ids.add(m[1]);
["labelA","labelB","addrA","addrB","geoA","geoB","pinA","pinB","cardA","cardB","addrWp","geoWp","addWp","wpList","alts","level","units","results","status","threshold","thUnit"].forEach(i=>ids.add(i));
const missing=[...ids].filter(id=>!html.includes("id=\""+id+"\""));
console.log("MISSING DOM ids:", missing.length?missing.join(", "):"NONE");
console.log("disclaimer present?", html.includes("approximation tool for the curious"));
'
```
Expected: `MISSING DOM ids: NONE`, `disclaimer present? true`.

- [ ] **Step 4: Full unit suite**

Run: `cd ~/border-distance && npm test 2>&1 | tail -4`
Expected: all pass — regions 3, routeChoice 5, dataLoader 4, resolve 5, geocode 4, distance 4, routing 4, routeBetween 3 = 32.

- [ ] **Step 5: Browser verification (Chrome is installed)**

Run: `cd ~/border-distance && (python3 -m http.server 8000 >/tmp/serve.log 2>&1 &) && sleep 1 && echo served`. Open `http://localhost:8000/`. Confirm: map loads (no JS console errors); set A = "McKinney, TX", B = "Dallas, TX" → driving + County (between) ≈ 0 etc.; set A = "Watford, UK", B = "Northolt, London" → both resolve (London region; city = Greater London), driving shows, city (between) computes; set a threshold and confirm the active level row marks under/over and (with alternatives) the selection can switch. Stop server: `pkill -f "http.server 8000"`.

- [ ] **Step 6: Commit** `feat: region-aware app with threshold + optimization + disclaimer`.

---

### Task 8: README + final verification

**Files:** Modify `README.md`.

- [ ] **Step 1:** Update README intro to mention coverage "United States and London (more cities to come)"; add to "How it works" bullets for `js/regions.js` (region registry) and `js/routeChoice.js` (threshold optimization) and `build/prepare-metro.sh` (OSM city pipeline); add a "Known limitations" bullet: `**Approximation only.** Data from public sources (US Census, OpenStreetMap/Nominatim, OSRM); no guarantee of accuracy — not for navigation, legal, or official use.` and `**Coverage** is the US plus curated cities (currently London); points elsewhere report "outside covered areas."`. Update "Data source" to add: `City boundaries: OpenStreetMap admin relations via Overpass.`

- [ ] **Step 2:** Run `cd ~/border-distance && npm test 2>&1 | tail -3` → all pass (32).

- [ ] **Step 3: Commit** `docs: README for region model, London, threshold`.

---

## Self-Review Notes

- **Spec coverage:** region registry (Task 1); threshold optimization rule (Task 2 + applied in Task 7); London OSM pipeline (Task 3); region/level loader (Task 4); detection + resolution (Task 5); widened geocoding (Task 6); region-aware UI + threshold marking + optimization + disclaimer + subdivision/unit drawing (Task 7); README + disclaimer (Tasks 7–8). London pipeline risk verified in Task 3; cross-region + threshold behavior verified in Task 7's browser step.
- **Naming consistency:** `REGIONS`/`REGION_IDS`; loader `getDetectLayers()`/`getLevel(regionId, levelKey, parentId)`; resolve `detectRegion`/`resolvePoint`→`{region, outside, units}`; `chooseRoute(routes, betweenKms, thresholdKm)`; app reads `resolved.units[key]`, `resolved.region`, `resolved.outside`; `sharedLevels()` drives the level select + between rows; US `place` lazy by `STATEFP`; London files fixed under `metros/london/`. map exports unchanged.
- **No placeholders:** every code step complete; Overpass/relation ids concrete with verify-and-adjust note; threshold marking and optimization fully specified.
```
