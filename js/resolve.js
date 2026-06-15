import * as turf from '@turf/turf';

export function findContaining(point, features) {
  const pt = turf.point([point.lon, point.lat]);
  for (const f of features) {
    if (turf.booleanPointInPolygon(pt, f)) return f;
  }
  return null;
}

/**
 * Resolve a {lat, lon} point to its containing admin units.
 * Returns { outsideUS, state, county, place }. `place` is null for
 * unincorporated areas; `county` may also be null near simplified coastlines.
 */
export async function resolvePoint(point, loader) {
  const states = await loader.getStates();
  const state = findContaining(point, states.features);
  if (!state) return { outsideUS: true, state: null, county: null, place: null };

  const counties = await loader.getCounties();
  const county = findContaining(point, counties.features);

  const stateFips = state.properties.STATEFP;
  const places = await loader.getPlaces(stateFips);
  const place = findContaining(point, places.features);

  return { outsideUS: false, state, county, place };
}
