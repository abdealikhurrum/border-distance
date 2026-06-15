# Border Distance — Design

**Date:** 2026-06-15
**Status:** Approved (pre-implementation)

## Summary

A static web utility that, given two points in the US, reports the distance
between them at several administrative levels: straight-line (point-to-point),
city/place boundary, county boundary, and state boundary. The headline insight:
the distance collapses as you widen the administrative level — two points 30
miles apart can be 0 miles apart at the county level if their counties border,
and the tool makes that visible.

Each endpoint is resolved to the **specific** administrative units that contain
its point (not by city name), so multi-county cities are handled correctly. A
point in the Collin-County portion of Dallas is treated as Collin County, not
Dallas County.

## Goals

- Given two US points, show distance at four levels: point-to-point, city/place,
  county, state — in both miles and km.
- Resolve each point to the exact polygons that contain it (state, county,
  place), so the answer reflects the real location, not a city's nominal county.
- Run entirely client-side as a static site (GitHub Pages friendly), with
  geometry computed locally. No backend.

## Non-goals

- Driving/road distance (this is geometric distance only).
- Geographies outside the United States.
- Administrative levels below place (no tracts, ZIP, school districts) in v1.

## Core model

- An endpoint is a **point** (lat/lon), obtained either by geocoding a typed
  address or by placing/dragging a map pin. The pin is the offline-capable
  source of truth; geocoding is a convenience used only at input time.
- At query time, each point is resolved by point-in-polygon to its containing
  `{state, county, place|null}`. `place` is null for unincorporated areas.
- Distance at each level is computed between the two resolved polygons:
  - **Point-to-point:** great-circle distance between the two actual input
    points.
  - **City/place:** place(A) polygon ↔ place(B) polygon.
  - **County:** county(A) polygon ↔ county(B) polygon.
  - **State:** state(A) polygon ↔ state(B) polygon.
- Polygon ↔ polygon distance is 0 if the polygons intersect or touch; otherwise
  the minimum distance between their boundaries.

## Architecture

Pure static site (vanilla HTML/JS) plus a one-time data-build script. Runtime
libraries: Leaflet (map), Turf.js (geometry), topojson-client (TopoJSON →
GeoJSON).

### Runtime modules

Each module has a single responsibility and a clear interface.

- **`geocode.js`** — `geocode(addressString) → {lat, lon, matchedLabel}` via the
  US Census Geocoder (no API key). Handles no-match and multiple-match results.
  Network is required only here; failure degrades gracefully to pin-only input.
- **`dataLoader.js`** — loads and caches the TopoJSON files and converts them to
  GeoJSON: `states` and `counties` upfront, `places/<stateFips>` lazily on first
  need. Caches each file so it is fetched at most once.
- **`resolve.js`** — `resolve(point) → {state, county, place|null}` using Turf
  point-in-polygon. Flow: PIP against states → stateFips; if none, the point is
  outside the US. PIP against counties → county. Lazy-load that state's places,
  PIP → place or null. Names/FIPS are read from feature properties.
- **`distance.js`** — *pure*, no DOM/network:
  - `polygonDistance(polyA, polyB) → {miles, km, nearestPair}` — 0 if the
    polygons intersect/touch (Turf `booleanIntersects`); else the minimum
    boundary distance, computed by taking each boundary vertex of A and finding
    the nearest point on B's boundary (and vice versa), keeping the minimum and
    the nearest pair of points (for drawing the shortest segment).
  - `pointToPoint(a, b) → {miles, km}` — great-circle distance.
- **`map.js`** — Leaflet map: two draggable pins, draws the containing polygons
  for the currently selected level and the shortest connecting segment.
- **`app.js`** — orchestration: input → geocode/pin → resolve → distance →
  render the four numbers with a mi/km toggle; drives the map.

### Data files

Produced by `build/prepare-data.sh`, which downloads US Census cartographic
boundary files and uses **mapshaper** to simplify and emit quantized TopoJSON.

- `data/states.topo.json` — 50 states + DC, simplified. Loaded upfront.
- `data/counties.topo.json` — ~3,200 counties, simplified. Loaded upfront.
- `data/places/<STATEFIPS>.topo.json` — incorporated places / CDPs for one
  state. Lazy-loaded when a point resolves into that state.

Feature properties carry display name and FIPS, so no separate search index is
needed. (If the Census build is preferred in Python via geopandas + topojson
instead of mapshaper, that is an acceptable substitution; mapshaper is chosen
for smallest output with least effort.)

## Data flow

1. Page load: fetch `states.topo.json` and `counties.topo.json`.
2. User provides endpoint A: types an address (→ `geocode.js` → point) or drops
   a pin (→ point directly).
3. `resolve.js`: PIP states → stateFips; lazy-load `places/<stateFips>`; PIP
   county and place. Same for endpoint B.
4. `distance.js`: compute the four distances between the resolved
   polygons/points.
5. `app.js` renders the four numbers (mi/km); `map.js` draws pins, the polygons
   at the selected level, and the shortest segment.

## Edge cases

- **Address no-match:** show a message and prompt to drop a pin instead.
- **Multiple geocoder matches:** present them for the user to choose.
- **Point outside any US state** (ocean / other country): clear error; no
  distances computed.
- **Point in unincorporated area** (`place` = null): city level shows
  "n/a (outside any incorporated place)"; other levels still computed.
- **Same point twice:** all four distances are 0.
- **Same place / county / state:** that level reads 0 (expected — this is the
  whole point of the tool).
- **Multi-county city:** handled inherently because resolution is by point, not
  by city name.
- **Geocoder / network down:** pin input remains fully functional.

## Implementation risks to verify first

1. **Census Geocoder CORS** from a static page. If browser calls are blocked,
   fall back to the Nominatim (OSM) geocoder. Verify before building input UI.
2. **Census download + simplification** yields acceptably small per-state place
   files. Spot-check Texas (large, multi-county cities — the motivating case).

## Testing

- `distance.js` and `resolve.js` are pure and get unit tests with fixture
  polygons/points:
  - same place, different county → city = 0 but county > 0 (the Dallas/Collin
    vs Tarrant motivating case);
  - far-apart points → nonzero at every level;
  - identical input → 0 at every level;
  - point in unincorporated area → place = null.
- Manual verification checklist of a handful of known US point pairs.

## Deployment

Static site, deployable to GitHub Pages (consistent with existing tools). Data
files committed to the repo or fetched from a static path under the site.
