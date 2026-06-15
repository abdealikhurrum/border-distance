import { createLoader } from './dataLoader.js';
import { resolvePoint } from './resolve.js';
import { pointToPoint } from './distance.js';
import { geocode } from './geocode.js';
import { getRoute } from './routing.js';
import { betweenDistance } from './routeBetween.js';
import { chooseRoute } from './routeChoice.js';
import { REGIONS } from './regions.js';
import { initMap, setPin, panTo, onPinDrag, setWaypoints, drawScene, clearOverlays } from './map.js';

const loader = createLoader('./data');
const state = {
  A: null, B: null, waypoints: [],
  active: 'A', level: null, units: 'miles',
  routes: [], selected: 0, routeKey: null, between: {},
};
const seq = { A: 0, B: 0 };
let routeSeq = 0;
const MI = 1.609344;

const $ = (id) => document.getElementById(id);
const setStatus = (msg) => { $('status').textContent = msg || ''; };
function fmtDist(km) {
  const v = state.units === 'miles' ? km / MI : km;
  return `${v.toFixed(1)} ${state.units === 'miles' ? 'mi' : 'km'}`;
}
const naCell = (note) => `<span class="muted">${note}</span>`;

function thresholdKm() {
  const raw = parseFloat($('threshold').value);
  if (!isFinite(raw) || raw <= 0) return null;
  return state.units === 'miles' ? raw * MI : raw;
}

function setActiveCard() {
  $('cardA').classList.toggle('active', state.active === 'A');
  $('cardB').classList.toggle('active', state.active === 'B');
}

function sharedLevels() {
  const A = state.A, B = state.B;
  if (!A || !B || A.resolved.outside || B.resolved.outside) return [];
  const aLevels = REGIONS[A.resolved.region].levels;
  const bKeys = new Set(REGIONS[B.resolved.region].levels.map((l) => l.key));
  return aLevels.filter((l) => bKeys.has(l.key));
}

async function setEndpoint(key, point, label, { pan = true } = {}) {
  const token = ++seq[key];
  setStatus(`Resolving point ${key}…`);
  try {
    const resolved = await resolvePoint(point, loader);
    if (token !== seq[key]) return;
    state[key] = { point, resolved, label };
    setPin(key, point);
    onPinDrag(key, (p) => setEndpoint(key, p, `dragged pin (${p.lat.toFixed(4)}, ${p.lon.toFixed(4)})`, { pan: false }));
    if (pan) panTo(point);
    renderLabel(key);
    await refreshRoute();
  } catch (e) {
    if (token === seq[key]) setStatus(`Could not resolve point ${key}: ${e.message}`);
  }
}

function renderLabel(key) {
  const s = state[key];
  if (!s) return;
  const r = s.resolved;
  let txt;
  if (r.outside) txt = 'Outside covered areas';
  else {
    const cfg = REGIONS[r.region];
    const parts = cfg.levels.map((l) => r.units[l.key]?.properties.NAME).filter(Boolean);
    txt = `${parts.join(', ')} (${cfg.name})`;
  }
  $(`label${key}`).textContent = `${s.label} → ${txt}`;
}

function syncWaypointMarkers() {
  setWaypoints(state.waypoints.map((w) => w.point), (i, p) => {
    state.waypoints[i] = { point: p, label: `pin (${p.lat.toFixed(4)}, ${p.lon.toFixed(4)})` };
    renderWaypoints(); refreshRoute();
  });
}
function addWaypoint(point, label) { state.waypoints.push({ point, label }); syncWaypointMarkers(); renderWaypoints(); refreshRoute(); }
function removeWaypoint(i) { state.waypoints.splice(i, 1); syncWaypointMarkers(); renderWaypoints(); refreshRoute(); }
function moveWaypoint(i, d) { const j = i + d; if (j < 0 || j >= state.waypoints.length) return; const [w] = state.waypoints.splice(i, 1); state.waypoints.splice(j, 0, w); syncWaypointMarkers(); renderWaypoints(); refreshRoute(); }
function renderWaypoints() {
  $('wpList').innerHTML = state.waypoints.map((w, i) => `
    <div class="wp-row"><span>${i + 1}. ${w.label}</span>
      <span><button data-act="up" data-i="${i}">▲</button><button data-act="down" data-i="${i}">▼</button><button data-act="rm" data-i="${i}">✕</button></span>
    </div>`).join('');
}

