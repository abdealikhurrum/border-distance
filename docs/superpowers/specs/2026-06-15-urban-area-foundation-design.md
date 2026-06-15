# Urban-Area Coverage Foundation — Design

**Date:** 2026-06-15
**Status:** Approved (pre-implementation)
**Amends:** `2026-06-15-border-distance-design.md`, `2026-06-15-road-distance-design.md`
**Supersedes:** `2026-06-15-multi-country-design.md` (official-agency, whole-country
approach — abandoned in favor of OSM + curated urban areas)

## Summary

Generalize the tool from "US only" to a **set of covered regions**: the existing
US full-country dataset plus **curated urban areas** fetched one city at a time
from OpenStreetMap. Each urban area is the built-up city-plus-suburbs
agglomeration (the boundary you exit) together with its administrative
subdivisions. The existing driving-distance and route-miles-between-units metrics
are unchanged; an urban area is simply another unit a point can resolve to. This
foundation also adds an **optional distance threshold** and **threshold-aware
route optimization** using OSRM's alternative routes.

This is the **foundation**: it builds the region architecture, the OSM/Overpass
per-city pipeline, the threshold/optimization feature, and proves it end-to-end
with **one template city — London**. Adding the remaining cities (Birmingham,
Stuttgart, Paris, Mumbai, Hyderabad) is a mechanical follow-on (one Overpass
fetch + one registry entry per city).

## Goals

- Support multiple covered regions: US (full-country) and curated urban areas.
- For an urban area: resolve a point to its built-up agglomeration polygon and
  its admin subdivisions, and report the between-distance per level as today.
- Add an optional threshold; mark whether the selected level's between-distance
  meets it.
- When a threshold is set and the shortest route overshoots by ≤~10%, evaluate
  OSRM's alternative routes and select/flag one whose between-distance comes in
  under the threshold.
- Prove the architecture and the OSM pipeline on London.
- Keep the disclaimer; keep shipped artifacts framed generally.

## Non-goals (deferred)

- The other five metros (additive once London works).
- Whole-country Canada/Mexico (shelved).
- A US "urban area" level (US keeps place/county/state for now).
- Active reroute search beyond OSRM's offered alternatives.

## Region model

A region is either the US (full-country) or a curated urban area. Each region
declares ordered levels (smallest → largest) with labels:

- **US** (unchanged): `place` (City / Place), `county` (County), `state` (State).
- **Urban area** (e.g. London): `subdivision` (the local label, e.g. "Borough"),
  `urban` (the agglomeration, e.g. "Greater London"). The `urban` level is the
  qasr-relevant unit.

A small registry `js/regions.js` holds, per region: `{ id, name, kind, levels:
[{key,label}…], detectLayer, files }`. `kind` is `'country'` or `'urban'`.

## Detection & resolution

The detection layers — US states and every urban area's agglomeration polygon —
are loaded upfront (small). `resolvePoint(point, loader)`:

1. If the point is in the US states layer → resolve the US chain
   (state→county→place), as today.
2. Else if the point is in some urban area's agglomeration polygon → resolve that
   urban area: `urban` = the agglomeration; `subdivision` = the containing
   subdivision (lazy-loaded for that city), or null.
3. Else → `outside: true`.

Returns `{ region, outside, units }` where `units` maps the region's level keys
to a feature or null.

## Between-distance across regions

The between computation is pure geometry (route miles outside both endpoints'
unit polygons) and works for any two polygons. The app computes it for **level
keys present in both endpoints' regions**:

- Two urban areas (e.g. London ↔ a future Paris) share `urban` (and `subdivision`)
  → the urban-area between-distance is the qasr distance for that trip.
- Two US points share `place`/`county`/`state` (existing behavior).
- A US point ↔ an urban-area point share no level key → driving + straight-line
  only; per-level rows show "n/a (different region types)".

## Threshold & route optimization

- An optional numeric **threshold** input (miles or km, following the units
  toggle). Empty = no threshold (current behavior).
- When set, the selected level's between-distance row is marked **under** or
  **over** the threshold.
- **Optimization:** when a threshold is set, after the route(s) load, if the
  default (shortest) route's selected-level between-distance is over the
  threshold but by ≤ 10% (i.e. within `[threshold, threshold × 1.10]`), evaluate
  the OSRM alternatives' between-distances; if any alternative is ≤ threshold,
  auto-select it and note "switched to a route that stays under the threshold."
  If none qualifies, keep the shortest and note it. Alternatives are only
  available with no waypoints (existing OSRM constraint), so optimization is
  skipped when waypoints are set.

