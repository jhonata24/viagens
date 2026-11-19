-- Preço de cada paragem: valor por adulto em libras (0 = grátis) e uma nota curta.
alter table public.itinerary_stops
  add column price_gbp numeric(8,2) check (price_gbp is null or price_gbp >= 0),
  add column price_note text check (price_note is null or char_length(price_note) <= 120);
