import * as turf from '@turf/turf';

const KM_PER_MILE = 1.609344;
const CHUNK_KM = 0.25;

export function betweenDistance(routeLine, unitA, unitB) {
  const line = routeLine.type === 'Feature' ? routeLine : turf.feature(routeLine);
  const chunks = turf.lineChunk(line, CHUNK_KM, { units: 'kilometers' });

  let betweenKm = 0;
  const betweenSegs = [];
  for (const seg of chunks.features) {
    const coords = seg.geometry.coordinates;
    if (coords.length < 2) continue;
    const mid = turf.midpoint(turf.point(coords[0]), turf.point(coords[coords.length - 1]));
    const inA = unitA && turf.booleanPointInPolygon(mid, unitA);
    const inB = unitB && turf.booleanPointInPolygon(mid, unitB);
    if (!inA && !inB) {
      betweenKm += turf.length(seg, { units: 'kilometers' });
      betweenSegs.push(coords);
    }
  }

  return {
    betweenKm,
    betweenMiles: betweenKm / KM_PER_MILE,
    betweenLine: betweenSegs.length ? turf.multiLineString(betweenSegs) : null,
  };
}
