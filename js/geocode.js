const defaultFetch = (...args) => fetch(...args);

export async function geocode(address, fetchImpl = defaultFetch) {
  const q = encodeURIComponent(address);

  // Primary: US Census Geocoder (no API key).
  try {
    const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${q}&benchmark=Public_AR_Current&format=json`;
    const res = await fetchImpl(url);
    if (res.ok) {
      const data = await res.json();
      const m = data?.result?.addressMatches?.[0];
      if (m) return { lat: m.coordinates.y, lon: m.coordinates.x, matchedLabel: m.matchedAddress, source: 'census' };
    }
  } catch {
    // fall through to Nominatim (covers CORS/network failures)
  }

  // Fallback: Nominatim (OSM).
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q=${q}`;
  const res = await fetchImpl(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Geocoding failed: ${res.status}`);
  const arr = await res.json();
  if (!arr.length) return null;
  return { lat: parseFloat(arr[0].lat), lon: parseFloat(arr[0].lon), matchedLabel: arr[0].display_name, source: 'nominatim' };
}
