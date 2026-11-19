-- Refeições que cada restaurante serve (ex.: um café de brunch só serve almoço).
alter table public.restaurants add column meals text[] not null default '{almoço,jantar}';
