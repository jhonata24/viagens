// Ordem otimizada de paragens: vizinho mais próximo + melhoria 2-opt.
// Com `base` (o hotel), a rota é uma volta: começa e acaba na base, e todas as paragens podem mudar de ordem.
// Sem base, a primeira paragem fica fixa como ponto de partida e o caminho é aberto.

export function haversine(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export const pathLength = (pts) => pts.slice(1).reduce((s, p, i) => s + haversine(pts[i], p), 0);

const hasGeo = (s) => s && s.lat != null && s.lng != null;

/** Pontos da rota completa, com o hotel no início e no fim quando existe. */
export function routePoints(stops, base = null) {
  const geo = stops.filter(hasGeo);
  return hasGeo(base) ? [base, ...geo, base] : geo;
}

export function optimizeOrder(stops, base = null) {
  const geo = stops.filter(hasGeo);
  const noGeo = stops.filter((s) => !hasGeo(s));
  const loop = hasGeo(base);
  if (geo.length < (loop ? 2 : 3)) return [...geo, ...noGeo];

  // vizinho mais próximo
  const start = loop ? base : geo[0];
  const rest = loop ? [...geo] : geo.slice(1);
  const order = loop ? [] : [geo[0]];
  let last = start;
  while (rest.length) {
    let bi = 0;
    rest.forEach((p, i) => { if (haversine(last, p) < haversine(last, rest[bi])) bi = i; });
    last = rest.splice(bi, 1)[0];
    order.push(last);
  }

  // 2-opt: as pontas fixas (hotel, ou a primeira paragem) nunca mudam
  const full = () => (loop ? [base, ...order, base] : order);
  const first = loop ? 0 : 1;
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = first; i < order.length - 1; i++) {
      for (let k = i + 1; k < order.length; k++) {
        const before = pathLength(full());
        const seg = order.slice(i, k + 1).reverse();
        const cand = [...order.slice(0, i), ...seg, ...order.slice(k + 1)];
        const after = pathLength(loop ? [base, ...cand, base] : cand);
        if (after + 1e-9 < before) { order.splice(0, order.length, ...cand); improved = true; }
      }
    }
  }
  return [...order, ...noGeo];
}

/** Link do Google Maps com a rota a pé. O Google aceita no máximo 9 paragens intermédias. */
export function googleMapsUrl(stops, base = null, mode = "walking") {
  const pts = routePoints(stops, base);
  if (pts.length < 2) return null;
  const ll = (s) => `${s.lat},${s.lng}`;
  const mid = pts.slice(1, -1).slice(0, 9);
  const p = new URLSearchParams({ api: "1", origin: ll(pts[0]), destination: ll(pts[pts.length - 1]), travelmode: mode });
  if (mid.length) p.set("waypoints", mid.map(ll).join("|"));
  return `https://www.google.com/maps/dir/?${p}`;
}

/**
 * Quilómetros (em linha reta) de toda a viagem para um hotel: em cada dia, sai do hotel,
 * faz as paragens na ordem otimizada e volta ao hotel.
 * stopsByDay: { "2026-12-23": [stops], ... }
 */
export function tripKm(stopsByDay, hotel) {
  let total = 0;
  const perDay = {};
  for (const [day, stops] of Object.entries(stopsByDay)) {
    const km = stops.some(hasGeo) ? pathLength(routePoints(optimizeOrder(stops, hotel), hotel)) : 0;
    perDay[day] = km;
    total += km;
  }
  return { total, perDay };
}
