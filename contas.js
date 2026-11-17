import { db, esc, money, fmtDate, run } from "./util.js";
import { balances, settle } from "./contas-logic.js";

const CURRENCIES = { EUR: "Euros (€)", GBP: "Libras (£)", USD: "Dólares ($)" };

export async function renderContas(el, ctx) {
  const { trip, member, members } = ctx;
  const { data: expenses, error } = await db
    .from("expenses")
    .select("*, expense_shares(member_id)")
    .eq("trip_id", trip.id)
    .order("spent_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (!el.isConnected) return;
  if (error) { el.innerHTML = `<p class="error">Não foi possível carregar as contas.</p>`; return; }

  const name = (id) => members.find((m) => m.id === id)?.name ?? "?";
  const rows = expenses.map((e) => ({ ...e, shares: e.expense_shares.map((s) => s.member_id) }));
  const bal = balances(rows);
  const curs = Object.keys(bal);
  const today = new Date().toISOString().slice(0, 10);
  const defaultDay = today >= trip.start_date && today <= trip.end_date ? today : trip.start_date;
  const lastCur = rows[0]?.currency ?? "EUR";

  const totals = curs.map((c) => {
    const total = rows.filter((r) => r.currency === c).reduce((s, r) => s + Number(r.amount), 0);
    return `<div class="tile"><span class="muted">Gasto total</span><b>${money(total, c, 2)}</b></div>`;
  }).join("");

  const balanceBlock = curs.map((c) => {
    const transfers = settle(bal[c]);
    return `<div class="panel">
      <h3>${CURRENCIES[c] ?? c}</h3>
      <ul class="bal">${members.map((m) => {
        const v = bal[c][m.id] ?? 0;
        return `<li><span>${esc(m.name)}</span><b class="${v > 0 ? "pos" : v < 0 ? "neg" : ""}">${v > 0 ? "recebe " : v < 0 ? "deve " : ""}${money(Math.abs(v) / 100, c, 2)}</b></li>`;
      }).join("")}</ul>
      <h4>Para ficar tudo certo</h4>
      ${transfers.length
        ? `<ul class="settle">${transfers.map((t) => `<li><b>${esc(name(t.from))}</b> paga <b>${money(t.cents / 100, c, 2)}</b> a <b>${esc(name(t.to))}</b></li>`).join("")}</ul>`
        : `<p class="muted">Está tudo acertado.</p>`}
    </div>`;
  }).join("");

  el.innerHTML = `
    ${members.length < 2 ? `<p class="hint">Acrescente as pessoas da viagem com “+ Pessoa”, no topo da página, para poder dividir as contas.</p>` : ""}
    ${curs.length ? `<div class="tiles">${totals}</div>` : ""}
    <section class="panel">
      <h3>Nova despesa</h3>
      <form id="add-exp" class="form-grid">
        <label for="exp-desc">O quê</label>
        <input id="exp-desc" required maxlength="120" placeholder="Ex.: Jantar em Covent Garden">
        <label for="exp-amount">Valor</label>
        <div class="inline">
          <input id="exp-amount" required type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="0,00">
          <select id="exp-cur" aria-label="Moeda">${Object.entries(CURRENCIES).map(([k, v]) => `<option value="${k}" ${k === lastCur ? "selected" : ""}>${v}</option>`).join("")}</select>
        </div>
        <label for="exp-payer">Quem pagou</label>
        <select id="exp-payer" required>${members.map((m) => `<option value="${m.id}" ${member?.id === m.id ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select>
        <span class="label">Dividir por</span>
        <div class="checks">${members.map((m) => `<label class="check"><input type="checkbox" name="share" value="${m.id}" checked> ${esc(m.name)}</label>`).join("")}</div>
        <label for="exp-date">Dia</label>
        <input id="exp-date" type="date" value="${defaultDay}">
        <div></div><button class="btn" type="submit" ${members.length ? "" : "disabled"}>Guardar despesa</button>
      </form>
    </section>
    ${curs.length ? `<section><h2>Quem deve a quem</h2><p class="muted">Cada despesa é dividida em partes iguais pelas pessoas escolhidas. Euros e libras são contados em separado.</p><div class="bal-grid">${balanceBlock}</div></section>` : ""}
    <section>
      <h2>Despesas</h2>
      ${rows.length ? `<ul class="exp-list">${rows.map((e) => `
        <li>
          <div><b>${esc(e.description)}</b><span class="muted">${fmtDate(e.spent_on, { day: "numeric", month: "short" })} · pagou ${esc(name(e.paid_by))} · dividido por ${e.shares.map((s) => esc(name(s))).join(", ")}</span></div>
          <b class="amt">${money(e.amount, e.currency, 2)}</b>
          <button class="icon-btn" data-del="${e.id}" aria-label="Apagar ${esc(e.description)}" title="Apagar">✕</button>
        </li>`).join("")}</ul>` : `<p class="muted">Ainda não há despesas.</p>`}
    </section>`;

  el.querySelector("#add-exp").addEventListener("submit", async (e) => {
    e.preventDefault();
    const shares = [...el.querySelectorAll('input[name="share"]:checked')].map((c) => c.value);
    if (!shares.length) { el.querySelector(".checks").classList.add("invalid"); return; }
    const amount = Number(el.querySelector("#exp-amount").value);
    if (!(amount > 0)) return;
    const btn = e.submitter; btn.disabled = true;
    const exp = await run(db.from("expenses").insert({
      trip_id: trip.id,
      description: el.querySelector("#exp-desc").value.trim(),
      amount,
      currency: el.querySelector("#exp-cur").value,
      paid_by: el.querySelector("#exp-payer").value,
      spent_on: el.querySelector("#exp-date").value || defaultDay,
    }).select("id").single());
    if (!exp) { btn.disabled = false; return; }
    const ok = await run(db.from("expense_shares").insert(shares.map((m) => ({ expense_id: exp.id, member_id: m }))));
    if (!ok) await db.from("expenses").delete().eq("id", exp.id);
    ctx.refresh();
  });

  el.querySelectorAll("[data-del]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Apagar?"; b.classList.add("armed"); return; }
      if (await run(db.from("expenses").delete().eq("id", b.dataset.del))) ctx.refresh();
    })
  );
}
