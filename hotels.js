import { db, esc, money, nights, run } from "./util.js";

export async function renderHotels(el, ctx) {
  const { trip, member } = ctx;
  const [{ data: hotels, error: e1 }, { data: votes, error: e2 }] = await Promise.all([
    db.from("hotels").select("*").eq("trip_id", trip.id).order("rank"),
    db.from("votes").select("hotel_id, voter_name, member_id").eq("trip_id", trip.id),
  ]);
  if (!el.isConnected) return;
  if (e1 || e2) { el.innerHTML = `<p class="error">Não foi possível carregar os hotéis.</p>`; return; }

  const n = nights(trip);
  const myVote = member && votes.find((v) => v.member_id === member.id || v.voter_name === member.name)?.hotel_id;
  const byHotel = (id) => votes.filter((v) => v.hotel_id === id).map((v) => v.voter_name);

  const card = (h, top) => {
    const voters = byHotel(h.id);
    const mine = myVote === h.id;
    return `<article class="card${top ? " top" : ""}${mine ? " mine" : ""}">
      <div class="row1">
        <div class="rank">${h.rank}</div>
        <div><h3>${esc(h.name)}</h3><div class="zone">${esc(h.zone)}${h.stars ? " · " + "★".repeat(h.stars) : ""}</div></div>
        <div class="price">${h.total_price
          ? `<b>${money(h.total_price, h.currency)}</b><span>${money(h.total_price / n, h.currency)} por noite</span><span>${money(h.total_price / n / trip.travelers, h.currency)} por pessoa/noite</span>`
          : `<span>Preço por confirmar</span>`}</div>
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
          <button class="btn ghost" data-vote="${h.id}" aria-pressed="${mine}" ${member ? "" : "disabled title=\"Escolha o seu nome em Eu sou, no topo\""}>${mine ? "O meu voto ✓" : "Votar neste"}</button>
          ${h.booking_url ? `<a class="btn" href="${esc(h.booking_url)}" target="_blank" rel="noopener">Ver no Booking.com</a>` : ""}
        </div>
      </div>
    </article>`;
  };

  const ok = hotels.filter((h) => h.breakfast === "incluido");
  const other = hotels.filter((h) => h.breakfast !== "incluido");

  el.innerHTML = `
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
