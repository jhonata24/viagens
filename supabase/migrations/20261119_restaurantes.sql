-- Restaurantes sugeridos por viagem. Os dias e refeições adequados calculam-se no site
-- pela distância às paragens do roteiro.
create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  cuisine text,
  area text,
  address text,
  lat double precision,
  lng double precision,
  avg_price_gbp numeric(8,2) check (avg_price_gbp is null or avg_price_gbp >= 0),
  price_note text,
  rating text,
  thefork boolean not null default false,
  thefork_url text,
  -- descontos por dia, ex.: {"2026-12-23": "-50% ao almoço"}
  offers jsonb not null default '{}'::jsonb,
  closed_days date[] not null default '{}',
  booking text not null default 'aconselhado' check (booking in ('thefork', 'reservar', 'aconselhado', 'sem_reserva', 'direto')),
  booking_note text,
  notes text,
  checked_at date,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index restaurants_trip_idx on public.restaurants(trip_id, position);

alter table public.restaurants enable row level security;
create policy "restaurants ler" on public.restaurants for select to anon, authenticated using (true);
