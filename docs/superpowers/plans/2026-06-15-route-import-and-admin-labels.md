# Route Import + Admin-Level Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user import an external route (GPX / GeoJSON / KML / encoded polyline) and use it as the path instead of OSRM, and show each resolved endpoint's admin units *with their level names* — both reusing the existing pipeline and data.

**Architecture:** A new pure module `js/routeImport.js` parses any of the four formats to a GeoJSON LineString + distance. `app.js` gains a route "source" (`computed` | `imported`): when imported, it sets that line as the active route, derives endpoints A/B from the track ends, resolves them, and skips OSRM/alternatives. Admin-level labels are a `renderLabel` change plus a small caption, from preloaded `regions.js` + resolved units. Everything downstream (between-distance, threshold, map) is unchanged.

**Tech Stack:** Vanilla JS (ES modules), Turf.js, Node's built-in test runner. No new dependencies.

Implements `docs/superpowers/specs/2026-06-15-route-import-and-admin-labels-design.md`. On branch `feature/route-import`.

---

## File Structure

- `js/routeImport.js` — NEW, pure. `detectFormat`, `parseRoute`.
- `index.html` — MODIFY. Import controls (file input + polyline textarea + buttons) and per-endpoint level captions.
- `js/app.js` — MODIFY. Route source, import handler, endpoint-resolve split, `refreshRoute` branch, level-name labels.
- `README.md` — MODIFY. Document import + admin labels.
- `tests/routeImport.test.js` — NEW.

---

### Task 1: `routeImport.js` — parse GPX/GeoJSON/KML/polyline

**Files:** Create `js/routeImport.js`, `tests/routeImport.test.js`

- [ ] **Step 1: Write `tests/routeImport.test.js`**

```js
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
  assert.ok(r.distanceKm > 110 && r.distanceKm < 112, `km=${r.distanceKm}`); // ~111 km per degree lat
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
```

- [ ] **Step 2: Run → fail.** `cd ~/border-distance && node --test tests/routeImport.test.js` → FAIL (missing module).

- [ ] **Step 3: Implement `js/routeImport.js`**

```js
import * as turf from '@turf/turf';

const KM_PER_MILE = 1.609344;

export function detectFormat(filename = '', text = '') {
  const f = filename.toLowerCase();
  if (f.endsWith('.gpx')) return 'gpx';
  if (f.endsWith('.kml')) return 'kml';
  if (f.endsWith('.geojson') || f.endsWith('.json')) return 'geojson';
  const t = text.trimStart();
  if (/<gpx[\s>]/i.test(t)) return 'gpx';
  if (/<kml[\s>]/i.test(t)) return 'kml';
  if (t.startsWith('{') || t.startsWith('[')) return 'geojson';
  return 'polyline';
}

function geojsonCoords(text) {
  const data = JSON.parse(text);
  const geoms = [];
  const visit = (g) => {
    if (!g) return;
    if (g.type === 'FeatureCollection') g.features.forEach((f) => visit(f.geometry));
    else if (g.type === 'Feature') visit(g.geometry);
    else if (g.type === 'GeometryCollection') g.geometries.forEach(visit);
    else geoms.push(g);
  };
  visit(data);
  for (const g of geoms) {
    if (g.type === 'LineString') return g.coordinates;
    if (g.type === 'MultiLineString') return g.coordinates.flat();
  }
  return [];
}

function gpxCoords(text) {
  const pts = [];
  const re = /<(?:trkpt|rtept)\b[^>]*?\blat=["']([-\d.]+)["'][^>]*?\blon=["']([-\d.]+)["']/gi;
  let m;
  while ((m = re.exec(text))) pts.push([parseFloat(m[2]), parseFloat(m[1])]);
  if (pts.length) return pts;
  const re2 = /<(?:trkpt|rtept)\b[^>]*?\blon=["']([-\d.]+)["'][^>]*?\blat=["']([-\d.]+)["']/gi;
  while ((m = re2.exec(text))) pts.push([parseFloat(m[1]), parseFloat(m[2])]);
  return pts;
}

function kmlCoords(text) {
  const m = /<coordinates>([\s\S]*?)<\/coordinates>/i.exec(text);
  if (!m) return [];
  return m[1].trim().split(/\s+/)
    .map((tok) => { const [lon, lat] = tok.split(',').map(Number); return [lon, lat]; })
    .filter((c) => Number.isFinite(c[0]) && Number.isFinite(c[1]));
}

function polylineCoords(str, precision = 5) {
  let index = 0, lat = 0, lng = 0, byte = 0, shift, result;
  const coords = [];
  const factor = Math.pow(10, precision);
  while (index < str.length) {
    shift = 0; result = 0;
    do { byte = str.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { byte = str.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    coords.push([lng / factor, lat / factor]);
  }
  return coords;
}

export function parseRoute(text, format) {
  if (!text || !text.trim()) throw new Error('Empty route input');
  let coords;
  if (format === 'geojson') coords = geojsonCoords(text);
  else if (format === 'gpx') coords = gpxCoords(text);
  else if (format === 'kml') coords = kmlCoords(text);
  else if (format === 'polyline') coords = polylineCoords(text.trim());
  else throw new Error(`Unknown format: ${format}`);
  if (!coords || coords.length < 2) throw new Error('No usable route line found (need at least 2 points)');
  const geometry = { type: 'LineString', coordinates: coords };
  const distanceKm = turf.length(turf.feature(geometry), { units: 'kilometers' });
  return { geometry, distanceKm, distanceMiles: distanceKm / KM_PER_MILE };
}
```

