// Region registry. levels are ordered smallest -> largest. detectKey is the
// level whose polygon is used to detect the region (US: state; urban: city).
// US level files keep their existing flat paths; urban files live under metros/.
export const REGIONS = {
  us: {
    id: 'us', name: 'United States', kind: 'us', detectKey: 'state',
    levels: [
      { key: 'place', label: 'City / Place', file: { lazyDir: 'places', parent: 'state' } },
      { key: 'county', label: 'County', file: { path: 'counties.topo.json' } },
      { key: 'state', label: 'State', file: { path: 'states.topo.json' } },
    ],
  },
  london: {
    id: 'london', name: 'London', kind: 'urban', detectKey: 'city',
    levels: [
      // `city` is a metro buffer (core + immediate surroundings within km of center);
      // built by build/prepare-metro-buffer.sh. `region` is the OSM admin relation.
      { key: 'city', label: 'London', buffer: { center: [-0.1276, 51.5072], km: 50 }, file: { path: 'metros/london/city.topo.json' } },
      { key: 'region', label: 'England', relId: 58447, file: { path: 'metros/london/region.topo.json' } },
    ],
  },
};

export const REGION_IDS = Object.keys(REGIONS);
