# Border Distance

A static web tool. Pick two US points (by address or by clicking the map) and
see the distance between them at four administrative levels: straight-line
(point-to-point), city/place boundary, county boundary, and state boundary.
Each point is resolved to the *specific* polygons that contain it, so a point in
the Collin-County part of Dallas is treated as Collin County — not Dallas County.

For example, McKinney → Dallas is ~30 mi point-to-point, but **0 mi** at the
county level because Collin County borders Dallas County.

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

- `js/geocode.js` — address → point (US Census Geocoder, Nominatim fallback).
- `js/dataLoader.js` — fetches + caches TopoJSON, converts to GeoJSON (states and
  counties upfront; place polygons lazily, one file per state).
- `js/resolve.js` — point-in-polygon resolution of a point to its containing
  `{state, county, place}`.
- `js/distance.js` — pure geometry: great-circle point-to-point, and
  polygon-to-polygon minimum boundary distance (0 when polygons touch/overlap).
- `js/map.js` / `js/app.js` — Leaflet map and UI orchestration.

## Known limitations

- **Coastal / ocean water is not covered.** The data comes from the US Census
  *cartographic boundary* files, which are clipped to the shoreline. A point
  dropped offshore or in a coastal bay resolves to nothing and is reported as
  "outside the US." Distances between two jurisdictions facing each other across
  a bay or the ocean therefore reflect the shoreline-to-shoreline water gap, and
  the tool does **not** model legal territorial-sea jurisdiction (the 3-mile
  limit). *Inland* water is included: reservoirs and lakes inside a jurisdiction
  resolve normally, and states/counties that share a river boundary read as 0.
- **Distances are geometric, not road/driving distances.**
- **United States only.**
- Boundaries are simplified for size; sub-kilometer precision, which is well
  within the tool's 0.1-mile reporting resolution.

## Deploy

Static — push to a GitHub Pages branch/repo and serve the root. All of
`index.html`, `js/`, and `data/` must be published together.

## Data source

US Census Bureau cartographic boundary files (GENZ2023), 1:500k.
Geocoding: US Census Geocoder, with Nominatim (OpenStreetMap) as a fallback.
