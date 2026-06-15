# Urban-Area Coverage Foundation — Design

**Date:** 2026-06-15
**Status:** Approved (pre-implementation)
**Amends:** `2026-06-15-border-distance-design.md`, `2026-06-15-road-distance-design.md`
**Supersedes:** `2026-06-15-multi-country-design.md` (official-agency, whole-country
approach — abandoned in favor of OSM + curated urban areas)

## Summary

Generalize the tool from "US only" to a **set of covered regions**: the existing
US full-country dataset plus **curated urban areas** fetched one city at a time
from OpenStreetMap. Each urban area is modeled as the built-up city-plus-suburbs
agglomeration ("city") together with the administrative units that contain it
(region / state-equivalents) — the same shape as the US city/county/state
hierarchy. The existing driving-distance and route-miles-between-units metrics
are unchanged; an urban area is just another region a point can resolve to.

This foundation also adds an **optional distance threshold** and **threshold-aware
route optimization** using OSRM's alternative routes.

It is the **foundation**: it builds the region architecture, the OSM/Overpass
per-city pipeline, the threshold/optimization feature, and proves it end-to-end
with **one template city — London**. Adding the remaining cities (Birmingham,
Stuttgart, Paris, Mumbai, Hyderabad) is a mechanical follow-on (one per-city
config + Overpass fetch each).

## Goals

- Support multiple covered regions: US (full-country) and curated urban areas.
- For an urban area: resolve a point to its built-up agglomeration ("city") and
  the administrative units that contain it, and report the between-distance per
  level as today.
- Add an optional threshold; mark whether the selected level's between-distance
  meets it.
- When a threshold is set and the shortest route overshoots by ≤~10%, evaluate
  OSRM's alternative routes and select/flag one whose between-distance comes in
  under the threshold.
- Prove the architecture and the OSM pipeline on London.
- Keep the disclaimer; keep shipped artifacts framed generally and neutrally.

## Non-goals (deferred)

- The other five cities (additive once London works).
- Whole-country Canada/Mexico (shelved).
- Sub-city subdivisions (boroughs/wards) — the model keeps the city and the
  admin units *above* it, not below.
- A US "urban area" level (US keeps place/county/state for now).
- Active reroute search beyond OSRM's offered alternatives.

## Region model

A region is either the US (full-country) or a curated urban area. Each region
declares ordered levels (smallest → largest), each with a key and a label:

- **US** (unchanged): `place` (City / Place), `county` (County), `state` (State).
- **Urban area** (e.g. London): `city` (the built-up agglomeration — always
  present, the smallest level) plus the administrative units that contain it,
  ordered outward. London: `city` (Greater London), `region` (England). Other
  cities may have a different number of "beyond city" levels (e.g. a district
  and a state), but every urban area has the universal `city` level.

The universal `city` key lets any two urban areas be compared at the city level.
US and urban regions use different keys, so a US↔urban pair shares no level (see
Between-distance).

A small registry `js/regions.js` holds, per region: `{ id, name, kind, levels:
[{ key, label }…] }`. `kind` is `'us'` or `'urban'`. For urban regions each level
also carries the OSM relation id used to fetch it (see Data).

## Detection & resolution

The detection layers — US states and every urban area's `city` polygon — are
loaded upfront (small). `resolvePoint(point, loader)`:

1. If the point is in the US states layer → resolve the US chain
   (state→county→place), as today.
2. Else if the point is in some urban area's `city` polygon → that is the region;
   resolve each of its levels (each level is one containing polygon; since the
   levels nest, all contain the point).
3. Else → `outside: true`.

