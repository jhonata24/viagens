import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

export const db = createClient(SUPABASE_URL, SUPABASE_KEY);

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const money = (n, cur = "EUR", digits = 0) =>
  Number(n).toLocaleString("pt-PT", { style: "currency", currency: cur, minimumFractionDigits: digits, maximumFractionDigits: digits });

export const fmtDate = (d, opts = { day: "numeric", month: "long", year: "numeric" }) =>
  new Date(d + "T00:00:00").toLocaleDateString("pt-PT", opts);

export const nights = (t) => Math.round((new Date(t.end_date) - new Date(t.start_date)) / 86400000);

export const daysUntil = (d) => {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return Math.round((new Date(d + "T00:00:00") - t) / 86400000);
};

/** Datas (YYYY-MM-DD) de cada dia da viagem, do primeiro ao último. */
export function tripDays(t) {
  const out = [];
  const d = new Date(t.start_date + "T00:00:00");
  const end = new Date(t.end_date + "T00:00:00");
  while (d <= end) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    d.setDate(d.getDate() + 1);
  }
  return out;
}

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};

/** A pessoa escolhida neste browser para esta viagem. */
export const me = {
  get: (tripId) => store.get(`viagens:eu:${tripId}`),
  set: (tripId, memberId) => store.set(`viagens:eu:${tripId}`, memberId),
};

export function toast(msg, kind = "error") {
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.setAttribute("role", "status");
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

/** Corre uma chamada ao Supabase e mostra um aviso se falhar. Devolve os dados ou null. */
export async function run(promise, failMsg) {
  const { data, error } = await promise;
  if (error) {
    console.error(error);
    toast(failMsg || "Não foi possível guardar. Tente outra vez.");
    return null;
  }
  return data ?? true;
}
