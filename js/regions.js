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
      { key: 'region', label: 'Region', relId: 58447, file: { path: 'metros/london/region.topo.json' } },
    ],
  },
  // Additional metros: each is its real local-government units within ~50 km of
  // the centre (a single `district` level, country-appropriate label).
  birmingham: {
    id: 'birmingham', name: 'Birmingham', kind: 'urban', detectKey: 'district',
    metroCenter: [-1.8904, 52.4862], metroRadiusKm: 50,
    levels: [{ key: 'district', label: 'Local authority', file: { path: 'metros/birmingham/districts.topo.json' } }],
  },
  stuttgart: {
    id: 'stuttgart', name: 'Stuttgart', kind: 'urban', detectKey: 'district',
    metroCenter: [9.1829, 48.7758], metroRadiusKm: 50,
    levels: [{ key: 'district', label: 'Kreis', file: { path: 'metros/stuttgart/districts.topo.json' } }],
  },
  paris: {
    id: 'paris', name: 'Paris', kind: 'urban', detectKey: 'district',
    metroCenter: [2.3522, 48.8566], metroRadiusKm: 50,
    levels: [{ key: 'district', label: 'Département', file: { path: 'metros/paris/districts.topo.json' } }],
  },
  mumbai: {
    id: 'mumbai', name: 'Mumbai', kind: 'urban', detectKey: 'district',
    metroCenter: [72.8777, 19.0760], metroRadiusKm: 50,
    levels: [{ key: 'district', label: 'Municipal Corporation', file: { path: 'metros/mumbai/districts.topo.json' } }],
  },
  hyderabad: {
    id: 'hyderabad', name: 'Hyderabad', kind: 'urban', detectKey: 'district',
    metroCenter: [78.4867, 17.3850], metroRadiusKm: 50,
    levels: [{ key: 'district', label: 'Municipal Corporation', file: { path: 'metros/hyderabad/districts.topo.json' } }],
  },
  // Full-country coverage (like the US). Statistics Canada 2021 boundaries.
  ca: {
    id: 'ca', name: 'Canada', kind: 'country', detectKey: 'province',
    levels: [
      { key: 'csd', label: 'Census subdivision', file: { lazyDir: 'ca/csd', parent: 'province' } },
      { key: 'cd', label: 'Census division', file: { path: 'ca/cd.topo.json' } },
      { key: 'province', label: 'Province / Territory', file: { path: 'ca/provinces.topo.json' } },
    ],
  },
};

export const REGION_IDS = Object.keys(REGIONS);
