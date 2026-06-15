import { feature } from 'topojson-client';
import { REGIONS, REGION_IDS } from './regions.js';

const defaultFetch = (...args) => fetch(...args);

function levelPath(base, regionId, levelKey, parentId) {
  const region = REGIONS[regionId];
  if (!region) throw new Error(`Unknown region: ${regionId}`);
  const lvl = region.levels.find((l) => l.key === levelKey);
  if (!lvl) throw new Error(`Unknown level "${levelKey}" for region "${regionId}"`);
  const f = lvl.file;
  if (f.path) return `${base}/${f.path}`;
  return `${base}/${f.lazyDir}/${parentId}.topo.json`;
}

export function createLoader(base = './data', fetchImpl = defaultFetch) {
  const cache = new Map();
  let detectLayers = null;

  async function loadTopo(path) {
    if (cache.has(path)) return cache.get(path);
    const res = await fetchImpl(path);
    if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
    const topo = await res.json();
    const objName = Object.keys(topo.objects)[0];
    if (!objName) throw new Error(`No objects in TopoJSON at ${path}`);
    const geo = feature(topo, topo.objects[objName]);
    cache.set(path, geo);
    return geo;
  }

  return {
    getLevel: (regionId, levelKey, parentId) => loadTopo(levelPath(base, regionId, levelKey, parentId)),
    async getDetectLayers() {
      if (detectLayers) return detectLayers;
      const out = {};
      for (const id of REGION_IDS) {
        out[id] = await loadTopo(levelPath(base, id, REGIONS[id].detectKey));
      }
      detectLayers = out;
      return out;
    },
  };
}
