#!/usr/bin/env bash
set -euo pipefail
# Fetch one OSM administrative relation as a simplified TopoJSON polygon.
# usage: prepare-metro.sh <outdir> <levelKey> <relId>
OUTDIR="$1"; KEY="$2"; REL="$3"
TMP=data/tmp; mkdir -p "$OUTDIR" "$TMP"
q="[out:json][timeout:120];relation(${REL});(._;>;);out body;"
# Try several public Overpass mirrors (the main de endpoint often 406/429s).
ENDPOINTS=(
  "https://overpass.kumi.systems/api/interpreter"
  "https://overpass-api.de/api/interpreter"
  "https://overpass.private.coffee/api/interpreter"
)
ok=0
for OVERPASS in "${ENDPOINTS[@]}"; do
  echo "trying $OVERPASS ..."
  if curl -fsS "$OVERPASS" --data-urlencode "data=$q" -o "$TMP/${KEY}.osm.json"; then ok=1; break; fi
done
[ "$ok" = 1 ] || { echo "all Overpass endpoints failed for relation ${REL}"; exit 1; }
npx -y osmtogeojson "$TMP/${KEY}.osm.json" > "$TMP/${KEY}.geojson"
# osmtogeojson emits the boundary polygon(s) plus member ways; mapshaper splits
# mixed geometry into layers and `-target 1` selects the first (the polygon
# layer for these admin relations). Verify resolution per city when adding more.
npx -y mapshaper "$TMP/${KEY}.geojson" \
  -target 1 \
  -each 'NAME = name || ""' \
  -filter-fields NAME \
  -simplify 8% keep-shapes \
  -o format=topojson quantization=1e5 "$OUTDIR/${KEY}.topo.json"
# Sanity guard: a wrong/empty relation (or the wrong mapshaper layer) would write
# a file with no polygons. Catch that here rather than at resolve time.
grep -Eq '"type":"(Polygon|MultiPolygon)"' "$OUTDIR/${KEY}.topo.json" \
  || { echo "ERROR: no polygon geometry in $OUTDIR/${KEY}.topo.json (check relation ${REL} / mapshaper layer)"; exit 1; }
echo "wrote $OUTDIR/${KEY}.topo.json"
