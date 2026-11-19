import { db, esc, fmtDate, tripDays, run, toast, geocode } from "./util.js";
import { optimizeOrder, googleMapsUrl, pathLength, routePoints } from "./rota-logic.js";
import { SUPABASE_URL } from "./config.js";

const BUCKET = "roteiros";
const pdfUrl = (path) => `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
let map = null;

export async function renderRoteiro(el, ctx) {
  const { trip } = ctx;
  const days = tripDays(trip);
  // URL: #slug/roteiro/<opção>/<dia> (os links antigos, só com o dia, abrem a opção 1)
  const m = /^(\d+)\/(.*)$/.exec(ctx.sub || "");
  const wantN = m ? Number(m[1]) : 1;
  const daySub = m ? m[2] : ctx.sub;
  const day = days.includes(daySub) ? daySub : days[0];

  const [{ data: files, error: e1 }, { data: tripStops, error: e2 }, { data: hotelRow }, { data: variantRows }] = await Promise.all([
    db.from("trip_files").select("*").eq("trip_id", trip.id).eq("kind", "roteiro").order("created_at"),
    db.from("itinerary_stops").select("*").eq("trip_id", trip.id).order("day").order("position").order("created_at"),
    trip.hotel_id ? db.from("hotels").select("id, name, zone, lat, lng").eq("id", trip.hotel_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from("itinerary_variants").select("*").eq("trip_id", trip.id).order("n"),
  ]);
  // Opções de roteiro. Sem nenhuma registada, há uma só (a 1), como antes.
  const variants = variantRows?.length ? variantRows : [{ n: 1, name: "Roteiro", summary: null, auto_order: true }];
  const variant = variants.find((v) => v.n === wantN) ?? variants[0];
  const allStops = (tripStops ?? []).filter((s) => (s.variant ?? 1) === variant.n);
  const dayHref = (d, n = variant.n) => `#${esc(trip.slug)}/roteiro/${n}/${d}`;
  const hotel = hotelRow && hotelRow.lat != null ? hotelRow : null;
  if (!el.isConnected) return;
  if (e1 || e2) { el.innerHTML = `<p class="error">Não foi possível carregar o roteiro.</p>`; return; }

  // Ordem automática: a que dá menos quilómetros (com o hotel no início e no fim, quando há).
  // Nas opções com horários marcados (auto_order = false), mantém-se a ordem por horário.
  const saved = allStops.filter((s) => s.day === day);
  const stops = variant.auto_order ? optimizeOrder(saved, hotel) : saved;
  if (variant.auto_order && stops.some((s, i) => s.position !== i)) {
    Promise.all(stops.map((s, i) => db.from("itinerary_stops").update({ position: i }).eq("id", s.id)))
      .then((res) => { if (res.some((r) => r.error)) console.error("Não foi possível guardar a ordem"); });
    stops.forEach((s, i) => { s.position = i; });
  }
  const countByDay = (d) => allStops.filter((s) => s.day === d).length;
  const gmaps = googleMapsUrl(stops, hotel);
  const geoStops = stops.filter((s) => s.lat != null);
  const route = routePoints(stops, hotel);
  const km = route.length > 1 ? pathLength(route) : 0;
  const hotelRow1 = (label) => hotel ? `<li class="hotel-stop"><span class="stop-n">H</span><div class="stop-body"><b>${esc(hotel.name)}</b><span class="muted small">${label}</span></div></li>` : "";
  const missing = stops.length - geoStops.length;
  // Preços (por adulto, em libras). 0 = grátis; sem valor = não indicado (ex.: refeições).
  const gbp = (n) => `£${Number(n).toLocaleString("pt-PT", { maximumFractionDigits: 2 })}`;
  // Nas refeições o preço é uma estimativa e soma à parte das entradas.
  const isMeal = (s) => s.kind === "refeicao";
  const priceTag = (s) => s.price_gbp == null ? "" : isMeal(s)
    ? `<span class="price meal">~${gbp(s.price_gbp)} por pessoa</span>`
    : `<span class="price${Number(s.price_gbp) === 0 ? " free" : ""}">${Number(s.price_gbp) === 0 ? "Grátis" : `${gbp(s.price_gbp)} por pessoa`}</span>`;
  const sum = (list) => list.reduce((t, s) => t + Number(s.price_gbp), 0);
  const priced = stops.filter((s) => s.price_gbp != null && !isMeal(s));
  const meals = stops.filter((s) => s.price_gbp != null && isMeal(s));
  const dayTotal = sum(priced), mealTotal = sum(meals);
  const both = (n) => `${gbp(n)} por pessoa · ${gbp(n * trip.travelers)} para ${trip.travelers}`;

  el.innerHTML = `
    <section class="panel">
      <h3>Roteiro em PDF</h3>
      <p class="muted">Carreguem aqui o roteiro em PDF para todos o poderem abrir no telemóvel.</p>
      ${files.length ? `<ul class="files">${files.map((f) => `
        <li>
          <a class="file" href="${pdfUrl(f.path)}" target="_blank" rel="noopener">📄 ${esc(f.name)}</a>
          <button class="icon-btn" data-delfile="${f.id}" data-path="${esc(f.path)}" aria-label="Apagar ${esc(f.name)}" title="Apagar">✕</button>
        </li>`).join("")}</ul>` : ""}
      <label class="btn ghost upload">Carregar PDF<input id="pdf-input" type="file" accept="application/pdf" hidden></label>
      <span id="pdf-status" class="muted" aria-live="polite"></span>
    </section>

    <section>
      <h2>Roteiro por dia</h2>
      ${variants.length > 1 ? `<div class="variant-tabs" role="tablist" aria-label="Opções de roteiro">${variants.map((v) => `
        <a role="tab" href="${dayHref(day, v.n)}" aria-selected="${v.n === variant.n}" class="variant-tab${v.n === variant.n ? " on" : ""}">${esc(v.name)}</a>`).join("")}</div>` : ""}
      ${variant.summary ? `<details class="panel variant-summary"${variant.n !== 1 ? " open" : ""}><summary><b>Sobre esta opção: bilhetes e custos</b></summary><div class="pre">${esc(variant.summary)}</div></details>` : ""}
      <div class="day-tabs" role="tablist">${days.map((d) => `
        <a role="tab" href="${dayHref(d)}" aria-selected="${d === day}" class="day-tab${d === day ? " on" : ""}">
          ${fmtDate(d, { weekday: "short", day: "numeric", month: "short" })}${countByDay(d) ? ` <span class="badge">${countByDay(d)}</span>` : ""}
        </a>`).join("")}</div>

      <div class="route-layout">
        <div>
          ${hotel ? "" : `<p class="hint">Escolham o hotel no separador Hotéis: as rotas passam a começar e acabar lá.</p>`}
          ${stops.length ? `<ol class="stops">${hotelRow1("Partida")}${stops.map((s, i) => `
            <li>
              <span class="stop-n${isMeal(s) ? " meal" : ""}" ${isMeal(s) ? 'title="Refeição"' : ""}>${isMeal(s) ? "🍴" : i + 1}</span>
              <div class="stop-body">
                <b>${esc(s.name)}</b>
                ${s.price_gbp != null || s.price_note ? `<span class="small price-line">${priceTag(s)}${s.price_note ? ` <span class="muted">${esc(s.price_note)}</span>` : ""}</span>` : ""}
                ${s.lat == null ? `<span class="warn-text">Não encontrado no mapa: acrescente a morada.</span>` : s.address ? `<span class="muted small">${esc(s.address.split(",").slice(0, 3).join(","))}</span>` : ""}
                ${s.notes ? `<span class="small">${esc(s.notes)}</span>` : ""}
              </div>
              <div class="stop-actions">
                <button class="icon-btn" data-delstop="${s.id}" aria-label="Apagar ${esc(s.name)}">✕</button>
              </div>
            </li>`).join("")}${hotelRow1("Regresso")}</ol>` : `<p class="muted">Ainda não há paragens para este dia.${hotel ? "" : " A primeira paragem é o ponto de partida."}</p>`}

          ${priced.length || meals.length ? `<div class="day-total">
            ${priced.length ? `<div><b>Entradas:</b> ${dayTotal ? both(dayTotal) : "tudo grátis"}</div>` : ""}
            ${meals.length ? `<div><b>Refeições (estimativa):</b> ~${both(mealTotal)}</div>` : ""}
            <div class="muted small">Preços por adulto, sem transportes${variant.summary ? ". As entradas estão ao preço de bilhete avulso (ver o pass acima)" : ""}.</div>
          </div>` : ""}
          <div class="route-btns">
            ${gmaps ? `<a class="btn" href="${gmaps}" target="_blank" rel="noopener">Abrir rota no Google Maps</a>` : ""}
          </div>
          ${km ? `<p class="muted small">${variant.auto_order ? "Ordem calculada automaticamente para andar o menos possível." : "Ordem pelos horários das visitas (bilhetes com hora marcada)."} Cerca de ${km.toFixed(1).replace(".", ",")} km a pé em linha reta${hotel ? ", a sair do hotel e a voltar" : " entre paragens"}.${route.length > 11 ? " O Google Maps só aceita 9 paragens intermédias: as restantes ficam de fora do link." : ""}${missing ? ` ${missing} paragem(ns) sem localização não entram na rota.` : ""}</p>` : ""}

          <form id="add-stop" class="form-grid">
            <label for="stop-name">Sítio</label>
            <input id="stop-name" required maxlength="120" placeholder="Ex.: Tower Bridge">
            <label for="stop-addr">Morada</label>
            <input id="stop-addr" maxlength="200" placeholder="Opcional, se o nome não chegar">
            <label for="stop-notes">Notas</label>
            <input id="stop-notes" maxlength="200" placeholder="Ex.: comprar bilhetes antes">
            <label for="stop-price">Preço (£)</label>
            <input id="stop-price" type="number" min="0" step="0.5" inputmode="decimal" placeholder="Por pessoa. 0 = grátis; vazio = não sei">
            <div></div><label class="check"><input id="stop-meal" type="checkbox"> É uma refeição (o preço é uma estimativa)</label>
            <div></div><button class="btn" type="submit">Acrescentar paragem</button>
          </form>
        </div>
        <div id="map" class="map" role="img" aria-label="Mapa das paragens do dia"></div>
      </div>
    </section>`;

  drawMap(geoStops, hotel);

  // PDF
  el.querySelector("#pdf-input").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const status = el.querySelector("#pdf-status");
    if (file.type !== "application/pdf") { status.textContent = "Só se aceitam ficheiros PDF."; return; }
    if (file.size > 20 * 1024 * 1024) { status.textContent = "O PDF tem mais de 20 MB."; return; }
    status.textContent = "A carregar…";
    const safe = file.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "-");
    const path = `${trip.id}/${Date.now()}-${safe}`;
    const { error } = await db.storage.from(BUCKET).upload(path, file, { contentType: "application/pdf" });
    if (error) { status.textContent = "Não foi possível carregar o PDF."; console.error(error); return; }
    if (await run(db.from("trip_files").insert({ trip_id: trip.id, kind: "roteiro", name: file.name, path }))) ctx.refresh();
  });
  el.querySelectorAll("[data-delfile]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Apagar?"; b.classList.add("armed"); return; }
      await db.storage.from(BUCKET).remove([b.dataset.path]);
      if (await run(db.from("trip_files").delete().eq("id", b.dataset.delfile))) ctx.refresh();
    })
  );

  // Paragens
  el.querySelector("#add-stop").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = el.querySelector("#stop-name").value.trim();
    const addr = el.querySelector("#stop-addr").value.trim();
    if (!name) return;
    const btn = e.submitter; btn.disabled = true; btn.textContent = "A procurar no mapa…";
    const geo = await geocode(addr || name, trip.destination);
    if (!geo) toast("Não encontrei este sítio no mapa. Fica na lista; acrescente a morada para entrar na rota.", "info");
    const ok = await run(db.from("itinerary_stops").insert({
      trip_id: trip.id, variant: variant.n, day, name,
      address: geo?.address ?? (addr || null),
      lat: geo?.lat ?? null, lng: geo?.lng ?? null,
      notes: el.querySelector("#stop-notes").value.trim() || null,
      price_gbp: el.querySelector("#stop-price").value === "" ? null : Number(el.querySelector("#stop-price").value),
      kind: el.querySelector("#stop-meal").checked ? "refeicao" : "visita",
      position: stops.length ? Math.max(...stops.map((s) => s.position)) + 1 : 0,
    }));
    if (ok) ctx.refresh(); else { btn.disabled = false; btn.textContent = "Acrescentar paragem"; }
  });


  el.querySelectorAll("[data-delstop]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "?"; b.classList.add("armed"); return; }
      if (await run(db.from("itinerary_stops").delete().eq("id", b.dataset.delstop))) ctx.refresh();
    })
  );
}