- [ ] **Step 4: Run → pass** (7 tests). `cd ~/border-distance && node --test tests/routeImport.test.js`

- [ ] **Step 5: Commit**

```bash
cd ~/border-distance
git add js/routeImport.js tests/routeImport.test.js
git commit -m "feat: routeImport parses GPX/GeoJSON/KML/polyline to a LineString"
```
(If commit fails with a 1Password signing error, retry with `git -c commit.gpgsign=false commit -m "…"`.)

---

### Task 2: `index.html` — import controls + level captions

**Files:** Modify `index.html`

- [ ] **Step 1: Add import controls.** Insert this block immediately AFTER the `#cardWp` waypoints card and BEFORE the `<div id="alts">` element:

```html
    <div class="card" id="cardImport">
      <strong>Import a route</strong>
      <div style="margin-top:6px;"><input type="file" id="importFile" accept=".gpx,.geojson,.json,.kml" /></div>
      <div style="display:flex; gap:6px; margin-top:6px;">
        <input type="text" id="importPoly" placeholder="…or paste an encoded polyline" />
        <button id="importPolyBtn">Load</button>
      </div>
      <button id="clearImport" style="margin-top:6px;">Clear import</button>
    </div>
```

- [ ] **Step 2: Add per-endpoint level captions.** Immediately AFTER the `<div class="muted" id="labelA"></div>` line add:

```html
      <div class="muted" id="levelsA" style="font-size:0.8em;"></div>
```

and immediately AFTER `<div class="muted" id="labelB"></div>` add:

```html
      <div class="muted" id="levelsB" style="font-size:0.8em;"></div>
```

- [ ] **Step 3: Verify ids present**

Run: `cd ~/border-distance && grep -o 'id="[a-zA-Z]*"' index.html | grep -E 'cardImport|importFile|importPoly|importPolyBtn|clearImport|levelsA|levelsB'`
Expected: seven lines (`cardImport`, `importFile`, `importPoly`, `importPolyBtn`, `clearImport`, `levelsA`, `levelsB`).

- [ ] **Step 4: Commit**

```bash
cd ~/border-distance
git add index.html
git commit -m "feat: add route-import controls and level captions to UI"
```

---

### Task 3: `app.js` — route source, import, level-name labels

**Files:** Modify `js/app.js`

- [ ] **Step 1: Add the import + routeChoice imports and `routeSource` state.**

Add to the import block (with the other `./` imports):
```js
import { detectFormat, parseRoute } from './routeImport.js';
```
In the `state` object literal, add `routeSource: 'computed',` (alongside `routes`, `selected`, etc.).

