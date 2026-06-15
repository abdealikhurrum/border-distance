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
    id: 'london', name: 'London', kind: 'urban', detectKey: 'district',
    // `district` = real UK local authorities (ONS LAD) within ~50 km of the metro
    // centre; the 50 km bounds the download, the units are genuine admin polygons.
    // `region` is the OSM England relation. A point is "in the London metro" if it
    // falls in one of the loaded local authorities.
    metroCenter: [-0.1276, 51.5072], metroRadiusKm: 50,
    levels: [
      { key: 'district', label: 'Local authority', file: { path: 'metros/london/districts.topo.json' } },
      { key: 'region', label: 'England', relId: 58447, file: { path: 'metros/london/region.topo.json' } },
    ],
  },
};

export const REGION_IDS = Object.keys(REGIONS);
