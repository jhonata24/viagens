-- Várias opções de roteiro por viagem (ex.: "Roteiro Opção 1", "Roteiro Opção 2").
-- Cada paragem pertence a uma opção (variant). As paragens já existentes ficam na opção 1.

create table public.itinerary_variants (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  n int not null check (n >= 1),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  summary text,
  -- true: o site ordena as paragens para andar menos; false: mantém a ordem por horário
  auto_order boolean not null default true,
  created_at timestamptz not null default now(),
  unique (trip_id, n)
);

alter table public.itinerary_stops add column variant int not null default 1 check (variant >= 1);
drop index if exists itinerary_trip_day_idx;
create index itinerary_trip_variant_day_idx on public.itinerary_stops(trip_id, variant, day, position);

alter table public.itinerary_variants enable row level security;
create policy "itinerary_variants ler" on public.itinerary_variants for select to anon, authenticated using (true);