- [ ] **Step 2: Split endpoint resolution out of `setEndpoint`.** Replace the existing `setEndpoint` function with these two functions:

```js
async function resolveEndpoint(key, point, label, { pan = true } = {}) {
  const token = ++seq[key];
  const resolved = await resolvePoint(point, loader);
  if (token !== seq[key]) return false;
  state[key] = { point, resolved, label };
  setPin(key, point);
  onPinDrag(key, (p) => setEndpoint(key, p, `dragged pin (${p.lat.toFixed(4)}, ${p.lon.toFixed(4)})`, { pan: false }));
  if (pan) panTo(point);
  renderLabel(key);
  return true;
}

async function setEndpoint(key, point, label, opts = {}) {
  setStatus(`Resolving point ${key}…`);
  try {
    const ok = await resolveEndpoint(key, point, label, opts);
    if (ok) await refreshRoute();
  } catch (e) {
    setStatus(`Could not resolve point ${key}: ${e.message}`);
  }
}
```

- [ ] **Step 3: Branch `refreshRoute` for imported routes.** At the very top of `refreshRoute` (before the existing body), add:

```js
  if (state.routeSource === 'imported') { render(); return; }
```

- [ ] **Step 4: Add the import + clear handlers.** Add these functions (e.g. after `refreshRoute`):

```js
async function importRouteText(text, filename) {
  try {
    const fmt = detectFormat(filename, text);
    const r = parseRoute(text, fmt);
    let geom = r.geometry;
    if (geom.coordinates.length > 4000) {
      geom = turf.simplify(turf.feature(geom), { tolerance: 0.0005, highQuality: false }).geometry;
    }
    state.routeSource = 'imported';
    state.routes = [{ distanceMiles: r.distanceMiles, distanceKm: r.distanceKm, geometry: geom, imported: true }];
    state.selected = 0; state.between = {}; state.routeKey = null;
    const cs = geom.coordinates;
    setStatus('Imported route — resolving endpoints…');
    await resolveEndpoint('A', { lon: cs[0][0], lat: cs[0][1] }, 'imported start', { pan: false });
    await resolveEndpoint('B', { lon: cs[cs.length - 1][0], lat: cs[cs.length - 1][1] }, 'imported end', { pan: true });
    render();
    setStatus(`Imported route (${fmt}): ${state.routes[0].distanceMiles.toFixed(1)} mi`);
  } catch (e) {
    setStatus(`Import failed: ${e.message}`);
  }
}

function clearImport() {
  state.routeSource = 'computed';
  state.routes = []; state.routeKey = null; state.between = {};
  if (state.A && state.B) refreshRoute(); else render();
}
```

(`turf` must be importable in app.js. If app.js does not already import turf, add `import * as turf from '@turf/turf';` at the top.)

- [ ] **Step 5: Show level names in `renderLabel` + the levels caption.** Replace the body of `renderLabel` with:

```js
function renderLabel(key) {
  const s = state[key];
  if (!s) return;
  const r = s.resolved;
  const cap = document.getElementById(`levels${key}`);
  if (r.outside) {
    $(`label${key}`).textContent = `${s.label} → Outside covered areas`;
    if (cap) cap.textContent = '';
    return;
  }
  const cfg = REGIONS[r.region];
  const parts = cfg.levels
    .map((l) => { const n = r.units[l.key]?.properties.NAME; return n ? `${n} — ${l.label}` : null; })
    .filter(Boolean);
  $(`label${key}`).textContent = `${s.label} → ${parts.join(' · ')} (${cfg.name})`;
  if (cap) cap.textContent = `Levels here: ${cfg.levels.map((l) => l.label).join(', ')}`;
}
```

- [ ] **Step 6: Wire the controls in `init`.** Add these lines inside `init()` (alongside the other control wiring):

```js
  $('importFile').addEventListener('change', (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => importRouteText(String(reader.result), file.name);
    reader.readAsText(file);
  });
  $('importPolyBtn').onclick = () => { const v = $('importPoly').value.trim(); if (v) importRouteText(v, ''); };
  $('clearImport').onclick = () => clearImport();
```

