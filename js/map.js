import L from 'leaflet';

let map;
let pins = { A: null, B: null };
let overlay = L.layerGroup();
let wpMarkers = [];

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
  if (pins[key]) {
    pins[key].setLatLng([point.lat, point.lon]);
  } else {
    pins[key] = L.marker([point.lat, point.lon], { draggable: true }).addTo(map).bindTooltip(`Point ${key}`);
  }
  return pins[key];
}

export function panTo(point) {
  map.setView([point.lat, point.lon], Math.max(map.getZoom(), 9));
}

export function onPinDrag(key, handler) {
  if (!pins[key]) return;
  pins[key].off('dragend').on('dragend', (e) => {
    const ll = e.target.getLatLng();
    handler({ lat: ll.lat, lon: ll.lng });
  });
}

export function clearOverlays() {
  overlay.clearLayers();
}

export function drawScene({ unitA, unitB, routes, selectedIndex, betweenLine }) {
  overlay.clearLayers();
  const polyStyle = (color) => ({ color, weight: 2, fillOpacity: 0.08 });
  if (unitA) L.geoJSON(unitA, { style: polyStyle('#2563eb') }).addTo(overlay);
  if (unitB) L.geoJSON(unitB, { style: polyStyle('#dc2626') }).addTo(overlay);

  (routes || []).forEach((r, i) => {
    if (i === selectedIndex) return; // draw the selected route last, on top
    L.geoJSON(r.geometry, { style: { color: '#9ca3af', weight: 3, opacity: 0.6 } }).addTo(overlay);
  });
  if (routes && routes[selectedIndex]) {
    L.geoJSON(routes[selectedIndex].geometry, { style: { color: '#1d4ed8', weight: 5 } }).addTo(overlay);
  }
  if (betweenLine) {
    L.geoJSON(betweenLine, { style: { color: '#16a34a', weight: 6, opacity: 0.9 } }).addTo(overlay);
  }
}

export function setWaypoints(points, onDrag) {
  wpMarkers.forEach((m) => map.removeLayer(m));
  wpMarkers = points.map((p, i) => {
    const m = L.marker([p.lat, p.lon], { draggable: true }).addTo(map).bindTooltip(`Waypoint ${i + 1}`);
    m.on('dragend', (e) => {
      const ll = e.target.getLatLng();
      onDrag(i, { lat: ll.lat, lon: ll.lng });
    });
    return m;
  });
}
