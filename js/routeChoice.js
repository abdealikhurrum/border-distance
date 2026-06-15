// Pick a route index given each route's selected-level between-distance (km).
// betweenKms is indexed by route; index 0 is the default (shortest-driving)
// route, NOT the smallest between-distance — between-distances are not sorted,
// since a longer-driving alternative can have a smaller between-distance (that's
// what we're hunting for). With a threshold: keep the default route if its
// between-distance is already under, or if it overshoots by more than 10%;
// otherwise (default within (t, t*1.10]) pick the first route whose
// between-distance is <= threshold, else keep the default.
export function chooseRoute(routes, betweenKms, thresholdKm) {
  if (thresholdKm == null) return 0;
  const primaryBetween = betweenKms[0];
  if (primaryBetween <= thresholdKm) return 0;
  if (primaryBetween > thresholdKm * 1.10) return 0;
  for (let i = 0; i < betweenKms.length; i++) {
    if (betweenKms[i] <= thresholdKm) return i;
  }
  return 0;
}
