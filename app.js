import { db, esc, fmtDate, nights, daysUntil, me, run } from "./util.js";
import { renderHotels } from "./hotels.js";
import { renderRoteiro } from "./roteiro.js";
import { renderAtracoes } from "./atracoes.js";
import { renderContas } from "./contas.js";

const app = document.getElementById("app");
const TABS = [
  { id: "hoteis", label: "Hotéis", render: renderHotels },
  { id: "roteiro", label: "Roteiro", render: renderRoteiro },
  { id: "atracoes", label: "Atrações", render: renderAtracoes },
  { id: "contas", label: "Contas", render: renderContas },
];

const fail = (msg) => { app.innerHTML = `<p class="error">${esc(msg)} Tente recarregar a página.</p>`; };

/* ---------- Página inicial ---------- */
async function renderHome() {
  document.title = "Viagens";
  const { data: trips, error } = await db.from("trips").select("*").order("start_date");
  if (error) return fail("Não foi possível carregar as viagens.");

  app.innerHTML = `
    <div class="home-head">
      <div class="eyebrow">Família · planeamento</div>
      <h1>As nossas viagens</h1>
      <p class="muted" style="margin:0">Escolham uma viagem para ver os hotéis, o roteiro, as atrações e as contas.</p>
    </div>
    <div class="trips">${trips.map((t) => {
      const d = daysUntil(t.start_date);
      const past = daysUntil(t.end_date) < 0;
      const count = past ? `<b>✓</b><span>já foi</span>` : d > 0 ? `<b>${d}</b><span>dias até partir</span>` : `<b>Agora</b><span>a decorrer</span>`;
      return `<a class="trip${past ? " past" : ""}" href="#${esc(t.slug)}">
        <div class="badge-city">${esc(t.destination.slice(0, 3).toUpperCase())}</div>
        <div>
          <h2>${esc(t.title)}</h2>
          <div class="meta"><span>${fmtDate(t.start_date)} a ${fmtDate(t.end_date)}</span><span>${nights(t)} noites</span><span>${t.travelers} pessoas · ${t.rooms} ${t.rooms === 1 ? "quarto" : "quartos"}</span></div>
        </div>
        <div class="count">${count}</div>
      </a>`;
    }).join("") || '<p class="muted">Ainda não há viagens.</p>'}</div>`;
}

/* ---------- Página de uma viagem ---------- */
async function renderTrip(slug, tabId, sub) {
  const { data: trip, error } = await db.from("trips").select("*").eq("slug", slug).maybeSingle();
  if (error) return fail("Não foi possível carregar a viagem.");
  if (!trip) { location.hash = ""; return; }
  const tab = TABS.find((t) => t.id === tabId) ?? TABS[0];
  document.title = `${tab.label} · ${trip.title}`;

  const { data: members, error: em } = await db.from("trip_members").select("*").eq("trip_id", trip.id).order("created_at");
  if (em) return fail("Não foi possível carregar a viagem.");
  const member = members.find((m) => m.id === me.get(trip.id)) ?? null;

  app.innerHTML = `
    <a class="back" href="#">← Todas as viagens</a>
    <div class="trip-head">
      <div class="eyebrow">Viagem · ${esc(trip.country || "")}</div>
      <h1>${esc(trip.title)}</h1>
      <div class="chips">
        <span class="chip">${fmtDate(trip.start_date)} → ${fmtDate(trip.end_date)}</span>
        <span class="chip">${nights(trip)} noites</span>
        ${trip.requirements.map((r) => `<span class="chip">${esc(r)}</span>`).join("")}
      </div>
    </div>
    ${trip.alert && tab.id !== "contas" ? `<div class="alert">${esc(trip.alert)}</div>` : ""}

    <div class="who">
      <label for="who-select"><b>Quem é você?</b></label>
      <select id="who-select">
        <option value="">Escolha o seu nome…</option>
        ${members.map((m) => `<option value="${m.id}" ${member?.id === m.id ? "selected" : ""}>${esc(m.name)}</option>`).join("")}
      </select>
      <form id="add-member" class="inline">
        <label for="new-member" class="sr">Nome de uma pessoa nova</label>
        <input id="new-member" maxlength="40" placeholder="Pessoa nova">
        <button class="btn ghost" type="submit">Acrescentar</button>
      </form>
      <span class="muted small">${members.length ? `Na viagem: ${members.map((m) => esc(m.name)).join(", ")}` : "Acrescentem as pessoas da viagem."}</span>
    </div>

    <nav class="tabs" aria-label="Secções da viagem">${TABS.map((t) =>
      `<a href="#${esc(trip.slug)}/${t.id}" class="tab${t.id === tab.id ? " on" : ""}" ${t.id === tab.id ? 'aria-current="page"' : ""}>${t.label}</a>`
    ).join("")}</nav>
    <div id="tab-body"><p class="muted">A carregar…</p></div>`;

  app.querySelector("#who-select").addEventListener("change", (e) => {
    me.set(trip.id, e.target.value || null);
    route();
  });
  app.querySelector("#add-member").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = app.querySelector("#new-member").value.trim();
    if (!name) return;
    const m = await run(db.from("trip_members").insert({ trip_id: trip.id, name }).select("id").single(), "Não foi possível acrescentar (o nome já existe?).");
    if (m) { if (!member) me.set(trip.id, m.id); route(); }
  });

  const body = app.querySelector("#tab-body");
  const ctx = { trip, member, members, sub, refresh: () => tab.render(body, ctx) };
  await tab.render(body, ctx);
}

/* ---------- Navegação: #slug/separador/extra ---------- */
let lastKey = "";
function route() {
  const [slug, tab, sub] = decodeURIComponent(location.hash.slice(1)).split("/");
  const key = `${slug}/${tab}`;
  if (key !== lastKey) window.scrollTo(0, 0);
  lastKey = key;
  slug ? renderTrip(slug, tab, sub) : renderHome();
}
window.addEventListener("hashchange", route);
route();
