import { db, esc, fmtDate, tripDays, run, toast } from "./util.js";
import { optimizeOrder, googleMapsUrl, pathLength } from "./rota-logic.js";
import { SUPABASE_URL } from "./config.js";

const BUCKET = "roteiros";
const pdfUrl = (path) => `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
let map = null;

/** Procura as coordenadas de um sítio no OpenStreetMap (Nominatim). */
async function geocode(q, destination) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=pt&q=${encodeURIComponent(`${q}, ${destination}`)}`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    const [hit] = await r.json();
    return hit ? { lat: Number(hit.lat), lng: Number(hit.lon), address: hit.display_name } : null;
  } catch {
    return null;
  }
}

export async function renderRoteiro(el, ctx) {
  const { trip } = ctx;
  const days = tripDays(trip);
  const day = days.includes(ctx.sub) ? ctx.sub : days[0];

  const [{ data: files, error: e1 }, { data: allStops, error: e2 }] = await Promise.all([
    db.from("trip_files").select("*").eq("trip_id", trip.id).eq("kind", "roteiro").order("created_at"),
    db.from("itinerary_stops").select("*").eq("trip_id", trip.id).order("day").order("position").order("created_at"),
  ]);
  if (e1 || e2) { el.innerHTML = `<p class="error">Não foi possível carregar o roteiro.</p>`; return; }

  const stops = allStops.filter((s) => s.day === day);
  const countByDay = (d) => allStops.filter((s) => s.day === d).length;
  const gmaps = googleMapsUrl(stops);
  const geoStops = stops.filter((s) => s.lat != null);
  const km = geoStops.length > 1 ? pathLength(geoStops) : 0;
  const missing = stops.length - geoStops.length;

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
      <div class="day-tabs" role="tablist">${days.map((d) => `
        <a role="tab" href="#${esc(trip.slug)}/roteiro/${d}" aria-selected="${d === day}" class="day-tab${d === day ? " on" : ""}">
          ${fmtDate(d, { weekday: "short", day: "numeric", month: "short" })}${countByDay(d) ? ` <span class="badge">${countByDay(d)}</span>` : ""}
        </a>`).join("")}</div>

      <div class="route-layout">
        <div>
          ${stops.length ? `<ol class="stops">${stops.map((s, i) => `
            <li>
              <span class="stop-n">${i + 1}</span>
              <div class="stop-body">
                <b>${esc(s.name)}</b>
                ${s.lat == null ? `<span class="warn-text">Não encontrado no mapa: acrescente a morada.</span>` : s.address ? `<span class="muted small">${esc(s.address.split(",").slice(0, 3).join(","))}</span>` : ""}
                ${s.notes ? `<span class="small">${esc(s.notes)}</span>` : ""}
              </div>
              <div class="stop-actions">
                <button class="icon-btn" data-up="${s.id}" ${i === 0 ? "disabled" : ""} aria-label="Subir ${esc(s.name)}">↑</button>
                <button class="icon-btn" data-down="${s.id}" ${i === stops.length - 1 ? "disabled" : ""} aria-label="Descer ${esc(s.name)}">↓</button>
                <button class="icon-btn" data-delstop="${s.id}" aria-label="Apagar ${esc(s.name)}">✕</button>
              </div>
            </li>`).join("")}</ol>` : `<p class="muted">Ainda não há paragens para este dia. A primeira paragem é o ponto de partida (por exemplo, o hotel).</p>`}

          <div class="route-btns">
            <button class="btn ghost" id="optimize" ${geoStops.length < 3 ? "disabled" : ""}>Otimizar ordem</button>
            ${gmaps ? `<a class="btn" href="${gmaps}" target="_blank" rel="noopener">Abrir rota no Google Maps</a>` : ""}
          </div>
          ${km ? `<p class="muted small">Cerca de ${km.toFixed(1).replace(".", ",")} km a pé em linha reta entre paragens.${geoStops.length > 11 ? " O Google Maps só aceita 11 paragens de cada vez: as restantes ficam de fora do link." : ""}${missing ? ` ${missing} paragem(ns) sem localização não entram na rota.` : ""}</p>` : ""}

          <form id="add-stop" class="form-grid">
            <label for="stop-name">Sítio</label>
            <input id="stop-name" required maxlength="120" placeholder="Ex.: Tower Bridge">
            <label for="stop-addr">Morada</label>
            <input id="stop-addr" maxlength="200" placeholder="Opcional, se o nome não chegar">
            <label for="stop-notes">Notas</label>
            <input id="stop-notes" maxlength="200" placeholder="Ex.: comprar bilhetes antes">
            <div></div><button class="btn" type="submit">Acrescentar paragem</button>
          </form>
        </div>
        <div id="map" class="map" role="img" aria-label="Mapa das paragens do dia"></div>
      </div>
    </section>`;

  drawMap(geoStops);

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
      trip_id: trip.id, day, name,
      address: geo?.address ?? (addr || null),
      lat: geo?.lat ?? null, lng: geo?.lng ?? null,
      notes: el.querySelector("#stop-notes").value.trim() || null,
      position: stops.length ? Math.max(...stops.map((s) => s.position)) + 1 : 0,
    }));
    if (ok) ctx.refresh(); else { btn.disabled = false; btn.textContent = "Acrescentar paragem"; }
  });

  const saveOrder = async (ordered) => {
    const res = await Promise.all(ordered.map((s, i) => db.from("itinerary_stops").update({ position: i }).eq("id", s.id)));
    if (res.some((r) => r.error)) toast("Não foi possível guardar a nova ordem.");
    ctx.refresh();
  };
  const move = (id, delta) => {
    const arr = [...stops];
    const i = arr.findIndex((s) => s.id === id);
    const j = i + delta;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    saveOrder(arr);
  };
  el.querySelectorAll("[data-up]").forEach((b) => b.addEventListener("click", () => move(b.dataset.up, -1)));
  el.querySelectorAll("[data-down]").forEach((b) => b.addEventListener("click", () => move(b.dataset.down, 1)));
  el.querySelector("#optimize").addEventListener("click", () => saveOrder(optimizeOrder(stops)));
  el.querySelectorAll("[data-delstop]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "?"; b.classList.add("armed"); return; }
      if (await run(db.from("itinerary_stops").delete().eq("id", b.dataset.delstop))) ctx.refresh();
    })
  );
}

function drawMap(pts) {
  const box = document.getElementById("map");
  if (map) { map.remove(); map = null; }
  if (!window.L) { box.innerHTML = `<p class="muted pad">O mapa não carregou.</p>`; return; }
  map = L.map(box, { scrollWheelZoom: false });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  if (!pts.length) { map.setView([51.5074, -0.1278], 12); return; }
  const latlngs = pts.map((p) => [p.lat, p.lng]);
  pts.forEach((p, i) =>
    L.marker([p.lat, p.lng], {
      icon: L.divIcon({ className: "pin", html: `<span>${i + 1}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] }),
      title: p.name,
    }).bindPopup(esc(p.name)).addTo(map)
  );
  if (latlngs.length > 1) L.polyline(latlngs, { color: getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#C4122F", weight: 3, dashArray: "6 6" }).addTo(map);
  map.fitBounds(latlngs, { padding: [30, 30], maxZoom: 15 });
}
