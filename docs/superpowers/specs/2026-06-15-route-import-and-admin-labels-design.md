# Route Import + Admin-Level Labels — Design

**Date:** 2026-06-15
**Status:** Approved (pre-implementation)
**Amends:** `2026-06-15-road-distance-design.md`, `2026-06-15-urban-area-foundation-design.md`

## Summary

Two additions to the live tool:

1. **Route import** — load an external route (GPX, GeoJSON, KML, or an encoded
   polyline) and use it as the path between two points instead of fetching a
   driving route from OSRM. The imported line feeds the existing
   between-the-units / threshold / map pipeline unchanged.
2. **Admin-level labels** — for each resolved endpoint, show the *level* each
   unit belongs to (and a per-region list of available levels), using only the
   data already loaded — so the user can see which administrative levels apply
   and what they are named.

The entire downstream pipeline (point resolution, route-miles-between-units,
threshold marking, alternative selection, map drawing) already operates on a
route polyline + distance, so route import is mostly a new *route source*; the
rest is reused.

## Goals

- Accept a user-supplied route in GPX, GeoJSON, KML, or encoded-polyline form and
  treat it as the active route.
- Auto-derive the two endpoints from the imported track (first/last points),
  resolve them to admin units, and compute the between-distance along the
  imported line.
- Show, per resolved endpoint, each unit's admin **level name**, plus a caption
  of the region's available levels — all from preloaded data.
- Keep everything static and offline-friendly except the existing network needs
  (geocoding, OSRM when computing a route).

## Non-goals

- Multi-modal *routing* (transit/walk/cycle providers) — out of scope; import is
  the chosen path for external/other-source routes.
- Dynamic discovery of admin levels via live OSM queries (the "label what we
  preload" choice) — no new queries.
- Editing/snapping an imported track; it is used as given.

## Feature 1 — Route import

### `js/routeImport.js` (new, pure)

`parseRoute(text, format) → { geometry, distanceKm, distanceMiles }` where
`geometry` is a GeoJSON `LineString` (`{ type, coordinates: [[lon,lat], …] }`).
`format` is one of `geojson | gpx | kml | polyline`. Distance is
`turf.length(geometry, kilometers)` (and `/1.609344` for miles).

Parsers (each returns the ordered `[lon,lat]` coordinate array; the module
assembles the LineString):
- **geojson** — accept a `FeatureCollection`, `Feature`, or bare geometry; take
  the first `LineString`, or flatten the first `MultiLineString`.
- **gpx** — XML; concatenate all `<trkpt lat lon>` across track segments; if no
  track points, fall back to `<rtept lat lon>`. (Browser: `DOMParser`; the pure
  module accepts already-parsed coordinate extraction so it is unit-testable
  without a DOM — see Testing.)
- **kml** — XML; read `<LineString><coordinates>` (whitespace-separated
  `lon,lat[,ele]` tuples); first LineString.
- **polyline** — decode Google's encoded-polyline algorithm (precision 5) → coords.

`detectFormat(filename, text)` chooses by extension (`.gpx/.geojson/.json/.kml`),
falling back to content sniffing (`<gpx`, `<kml`, `{`), else treats input as an
encoded polyline.

Errors: throw a clear `Error` on empty input, unparseable content, or no usable
line (≥ 2 coordinates). The caller surfaces the message inline.

To keep the module DOM-free and testable, XML parsing is done by the caller
(browser `DOMParser`) which hands `routeImport` the extracted coordinate arrays;
`routeImport` owns format detection, polyline/geojson parsing (pure string/JSON),
LineString assembly, distance, and validation. (Equivalent: the GPX/KML coord
extraction is a small pure regex-based helper in `routeImport` so the whole
module is unit-testable — this is the approach taken: regex extraction of
`trkpt`/`rtept` lat/lon and KML `<coordinates>`, no DOM dependency.)

### App integration

- An **"Import route"** control in the panel: a file input (accepts
  `.gpx,.geojson,.json,.kml`) plus a small textarea to paste an encoded polyline,
  and a **"Clear import"** button.
- On import: read the text, `detectFormat`, `parseRoute` → set
  `state.routeSource = 'imported'` and `state.routes = [{ distanceMiles,
  distanceKm, geometry, imported: true }]`, `state.selected = 0`.
- **Endpoints**: set A = first coordinate, B = last coordinate of the imported
  line; resolve both via `resolvePoint` (populating units/labels) and drop pins.
- Compute the between-distance along the imported geometry (existing `betweenFor`).
- While `routeSource === 'imported'`: skip `getRoute`; hide/disable alternatives
  and waypoints (the path is given). "Clear import" sets `routeSource =
  'computed'` and re-runs the normal flow.
- The map draws the imported polyline via the existing `drawScene` (it already
  takes `routes`).
- Long tracks: if the geometry has more than a few thousand points, simplify with
  `turf.simplify` before clipping, to keep `betweenDistance` responsive.

## Feature 2 — Admin-level labels

Using only `regions.js` + the resolved `units` (no queries):
- In each endpoint's label, show the level name beside each unit, e.g.
  `Westminster — Local authority · England — Region` (London);
  `Dallas — City/Place · Dallas — County · Texas — State` (US). Outside coverage
  stays `Outside covered areas`.
- A one-line caption per resolved endpoint listing the region's available level
  labels (the taxonomy), e.g. `Levels here: Local authority, Region`.
- This is a `renderLabel` change plus a small caption element; no data or
  architecture change.

## Architecture / components

- `js/routeImport.js` — NEW, pure (format detection + parsing + LineString +
  distance + validation).
- `index.html` — import control (file input + polyline textarea + Clear button),
  and a small per-endpoint "levels" caption element.
- `js/app.js` — add `state.routeSource` (`'computed' | 'imported'`); import
  handler; branch `refreshRoute`/render to use the imported route and skip OSRM /
  alternatives / waypoints when imported; `renderLabel` shows level names; a
  `renderLevelsCaption` helper.
- Unchanged: `routing.js`, `routeBetween.js`, `routeChoice.js`, `resolve.js`,
  `dataLoader.js`, `regions.js`, `map.js`, `geocode.js`, `distance.js`.

## Edge cases

- Empty/invalid/no-line import → inline error; state unchanged.
- Imported endpoint(s) outside covered regions → resolves to "outside"; driving
  point-to-point of the imported line still shows; per-level rows "n/a".
- Imported endpoints in two different regions/region-types → shared-level logic
  applies as today.
- A `MultiLineString` import → flattened to one line (segments concatenated).
- Threshold with an imported route → marks under/over on the active level;
  optimization is skipped (no alternatives for a given path).

## Testing

- `js/routeImport.js` — unit tests with fixture strings:
  - geojson Feature/FeatureCollection/bare-geometry LineString → coords+distance;
  - gpx with `<trkpt>` across two `<trkseg>` (concatenated) and a `<rtept>`-only
    fallback;
  - kml `<LineString><coordinates>`;
  - encoded polyline decodes to known coords;
  - `detectFormat` picks by extension and by content sniff;
  - invalid/empty/single-point input throws.
- Admin-label rendering verified in-browser (a London import shows level names;
  a US pair shows place/county/state names).
- Full suite stays green; app/map verified in-browser.

## Deployment

Static GitHub Pages, as today. Adds one JS module; no new data. README updated to
describe importing a route and the admin-level labels.