- [ ] **Step 7: Syntax check + headless cross-check**

Run: `cd ~/border-distance && node --check js/app.js && echo OK`
Run:
```bash
cd ~/border-distance && node --input-type=module -e '
import { readFile } from "node:fs/promises";
const html = await readFile("index.html","utf8");
const app = await readFile("js/app.js","utf8");
const ids = new Set();
for (const m of app.matchAll(/\$\([\x27\x22]([A-Za-z]+)[\x27\x22]\)/g)) ids.add(m[1]);
["importFile","importPoly","importPolyBtn","clearImport","levelsA","levelsB"].forEach(i=>ids.add(i));
console.log("MISSING:", [...ids].filter(id=>!html.includes("id=\""+id+"\"")).join(", ")||"NONE");
console.log("routeSource present:", app.includes("routeSource"));
'
```
Expected: `MISSING: NONE`, `routeSource present: true`.

- [ ] **Step 8: Full suite**

Run: `cd ~/border-distance && npm test 2>&1 | tail -4`
Expected: all pass (existing 34 + routeImport 7 = 41).

- [ ] **Step 9: Browser verification**

Run: `cd ~/border-distance && (python3 -m http.server 8000 >/tmp/serve.log 2>&1 &) && sleep 1 && echo served`. Open `http://localhost:8000/`. In the browser console, exercise import via a dynamic import (avoids needing a file dialog):
```js
const { parseRoute } = await import('./js/routeImport.js?v='+Date.now());
parseRoute('<gpx><trk><trkseg><trkpt lat="51.50" lon="-0.12"></trkpt><trkpt lat="51.55" lon="-0.36"></trkpt></trkseg></trk></gpx>','gpx');
```
Confirm it returns a LineString + distance with no console error. Then paste a London-area encoded polyline into the "encoded polyline" box → Load → confirm the route draws, endpoints resolve with level-name labels (e.g. "… — Local authority · England — Region (London)"), the "Levels here:" caption shows, and "Clear import" returns to computed mode. Stop server: `pkill -f "http.server 8000"`.

- [ ] **Step 10: Commit**

```bash
cd ~/border-distance
git add js/app.js
git commit -m "feat: route import source + clear; admin level-name labels"
```

---

### Task 4: README + final verification

**Files:** Modify `README.md`

- [ ] **Step 1:** Add to the README intro (after the existing first paragraph) a sentence: `You can also import a route (GPX, GeoJSON, KML, or an encoded polyline) to use as the path instead of the computed driving route; each endpoint shows the administrative levels it falls in and their names.` In "How it works", add a bullet: `- \`js/routeImport.js\` — parses an imported GPX/GeoJSON/KML/encoded-polyline route into a LineString + distance.`

- [ ] **Step 2:** Run `cd ~/border-distance && npm test 2>&1 | tail -3` → all pass (41).

- [ ] **Step 3: Commit**

```bash
cd ~/border-distance
git add README.md
git commit -m "docs: document route import and admin-level labels"
```

---

## Self-Review Notes

- **Spec coverage:** four-format parser + distance + validation (Task 1); import controls + captions (Task 2); route-source branch, endpoints-from-track-ends, resolve + bypass OSRM/alternatives, level-name labels + caption, long-track simplify, clear-import (Task 3); README (Task 4). Edge cases (empty/invalid/single-point, MultiLineString flatten, threshold-with-import via existing render, outside-coverage endpoints) covered by routeImport validation + the unchanged downstream render.
- **Naming consistency:** `detectFormat`/`parseRoute` → `{geometry, distanceKm, distanceMiles}`; app `state.routeSource` ('computed'|'imported'); `resolveEndpoint` (no refresh) vs `setEndpoint` (resolve+refresh); `importRouteText`/`clearImport`; DOM ids `importFile/importPoly/importPolyBtn/clearImport/levelsA/levelsB`. `refreshRoute` early-returns when imported so the existing computed body is untouched. Map/`drawSceneNow` already read `state.routes[selected].geometry` — imported route draws with no map change.
- **No placeholders:** every code step complete; the polyline test uses the canonical decode vector.
```
