# Road Distance — Design (amendment)

**Date:** 2026-06-15
**Status:** Approved (pre-implementation)
**Amends:** `2026-06-15-border-distance-design.md`

## Summary

The original tool reports *straight-line* (as-the-crow-flies) distances: a
great-circle point-to-point, and minimum geometric boundary gaps between the
administrative units containing each endpoint. This amendment changes the metric
to **actual road/driving distance** along a computed route from A to B, adds
**waypoints** for steering the route, and lets the user **pick among alternative
routes**.

The "distance collapses as you widen the administrative level" story is
preserved, now measured along the road route:

- **Point-to-point** = the driving distance of the selected route (with the
  straight-line distance kept as a small secondary reference).
- **City / County / State** = **route miles between the units**: of the selected
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
- Let the user steer the route through chosen points via ordered **waypoints**
  (the mechanism for routing through specific streets / highway entries).
- Let the user **choose among alternative routes** when no waypoints are set.
- Keep the project a static site (no backend, no API key) by using a free public
  routing API for the route geometry; all clipping math stays local.

## Non-goals

- Turn-by-turn directions, travel time, traffic.
- Declarative road preferences (avoid/prefer tolls, highways, ferries by
  type/name) — that would require a keyed API; steering is done via waypoints.
- Routing that works offline or at production traffic scale (the public demo
  routers are fair-use).
- Geographies outside the United States.

## Core model

1. Resolve endpoints A and B to `{state, county, place}` (unchanged). Waypoints
   are *not* resolved to units — they only shape the route path.
2. Build the ordered coordinate list `coords = [A, …waypoints, B]` and fetch
   driving route(s) from a free public router. With exactly two coordinates
   (no waypoints), request **alternatives**; the router returns one or more
   routes. With waypoints, a single route through them is returned (the router
   does not offer alternatives for multi-waypoint requests).
3. Each route gives a total driving distance and geometry (a GeoJSON LineString
   of `[lon,lat]` road coordinates).
4. The user selects a route (default: the first/shortest). For the selected
   route:
   - **Point-to-point** = route total distance.
   - **Per level L** (place, county, state): with `unitA = A.resolved[L]` and
     `unitB = B.resolved[L]`, the level's number = the length of the route that
     lies outside both `unitA` and `unitB` ("between"). If either unit is null
     (unincorporated / no county), the level is "n/a".
5. The "between" portion of the selected route is returned as geometry so the
   map can highlight exactly the mileage that counts.

Polygon-clipping is computed locally with Turf; the only external dependency is
the router that returns route geometry + distance.

## Architecture

Static site (unchanged libraries: Leaflet, Turf, topojson-client via import map).
Two new modules plus changes to `app.js` and `map.js`.

### New modules

- **`js/routing.js`** — `getRoute(coords, fetchImpl = defaultFetch, opts = {})`
  where `coords` is an ordered array of `{lat, lon}` (at least A and B, with any
  waypoints in between). Returns an **array** of routes
  `[{ distanceMiles, distanceKm, geometry }, …]`, or `[]` when no route is found.
  Calls the OSRM public demo:
  `https://router.project-osrm.org/route/v1/driving/{lon},{lat};…?overview=full&geometries=geojson`,
  appending `&alternatives=3` **only when `coords.length === 2`** (OSRM ignores/
  rejects alternatives with intermediate waypoints). Reads each
  `data.routes[i].distance` (meters → mi/km) and `data.routes[i].geometry`
  (GeoJSON LineString). Returns `[]` when `data.code !== 'Ok'` or no routes.
  `fetch` is injectable for tests. (Fallback to FOSSGIS Valhalla is a documented
  option if OSRM CORS/availability fails; verified before building the UI.)

- **`js/routeBetween.js`** — *pure*, no DOM/network:
  `betweenDistance(routeLine, unitA, unitB)` →
  `{ betweenMiles, betweenKm, betweenLine }`. Densifies `routeLine` into small
  segments (Turf), classifies each segment by its midpoint
  (`booleanPointInPolygon` against `unitA` and `unitB`), sums the length of
  segments in neither unit, and collects those segments into a GeoJSON
  MultiLineString (`betweenLine`) for map highlighting.

