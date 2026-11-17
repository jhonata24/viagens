import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

const db = createClient(SUPABASE_URL, SUPABASE_KEY);
const app = document.getElementById("app");

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n, cur = "EUR") => Number(n).toLocaleString("pt-PT", { style: "currency", currency: cur, maximumFractionDigits: 0 });
const fmtDate = (d) => new Date(d + "T00:00:00").toLocaleDateString("pt-PT", { day: "numeric", month: "long", year: "numeric" });
const nights = (t) => Math.round((new Date(t.end_date) - new Date(t.start_date)) / 86400000);
const daysUntil = (d) => { const t = new Date(); t.setHours(0, 0, 0, 0); return Math.round((new Date(d + "T00:00:00") - t) / 86400000); };
const getName = () => { try { return localStorage.getItem("viagens:nome") || ""; } catch { return ""; } };
const setName = (n) => { try { localStorage.setItem("viagens:nome", n); } catch {} };

function fail(msg) {
  app.innerHTML = `<p class="error">${esc(msg)} Tente recarregar a página.</p>`;
}

/* ---------- Página inicial: lista de viagens ---------- */
async function renderHome() {
  document.title = "Viagens";
  const { data: trips, error } = await db.from("trips").select("*").order("start_date", { ascending: true });
  if (error) return fail("Não foi possível carregar as viagens.");

  const cards = trips.map((t) => {
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
  }).join("");

  app.innerHTML = `
    <div class="home-head">
      <div class="eyebrow">Família · planeamento</div>
      <h1>As nossas viagens</h1>
      <p class="muted" style="margin:0">Escolham uma viagem para ver os hotéis, os preços e votar no preferido.</p>
    </div>
    <div class="trips">${cards || '<p class="muted">Ainda não há viagens.</p>'}</div>`;
}

