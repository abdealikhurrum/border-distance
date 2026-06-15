#!/usr/bin/env bash
set -euo pipefail
# Generate a metro "city" unit as a circular buffer around a centre point.
# A metro is treated as the core city plus its immediate surroundings within
# <radiusKm>; the radius just bounds the area (no external data needed).
# usage: prepare-metro-buffer.sh <outdir> <name> <lon> <lat> <radiusKm>
OUTDIR="$1"; NAME="$2"; LON="$3"; LAT="$4"; RKM="$5"
TMP=data/tmp; mkdir -p "$OUTDIR" "$TMP"

node --input-type=module -e '
import * as turf from "@turf/turf";
import { writeFileSync } from "node:fs";
const lon = Number(process.argv[1]);
const lat = Number(process.argv[2]);
const rkm = Number(process.argv[3]);
const name = process.argv[4];
const out = process.argv[5];
const poly = turf.buffer(turf.point([lon, lat]), rkm, { units: "kilometers" });
poly.properties = { NAME: name };
writeFileSync(out, JSON.stringify(turf.featureCollection([poly])));
' -- "$LON" "$LAT" "$RKM" "$NAME" "$TMP/metro_buffer.geojson"

npx -y mapshaper "$TMP/metro_buffer.geojson" \
  -simplify 20% keep-shapes \
  -o format=topojson quantization=1e5 force "$OUTDIR/city.topo.json"
grep -Eq '"type":"(Polygon|MultiPolygon)"' "$OUTDIR/city.topo.json" \
  || { echo "ERROR: no polygon in $OUTDIR/city.topo.json"; exit 1; }
echo "wrote $OUTDIR/city.topo.json (${NAME}, ${RKM}km around ${LON},${LAT})"
