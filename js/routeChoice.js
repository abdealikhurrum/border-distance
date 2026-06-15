// Pick a route index given each route's selected-level between-distance (km).
// With a threshold: keep the shortest if it's already under, or if it overshoots
// by more than 10%; otherwise (within [t, t*1.10]) pick the first alternative
// whose between-distance is <= threshold, else keep the shortest.
export function chooseRoute(routes, betweenKms, thresholdKm) {
  if (thresholdKm == null) return 0;
  const shortest = betweenKms[0];
  if (shortest <= thresholdKm) return 0;
  if (shortest > thresholdKm * 1.10) return 0;
  for (let i = 0; i < betweenKms.length; i++) {
    if (betweenKms[i] <= thresholdKm) return i;
  }
  return 0;
}
