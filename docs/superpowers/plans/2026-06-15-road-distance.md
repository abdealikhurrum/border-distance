# Road Distance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change the tool's metric from straight-line to actual driving distance — point-to-point driving distance plus, per admin level, the route mileage lying between the two endpoints' units — and add waypoints and selectable route alternatives.

**Architecture:** Add two modules: `routing.js` (fetches driving route(s) from the free OSRM public demo) and `routeBetween.js` (pure: clips a route polyline against two unit polygons to measure "between" mileage). Rewire `app.js`/`map.js` to fetch one route through `[A, …waypoints, B]`, let the user pick among alternatives (when no waypoints), and render/draw driving figures. All polygon clipping stays local (Turf); only route geometry comes over the network.

**Tech Stack:** Vanilla JS (ES modules), Turf.js, Leaflet, topojson-client, OSRM public demo (`router.project-osrm.org`), Node's built-in test runner.

Amends the road-distance spec: `docs/superpowers/specs/2026-06-15-road-distance-design.md`. The existing implementation (geocode/resolve/dataLoader/distance + map/app) is on branch `feature/border-distance-impl`; this plan continues on that branch.

---

## File Structure

- `js/routing.js` — NEW. `getRoute(coords, fetchImpl, opts)` → array of `{distanceMiles, distanceKm, geometry}`.
- `js/routeBetween.js` — NEW, pure. `betweenDistance(routeLine, unitA, unitB)` → `{betweenMiles, betweenKm, betweenLine}`.
- `index.html` — MODIFY. Add waypoints card + alternatives container.
- `js/map.js` — MODIFY. Add `drawScene`, `setWaypoints`; remove `drawLevel`.
- `js/app.js` — MODIFY (rewrite). Routing, waypoints, alternatives, caching, rendering, drawing.
- `README.md` — MODIFY. Network-required + OSRM fair-use; waypoints/alternatives; driving metric.
- `tests/routing.test.js`, `tests/routeBetween.test.js` — NEW.

---

### Task 1: `routing.js` — driving routes from OSRM

**Files:**
- Create: `js/routing.js`
- Test: `tests/routing.test.js`

- [ ] **Step 1: Write failing tests** — create `tests/routing.test.js`:

```js
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
    [{ lat: 33.1972, lon: -96.6398 }, { lat: 32.7767, lon: -96.7970 }],
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
```

- [ ] **Step 2: Run to verify failure**

Run: `cd ~/border-distance && node --test tests/routing.test.js`
Expected: FAIL — module/exports missing.

- [ ] **Step 3: Implement `js/routing.js`**

```js
const defaultFetch = (...args) => fetch(...args);
const M_PER_MILE = 1609.344;

export async function getRoute(coords, fetchImpl = defaultFetch, opts = {}) {
  const path = coords.map((c) => `${c.lon},${c.lat}`).join(';');
  let url = `https://router.project-osrm.org/route/v1/driving/${path}?overview=full&geometries=geojson`;
  if (coords.length === 2 && opts.alternatives) url += '&alternatives=3';

  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`Routing failed: ${res.status}`);
  const data = await res.json();
  if (data.code !== 'Ok' || !Array.isArray(data.routes) || data.routes.length === 0) return [];

  return data.routes.map((r) => ({
    distanceMiles: r.distance / M_PER_MILE,
    distanceKm: r.distance / 1000,
    geometry: r.geometry,
  }));
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd ~/border-distance && node --test tests/routing.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Live smoke test against OSRM (risk check)**

