import { feature } from 'topojson-client';

const defaultFetch = (...args) => fetch(...args);

export function createLoader(base = './data', fetchImpl = defaultFetch) {
  const cache = new Map();

  async function loadTopo(path) {
    if (cache.has(path)) return cache.get(path);
    const res = await fetchImpl(path);
    if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
    const topo = await res.json();
    const objName = Object.keys(topo.objects)[0];
    const geo = feature(topo, topo.objects[objName]);
    cache.set(path, geo);
    return geo;
  }

  return {
    getStates: () => loadTopo(`${base}/states.topo.json`),
    getCounties: () => loadTopo(`${base}/counties.topo.json`),
    getPlaces: (stateFips) => loadTopo(`${base}/places/${stateFips}.topo.json`),
  };
}