## Data: OSM via Overpass (London template)

Per city, `build/prepare-metro.sh <id>` queries Overpass, converts to GeoJSON
with `osmtogeojson`, normalizes properties to `{NAME}`, simplifies + quantizes
with mapshaper, and writes `data/metros/<id>/urban.topo.json` (agglomeration) and
`data/metros/<id>/subs.topo.json` (subdivisions).

Per-city config (in the build script and `regions.js`): `{ id, name, country,
aggRel (OSM relation id of the agglomeration), subAdminLevel }`.

- **London:** `aggRel = 175342` (Greater London), `subAdminLevel = 8` (London
  boroughs + City of London). Overpass: fetch the agglomeration relation geometry
  for `urban`, and `admin_level=8 boundary=administrative` areas within it for
  `subs`. (Relation id / admin level verified during the build risk-check; if the
  relation differs, adjust the config and report.)

`osmtogeojson` is added as a dev dependency for relation→polygon assembly.

## Architecture / components

- `js/regions.js` (new) — region registry (US + urban areas), level definitions,
  file layout, detection layer references.
- `js/dataLoader.js` (rewrite) — region/level-aware: `getDetectLayers()` (US
  states + all urban agglomerations, upfront), `getLevel(regionId, levelKey,
  parentId?)` (lazy where applicable). Caches by path.
- `js/resolve.js` (rewrite) — `findContaining` (unchanged), `detectRegion`,
  `resolvePoint` → `{region, outside, units}`.
- `js/app.js` (rewrite) — region-aware labels/levels (shared-level logic),
  threshold input + marking, optimization step, subdivision outlines via the
  existing `drawScene`.
- `index.html` — threshold input field; level select stays dynamic; disclaimer.
- `js/routing.js`, `js/routeBetween.js`, `js/map.js`, `js/geocode.js` — unchanged
  except `geocode.js` widens `countrycodes` to include the covered countries
  (`us,gb` for the London foundation; extended as cities are added).
- `build/prepare-metro.sh` (new) + `build/prepare-data.sh` runner updated;
  `build/prepare-us.sh` unchanged in behavior (US data stays where it is).

## Edge cases

- Point outside all covered regions → "outside covered areas"; no figures.
- Null subdivision (point in the agglomeration but outside any subdivision
  polygon) → that level "n/a".
- Different region types (US ↔ urban) → driving/straight-line only.
- Threshold set but overshoot > 10% → no optimization; show the over mark.
- Waypoints set → no alternatives → optimization skipped (driving still shown).
- Overpass/osmtogeojson failure at build → reported; the city is simply not added.

## Implementation risks to verify first

1. **Overpass + osmtogeojson for London** — confirm the agglomeration relation
   (175342) and `admin_level=8` subdivisions fetch, assemble into valid polygons,
   reproject/stay in WGS84 lon/lat, and that a London point resolves
   (`urban = Greater London`, `subdivision = ` the borough). This is the core
   pipeline risk; prove it before wiring the rest.
2. **Cross-region routing/labels** — confirm a London point and a US point behave
   (driving shown, per-level n/a).
3. **Optimization correctness** — with a synthetic threshold, confirm an
   alternative with a smaller between-distance is selected when within the 10%
   window.

## Testing

- `js/regions.js` — registry shape (each region has levels, a detect layer; urban
  regions have `urban` as the widest level).
- `js/resolve.js` — `detectRegion` picks US vs an urban area vs none across
  fixture detect layers; `resolvePoint` returns the region's `units`, null where
  uncontained, `outside` when no region matches.
- `js/dataLoader.js` — path building for US levels and metro `urban`/`subs`;
  caching.
- A pure **optimization helper** (`chooseRoute(routes, betweens, threshold)` →
  index) — unit-tested: returns the shortest when no threshold; keeps shortest
  when overshoot > 10%; switches to a qualifying alternative within the window;
  keeps shortest when none qualifies.
- Build risk-check (London resolution) and app/map verified in-browser.

## Deployment

Same static GitHub Pages deployment. Adds a small `data/metros/london/` folder.
README + disclaimer updated for the region model and the threshold feature.
