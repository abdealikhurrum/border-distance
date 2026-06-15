import { createLoader } from './dataLoader.js';
import { resolvePoint } from './resolve.js';
import { pointToPoint, polygonDistance } from './distance.js';
import { geocode } from './geocode.js';
import { initMap, setPin, panTo, onPinDrag, drawLevel, clearOverlays } from './map.js';

const loader = createLoader('./data');
const state = { A: null, B: null, active: 'A', level: 'county', units: 'miles', dist: null };
const seq = { A: 0, B: 0 };

const $ = (id) => document.getElementById(id);
const setStatus = (msg) => { $('status').textContent = msg || ''; };

function fmt(d, available, note) {
  if (!available) return `<span class="muted">${note || 'n/a'}</span>`;
  const v = state.units === 'miles' ? d.miles : d.km;
  const u = state.units === 'miles' ? 'mi' : 'km';
  return `${v.toFixed(1)} ${u}`;
}

function setActiveCard() {
  $('cardA').classList.toggle('active', state.active === 'A');
  $('cardB').classList.toggle('active', state.active === 'B');
}

async function setEndpoint(key, point, label, { pan = true } = {}) {
  const token = ++seq[key];
  setStatus(`Resolving point ${key}…`);
  try {
    const resolved = await resolvePoint(point, loader);
    if (token !== seq[key]) return; // superseded by a newer call
    state[key] = { point, resolved, label };
    setPin(key, point);
    onPinDrag(key, (p) => setEndpoint(key, p, `dragged pin (${p.lat.toFixed(4)}, ${p.lon.toFixed(4)})`, { pan: false }));
    if (pan) panTo(point);
    renderLabel(key);
    computeDistances();
    render();
  } catch (e) {
    if (token === seq[key]) setStatus(`Could not resolve point ${key}: ${e.message}`);
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

function computeDistances() {
  const A = state.A, B = state.B;
  if (!(A && B && !A.resolved.outsideUS && !B.resolved.outsideUS)) { state.dist = null; return; }
  const pd = (fa, fb) => (fa && fb) ? polygonDistance(fa, fb) : null;
  state.dist = {
    p2p: pointToPoint(A.point, B.point),
    place: pd(A.resolved.place, B.resolved.place),
    county: pd(A.resolved.county, B.resolved.county),
    state: pd(A.resolved.state, B.resolved.state),
  };
}

function render() {
  const d = state.dist;
  const rows = [];
  if (d) {
    rows.push(['Point-to-point', fmt(d.p2p, true)]);
    rows.push(['City / Place', d.place ? fmt(d.place, true) : fmt(null, false, 'n/a (outside any incorporated place)')]);
    rows.push(['County', d.county ? fmt(d.county, true) : fmt(null, false, 'n/a (no county)')]);
    rows.push(['State', d.state ? fmt(d.state, true) : fmt(null, false, 'n/a')]);
  } else if (state.A && state.B) {
    setStatus('One or both points are outside the US.');
  }
  $('results').querySelector('tbody').innerHTML = rows.length
    ? rows.map(([k, v]) => `<tr><td>${k}</td><td class="num">${v}</td></tr>`).join('')
    : '<tr><td class="muted">Set both points to see distances.</td></tr>';
  drawForLevel();
  if (d) setStatus('');
}

function featAtLevel(s) {
  if (!s || s.resolved.outsideUS) return null;
  return { state: s.resolved.state, county: s.resolved.county, place: s.resolved.place }[state.level];
}

function drawForLevel() {
  const A = state.A, B = state.B;
  if (!A || !B) { clearOverlays(); return; }
  const fa = featAtLevel(A), fb = featAtLevel(B);
  const cached = state.dist ? state.dist[state.level] : null;
  drawLevel(fa, fb, cached ? cached.nearestPair : null);
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