Run:
```bash
cd ~/border-distance && node --input-type=module -e '
import { getRoute } from "./js/routing.js";
const routes = await getRoute(
  [{ lat: 33.1972, lon: -96.6398 }, { lat: 32.7767, lon: -96.7970 }],
  undefined, { alternatives: true });
console.log("routes:", routes.length, "| miles[0]:", routes[0]?.distanceMiles?.toFixed(1), "| geom:", routes[0]?.geometry?.type);
const wp = await getRoute(
  [{ lat: 33.1972, lon: -96.6398 }, { lat: 33.0, lon: -96.7 }, { lat: 32.7767, lon: -96.7970 }],
  undefined, { alternatives: false });
console.log("waypoint route:", wp.length, "| miles:", wp[0]?.distanceMiles?.toFixed(1));
'
```
Expected: `routes:` ≥ 1 with `miles[0]` ≈ 25–45 and `geom: LineString`; `waypoint route: 1` with a plausible mileage. This confirms OSRM availability, the response shape, alternatives, and multi-waypoint requests. (CORS from a browser is verified later in Task 5's browser step; OSRM demo is CORS-enabled. If this request fails entirely, report it — the fallback is FOSSGIS Valhalla, which would change the URL/parsing in this module only.)

- [ ] **Step 6: Commit**

```bash
cd ~/border-distance
git add js/routing.js tests/routing.test.js
git commit -m "feat: getRoute fetches driving route(s) from OSRM (alternatives, waypoints)"
```

---

### Task 2: `routeBetween.js` — route mileage between two units

**Files:**
- Create: `js/routeBetween.js`
- Test: `tests/routeBetween.test.js`

- [ ] **Step 1: Write failing tests** — create `tests/routeBetween.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as turf from '@turf/turf';
import { betweenDistance } from '../js/routeBetween.js';

// unit square covering [x0, x0+1] x [0, 1]
const square = (x0) => turf.polygon([[[x0, 0], [x0 + 1, 0], [x0 + 1, 1], [x0, 1], [x0, 0]]]);

test('betweenDistance is ~0 for a route crossing directly between adjacent units', () => {
  const route = turf.lineString([[0.5, 0.5], [1.5, 0.5]]); // through A=[0,1] into B=[1,2]
  const r = betweenDistance(route, square(0), square(1));
  assert.ok(r.betweenMiles < 1, `betweenMiles=${r.betweenMiles}`);
  assert.equal(r.betweenLine, null);
});

test('betweenDistance equals the gap length when units are separated', () => {
  const route = turf.lineString([[0.5, 0.5], [2.5, 0.5]]); // A=[0,1], gap=[1,2], B=[2,3]
  const r = betweenDistance(route, square(0), square(2));
  // gap is ~1 deg lon at lat 0.5 ≈ 69 mi
  assert.ok(r.betweenMiles > 60 && r.betweenMiles < 75, `betweenMiles=${r.betweenMiles}`);
  assert.equal(r.betweenLine.geometry.type, 'MultiLineString');
});

test('betweenDistance accepts a raw LineString geometry (not just a Feature)', () => {
  const geom = { type: 'LineString', coordinates: [[0.5, 0.5], [1.5, 0.5]] };
  const r = betweenDistance(geom, square(0), square(1));
  assert.ok(r.betweenMiles < 1);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd ~/border-distance && node --test tests/routeBetween.test.js`
Expected: FAIL — module/exports missing.

- [ ] **Step 3: Implement `js/routeBetween.js`**

```js
import * as turf from '@turf/turf';

const KM_PER_MILE = 1.609344;
const CHUNK_KM = 0.25;

export function betweenDistance(routeLine, unitA, unitB) {
  const line = routeLine.type === 'Feature' ? routeLine : turf.feature(routeLine);
  const chunks = turf.lineChunk(line, CHUNK_KM, { units: 'kilometers' });

  let betweenKm = 0;
  const betweenSegs = [];
  for (const seg of chunks.features) {
    const coords = seg.geometry.coordinates;
    if (coords.length < 2) continue;
    const mid = turf.midpoint(turf.point(coords[0]), turf.point(coords[coords.length - 1]));
    const inA = unitA && turf.booleanPointInPolygon(mid, unitA);
    const inB = unitB && turf.booleanPointInPolygon(mid, unitB);
    if (!inA && !inB) {
      betweenKm += turf.length(seg, { units: 'kilometers' });
      betweenSegs.push(coords);
    }
  }

  return {
    betweenKm,
    betweenMiles: betweenKm / KM_PER_MILE,
    betweenLine: betweenSegs.length ? turf.multiLineString(betweenSegs) : null,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd ~/border-distance && node --test tests/routeBetween.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Real-data integration spot check (risk check)**

This exercises `routing.js` + `resolve.js` + `routeBetween.js` against real Census data and a live OSRM route. Run:
```bash
cd ~/border-distance && node --input-type=module -e '
import { readFile } from "node:fs/promises";
import { feature } from "topojson-client";
import { findContaining } from "./js/resolve.js";
import { getRoute } from "./js/routing.js";
import { betweenDistance } from "./js/routeBetween.js";
const load = async p => { const t = JSON.parse(await readFile(p)); return feature(t, t.objects[Object.keys(t.objects)[0]]); };
const counties = await load("data/counties.topo.json");
const cty = (lon, lat) => findContaining({ lon, lat }, counties.features);
async function probe(name, A, B) {
  const routes = await getRoute([A, B], undefined, { alternatives: true });
  const r = betweenDistance(routes[0].geometry, cty(A.lon, A.lat), cty(B.lon, B.lat));
  console.log(`${name}: drive=${routes[0].distanceMiles.toFixed(1)}mi  county-between=${r.betweenMiles.toFixed(1)}mi`);
}
// McKinney (Collin) -> Dallas downtown (Dallas) : adjacent counties -> ~0 between
await probe("McKinney->Dallas", { lat: 33.1972, lon: -96.6398 }, { lat: 32.7767, lon: -96.7970 });
// Collin -> Fort Worth (Tarrant): non-adjacent -> > 0 between
await probe("Collin->FortWorth", { lat: 33.0357, lon: -96.7836 }, { lat: 32.7555, lon: -97.3308 });
'
```
Expected: `McKinney->Dallas` shows `county-between` ≈ 0 (well under ~3 mi — adjacent counties, route crosses straight over), and `Collin->FortWorth` shows `county-between` clearly > 0 (miles driven through the intervening county). Report the actual numbers. (This validates the route-clipping accuracy risk.)

- [ ] **Step 6: Commit**

```bash
cd ~/border-distance
git add js/routeBetween.js tests/routeBetween.test.js
git commit -m "feat: betweenDistance clips a route against two unit polygons"
```

---

### Task 3: `index.html` — waypoints card + alternatives container

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add the waypoints card and alternatives container**

In `index.html`, insert the following block immediately AFTER the closing `</div>` of `id="cardB"` and BEFORE the `<div style="margin:8px 0;">` that holds the level/units selects:

```html
    <div class="card" id="cardWp">
      <strong>Waypoints (optional)</strong>
      <div style="display:flex; gap:6px; margin-top:6px;">
        <input type="text" id="addrWp" placeholder="Waypoint address" />
        <button id="geoWp">Add</button>
      </div>
      <button id="addWp" style="margin-top:6px;">Add on map</button>
      <div id="wpList"></div>
    </div>

    <div id="alts" style="margin:8px 0;"></div>
```

- [ ] **Step 2: Add styles for waypoint rows**

In the `<style>` block, after the `.muted { color: #888; }` line, add:

```css
    .wp-row { display: flex; justify-content: space-between; align-items: center; gap: 6px; padding: 4px 0; border-bottom: 1px solid #f0f0f0; font-size: 0.9em; }
    .wp-row button { padding: 2px 6px; }
```

- [ ] **Step 3: Verify the new ids exist**

Run: `cd ~/border-distance && grep -o 'id="[a-zA-Z]*"' index.html | grep -E 'addrWp|geoWp|addWp|wpList|alts|cardWp'`
Expected: prints `id="cardWp"`, `id="addrWp"`, `id="geoWp"`, `id="addWp"`, `id="wpList"`, `id="alts"` (six lines).

- [ ] **Step 4: Commit**

```bash
cd ~/border-distance
git add index.html
git commit -m "feat: add waypoints card and alternatives container to UI"
```

---

### Task 4: `map.js` — route + between rendering, waypoint markers

**Files:**
- Modify: `js/map.js`

Browser-only; verified in-browser in Task 5.

- [ ] **Step 1: Add waypoint marker state**

In `js/map.js`, just after the existing `let overlay = L.layerGroup();` line, add:

```js
let wpMarkers = [];
```

- [ ] **Step 2: Replace `drawLevel` with `drawScene`**

Delete the entire existing `export function drawLevel(...) { … }` and replace it with:

```js
export function drawScene({ unitA, unitB, routes, selectedIndex, betweenLine }) {
  overlay.clearLayers();
  const polyStyle = (color) => ({ color, weight: 2, fillOpacity: 0.08 });
  if (unitA) L.geoJSON(unitA, { style: polyStyle('#2563eb') }).addTo(overlay);
  if (unitB) L.geoJSON(unitB, { style: polyStyle('#dc2626') }).addTo(overlay);

  (routes || []).forEach((r, i) => {
    if (i === selectedIndex) return; // draw the selected route last, on top
    L.geoJSON(r.geometry, { style: { color: '#9ca3af', weight: 3, opacity: 0.6 } }).addTo(overlay);
  });
  if (routes && routes[selectedIndex]) {
    L.geoJSON(routes[selectedIndex].geometry, { style: { color: '#1d4ed8', weight: 5 } }).addTo(overlay);
  }
  if (betweenLine) {
    L.geoJSON(betweenLine, { style: { color: '#16a34a', weight: 6, opacity: 0.9 } }).addTo(overlay);
  }
}

export function setWaypoints(points, onDrag) {
  wpMarkers.forEach((m) => map.removeLayer(m));
  wpMarkers = points.map((p, i) => {
    const m = L.marker([p.lat, p.lon], { draggable: true }).addTo(map).bindTooltip(`Waypoint ${i + 1}`);
    m.on('dragend', (e) => {
      const ll = e.target.getLatLng();
      onDrag(i, { lat: ll.lat, lon: ll.lng });
    });
    return m;
  });
}
```

Leave `initMap`, `setPin`, `panTo`, `onPinDrag`, `clearOverlays` unchanged.

- [ ] **Step 3: Syntax check**

Run: `cd ~/border-distance && node --check js/map.js && echo OK`
Expected: prints `OK`.

- [ ] **Step 4: Commit**

```bash
cd ~/border-distance
git add js/map.js
git commit -m "feat: map drawScene (routes + between highlight) and waypoint markers"
```

---

### Task 5: `app.js` — routing, waypoints, alternatives, rendering

**Files:**
- Modify (overwrite): `js/app.js`

- [ ] **Step 1: Overwrite `js/app.js` with this version**

```js
import { createLoader } from './dataLoader.js';
import { resolvePoint } from './resolve.js';
import { pointToPoint } from './distance.js';
import { geocode } from './geocode.js';
import { getRoute } from './routing.js';
import { betweenDistance } from './routeBetween.js';
import { initMap, setPin, panTo, onPinDrag, setWaypoints, drawScene, clearOverlays } from './map.js';

const loader = createLoader('./data');
const state = {
  A: null, B: null, waypoints: [],
  active: 'A', level: 'county', units: 'miles',
  routes: [], selected: 0, routeKey: null, between: {},
};
const seq = { A: 0, B: 0 };
let routeSeq = 0;

const $ = (id) => document.getElementById(id);
const setStatus = (msg) => { $('status').textContent = msg || ''; };

function fmtDist(km) {
  const v = state.units === 'miles' ? km / 1.609344 : km;
  return `${v.toFixed(1)} ${state.units === 'miles' ? 'mi' : 'km'}`;
}
const naCell = (note) => `<span class="muted">${note}</span>`;

function setActiveCard() {
  $('cardA').classList.toggle('active', state.active === 'A');
  $('cardB').classList.toggle('active', state.active === 'B');
}

// ---------- endpoints ----------
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
  const parts = r.outsideUS
    ? ['Outside the US']
    : [r.place ? r.place.properties.NAME : 'unincorporated', r.county?.properties.NAME, r.state?.properties.NAME].filter(Boolean);
  $(`label${key}`).textContent = `${s.label} → ${parts.join(', ')}`;
}

// ---------- waypoints ----------
function syncWaypointMarkers() {
  setWaypoints(state.waypoints.map((w) => w.point), (i, p) => {
    state.waypoints[i] = { point: p, label: `pin (${p.lat.toFixed(4)}, ${p.lon.toFixed(4)})` };
    renderWaypoints();
    refreshRoute();
  });
}
function addWaypoint(point, label) {
  state.waypoints.push({ point, label });
  syncWaypointMarkers();
  renderWaypoints();
  refreshRoute();
}
function removeWaypoint(i) {
  state.waypoints.splice(i, 1);
  syncWaypointMarkers();
  renderWaypoints();
  refreshRoute();
}
function moveWaypoint(i, delta) {
  const j = i + delta;
  if (j < 0 || j >= state.waypoints.length) return;
  const [w] = state.waypoints.splice(i, 1);
  state.waypoints.splice(j, 0, w);
  syncWaypointMarkers();
  renderWaypoints();
  refreshRoute();
}
function renderWaypoints() {
  $('wpList').innerHTML = state.waypoints.map((w, i) => `
    <div class="wp-row">
      <span>${i + 1}. ${w.label}</span>
      <span>
        <button data-act="up" data-i="${i}">▲</button>
        <button data-act="down" data-i="${i}">▼</button>
        <button data-act="rm" data-i="${i}">✕</button>
      </span>
    </div>`).join('');
}

// ---------- routing ----------
const coordKey = (coords) => coords.map((c) => `${c.lon},${c.lat}`).join(';');

async function refreshRoute() {
  const A = state.A, B = state.B;
  if (!(A && B && !A.resolved.outsideUS && !B.resolved.outsideUS)) {
    state.routes = []; state.routeKey = null; state.between = {};
    render(); return;
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

function betweenFor(routeIdx, level) {
  const cacheKey = `${routeIdx}:${level}`;
  if (cacheKey in state.between) return state.between[cacheKey];
  const unitA = state.A.resolved[level], unitB = state.B.resolved[level];
  const r = (unitA && unitB) ? betweenDistance(state.routes[routeIdx].geometry, unitA, unitB) : null;
  state.between[cacheKey] = r;
  return r;
}

// ---------- render ----------
function render() {
  const A = state.A, B = state.B;
  const rows = [];
  if (state.routes.length) {
    const route = state.routes[state.selected];
    rows.push(['Driving (point-to-point)', fmtDist(route.distanceKm)]);
    rows.push(['Straight-line', fmtDist(pointToPoint(A.point, B.point).km)]);
    const lvlRow = (label, level, note) => {
      const b = betweenFor(state.selected, level);
      return [label, b ? fmtDist(b.betweenKm) : naCell(note)];
    };
    rows.push(lvlRow('City / Place (between)', 'place', 'n/a (outside any incorporated place)'));
    rows.push(lvlRow('County (between)', 'county', 'n/a (no county)'));
    rows.push(lvlRow('State (between)', 'state', 'n/a'));
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
      `<label style="margin-right:8px;"><input type="radio" name="alt" value="${i}"${i === state.selected ? ' checked' : ''}> ${fmtDist(r.distanceKm)}</label>`
    ).join('');
  } else {
    el.innerHTML = '';
  }
}

function unitAtLevel(s) {
  if (!s || s.resolved.outsideUS) return null;
  return s.resolved[state.level];
}
function drawSceneNow() {
  const A = state.A, B = state.B;
  if (!A || !B) { clearOverlays(); return; }
  const b = state.routes.length ? betweenFor(state.selected, state.level) : null;
  drawScene({
    unitA: unitAtLevel(A), unitB: unitAtLevel(B),
    routes: state.routes, selectedIndex: state.selected,
    betweenLine: b ? b.betweenLine : null,
  });
}

// ---------- input ----------
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
  } catch (e) {
    setStatus(`Geocoding failed: ${e.message}.`);
  }
}

function init() {
  initMap('map', (point) => {
    const label = `map pin (${point.lat.toFixed(4)}, ${point.lon.toFixed(4)})`;
    if (state.active === 'wp') addWaypoint(point, label);
    else setEndpoint(state.active, point, label);
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
    if (btn.dataset.act === 'rm') removeWaypoint(i);
    else if (btn.dataset.act === 'up') moveWaypoint(i, -1);
    else if (btn.dataset.act === 'down') moveWaypoint(i, +1);
  });
  $('alts').addEventListener('change', (e) => {
    if (e.target.name === 'alt') { state.selected = Number(e.target.value); render(); }
  });
  $('level').onchange = (e) => { state.level = e.target.value; drawSceneNow(); };
  $('units').onchange = (e) => { state.units = e.target.value; render(); };
  setActiveCard();
  render();
}

init();
```

- [ ] **Step 2: Syntax check**

Run: `cd ~/border-distance && node --check js/app.js && echo OK`
Expected: prints `OK`.

- [ ] **Step 3: Headless integration verification**

Confirm every DOM id app.js touches exists in index.html, and every map.js import matches an export. Run:
```bash
cd ~/border-distance && node --input-type=module -e '
import { readFile } from "node:fs/promises";
const html = await readFile("index.html","utf8");
const app = await readFile("js/app.js","utf8");
const ids = new Set();
for (const m of app.matchAll(/\$\([\x27\x22]([A-Za-z]+)[\x27\x22]\)/g)) ids.add(m[1]);
["labelA","labelB","addrA","addrB","geoA","geoB","pinA","pinB","cardA","cardB","addrWp","geoWp","addWp","wpList","alts"].forEach(i=>ids.add(i));
const missing = [...ids].filter(id => !html.includes("id=\"" + id + "\""));
console.log("MISSING DOM ids:", missing.length ? missing.join(", ") : "NONE");
const mapSrc = await readFile("js/map.js","utf8");
const exp = [...mapSrc.matchAll(/export function (\w+)/g)].map(m=>m[1]);
const imp = (app.match(/import \{([^}]+)\} from [\x27\x22]\.\/map\.js[\x27\x22]/)||[])[1].split(",").map(s=>s.trim());
console.log("map imports missing from exports:", imp.filter(f=>!exp.includes(f)).join(", ") || "NONE");
console.log("drawLevel still referenced?", app.includes("drawLevel") || mapSrc.includes("drawLevel"));
'
```
Expected: `MISSING DOM ids: NONE`, `map imports missing from exports: NONE`, `drawLevel still referenced? false`.

- [ ] **Step 4: Run the full unit suite**

Run: `cd ~/border-distance && npm test 2>&1 | tail -4`
Expected: all tests pass (distance 4, resolve 5, geocode 5, dataLoader 4, routing 4, routeBetween 3 = 25).

- [ ] **Step 5: Browser verification (if a browser is available)**

If Google Chrome is installed, serve and verify; otherwise note it as deferred.
Run: `cd ~/border-distance && (python3 -m http.server 8000 >/tmp/serve.log 2>&1 &) && sleep 1 && echo served`
Open `http://localhost:8000/` and confirm: map loads (no console errors); set Point A = "McKinney, TX" and Point B = "Dallas, TX" (Find); a driving route draws, the table shows a Driving distance, Straight-line, and County (between) ≈ 0; multiple "Routes:" radios appear and selecting one redraws + updates numbers; click "Add on map" then the map to drop a waypoint — the route reshapes, the alternatives list disappears, and numbers update; drag a pin — the map does not zoom/recenter and numbers update.
Then stop the server: `pkill -f "http.server 8000"`.

- [ ] **Step 6: Commit**

```bash
cd ~/border-distance
git add js/app.js
git commit -m "feat: app routing, waypoints, route alternatives, driving figures"
```

---

### Task 6: README + limitations update

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the intro and limitations**

Replace the first paragraph of `README.md` (the one beginning "A static web tool.") with:

```markdown
A static web tool. Pick two US points (by address or by clicking the map),
optionally add waypoints, and see the **driving distance** between them plus how
much of the route falls *between* their administrative units at each level
(city/place, county, state). Each point is resolved to the specific polygons
that contain it, so a point in the Collin-County part of Dallas is treated as
Collin County — not Dallas County. When there are no waypoints, the tool also
offers alternative routes to choose from.
```

Then replace the example paragraph (beginning "For example, McKinney → Dallas") with:

```markdown
For example, driving McKinney → Dallas is ~30 mi, but the **county-between**
figure is ~0 because the route crosses straight from Collin County into the
bordering Dallas County.
```

- [ ] **Step 2: Add routing notes to "Known limitations"**

In the "Known limitations" section of `README.md`, add these bullets at the top of the list:

```markdown
- **Requires network.** Distances are driving distances: each query calls a
  routing service (OSRM public demo, `router.project-osrm.org`) for the route
  geometry, and addresses are geocoded online. The tool is no longer
  offline-capable. The OSRM demo server is fair-use and not guaranteed for
  production traffic; if it is unavailable, routing fails with a retry message.
- **Route steering is via waypoints**, not declarative road preferences. There
  is no "avoid tolls / prefer highway X" — drop a waypoint on the road or entry
  point you want. Auto-generated alternatives are offered only when no waypoints
  are set (an OSRM constraint).
```

- [ ] **Step 3: Update the "How it works" list**

In the "How it works" section, add these two bullets after the `js/distance.js` bullet:

```markdown
- `js/routing.js` — fetches driving route(s) from the OSRM public demo
  (alternatives when there are no waypoints; a single route through any
  waypoints).
- `js/routeBetween.js` — pure: clips a route polyline against two unit polygons
  to measure the mileage lying between them.
```

- [ ] **Step 4: Verify and commit**

Run: `cd ~/border-distance && grep -c "routing service\|routeBetween\|waypoints" README.md`
Expected: a count ≥ 3 (the new content is present).

```bash
cd ~/border-distance
git add README.md
git commit -m "docs: document driving metric, waypoints, alternatives, network requirement"
```

---

## Self-Review Notes

- **Spec coverage:** driving point-to-point + straight-line reference (Task 5 render); route-miles-between per level (Tasks 2 + 5); waypoints add/remove/reorder/drag (Tasks 3,4,5); alternatives only when no waypoints (Tasks 1,5); OSRM `getRoute` array return + 2-coord-only alternatives (Task 1); local clipping (Task 2); caching by coordinate sequence + per-route/level between cache (Task 5); both risks checked live (Task 1 Step 5, Task 2 Step 5); polygonDistance left unwired (Task 5 no longer imports it); deployment/network note (Task 6).
- **Naming consistency:** `getRoute(coords, fetchImpl, opts)` returns `[{distanceMiles, distanceKm, geometry}]`; `betweenDistance(routeLine, unitA, unitB)` returns `{betweenMiles, betweenKm, betweenLine}`; map exports `initMap/setPin/panTo/onPinDrag/setWaypoints/drawScene/clearOverlays` (drawLevel removed) — used identically in `app.js`. DOM ids `cardWp/addrWp/geoWp/addWp/wpList/alts` created in Task 3, consumed in Task 5.
- **No placeholders:** every code step has complete code; every run step states expected output.
```