function drawMap(pts, hotel) {
  const box = document.getElementById("map");
  if (map) { map.remove(); map = null; }
  if (!box) return;
  if (!window.L) { box.innerHTML = `<p class="muted pad">O mapa não carregou.</p>`; return; }
  map = L.map(box, { scrollWheelZoom: false });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  if (!pts.length && !hotel) { map.setView([51.5074, -0.1278], 12); return; }
  const latlngs = (hotel ? [hotel, ...pts, hotel] : pts).map((p) => [p.lat, p.lng]);
  if (hotel) L.marker([hotel.lat, hotel.lng], {
    icon: L.divIcon({ className: "pin hotel", html: "<span>H</span>", iconSize: [30, 30], iconAnchor: [15, 15] }),
    title: hotel.name, zIndexOffset: 1000,
  }).bindPopup(esc(hotel.name)).addTo(map);
  pts.forEach((p, i) =>
    L.marker([p.lat, p.lng], {
      icon: L.divIcon({ className: `pin${p.kind === "refeicao" ? " meal" : ""}`, html: `<span>${p.kind === "refeicao" ? "🍴" : i + 1}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] }),
      title: p.name,
    }).bindPopup(esc(p.name)).addTo(map)
  );
  if (latlngs.length > 1) L.polyline(latlngs, { color: getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#C4122F", weight: 3, dashArray: "6 6" }).addTo(map);
  map.fitBounds(latlngs, { padding: [30, 30], maxZoom: 15 });
}
