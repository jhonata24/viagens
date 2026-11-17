// Ordem otimizada de paragens (caminho aberto): vizinho mais próximo + melhoria 2-opt.
// A primeira paragem fica sempre em primeiro (é o ponto de partida, por exemplo o hotel).

export function haversine(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export const pathLength = (pts) => pts.slice(1).reduce((s, p, i) => s + haversine(pts[i], p), 0);

export function optimizeOrder(stops) {
  const geo = stops.filter((s) => s.lat != null && s.lng != null);
  const noGeo = stops.filter((s) => s.lat == null || s.lng == null);
  if (geo.length < 3) return [...geo, ...noGeo];

  // vizinho mais próximo a partir da primeira paragem
  const rest = geo.slice(1);
  const path = [geo[0]];
  while (rest.length) {
    const last = path[path.length - 1];
    let bi = 0;
    rest.forEach((p, i) => { if (haversine(last, p) < haversine(last, rest[bi])) bi = i; });
    path.push(rest.splice(bi, 1)[0]);
  }

  // 2-opt sem mexer na primeira paragem
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 1; i < path.length - 1; i++) {
      for (let k = i + 1; k < path.length; k++) {
        const cand = [...path.slice(0, i), ...path.slice(i, k + 1).reverse(), ...path.slice(k + 1)];
        if (pathLength(cand) + 1e-9 < pathLength(path)) { path.splice(0, path.length, ...cand); improved = true; }
      }
    }
  }
  return [...path, ...noGeo];
}

/** Link do Google Maps com a rota a pé. O Google aceita no máximo 9 paragens intermédias. */
export function googleMapsUrl(stops, mode = "walking") {
  const pts = stops.filter((s) => s.lat != null && s.lng != null);
  if (pts.length < 2) return null;
  const ll = (s) => `${s.lat},${s.lng}`;
  const mid = pts.slice(1, -1).slice(0, 9);
  const p = new URLSearchParams({ api: "1", origin: ll(pts[0]), destination: ll(pts[pts.length - 1]), travelmode: mode });
  if (mid.length) p.set("waypoints", mid.map(ll).join("|"));
  return `https://www.google.com/maps/dir/?${p}`;
}
