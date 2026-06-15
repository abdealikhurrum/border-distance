import { createLoader } from './dataLoader.js';
import { resolvePoint } from './resolve.js';
import { pointToPoint, polygonDistance } from './distance.js';
import { geocode } from './geocode.js';
import { initMap, setPin, panTo, onPinDrag, drawLevel, clearOverlays } from './map.js';

const loader = createLoader('./data');
const state = { A: null, B: null, active: 'A', level: 'county', units: 'miles' };

const $ = (id) => document.getElementById(id);
const setStatus = (msg) => { $('status').textContent = msg || ''; };

function fmt(d, available, note) {
  if (!available) return `<span class="muted">${note || 'n/a'}</span>`;
  const v = state.units === 'miles' ? d.miles : d.km;
  const u = state.units === 'miles' ? 'mi' : 'km';
  return `${v.toFixed(1)} ${u}`;
}

function polyRow(label, fa, fb, note) {
  return (fa && fb)
    ? [label, fmt(polygonDistance(fa, fb), true)]
    : [label, fmt(null, false, note)];
}

function setActiveCard() {
  $('cardA').classList.toggle('active', state.active === 'A');
  $('cardB').classList.toggle('active', state.active === 'B');
}

async function setEndpoint(key, point, label) {
  setStatus(`Resolving point ${key}…`);
  try {
    const resolved = await resolvePoint(point, loader);
    state[key] = { point, resolved, label };
    setPin(key, point);
    onPinDrag(key, (p) => setEndpoint(key, p, `dragged pin (${p.lat.toFixed(4)}, ${p.lon.toFixed(4)})`));
    panTo(point);
    renderLabel(key);
    render();
  } catch (e) {
    setStatus(`Could not resolve point ${key}: ${e.message}`);
  }
}

function renderLabel(key) {
  const s = state[key];
  if (!s) return;
  const r = s.resolved;
  const parts = r.outsideUS
    ? ['Outside the US']
    : [r.place ? r.place.properties.NAME : 'unincorporated', r.county?.properties.NAME, r.state?.properties.NAME].filter(Boolean);
  $(`label${key}`).textContent = `${s.label} → ${parts.join(', ')}`;
}

function render() {
  const A = state.A, B = state.B;
  const rows = [];
  if (A && B && !A.resolved.outsideUS && !B.resolved.outsideUS) {
    rows.push(['Point-to-point', fmt(pointToPoint(A.point, B.point), true)]);
    rows.push(polyRow('City / Place', A.resolved.place, B.resolved.place, 'n/a (outside any incorporated place)'));
    rows.push(polyRow('County', A.resolved.county, B.resolved.county, 'n/a (no county)'));
    rows.push(polyRow('State', A.resolved.state, B.resolved.state, 'n/a'));
  } else if (A && B) {
    setStatus('One or both points are outside the US.');
  }
  $('results').querySelector('tbody').innerHTML = rows.length
    ? rows.map(([k, v]) => `<tr><td>${k}</td><td class="num">${v}</td></tr>`).join('')
    : '<tr><td class="muted">Set both points to see distances.</td></tr>';

  drawForLevel();
  if (A && B && !A.resolved.outsideUS && !B.resolved.outsideUS) setStatus('');
}

function featAtLevel(s) {
  if (!s || s.resolved.outsideUS) return null;
  return { state: s.resolved.state, county: s.resolved.county, place: s.resolved.place }[state.level];
}

function drawForLevel() {
  const A = state.A, B = state.B;
  if (!A || !B) { clearOverlays(); return; }
  const fa = featAtLevel(A), fb = featAtLevel(B);
  let nearest = null;
  if (fa && fb) nearest = polygonDistance(fa, fb).nearestPair;
  drawLevel(fa, fb, nearest);
}

async function handleGeocode(key) {
  const addr = $(`addr${key}`).value.trim();
  if (!addr) return;
  setStatus(`Looking up "${addr}"…`);
  try {
    const hit = await geocode(addr);
    if (!hit) { setStatus(`No match for "${addr}". Try "Set on map" instead.`); return; }
    await setEndpoint(key, { lat: hit.lat, lon: hit.lon }, hit.matchedLabel);
  } catch (e) {
    setStatus(`Geocoding failed: ${e.message}. Try "Set on map" instead.`);
  }
}

function init() {
  initMap('map', (point) => setEndpoint(state.active, point, `map pin (${point.lat.toFixed(4)}, ${point.lon.toFixed(4)})`));
  $('geoA').onclick = () => handleGeocode('A');
  $('geoB').onclick = () => handleGeocode('B');
  $('addrA').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleGeocode('A'); });
  $('addrB').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleGeocode('B'); });
  $('pinA').onclick = () => { state.active = 'A'; setActiveCard(); setStatus('Click the map to set Point A.'); };
  $('pinB').onclick = () => { state.active = 'B'; setActiveCard(); setStatus('Click the map to set Point B.'); };
  $('level').onchange = (e) => { state.level = e.target.value; drawForLevel(); };
  $('units').onchange = (e) => { state.units = e.target.value; render(); };
  setActiveCard();
  render();
}

init();
