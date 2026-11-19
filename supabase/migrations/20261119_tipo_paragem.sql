-- Tipo de paragem: visita ou refeição (as refeições têm preço estimado e somam à parte das entradas).
alter table public.itinerary_stops
  add column kind text not null default 'visita' check (kind in ('visita', 'refeicao'));