/* ---------- Página de uma viagem ---------- */
async function renderTrip(slug) {
  const { data: trip, error } = await db.from("trips").select("*").eq("slug", slug).maybeSingle();
  if (error) return fail("Não foi possível carregar a viagem.");
  if (!trip) { location.hash = ""; return; }
  document.title = `${trip.title} · Viagens`;

  const [{ data: hotels, error: e1 }, { data: votes, error: e2 }] = await Promise.all([
    db.from("hotels").select("*").eq("trip_id", trip.id).order("rank"),
    db.from("votes").select("hotel_id, voter_name").eq("trip_id", trip.id),
  ]);
  if (e1 || e2) return fail("Não foi possível carregar os hotéis.");

  const me = getName();
  const myVote = votes.find((v) => v.voter_name === me)?.hotel_id;
  const byHotel = (id) => votes.filter((v) => v.hotel_id === id).map((v) => v.voter_name);
  const n = nights(trip);

  const card = (h, top) => {
    const voters = byHotel(h.id);
    const mine = myVote === h.id;
    const perNight = h.total_price ? money(h.total_price / n, h.currency) : "";
    const perPerson = h.total_price ? money(h.total_price / n / trip.travelers, h.currency) : "";
    return `<article class="card${top ? " top" : ""}${mine ? " mine" : ""}">
      <div class="row1">
        <div class="rank">${h.rank}</div>
        <div><h3>${esc(h.name)}</h3><div class="zone">${esc(h.zone)}${h.stars ? " · " + "★".repeat(h.stars) : ""}</div></div>
        <div class="price">${h.total_price ? `<b>${money(h.total_price, h.currency)}</b><span>${perNight} por noite</span><span>${perPerson} por pessoa/noite</span>` : `<span>Preço por confirmar</span>`}</div>
      </div>
      <div class="stats">
        <span class="pill ${h.breakfast}">${h.breakfast === "incluido" ? "Pequeno-almoço incluído" : "Pequeno-almoço: confirmar tarifa"}</span>
        ${h.score ? `<span class="stat">Nota <b>${Number(h.score).toFixed(1)}</b>${h.reviews ? ` <span class="muted">(${h.reviews.toLocaleString("pt-PT")})</span>` : ""}</span>` : ""}
        ${h.cleanliness ? `<span class="stat">Limpeza <b>${Number(h.cleanliness).toFixed(1)}</b></span>` : ""}
        ${h.location_score ? `<span class="stat">Localização <b>${Number(h.location_score).toFixed(1)}</b></span>` : ""}
        ${h.walk_to_center ? `<span class="stat">${esc(h.walk_to_center)}</span>` : ""}
      </div>
      <div class="pc"><div class="pro"><span class="h">Prós</span>${esc(h.pros)}</div><div class="con"><span class="h">Contras</span>${esc(h.cons)}</div></div>
      <div class="actions">
        <div class="votes">${voters.length ? `<b>${voters.length} ${voters.length === 1 ? "voto" : "votos"}</b>: ${voters.map(esc).join(", ")}` : "Sem votos"}</div>
        <div class="btns">
          <button class="btn ghost" data-vote="${h.id}" aria-pressed="${mine}" ${me ? "" : "disabled"}>${mine ? "O meu voto ✓" : "Votar neste"}</button>
          ${h.booking_url ? `<a class="btn" href="${esc(h.booking_url)}" target="_blank" rel="noopener">Ver no Booking.com</a>` : ""}
        </div>
      </div>
    </article>`;
  };

  const ok = hotels.filter((h) => h.breakfast === "incluido");
  const other = hotels.filter((h) => h.breakfast !== "incluido");
  const checked = hotels.find((h) => h.price_checked_at)?.price_checked_at;

  app.innerHTML = `
    <a class="back" href="#">← Todas as viagens</a>
    <div class="trip-head">
      <div class="eyebrow">Viagem · ${esc(trip.country || "")}</div>
      <h1>${esc(trip.title)}</h1>
      <div class="chips">
        <span class="chip">${fmtDate(trip.start_date)} → ${fmtDate(trip.end_date)}</span>
        <span class="chip">${n} noites</span>
        ${trip.requirements.map((r) => `<span class="chip">${esc(r)}</span>`).join("")}
      </div>
    </div>
    ${trip.alert ? `<div class="alert">${esc(trip.alert)}</div>` : ""}
    <div class="voter">
      <b>Qual é o vosso hotel preferido?</b>
      <form id="name-form">
        <label for="voter-name">O seu nome</label>
        <input id="voter-name" name="voter-name" maxlength="40" autocomplete="given-name" value="${esc(me)}" placeholder="Ex.: Ana">
        <button class="btn" type="submit">${me ? "Mudar nome" : "Começar a votar"}</button>
      </form>
      <span class="muted" style="font-size:14px">Cada pessoa tem um voto e pode mudá-lo quando quiser.</span>
    </div>
    <section>
      <h2>Recomendados</h2>
      <p class="muted">Pequeno-almoço incluído para todos, confirmado pelo hotel. Ordenados por qualidade/preço.</p>
      <div class="list">${ok.map((h, i) => card(h, i === 0)).join("") || '<p class="muted">Nenhum.</p>'}</div>
    </section>
    ${other.length ? `<section>
      <h2>Outras opções</h2>
      <p class="muted">O pequeno-almoço depende da tarifa ou paga-se à parte. Ao reservar, escolham uma tarifa com pequeno-almoço incluído.</p>
      <div class="list">${other.map((h) => card(h, false)).join("")}</div>
    </section>` : ""}
    <div class="foot">Preços totais${checked ? ` verificados no Booking.com a ${fmtDate(checked)}` : ""}. Os preços mudam todos os dias: confirmem no botão de cada hotel antes de reservar. Tempos a pé aproximados.</div>`;

  document.getElementById("name-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = document.getElementById("voter-name").value.trim();
    if (!v) return;
    setName(v);
    renderTrip(slug);
  });

  app.querySelectorAll("[data-vote]").forEach((b) =>
    b.addEventListener("click", async () => {
      b.disabled = true;
      const { error } = await db.from("votes").upsert(
        { trip_id: trip.id, hotel_id: b.dataset.vote, voter_name: getName() },
        { onConflict: "trip_id,voter_name" }
      );
      if (error) { b.disabled = false; alertBox("Não foi possível guardar o voto. Tente outra vez."); return; }
      renderTrip(slug);
    })
  );
}

function alertBox(msg) {
  const p = document.createElement("p");
  p.className = "error";
  p.textContent = msg;
  app.prepend(p);
}

/* ---------- Navegação ---------- */
function route() {
  const slug = decodeURIComponent(location.hash.slice(1));
  window.scrollTo(0, 0);
  slug ? renderTrip(slug) : renderHome();
}
window.addEventListener("hashchange", route);
route();