### Changed modules

- **`js/app.js`** — holds endpoints A and B, an **ordered waypoints array**, the
  returned **routes** array, and the **selected route index**. When A and B are
  resolved and in the US, build `coords = [A, …waypoints, B]` and fetch routes
  once, cached keyed by the full coordinate-sequence string (so level/units/
  route-selection toggles do not refetch). Refetch when A, B, or any waypoint is
  added / removed / reordered / moved. Default selection = route 0. Selecting a
  different alternative recomputes `betweenDistance` locally (cached per route
  index) without refetching. Renders: the alternatives list with each route's
  driving distance (shown only when there are no waypoints and more than one
  route), the four figures for the selected route, and the waypoint editor (add
  by address or map pin; list with remove + reorder). Async loading and error
  states for the routing call.

- **`js/map.js`** — draws all returned routes faint, the selected route bold with
  the "between" portion (from `betweenLine`) highlighted in a distinct color, the
  A/B endpoint markers, and numbered draggable waypoint markers. The map-click
  target extends to A / B / "add waypoint" depending on the active mode.

- **`js/distance.js`** — `pointToPoint` is retained (straight-line reference).
  `polygonDistance` is no longer used by the UI; the tested module stays in place
  but unwired.

## Data flow

1. Endpoints A and B set and resolved (existing flow); waypoints optionally added.
2. Both endpoints present and in the US → build `coords = [A, …waypoints, B]` →
   `getRoute(coords, fetch, { alternatives: waypoints.length === 0 })`
   (cached by the coordinate sequence).
3. User selects a route (default 0). `distanceMiles` → point-to-point figure.
4. For each level: `betweenDistance(selectedRoute.geometry, unitA, unitB)` →
   between figure (or "n/a" if a unit is null).
5. `app.js` renders the figures + alternatives list + waypoint editor; `map.js`
   draws the routes, the selected route's between-highlight, and the markers.

## Edge cases

- **No route found** (`data.code !== 'Ok'` or empty routes): clear error, no road
  figures shown.
- **Router unreachable / rate-limited**: error with a retry affordance; the
  straight-line `pointToPoint` may be shown as a fallback reference.
- **Either endpoint outside the US**: short-circuits before routing.
- **Null unit at a level** (unincorporated / no county): that level is "n/a".
- **Waypoints present**: alternatives are not requested/shown; a single steered
  route is used.
- **Route briefly clips a third unit at a border crossing**: yields a small
  non-zero "between" for otherwise-adjacent units; acceptable.

## Implementation risks to verify first

1. **OSRM demo CORS + availability** from a static page, including that
   `alternatives=3` returns multiple routes and that multi-waypoint requests
   succeed. If blocked, fall back to FOSSGIS Valhalla. Verify before building the
   routing UI.
2. **Route-clipping accuracy** vs segment density and polygon simplification.
   Spot-check that adjacent counties give ~0 and a known non-adjacent pair gives
   a sensible intervening mileage.

## Testing

- `js/routing.js` — injectable fetch:
  - two coordinates → URL includes `alternatives=3`; parses multiple routes into
    the array (distance + geometry each);
  - three coordinates (one waypoint) → URL omits `alternatives` and includes all
    three `lon,lat` pairs in order; parses the single route;
  - `data.code === 'NoRoute'` → returns `[]`.
- `js/routeBetween.js` — pure: a route crossing directly from square A into
  adjacent square B → `betweenMiles ≈ 0`; a route passing through a gap square
  between A and B → `betweenMiles ≈ gap length` and a non-empty `betweenLine`
  MultiLineString.
- `app.js` / `map.js` verified in-browser.

## Deployment

Still a static site, but the core feature now **requires network** for routing
(and geocoding) — it is no longer offline-capable. README and the "Known
limitations" section updated to note this and the OSRM-demo fair-use caveat.
