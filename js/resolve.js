import * as turf from '@turf/turf';
import { REGIONS, REGION_IDS } from './regions.js';

export function findContaining(point, features) {
  const pt = turf.point([point.lon, point.lat]);
  for (const f of features) {
    if (turf.booleanPointInPolygon(pt, f)) return f;
  }
  return null;
}

export async function detectRegion(point, loader) {
  const layers = await loader.getDetectLayers();
  for (const id of REGION_IDS) {
    const layer = layers[id];
    if (layer && findContaining(point, layer.features)) return id;
  }
  return null;
}

/**
 * Resolve a {lat, lon} point to a region and its admin units.
 * Returns { region, outside, units } where units maps the region's level keys
 * to a feature or null.
 */
export async function resolvePoint(point, loader) {
  const layers = await loader.getDetectLayers();
  let region = null;
  let detectFeat = null;
  for (const id of REGION_IDS) {
    const layer = layers[id];
    if (!layer) continue;
    const f = findContaining(point, layer.features);
    if (f) { region = id; detectFeat = f; break; }
  }
  if (!region) return { region: null, outside: true, units: {} };

  const cfg = REGIONS[region];
  // US place files are keyed by state FIPS; urban levels are fixed-path.
  const parentId = region === 'us' ? detectFeat.properties.STATEFP : null;

  const units = {};
  for (const lvl of cfg.levels) {
    if (lvl.key === cfg.detectKey) { units[lvl.key] = detectFeat; continue; }
    const fc = await loader.getLevel(region, lvl.key, parentId);
    units[lvl.key] = findContaining(point, fc.features);
  }
  return { region, outside: false, units };
}
