// Lógica das contas, sem dependências, para se poder testar à parte.
// Valores em cêntimos para evitar erros de arredondamento.

/** Divide `cents` por `n` partes iguais; os cêntimos que sobram vão para as primeiras partes. */
export function splitCents(cents, n) {
  const base = Math.floor(cents / n);
  const rest = cents - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rest ? 1 : 0));
}

/**
 * Saldos por moeda.
 * expenses: [{ amount, currency, paid_by, shares: [memberId, ...] }]
 * Devolve { EUR: { memberId: cents, ... }, GBP: {...} }  (positivo = tem a receber)
 */
export function balances(expenses) {
  const out = {};
  for (const e of expenses) {
    if (!e.shares.length) continue;
    const cur = (out[e.currency] ??= {});
    const cents = Math.round(Number(e.amount) * 100);
    cur[e.paid_by] = (cur[e.paid_by] ?? 0) + cents;
    const parts = splitCents(cents, e.shares.length);
    e.shares.forEach((m, i) => { cur[m] = (cur[m] ?? 0) - parts[i]; });
  }
  return out;
}

/** Transferências mínimas (método guloso) para acertar um conjunto de saldos. */
export function settle(bal) {
  const debt = Object.entries(bal).filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v })).sort((a, b) => b.v - a.v);
  const cred = Object.entries(bal).filter(([, v]) => v > 0).map(([id, v]) => ({ id, v })).sort((a, b) => b.v - a.v);
  const out = [];
  let i = 0, j = 0;
  while (i < debt.length && j < cred.length) {
    const x = Math.min(debt[i].v, cred[j].v);
    if (x > 0) out.push({ from: debt[i].id, to: cred[j].id, cents: x });
    debt[i].v -= x; cred[j].v -= x;
    if (debt[i].v === 0) i++;
    if (cred[j].v === 0) j++;
  }
  return out;
}
