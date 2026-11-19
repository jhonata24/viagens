import { db, esc, fmtDate, tripDays } from "./util.js";
import { haversine } from "./rota-logic.js";

// Distância máxima (km) para um restaurante contar como "adequado" a um momento do roteiro.
const NEAR_MEAL = 0.7;   // perto de uma refeição planeada no roteiro (≈ 9 min a pé)
const NEAR_STOP = 0.5;   // perto de uma visita marcada à hora de almoço ou jantar

const BOOKING = {
  thefork: { label: "Reservar pelo TheFork", cls: "tf" },
  reservar: { label: "Reservar", cls: "must" },
  direto: { label: "Reservar diretamente", cls: "must" },
  aconselhado: { label: "Melhor reservar", cls: "soft" },
  sem_reserva: { label: "Pode aparecer", cls: "walk" },
};

const hasGeo = (p) => p && p.lat != null && p.lng != null;
const fmtKm = (km) => (km < 1 ? `${Math.round(km * 1000 / 50) * 50} m` : `${km.toFixed(1).replace(".", ",")} km`);

/** Em que refeição cai uma paragem: pelo tipo (refeição) ou pela primeira hora escrita nas notas. */
function mealOf(stop) {
  if (stop.kind === "refeicao") return /^jantar/i.test(stop.name) ? "jantar" : "almoço";
  const m = /(\d{1,2}):(\d{2})/.exec(stop.notes || "");
  if (!m) return null;
  const h = Number(m[1]);
  if (h >= 11 && h < 16) return "almoço";
  if (h >= 16) return "jantar";
  return null;
}

