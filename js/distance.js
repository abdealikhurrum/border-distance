import * as turf from '@turf/turf';

const KM_PER_MILE = 1.609344;

export function pointToPoint(a, b) {
  const km = turf.distance(turf.point([a.lon, a.lat]), turf.point([b.lon, b.lat]), { units: 'kilometers' });
  return { km, miles: km / KM_PER_MILE };
}
