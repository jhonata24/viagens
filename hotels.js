import { db, esc, money, nights, run, geocode, toast } from "./util.js";
import { tripKm } from "./rota-logic.js";

let sortBy = "rank"; // "rank" (qualidade/preço) ou "km" (menos quilómetros no roteiro)
const fmtKm = (k) => `${k.toFixed(1).replace(".", ",")} km`;

export async function renderHotels(el, ctx) {
  const { trip, member } = ctx;
  const [{ data: hotels, error: e1 }, { data: votes, error: e2 }, { data: stops }] = await Promise.all([
    db.from("hotels").select("*").eq("trip_id", trip.id).order("rank"),
    db.from("votes").select("hotel_id, voter_name, member_id").eq("trip_id", trip.id),
    db.from("itinerary_stops").select("day, lat, lng").eq("trip_id", trip.id).eq("variant", 1),
  ]);
  if (!el.isConnected) return;
  if (e1 || e2) { el.innerHTML = `<p class="error">Não foi possível carregar os hotéis.</p>`; return; }

  const n = nights(trip);

  // Quilómetros a pé de todo o roteiro (rotas otimizadas, ida e volta ao hotel em cada dia)
  const byDay = {};
  (stops || []).forEach((s) => (byDay[s.day] ??= []).push(s));
  const hasRoute = (stops || []).some((s) => s.lat != null);
  const km = {};
  if (hasRoute) hotels.forEach((h) => { if (h.lat != null) km[h.id] = tripKm(byDay, h).total; });
  const withKm = hotels.filter((h) => km[h.id] != null);
  const shortest = withKm.length ? withKm.reduce((a, b) => (km[a.id] <= km[b.id] ? a : b)) : null;
  const shortestBf = withKm.filter((h) => h.breakfast === "incluido").reduce((a, b) => (!a || km[b.id] < km[a.id] ? b : a), null);
  const sorter = (a, b) => (sortBy === "km" ? (km[a.id] ?? 1e9) - (km[b.id] ?? 1e9) : a.rank - b.rank);
  const myVote = member && votes.find((v) => v.member_id === member.id || v.voter_name === member.name)?.hotel_id;
  const byHotel = (id) => votes.filter((v) => v.hotel_id === id).map((v) => v.voter_name);

  const card = (h, top) => {
    const voters = byHotel(h.id);
    const mine = myVote === h.id;
    const chosen = trip.hotel_id === h.id;
    const sites = Object.entries(h.prices || {}).map(([site, price]) => ({ site, price: Number(price) })).sort((a, b) => a.price - b.price);
    const best = sites[0] ?? (h.total_price ? { site: "Booking.com", price: Number(h.total_price) } : null);
    return `<article class="card${top ? " top" : ""}${mine ? " mine" : ""}${chosen ? " chosen-card" : ""}">
      <div class="row1">
        <div class="rank">${h.rank}</div>
        <div><h3>${esc(h.name)}</h3><div class="zone">${esc(h.zone)}${h.stars ? " · " + "★".repeat(h.stars) : ""}</div></div>
        <div class="price">${best
          ? `<b>${money(best.price, h.currency)}</b><span>no ${esc(best.site)}</span><span>${money(best.price / n, h.currency)} por noite</span><span>${money(best.price / n / trip.travelers, h.currency)} por pessoa/noite</span>`
          : `<span>Preço por confirmar</span>`}</div>
      </div>
      <div class="stats">
        <span class="pill ${h.breakfast}">${h.breakfast === "incluido" ? "Pequeno-almoço incluído" : "Pequeno-almoço: confirmar tarifa"}</span>
        ${h.score ? `<span class="stat">Nota <b>${Number(h.score).toFixed(1)}</b>${h.reviews ? ` <span class="muted">(${h.reviews.toLocaleString("pt-PT")})</span>` : ""}</span>` : ""}
        ${h.cleanliness ? `<span class="stat">Limpeza <b>${Number(h.cleanliness).toFixed(1)}</b></span>` : ""}
        ${h.location_score ? `<span class="stat">Localização <b>${Number(h.location_score).toFixed(1)}</b></span>` : ""}
        ${h.walk_to_center ? `<span class="stat">${esc(h.walk_to_center)}</span>` : ""}
        ${km[h.id] != null ? `<span class="stat km${h.id === shortest?.id ? " best" : ""}">Roteiro a pé <b>${fmtKm(km[h.id])}</b>${h.id === shortest?.id ? " · o mais curto" : ""}</span>` : ""}
      </div>
      ${sites.length > 1 ? `<div class="sites">${sites.map((x, i) => `<span class="site${i === 0 ? " cheapest" : ""}">${esc(x.site)}: <b>${money(x.price, h.currency)}</b>${i === 0 ? " · mais barato" : ""}</span>`).join("")}</div>` : ""}
      <div class="pc"><div class="pro"><span class="h">Prós</span>${esc(h.pros)}</div><div class="con"><span class="h">Contras</span>${esc(h.cons)}</div></div>
      <div class="actions">
        <div class="votes">${voters.length ? `<b>${voters.length} ${voters.length === 1 ? "voto" : "votos"}</b>: ${voters.map(esc).join(", ")}` : "Sem votos"}</div>
        <div class="btns">
          <button class="btn ghost choose" data-choose="${h.id}" aria-pressed="${chosen}">${chosen ? "Hotel escolhido ✓" : "Escolher este hotel"}</button>
          <button class="btn ghost" data-vote="${h.id}" aria-pressed="${mine}" ${member ? "" : "disabled title=\"Escolha o seu nome em Eu sou, no topo\""}>${mine ? "O meu voto ✓" : "Votar neste"}</button>
          ${h.booking_url ? `<a class="btn" href="${esc(h.booking_url)}" target="_blank" rel="noopener">Ver no Booking.com</a>` : ""}
        </div>
      </div>
    </article>`;
  };

  const ok = hotels.filter((h) => h.breakfast === "incluido").sort(sorter);
  const other = hotels.filter((h) => h.breakfast !== "incluido").sort(sorter);

  const chosenHotel = hotels.find((h) => h.id === trip.hotel_id);
  el.innerHTML = `
    ${chosenHotel
      ? `<div class="chosen"><span>Hotel escolhido: <b>${esc(chosenHotel.name)}</b>. As rotas do roteiro começam e acabam aqui.</span><button class="btn ghost" data-unchoose>Tirar escolha</button></div>`
      : `<p class="muted">Ainda não escolheram o hotel. Quando escolherem, as rotas do roteiro passam a começar e acabar nele.</p>`}
    ${shortestBf ? `<div class="panel km-summary">
      <span>Com pequeno-almoço incluído, o hotel que dá <b>menos quilómetros a pé</b> no roteiro dos ${Object.keys(byDay).length} dias é o <b>${esc(shortestBf.name)}</b>: ${fmtKm(km[shortestBf.id])} no total (em linha reta, a sair e voltar ao hotel todos os dias).${shortest && shortest.id !== shortestBf.id ? ` O mais curto de todos é o ${esc(shortest.name)} (${fmtKm(km[shortest.id])}), mas o pequeno-almoço não está garantido.` : ""}</span>
      <div class="inline sort"><span class="small muted">Ordenar por</span>
        <button class="btn ghost" data-sort="rank" aria-pressed="${sortBy === "rank"}">Qualidade/preço</button>
        <button class="btn ghost" data-sort="km" aria-pressed="${sortBy === "km"}">Menos km</button>
      </div>
    </div>` : ""}
    ${member ? "" : `<p class="hint">Para votar, escolha o seu nome em “Eu sou”, no topo da página.</p>`}
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
    <p class="foot">Preços totais verificados no Booking.com. Os preços mudam todos os dias: confirmem no botão de cada hotel antes de reservar. Tempos a pé aproximados.</p>`;

  const setHotel = async (id) => {
    if (id) {
      const h = hotels.find((x) => x.id === id);
      if (h && h.lat == null) {
        const g = await geocode(h.name, trip.destination);
        if (g) await db.from("hotels").update({ lat: g.lat, lng: g.lng }).eq("id", id);
        else toast("Não encontrei este hotel no mapa; as rotas não o vão incluir.", "info");
      }
    }
    const ok = await run(db.from("trips").update({ hotel_id: id }).eq("id", trip.id), "Não foi possível guardar o hotel escolhido.");
    if (ok) { trip.hotel_id = id; ctx.refresh(); }
  };
  el.querySelectorAll("[data-choose]").forEach((b) =>
    b.addEventListener("click", () => { b.disabled = true; setHotel(trip.hotel_id === b.dataset.choose ? null : b.dataset.choose); })
  );
  el.querySelector("[data-unchoose]")?.addEventListener("click", () => setHotel(null));
  el.querySelectorAll("[data-sort]").forEach((b) => b.addEventListener("click", () => { sortBy = b.dataset.sort; ctx.refresh(); }));

  el.querySelectorAll("[data-vote]").forEach((b) =>
    b.addEventListener("click", async () => {
      b.disabled = true;
      const ok = await run(
        db.from("votes").upsert(
          { trip_id: trip.id, hotel_id: b.dataset.vote, voter_name: member.name, member_id: member.id },
          { onConflict: "trip_id,voter_name" }
        ),
        "Não foi possível guardar o voto."
      );
      if (ok) ctx.refresh(); else b.disabled = false;
    })
  );
}
