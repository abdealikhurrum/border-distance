import * as turf from '@turf/turf';

const KM_PER_MILE = 1.609344;

export function detectFormat(filename = '', text = '') {
  const f = filename.toLowerCase();
  if (f.endsWith('.gpx')) return 'gpx';
  if (f.endsWith('.kml')) return 'kml';
  if (f.endsWith('.geojson') || f.endsWith('.json')) return 'geojson';
  const t = text.trimStart();
  if (/<gpx[\s>]/i.test(t)) return 'gpx';
  if (/<kml[\s>]/i.test(t)) return 'kml';
  if (t.startsWith('{') || t.startsWith('[')) return 'geojson';
  return 'polyline';
}

function geojsonCoords(text) {
  const data = JSON.parse(text);
  const geoms = [];
  const visit = (g) => {
    if (!g) return;
    if (g.type === 'FeatureCollection') g.features.forEach((f) => visit(f.geometry));
    else if (g.type === 'Feature') visit(g.geometry);
    else if (g.type === 'GeometryCollection') g.geometries.forEach(visit);
    else geoms.push(g);
  };
  visit(data);
  for (const g of geoms) {
    if (g.type === 'LineString') return g.coordinates;
    if (g.type === 'MultiLineString') return g.coordinates.flat();
  }
  return [];
}

function gpxCoords(text) {
  const pts = [];
  // Read lat/lon from each point's attributes independently, so either
  // attribute order (and a mix of both across points) parses correctly.
  const tagRe = /<(?:trkpt|rtept)\b([^>]*?)\/?>/gi;
  let m;
  while ((m = tagRe.exec(text))) {
    const attrs = m[1];
    const lat = /\blat=["']([-\d.]+)["']/.exec(attrs);
    const lon = /\blon=["']([-\d.]+)["']/.exec(attrs);
    if (lat && lon) pts.push([parseFloat(lon[1]), parseFloat(lat[1])]);
  }
  return pts;
}

function kmlCoords(text) {
  const m = /<coordinates>([\s\S]*?)<\/coordinates>/i.exec(text);
  if (!m) return [];
  return m[1].trim().split(/\s+/)
    .map((tok) => { const [lon, lat] = tok.split(',').map(Number); return [lon, lat]; })
    .filter((c) => Number.isFinite(c[0]) && Number.isFinite(c[1]));
}

function polylineCoords(str, precision = 5) {
  let index = 0, lat = 0, lng = 0, byte = 0, shift, result;
  const coords = [];
  const factor = Math.pow(10, precision);
  while (index < str.length) {
    shift = 0; result = 0;
    do { byte = str.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { byte = str.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    coords.push([lng / factor, lat / factor]);
  }
  return coords;
}

export function parseRoute(text, format) {
  if (!text || !text.trim()) throw new Error('Empty route input');
  let coords;
  if (format === 'geojson') coords = geojsonCoords(text);
  else if (format === 'gpx') coords = gpxCoords(text);
  else if (format === 'kml') coords = kmlCoords(text);
  else if (format === 'polyline') coords = polylineCoords(text.trim());
  else throw new Error(`Unknown format: ${format}`);
  if (!coords || coords.length < 2) throw new Error('No usable route line found (need at least 2 points)');
  const geometry = { type: 'LineString', coordinates: coords };
  const distanceKm = turf.length(turf.feature(geometry), { units: 'kilometers' });
  return { geometry, distanceKm, distanceMiles: distanceKm / KM_PER_MILE };
}
