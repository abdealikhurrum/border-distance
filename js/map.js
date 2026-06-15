import L from 'leaflet';

let map;
let pins = { A: null, B: null };
let overlay = L.layerGroup();

export function initMap(elId, onPick) {
  map = L.map(elId).setView([39.5, -98.35], 4); // continental US
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap',
  }).addTo(map);
  overlay.addTo(map);
  map.on('click', (e) => onPick({ lat: e.latlng.lat, lon: e.latlng.lng }));
  return map;
}

export function setPin(key, point) {
  if (pins[key]) map.removeLayer(pins[key]);
  pins[key] = L.marker([point.lat, point.lon], { draggable: true }).addTo(map).bindTooltip(`Point ${key}`);
  return pins[key];
}

export function panTo(point) {
  map.setView([point.lat, point.lon], Math.max(map.getZoom(), 9));
}

export function onPinDrag(key, handler) {
  if (pins[key]) pins[key].on('dragend', (e) => {
    const ll = e.target.getLatLng();
    handler({ lat: ll.lat, lon: ll.lng });
  });
}

export function clearOverlays() {
  overlay.clearLayers();
}

export function drawLevel(featA, featB, nearestPair) {
  overlay.clearLayers();
  const style = (color) => ({ color, weight: 2, fillOpacity: 0.1 });
  if (featA) L.geoJSON(featA, { style: style('#2563eb') }).addTo(overlay);
  if (featB) L.geoJSON(featB, { style: style('#dc2626') }).addTo(overlay);
  if (nearestPair) {
    const [a, b] = nearestPair; // [lon,lat] pairs
    L.polyline([[a[1], a[0]], [b[1], b[0]]], { color: '#16a34a', dashArray: '6 4', weight: 3 }).addTo(overlay);
  }
}