const coordKey = (coords) => coords.map((c) => `${c.lon},${c.lat}`).join(';');
async function refreshRoute() {
  const A = state.A, B = state.B;
  if (!(A && B && !A.resolved.outside && !B.resolved.outside)) {
    state.routes = []; state.routeKey = null; state.between = {}; render(); return;
  }
  const coords = [A.point, ...state.waypoints.map((w) => w.point), B.point];
  const key = coordKey(coords);
  if (key === state.routeKey && state.routes.length) { render(); return; }
  const token = ++routeSeq;
  setStatus('Finding route…');
  try {
    const routes = await getRoute(coords, undefined, { alternatives: state.waypoints.length === 0 });
    if (token !== routeSeq) return;
    state.routeKey = key; state.selected = 0; state.between = {};
    if (!routes.length) { state.routes = []; setStatus('No driving route found between these points.'); render(); return; }
    state.routes = routes; setStatus(''); render();
  } catch (e) {
    if (token === routeSeq) { state.routes = []; setStatus(`Routing failed: ${e.message}. (Public router may be busy — retry.)`); render(); }
  }
}

function betweenFor(routeIdx, levelKey) {
  const cacheKey = `${routeIdx}:${levelKey}`;
  if (cacheKey in state.between) return state.between[cacheKey];
  const ua = state.A.resolved.units[levelKey], ub = state.B.resolved.units[levelKey];
  const r = (ua && ub) ? betweenDistance(state.routes[routeIdx].geometry, ua, ub) : null;
  state.between[cacheKey] = r;
  return r;
}

function syncLevelOptions(levels) {
  const sel = $('level');
  sel.innerHTML = levels.map((l) => `<option value="${l.key}">${l.label}</option>`).join('');
  if (!levels.find((l) => l.key === state.level)) state.level = levels.length ? levels[0].key : null;
  if (state.level) sel.value = state.level;
}

function optimizeSelection(levels) {
  const tKm = thresholdKm();
  if (tKm == null || !state.level || !levels.find((l) => l.key === state.level)) return;
  const betweens = state.routes.map((_, i) => betweenFor(i, state.level));
  if (betweens.some((b) => b == null)) return;
  state.selected = chooseRoute(state.routes, betweens.map((b) => b.betweenKm), tKm);
}

function render() {
  const A = state.A, B = state.B;
  const levels = sharedLevels();
  syncLevelOptions(levels);
  if (state.routes.length) optimizeSelection(levels);

  const rows = [];
  const tKm = thresholdKm();
  if (state.routes.length) {
    const route = state.routes[state.selected];
    rows.push(['Driving (point-to-point)', fmtDist(route.distanceKm)]);
    rows.push(['Straight-line', fmtDist(pointToPoint(A.point, B.point).km)]);
    if (levels.length) {
      for (const lvl of levels) {
        const b = betweenFor(state.selected, lvl.key);
        let cell = b ? fmtDist(b.betweenKm) : naCell('n/a');
        if (b && tKm != null && lvl.key === state.level) {
          cell += b.betweenKm <= tKm ? ' <span style="color:#16a34a">✓ under</span>' : ' <span style="color:#dc2626">over</span>';
        }
        rows.push([`${lvl.label} (between)`, cell]);
      }
    } else {
      rows.push(['Administrative levels', naCell('n/a (different region types)')]);
    }
  }
  $('results').querySelector('tbody').innerHTML = rows.length
    ? rows.map(([k, v]) => `<tr><td>${k}</td><td class="num">${v}</td></tr>`).join('')
    : '<tr><td class="muted">Set both points to see distances.</td></tr>';

  renderAlternatives();
  drawSceneNow();
}

