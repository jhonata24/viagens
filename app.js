import { db, esc, fmtDate, nights, daysUntil, me, run } from "./util.js";
import { renderHotels } from "./hotels.js";
import { renderRoteiro } from "./roteiro.js";
import { renderAtracoes } from "./atracoes.js";
import { renderRestaurantes } from "./restaurantes.js";
import { renderContas } from "./contas.js";

const app = document.getElementById("app");
// Ícones de traço, 24×24
const ICON = {
  hoteis: '<path d="M3 19V6M3 15h18v4M21 15v-3a3 3 0 0 0-3-3h-7v6"/><circle cx="7" cy="11" r="2"/>',
  roteiro: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>',
  restaurantes: '<path d="M7 3v8a2 2 0 0 0 2 2h0v8"/><path d="M5 3v5a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V3"/><path d="M9 3v5"/><path d="M17 21V3c-2 0-3 3-3 6s1 4 3 4"/>',
  atracoes: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12 3 3 5-6"/>',
  contas: '<path d="M4 7h16v12H4z"/><path d="M4 7l2-3h12l2 3"/><circle cx="12" cy="13" r="2.5"/>',
};
const icon = (id) => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[id]}</svg>`;

const TABS = [
  { id: "hoteis", label: "Hotéis", render: renderHotels },
  { id: "roteiro", label: "Roteiro", render: renderRoteiro },
  { id: "restaurantes", label: "Restaurantes", render: renderRestaurantes },
  { id: "atracoes", label: "Atrações", render: renderAtracoes },
  { id: "contas", label: "Contas", render: renderContas },
];

const fail = (msg) => { app.innerHTML = `<p class="error">${esc(msg)} Tente recarregar a página.</p>`; };

/* ---------- Página inicial ---------- */
async function renderHome() {
  document.title = "Viagens";
  document.body.classList.remove("has-tabs");
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
      <h1>${esc(trip.title)}</h1>
      <div class="muted small">${fmtDate(trip.start_date, { day: "numeric", month: "short" })} → ${fmtDate(trip.end_date, { day: "numeric", month: "short", year: "numeric" })} · ${nights(trip)} noites · ${trip.requirements.map(esc).join(" · ")}</div>
    </div>

    <div class="who">
      <label for="who-select" class="small"><b>Eu sou</b></label>
      <select id="who-select">
        <option value="">Escolha o seu nome…</option>
        ${members.map((m) => `<option value="${m.id}" ${member?.id === m.id ? "selected" : ""}>${esc(m.name)}</option>`).join("")}
      </select>
      <details class="add-person">
        <summary class="btn ghost">+ Pessoa</summary>
        <form id="add-member" class="inline">
          <label for="new-member" class="sr">Nome de uma pessoa nova</label>
          <input id="new-member" maxlength="40" placeholder="Nome">
          <button class="btn" type="submit">Acrescentar</button>
        </form>
      </details>
    </div>

    <h2 class="tab-title">${tab.label}</h2>
    ${trip.alert && (tab.id === "hoteis" || tab.id === "roteiro") ? `<div class="alert">${esc(trip.alert)}</div>` : ""}
    <div id="tab-body"><p class="muted">A carregar…</p></div>
    <nav class="tabs" aria-label="Secções da viagem">${TABS.map((t) =>
      `<a href="#${esc(trip.slug)}/${t.id}" class="tab${t.id === tab.id ? " on" : ""}" ${t.id === tab.id ? 'aria-current="page"' : ""}>${icon(t.id)}<span>${t.label}</span></a>`
    ).join("")}</nav>`;
  document.body.classList.add("has-tabs");

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

/* ---------- Navegação: #slug/separador/extra (o extra pode ter "/", ex.: 2/2026-12-24) ---------- */
let lastKey = "";
function route() {
  const [slug, tab, ...rest] = decodeURIComponent(location.hash.slice(1)).split("/");
  const sub = rest.join("/");
  const key = `${slug}/${tab}`;
  if (key !== lastKey) window.scrollTo(0, 0);
  lastKey = key;
  slug ? renderTrip(slug, tab, sub) : renderHome();
}
window.addEventListener("hashchange", route);
route();
