# Border Distance

A static web tool covering the **United States and London** (more cities to
come). Pick two points (by address or by clicking the map), optionally add
waypoints, and see the **driving distance** between them plus how much of the
route falls *between* their administrative units at each level. Each point is
resolved to the specific polygons that contain it; the levels are
region-specific (US: place/county/state; London: city/region). Set an optional
**threshold** and the tool marks whether the selected level's between-distance
meets it — and, when the shortest route overshoots by ≤10%, it will pick an
alternative route that comes in under. When there are no waypoints, the tool also
offers alternative routes to choose from.

For example, driving McKinney → Dallas is ~30 mi, but the **county-between**
figure is ~0 because the route crosses straight from Collin County into the
bordering Dallas County.

## Run locally

    npm install        # dev deps (Turf, topojson-client, mapshaper) for tests + data build
    npm run serve      # serves at http://localhost:8000

The page itself needs no build step or backend; it loads Turf/Leaflet/topojson
from a CDN via an import map.

## Rebuild the boundary data

    npm run build:data              # all states (downloads from US Census, simplifies via mapshaper)
    bash build/prepare-data.sh 48   # just one state (FIPS 48 = Texas)

Outputs simplified, quantized TopoJSON to `data/`. Requires `curl`, `unzip`, and
Node (npx). Raw downloads are cached under `data/tmp/` (git-ignored).

## Tests

    npm test    # node --test over the pure modules (distance, resolve, geocode, dataLoader)

## How it works

- `js/geocode.js` — address → point via Nominatim (OpenStreetMap).
- `js/dataLoader.js` — fetches + caches TopoJSON, converts to GeoJSON (states and
  counties upfront; place polygons lazily, one file per state).
- `js/regions.js` — registry of covered regions (US full-country + curated
  cities like London) and their ordered admin levels + data-file layout.
- `js/resolve.js` — detects a point's region and resolves it to that region's
  containing admin units.
- `js/routeChoice.js` — pure rule that picks a route under the threshold when the
  shortest overshoots by ≤10%.
- `build/prepare-metro.sh` — fetches a city's OSM admin relations (via Overpass)
  into simplified TopoJSON.
- `js/distance.js` — pure geometry: great-circle point-to-point (the
  straight-line reference). (`polygonDistance` is also exported and tested but
  is no longer wired into the UI, which now uses route-between mileage.)
- `js/routing.js` — fetches driving route(s) from the OSRM public demo
  (alternatives when there are no waypoints; a single route through any
  waypoints).
- `js/routeBetween.js` — pure: clips a route polyline against two unit polygons
  to measure the mileage lying between them.
- `js/map.js` / `js/app.js` — Leaflet map and UI orchestration.

## Known limitations

- **Requires network.** Distances are driving distances: each query calls a
  routing service (OSRM public demo, `router.project-osrm.org`) for the route
  geometry, and addresses are geocoded online. The tool is no longer
  offline-capable. The OSRM demo server is fair-use and not guaranteed for
  production traffic; if it is unavailable, routing fails with a retry message.
- **Route steering is via waypoints**, not declarative road preferences. There
  is no "avoid tolls / prefer highway X" — drop a waypoint on the road or entry
  point you want. Auto-generated alternatives are offered only when no waypoints
  are set (an OSRM constraint).
- **Coastal / ocean water is not covered.** The data comes from the US Census
  *cartographic boundary* files, which are clipped to the shoreline. A point
  dropped offshore or in a coastal bay resolves to nothing and is reported as
  "outside the US." Distances between two jurisdictions facing each other across
  a bay or the ocean therefore reflect the shoreline-to-shoreline water gap, and
  the tool does **not** model legal territorial-sea jurisdiction (the 3-mile
  limit). *Inland* water is included: reservoirs and lakes inside a jurisdiction
  resolve normally, and states/counties that share a river boundary read as 0.
- **Approximation only.** Boundary, geocoding, and routing data come from public
  sources (US Census, OpenStreetMap/Nominatim, OSRM); no guarantee of accuracy —
  not for navigation, legal, or official use.
- **Coverage** is the US plus curated cities (currently London). Points elsewhere
  report "outside covered areas." Cross-region pairs (e.g. a US point and a London
  point) show driving + straight-line only; the per-level between figures appear
  only for levels both points share.
- Boundaries are simplified for size; sub-kilometer precision, which is well
  within the tool's 0.1-mile reporting resolution.

## Deploy

Static — push to a GitHub Pages branch/repo and serve the root. All of
`index.html`, `js/`, and `data/` must be published together.

## Data source

US Census Bureau cartographic boundary files (GENZ2023), 1:500k. City boundaries:
OpenStreetMap administrative relations via Overpass. Geocoding: Nominatim
(OpenStreetMap). Routing: OSRM public demo.