Returns `{ region, outside, units }` where `units` maps the region's level keys to
a feature (or null where a level's polygon does not contain the point).

## Between-distance across regions

The between computation is pure geometry (route miles outside both endpoints'
unit polygons) and works for any two polygons. The app computes it for **level
keys present in both endpoints' regions**:

- Two urban areas (e.g. London ↔ a future Paris) share `city` → the city-level
  between-distance is defined for that trip.
- Two US points share `place`/`county`/`state` (existing behavior).
- A US point ↔ an urban-area point share no level key → driving + straight-line
  only; per-level rows show "n/a (different region types)".

## Threshold & route optimization

- An optional numeric **threshold** input (in the active units, following the
  units toggle). Empty = no threshold (current behavior).
- When set, the selected level's between-distance row is marked **under** or
  **over** the threshold.
- **Optimization:** when a threshold is set, after the route(s) load, if the
  default (shortest) route's selected-level between-distance is over the
  threshold but by ≤ 10% (within `[threshold, threshold × 1.10]`), evaluate the
  OSRM alternatives' between-distances; if any alternative is ≤ threshold,
  auto-select it and note "switched to a route that stays under the threshold."
  If none qualifies, keep the shortest and note it. Alternatives exist only with
  no waypoints (existing OSRM constraint), so optimization is skipped when
  waypoints are set. The selection rule is a pure, unit-tested helper.

## Data: OSM via Overpass (London template)

Each urban-area level is a specific OSM administrative relation, fetched by id.
`build/prepare-metro.sh <id>` queries Overpass for each configured relation,
converts to GeoJSON with `osmtogeojson` (relation→polygon assembly), normalizes
properties to `{ NAME }`, simplifies + quantizes with mapshaper, and writes one
file per level: `data/metros/<id>/<levelKey>.topo.json`. (OSM data is already in
WGS84 lon/lat — no reprojection needed.)

Per-city config (in the build script and `regions.js`): an ordered list of
`{ key, label, relId }`.

- **London:** `city` = Greater London (OSM relation `175342`), `region` =
  England (OSM relation `58447`). Verified during the build risk-check; if a
  relation id differs, adjust the config and report.

`osmtogeojson` is added as a dev dependency.

## Architecture / components

- `js/regions.js` (new) — region registry (US + urban areas), level definitions
  and (for urban) per-level OSM relation ids.
- `js/dataLoader.js` (rewrite) — region/level-aware: `getDetectLayers()` (US
  states + all urban `city` polygons, upfront) and `getLevel(regionId, levelKey,
  parentId?)` (US `place` stays lazy-by-state; others fixed paths). Caches by path.
- `js/resolve.js` (rewrite) — `findContaining` (unchanged), `detectRegion`,
  `resolvePoint` → `{ region, outside, units }`.
- `js/app.js` (rewrite) — region-aware labels/levels (shared-level logic),
  threshold input + under/over marking, the optimization step, drawing the
  resolved unit polygons via the existing `drawScene`.
- `js/routeChoice.js` (new) — pure `chooseRoute(routes, betweenKms, thresholdKm)`
  → selected index, encoding the optimization rule.
- `index.html` — add a threshold input field; level select stays dynamic;
  disclaimer present.
- `js/routing.js`, `js/routeBetween.js`, `js/map.js` — unchanged. `js/geocode.js`
  — widen `countrycodes` to `us,gb` for the London foundation (extended per city).
- `build/prepare-metro.sh` (new); `build/prepare-data.sh` runner updated;
  `build/prepare-us.sh` unchanged in behavior (US data stays where it is).

## Edge cases

- Point outside all covered regions → "outside covered areas"; no figures.
- A level's polygon does not contain the point → that level "n/a".
- Different region types (US ↔ urban) → driving/straight-line only.
- Threshold set but overshoot > 10% → no optimization; show the over mark.
- Waypoints set → no alternatives → optimization skipped (driving still shown).
- Overpass/osmtogeojson failure at build → reported; the city is simply not added.

## Implementation risks to verify first

1. **Overpass + osmtogeojson for London** — confirm relations `175342` (Greater
   London) and `58447` (England) fetch, assemble into valid WGS84 polygons, and
   that a London point resolves (`city = Greater London`, `region = England`).
   This is the core pipeline risk; prove it before wiring the rest.
2. **Cross-region behavior** — confirm a London point and a US point produce
   driving/straight-line only with per-level "n/a (different region types)".
3. **Optimization rule** — `chooseRoute` selects a qualifying alternative within
   the 10% window and otherwise keeps the shortest (unit-tested).

## Testing

- `js/regions.js` — registry shape (each region has ordered levels; urban regions
  have `city` as the smallest level and a `relId` per level).
- `js/resolve.js` — `detectRegion` picks US vs an urban area vs none across
  fixture detect layers; `resolvePoint` returns the region's `units`, null where
  uncontained, `outside` when no region matches.
- `js/dataLoader.js` — path building for US levels and metro level files; caching.
- `js/routeChoice.js` — shortest when no threshold; keep shortest when overshoot
  > 10%; switch to a qualifying alternative within the window; keep shortest when
  none qualifies.
- Build risk-check (London resolution) and app/map verified in-browser.

## Deployment

Same static GitHub Pages deployment. Adds a small `data/metros/london/` folder.
README + disclaimer updated for the region model and the threshold feature.