/** Momentos (dia + refeição) do roteiro a que cada restaurante fica perto. */
function matchesFor(r, stops, variants) {
  const best = new Map();
  for (const s of stops) {
    if (!hasGeo(s)) continue;
    const meal = mealOf(s);
    if (!meal) continue;
    if ((r.closed_days || []).includes(s.day)) continue;
    if (!(r.meals || ["almoço", "jantar"]).includes(meal)) continue;
    const km = haversine(r, s);
    if (km > (s.kind === "refeicao" ? NEAR_MEAL : NEAR_STOP)) continue;
    const key = `${s.day}|${meal}`;
    const cur = best.get(key) ?? { day: s.day, meal, km: Infinity, near: null, variants: new Set(), planned: false };
    cur.variants.add(s.variant ?? 1);
    const planned = s.kind === "refeicao" && km < 0.15 && s.name.toLowerCase().includes(r.name.split(/[ &(]/)[0].toLowerCase());
    if (planned) cur.planned = true;
    if (km < cur.km) {
      cur.km = km;
      // "Almoço: Flat Iron Covent Garden · ..." → "o almoço planeado (Flat Iron Covent Garden)"
      const what = s.name.replace(/^(almoço( de natal)?|jantar)\s*:?\s*/i, "").replace(/\s*·.*$/, "");
      cur.near = s.kind === "refeicao" ? `${meal === "almoço" ? "o almoço" : "o jantar"} planeado (${what})` : s.name;
    }
    best.set(key, cur);
  }
  const names = new Map(variants.map((v) => [v.n, v.name.replace(/^Roteiro\s*/i, "")]));
  return [...best.values()]
    .map((m) => ({ ...m, offer: r.offers?.[m.day] ?? null, opts: [...m.variants].sort().map((n) => names.get(n) ?? `Opção ${n}`) }))
    .sort((a, b) => a.day.localeCompare(b.day) || (a.meal === "almoço" ? -1 : 1));
}

export async function renderRestaurantes(el, ctx) {
  const { trip } = ctx;
  const days = tripDays(trip);
  const filter = days.includes(ctx.sub) ? ctx.sub : "";

  const [{ data: rests, error: e1 }, { data: stops, error: e2 }, { data: variantRows }] = await Promise.all([
    db.from("restaurants").select("*").eq("trip_id", trip.id).order("position"),
    db.from("itinerary_stops").select("day, variant, kind, name, notes, lat, lng").eq("trip_id", trip.id),
    db.from("itinerary_variants").select("n, name").eq("trip_id", trip.id).order("n"),
  ]);
  if (!el.isConnected) return;
  if (e1 || e2) { el.innerHTML = `<p class="error">Não foi possível carregar os restaurantes.</p>`; return; }
  const variants = variantRows?.length ? variantRows : [{ n: 1, name: "Roteiro" }];

  const list = rests.map((r) => ({ ...r, matches: hasGeo(r) ? matchesFor(r, stops, variants) : [] }));
  let shown = filter ? list.filter((r) => r.matches.some((m) => m.day === filter)) : list;
  if (filter) {
    // No dia escolhido: primeiro os que têm desconto, depois os mais baratos.
    const offerOn = (r) => (r.offers?.[filter] ? 0 : 1);
    shown = [...shown].sort((a, b) => offerOn(a) - offerOn(b) || (a.avg_price_gbp ?? 99) - (b.avg_price_gbp ?? 99));
  }
  const checked = rests.map((r) => r.checked_at).filter(Boolean).sort().pop();
  const shortDay = (d) => fmtDate(d, { weekday: "short", day: "numeric", month: "short" });

  const chip = (m) => `
    <li class="fit${m.offer ? " has-offer" : ""}${filter && m.day !== filter ? " dim" : ""}">
      <b>${esc(shortDay(m.day))} · ${m.meal === "almoço" ? "Almoço" : "Jantar"}</b>
      <span class="muted small">${esc(m.opts.join(" e "))} · ${m.planned ? "é o que está no roteiro" : `a ${fmtKm(m.km)} d${/^o /.test(m.near) ? "" : "e "}${esc(m.near)}`}</span>
      ${m.offer ? `<span class="offer">TheFork ${esc(m.offer)}</span>` : ""}
    </li>`;

  const card = (r) => {
    const b = BOOKING[r.booking] ?? BOOKING.aconselhado;
    const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${r.name}, ${r.address ?? ""}`)}`;
    const closed = (r.closed_days || []).filter((d) => days.includes(d));
    return `
    <article class="card rest">
      <div class="rest-head">
        <div>
          <h3>${esc(r.name)}</h3>
          <div class="muted small">${[r.cuisine, r.area, r.rating].filter(Boolean).map(esc).join(" · ")}</div>
        </div>
        <div class="rest-price"><b>~£${Number(r.avg_price_gbp).toLocaleString("pt-PT")}</b><span class="muted small">por pessoa</span></div>
      </div>
      <div class="rest-tags">
        ${r.thefork ? `<a class="pill tf" href="${esc(r.thefork_url)}" target="_blank" rel="noopener">No TheFork ↗</a>` : `<span class="pill">Não está no TheFork</span>`}
        <span class="pill ${b.cls}">${b.label}</span>
      </div>
      ${r.booking_note ? `<p class="small" style="margin:0">${esc(r.booking_note)}</p>` : ""}
      ${r.price_note ? `<p class="muted small" style="margin:0">Preço: ${esc(r.price_note)}.</p>` : ""}
      <div>
        <h4 class="fit-title">Adequado para</h4>
        ${r.matches.length ? `<ul class="fits">${r.matches.map(chip).join("")}</ul>` : `<p class="muted small" style="margin:0">Não fica perto de nenhuma refeição do roteiro.</p>`}
      </div>
      ${closed.length ? `<p class="warn-text small" style="margin:0">Não contar com ele a ${closed.map((d) => fmtDate(d, { day: "numeric", month: "short" })).join(", ")}.</p>` : ""}
      ${r.notes ? `<p class="small" style="margin:0">${esc(r.notes)}</p>` : ""}
      <a class="small" href="${maps}" target="_blank" rel="noopener">Ver no Google Maps ↗</a>
    </article>`;
  };

  el.innerHTML = `
    <p class="muted" style="margin-top:0">Restaurantes sugeridos perto do roteiro. O "Adequado para" é calculado pela distância às paragens de cada dia, nas duas opções de roteiro.</p>
    <div class="day-tabs" role="tablist" aria-label="Filtrar por dia">
      <a role="tab" href="#${esc(trip.slug)}/restaurantes" aria-selected="${!filter}" class="day-tab${!filter ? " on" : ""}">Todos</a>
      ${days.map((d) => {
        const n = list.filter((r) => r.matches.some((m) => m.day === d)).length;
        return `<a role="tab" href="#${esc(trip.slug)}/restaurantes/${d}" aria-selected="${d === filter}" class="day-tab${d === filter ? " on" : ""}">${esc(shortDay(d))}${n ? ` <span class="badge">${n}</span>` : ""}</a>`;
      }).join("")}
    </div>
    <div class="rest-grid">${shown.map(card).join("") || `<p class="muted">Nenhum restaurante sugerido para este dia.</p>`}</div>
    <p class="muted small">No dia de Natal só se conta com os restaurantes confirmados abertos. Descontos e disponibilidade verificados no TheFork${checked ? ` a ${fmtDate(checked)}` : ""}: o desconto depende da hora e do número de pessoas, e pode mudar. Em geral o desconto aplica-se à comida, não às bebidas. Preços por adulto.</p>`;
}
