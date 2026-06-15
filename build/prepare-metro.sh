#!/usr/bin/env bash
set -euo pipefail
# Fetch one OSM administrative relation as a simplified TopoJSON polygon.
# usage: prepare-metro.sh <outdir> <levelKey> <relId>
OUTDIR="$1"; KEY="$2"; REL="$3"
TMP=data/tmp; mkdir -p "$OUTDIR" "$TMP"
OVERPASS="https://overpass.kumi.systems/api/interpreter"
q="[out:json][timeout:120];relation(${REL});(._;>;);out body;"
curl -fsS "$OVERPASS" --data-urlencode "data=$q" -o "$TMP/${KEY}.osm.json"
npx -y osmtogeojson "$TMP/${KEY}.osm.json" > "$TMP/${KEY}.geojson"
npx -y mapshaper "$TMP/${KEY}.geojson" \
  -target 1 \
  -each 'NAME = name || ""' \
  -filter-fields NAME \
  -simplify 8% keep-shapes \
  -o format=topojson quantization=1e5 "$OUTDIR/${KEY}.topo.json"
echo "wrote $OUTDIR/${KEY}.topo.json"
