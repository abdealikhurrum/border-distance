# Road Distance — Design (amendment)

**Date:** 2026-06-15
**Status:** Approved (pre-implementation)
**Amends:** `2026-06-15-border-distance-design.md`

## Summary

The original tool reports *straight-line* (as-the-crow-flies) distances: a
great-circle point-to-point, and minimum geometric boundary gaps between the
administrative units containing each endpoint. This amendment changes the metric
to **actual road/driving distance** along a single computed route from A to B.

The "distance collapses as you widen the administrative level" story is
preserved, now measured along the road route:

- **Point-to-point** = the driving distance of the route (with the straight-line
  distance kept as a small secondary reference).
- **City / County / State** = **route miles between the units**: of the single
  driving route A→B, the mileage lying outside *both* endpoints' units at that
  level. Adjacent units → ~0 (the route crosses straight over); non-adjacent →
  the miles driven through the territory in between.

Everything else from the original design is retained: geocoding, point-based
resolution to `{state, county, place}`, the Census TopoJSON data pipeline, and
the Leaflet map.

## Goals

- Report driving distance for the point-to-point figure.
- Report, per admin level, the route mileage that falls between the two
  endpoints' units (the road analog of the geometric gap).
- Keep the project a static site (no backend, no API key) by using a free
  public routing API for the route geometry; all clipping math stays local.

## Non-goals

- Turn-by-turn directions, travel time, traffic, or alternate routes.
- Routing that works offline or at production traffic scale (the public demo
  routers are fair-use).
- Geographies outside the United States.

## Core model

1. Resolve both endpoints to `{state, county, place}` (unchanged).
2. Fetch one driving route A→B from a free public router. The response gives the
   total driving distance and the route geometry (a GeoJSON LineString of
   `[lon,lat]` road coordinates).
3. **Point-to-point** = route total distance.
4. **Per level L** (place, county, state): let `unitA = A.resolved[L]`,
   `unitB = B.resolved[L]`. The level's number = the length of the route that
   lies outside both `unitA` and `unitB` ("between"). If either unit is null
   (unincorporated / no county), the level is "n/a".
5. The "between" portion of the route is also returned as geometry, so the map
   can highlight exactly the mileage that counts.

The polygon-clipping is computed locally with Turf; the only external dependency
is the router that returns the route geometry + distance.

## Architecture

Static site (unchanged libraries: Leaflet, Turf, topojson-client via import map).
Two new modules plus changes to `app.js` and `map.js`.

### New modules

- **`js/routing.js`** — `getRoute(a, b, fetchImpl = defaultFetch)` →
  `{ distanceMiles, distanceKm, geometry }` or null when no route is found.
  Calls the OSRM public demo:
  `https://router.project-osrm.org/route/v1/driving/{lonA},{latA};{lonB},{latB}?overview=full&geometries=geojson`.
  Reads `routes[0].distance` (meters → mi/km) and `routes[0].geometry` (GeoJSON
  LineString). Returns null when `code !== 'Ok'` or no routes. `fetch` is
  injectable for tests. (Fallback to FOSSGIS Valhalla is a documented option if
  OSRM CORS/availability fails; verified before building the UI.)

- **`js/routeBetween.js`** — *pure*, no DOM/network:
  `betweenDistance(routeLine, unitA, unitB)` →
  `{ betweenMiles, betweenKm, betweenLine }`. Densifies `routeLine` into small
  segments (Turf), classifies each segment by its midpoint
  (`booleanPointInPolygon` against `unitA` and `unitB`), sums the length of
  segments that are in neither unit, and collects those segments into a GeoJSON
  MultiLineString (`betweenLine`) for map highlighting.

### Changed modules

- **`js/app.js`** — when both endpoints are resolved and in the US, fetch the
  route once and cache it keyed by the `(A.point, B.point)` pair so that level
  and units toggles do not refetch. Compute the four figures from the cached
  route. Render driving point-to-point (plus straight-line reference) and the
  three between-the-units figures. Show async loading and error states for the
  routing call.

- **`js/map.js`** — add drawing of the driving route polyline, with the
  "between" portion (from `betweenLine`) highlighted in a distinct color. This
  replaces the old straight-line nearest-pair connector in the displayed output.

- **`js/distance.js`** — `pointToPoint` is retained (straight-line reference).
  `polygonDistance` is no longer used by the UI; the tested module stays in place
  but unwired.

## Data flow

1. Endpoint A and B set and resolved (existing flow).
2. Both present and in the US → `getRoute(A.point, B.point)` (cached by pair).
3. `distanceMiles` → point-to-point figure.
4. For each level: `betweenDistance(route.geometry, unitA, unitB)` → between
   figure (or "n/a" if a unit is null).
5. `app.js` renders the figures; `map.js` draws the route + between-highlight
   and the units at the selected level.

## Edge cases

- **No route found** (router returns `code !== 'Ok'`): clear error, no road
  figures shown.
- **Router unreachable / rate-limited**: error with a retry affordance; the
  straight-line `pointToPoint` may be shown as a fallback reference.
- **Either endpoint outside the US**: short-circuits before routing (existing
  behavior).
- **Null unit at a level** (unincorporated / no county): that level is "n/a".
- **Route briefly clips a third unit at a border crossing**: yields a small
  non-zero "between" for otherwise-adjacent units; acceptable.

## Implementation risks to verify first

1. **OSRM demo CORS + availability** from a static page. If blocked, fall back to
   FOSSGIS Valhalla (`valhalla.openstreetmap.de`, encoded-polyline shape).
   Verify before building the routing UI.
2. **Route-clipping accuracy** vs segment density and polygon simplification.
   Spot-check that adjacent counties give ~0 and a known non-adjacent pair gives
   a sensible intervening mileage.

## Testing

- `js/routing.js` — injectable fetch: parse an OSRM `Ok` response (distance +
  geometry), and return null on a `NoRoute` response.
- `js/routeBetween.js` — pure: a route crossing directly from square A into
  adjacent square B → `betweenMiles ≈ 0`; a route passing through a gap square
  between A and B → `betweenMiles ≈ gap length`; a `betweenLine` MultiLineString
  is returned for the gap case.
- `app.js` / `map.js` verified in-browser.

## Deployment

Still a static site, but the core feature now **requires network** for routing
(and geocoding) — it is no longer offline-capable. README and the "Known
limitations" section updated to note this and the OSRM-demo fair-use caveat.
