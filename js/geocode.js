const defaultFetch = (...args) => fetch(...args);

// Geocode a US address to a point via Nominatim (OpenStreetMap). The US Census
// Geocoder was tried first in an earlier version, but it does not send CORS
// headers, so it is unusable from a static page — Nominatim is the only
// browser-reachable, key-free option here.
export async function geocode(address, fetchImpl = defaultFetch) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q=${encodeURIComponent(address)}`;
  const res = await fetchImpl(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Geocoding failed: ${res.status}`);
  const arr = await res.json();
  if (!arr.length) return null;
  return { lat: parseFloat(arr[0].lat), lon: parseFloat(arr[0].lon), matchedLabel: arr[0].display_name, source: 'nominatim' };
}
