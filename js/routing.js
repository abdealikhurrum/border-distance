const defaultFetch = (...args) => fetch(...args);
const M_PER_MILE = 1609.344;

export async function getRoute(coords, fetchImpl = defaultFetch, opts = {}) {
  const path = coords.map((c) => `${c.lon},${c.lat}`).join(';');
  let url = `https://router.project-osrm.org/route/v1/driving/${path}?overview=full&geometries=geojson`;
  if (coords.length === 2 && opts.alternatives) url += '&alternatives=3';

  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`Routing failed: ${res.status}`);
  const data = await res.json();
  if (data.code !== 'Ok' || !Array.isArray(data.routes) || data.routes.length === 0) return [];

  return data.routes.map((r) => ({
    distanceMiles: r.distance / M_PER_MILE,
    distanceKm: r.distance / 1000,
    geometry: r.geometry,
  }));
}
