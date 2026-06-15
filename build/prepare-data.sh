#!/usr/bin/env bash
set -euo pipefail

YEAR=2023
TMP=data/tmp
BASE="https://www2.census.gov/geo/tiger/GENZ${YEAR}/shp"
MS="npx -y mapshaper"
SIMPLIFY="6%"
PRECISION="0.0001"

mkdir -p data/places "$TMP"

fetch_unzip() { # url destdir
  local url="$1" dest="$2"
  local zip="$TMP/$(basename "$url")"
  [ -f "$zip" ] || curl -fSL "$url" -o "$zip"
  mkdir -p "$dest"
  unzip -o -q "$zip" -d "$dest"
}

# States (upfront layer)
fetch_unzip "$BASE/cb_${YEAR}_us_state_500k.zip" "$TMP/state"
$MS "$TMP/state/cb_${YEAR}_us_state_500k.shp" \
  -filter-fields STATEFP,STUSPS,NAME \
  -simplify "$SIMPLIFY" keep-shapes \
  -o format=topojson no-quantization precision="$PRECISION" data/states.topo.json

# Counties (upfront layer)
fetch_unzip "$BASE/cb_${YEAR}_us_county_500k.zip" "$TMP/county"
$MS "$TMP/county/cb_${YEAR}_us_county_500k.shp" \
  -filter-fields STATEFP,COUNTYFP,NAME,NAMELSAD \
  -simplify "$SIMPLIFY" keep-shapes \
  -o format=topojson no-quantization precision="$PRECISION" data/counties.topo.json

# Places (per state, lazy layer). Pass FIPS args to limit (e.g. `48` for TX), else all 50 + DC.
STATES="${*:-01 02 04 05 06 08 09 10 11 12 13 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 41 42 44 45 46 47 48 49 50 51 53 54 55 56}"
for fips in $STATES; do
  url="$BASE/cb_${YEAR}_${fips}_place_500k.zip"
  if ! fetch_unzip "$url" "$TMP/place_$fips"; then
    echo "WARN: no place file for FIPS $fips, skipping"
    continue
  fi
  $MS "$TMP/place_$fips/cb_${YEAR}_${fips}_place_500k.shp" \
    -filter-fields STATEFP,PLACEFP,NAME,NAMELSAD \
    -simplify "$SIMPLIFY" keep-shapes \
    -o format=topojson no-quantization precision="$PRECISION" "data/places/${fips}.topo.json"
  echo "built data/places/${fips}.topo.json"
done

echo "done"