function renderAlternatives() {
  const el = $('alts');
  if (state.waypoints.length === 0 && state.routes.length > 1) {
    el.innerHTML = '<strong>Routes:</strong> ' + state.routes.map((r, i) =>
      `<label style="margin-right:8px;"><input type="radio" name="alt" value="${i}"${i === state.selected ? ' checked' : ''}> ${fmtDist(r.distanceKm)}</label>`).join('');
  } else { el.innerHTML = ''; }
}

function unitAtLevel(s) {
  if (!s || s.resolved.outside || !state.level) return null;
  return s.resolved.units[state.level] || null;
}
function drawSceneNow() {
  const A = state.A, B = state.B;
  if (!A || !B) { clearOverlays(); return; }
  const b = (state.routes.length && state.level) ? betweenFor(state.selected, state.level) : null;
  drawScene({ unitA: unitAtLevel(A), unitB: unitAtLevel(B), routes: state.routes, selectedIndex: state.selected, betweenLine: b ? b.betweenLine : null });
}

async function handleGeocode(target) {
  const inputId = target === 'wp' ? 'addrWp' : `addr${target}`;
  const addr = $(inputId).value.trim();
  if (!addr) return;
  setStatus(`Looking up "${addr}"…`);
  try {
    const hit = await geocode(addr);
    if (!hit) { setStatus(`No match for "${addr}". Try "Add on map" / "Set on map".`); return; }
    if (target === 'wp') { addWaypoint({ lat: hit.lat, lon: hit.lon }, hit.matchedLabel); $('addrWp').value = ''; setStatus(''); }
    else await setEndpoint(target, { lat: hit.lat, lon: hit.lon }, hit.matchedLabel);
  } catch (e) { setStatus(`Geocoding failed: ${e.message}.`); }
}

function init() {
  initMap('map', (point) => {
    const label = `map pin (${point.lat.toFixed(4)}, ${point.lon.toFixed(4)})`;
    if (state.active === 'wp') addWaypoint(point, label); else setEndpoint(state.active, point, label);
  });
  $('geoA').onclick = () => handleGeocode('A');
  $('geoB').onclick = () => handleGeocode('B');
  $('addrA').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleGeocode('A'); });
  $('addrB').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleGeocode('B'); });
  $('pinA').onclick = () => { state.active = 'A'; setActiveCard(); setStatus('Click the map to set Point A.'); };
  $('pinB').onclick = () => { state.active = 'B'; setActiveCard(); setStatus('Click the map to set Point B.'); };
  $('addWp').onclick = () => { state.active = 'wp'; setActiveCard(); setStatus('Click the map to add a waypoint.'); };
  $('geoWp').onclick = () => handleGeocode('wp');
  $('addrWp').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleGeocode('wp'); });
  $('wpList').addEventListener('click', (e) => {
    const btn = e.target.closest('button'); if (!btn) return;
    const i = Number(btn.dataset.i);
    if (btn.dataset.act === 'rm') removeWaypoint(i); else if (btn.dataset.act === 'up') moveWaypoint(i, -1); else if (btn.dataset.act === 'down') moveWaypoint(i, +1);
  });
  $('alts').addEventListener('change', (e) => { if (e.target.name === 'alt') { state.selected = Number(e.target.value); render(); } });
  $('level').onchange = (e) => { state.level = e.target.value; render(); };
  $('units').onchange = (e) => { state.units = e.target.value; $('thUnit').textContent = state.units === 'miles' ? 'mi' : 'km'; render(); };
  $('threshold').addEventListener('input', () => render());
  setActiveCard();
  render();
}
init();
