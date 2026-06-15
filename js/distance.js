import * as turf from '@turf/turf';

const KM_PER_MILE = 1.609344;

export function pointToPoint(a, b) {
  const km = turf.distance(turf.point([a.lon, a.lat]), turf.point([b.lon, b.lat]), { units: 'kilometers' });
  return { km, miles: km / KM_PER_MILE };
}

function lineFeatures(polyToLineResult) {
  return polyToLineResult.type === 'FeatureCollection' ? polyToLineResult.features : [polyToLineResult];
}

export function polygonDistance(a, b) {
  if (turf.booleanIntersects(a, b)) {
    return { km: 0, miles: 0, nearestPair: null };
  }
  const aLines = lineFeatures(turf.polygonToLine(a));
  const bLines = lineFeatures(turf.polygonToLine(b));
  let bestKm = Infinity;
  let bestPair = null;

  const scan = (srcLines, dstLines, srcIsA) => {
    for (const src of srcLines) {
      for (const coord of turf.coordAll(src)) {
        const pt = turf.point(coord);
        for (const dst of dstLines) {
          const snapped = turf.nearestPointOnLine(dst, pt, { units: 'kilometers' });
          if (snapped.properties.pointDistance < bestKm) {
            bestKm = snapped.properties.pointDistance;
            bestPair = srcIsA
              ? [coord, snapped.geometry.coordinates]
              : [snapped.geometry.coordinates, coord];
          }
        }
      }
    }
  };

  scan(aLines, bLines, true);
  scan(bLines, aLines, false);
  return { km: bestKm, miles: bestKm / KM_PER_MILE, nearestPair: bestPair };
}
