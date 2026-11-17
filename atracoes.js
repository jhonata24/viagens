import { db, esc, run } from "./util.js";

export async function renderAtracoes(el, ctx) {
  const { trip, member } = ctx;
  const { data: items, error } = await db.from("attractions").select("*").eq("trip_id", trip.id).order("position").order("created_at");
  if (!el.isConnected) return;
  if (error) { el.innerHTML = `<p class="error">Não foi possível carregar as atrações.</p>`; return; }

  const done = items.filter((a) => a.done).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;

  const row = (a) => `
    <li class="todo${a.done ? " done" : ""}">
      <input type="checkbox" id="a-${a.id}" data-toggle="${a.id}" ${a.done ? "checked" : ""}>
      <label for="a-${a.id}">
        <span class="todo-name">${esc(a.name)}</span>
        ${a.category ? `<span class="tag">${esc(a.category)}</span>` : ""}
        ${a.notes ? `<span class="todo-notes">${esc(a.notes)}</span>` : ""}
        ${a.done && a.done_by ? `<span class="todo-who">Feito por ${esc(a.done_by)}</span>` : ""}
      </label>
      <button class="icon-btn" data-del="${a.id}" aria-label="Apagar ${esc(a.name)}" title="Apagar">✕</button>
    </li>`;

  const todo = items.filter((a) => !a.done);
  const feitas = items.filter((a) => a.done);

  el.innerHTML = `
    <section>
      <div class="progress-head"><b>${done} de ${items.length} feitas</b><span class="muted">${pct}%</span></div>
      <div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>
      <ul class="todos">${todo.map(row).join("") || '<li class="muted">Está tudo feito!</li>'}</ul>
      ${feitas.length ? `<h3 class="sub">Já feitas</h3><ul class="todos">${feitas.map(row).join("")}</ul>` : ""}
    </section>
    <section class="panel">
      <h3>Acrescentar atração</h3>
      <form id="add-attr" class="form-grid">
        <label for="attr-name">Nome</label>
        <input id="attr-name" required maxlength="120" placeholder="Ex.: Sky Garden">
        <label for="attr-cat">Tipo</label>
        <input id="attr-cat" maxlength="40" placeholder="Ex.: Vista, Museus, Comida" list="attr-cats">
        <datalist id="attr-cats">${[...new Set(items.map((a) => a.category).filter(Boolean))].map((c) => `<option value="${esc(c)}">`).join("")}</datalist>
        <label for="attr-notes">Notas</label>
        <input id="attr-notes" maxlength="200" placeholder="Opcional">
        <div></div><button class="btn" type="submit">Acrescentar</button>
      </form>
    </section>`;

  el.querySelectorAll("[data-toggle]").forEach((cb) =>
    cb.addEventListener("change", async () => {
      const ok = await run(db.from("attractions").update(
        cb.checked
          ? { done: true, done_by: member?.name ?? null, done_at: new Date().toISOString() }
          : { done: false, done_by: null, done_at: null }
      ).eq("id", cb.dataset.toggle));
      if (ok) ctx.refresh(); else cb.checked = !cb.checked;
    })
  );

  el.querySelectorAll("[data-del]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Apagar?"; b.classList.add("armed"); return; }
      if (await run(db.from("attractions").delete().eq("id", b.dataset.del))) ctx.refresh();
    })
  );

  el.querySelector("#add-attr").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = el.querySelector("#attr-name").value.trim();
    if (!name) return;
    const ok = await run(db.from("attractions").insert({
      trip_id: trip.id,
      name,
      category: el.querySelector("#attr-cat").value.trim() || null,
      notes: el.querySelector("#attr-notes").value.trim() || null,
      position: items.length + 1,
    }));
    if (ok) ctx.refresh();
  });
}
