-- Esquema da app Viagens (aplicado no projeto Supabase "viagens").
create table public.trips (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  title text not null,
  destination text not null,
  country text,
  start_date date not null,
  end_date date not null,
  travelers int not null default 1,
  rooms int not null default 1,
  requirements text[] not null default '{}',
  alert text,
  created_at timestamptz not null default now()
);

create table public.hotels (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  rank int not null,
  name text not null,
  zone text,
  stars int,
  total_price numeric(10,2),
  currency text not null default 'EUR',
  score numeric(3,1),
  reviews int,
  cleanliness numeric(3,1),
  location_score numeric(3,1),
  walk_to_center text,
  breakfast text not null default 'confirmar' check (breakfast in ('incluido','confirmar')),
  pros text,
  cons text,
  booking_url text,
  price_checked_at date,
  created_at timestamptz not null default now()
);
create index hotels_trip_idx on public.hotels(trip_id, rank);

create table public.votes (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  voter_name text not null check (char_length(btrim(voter_name)) between 1 and 40),
  created_at timestamptz not null default now(),
  unique (trip_id, voter_name)
);
create index votes_hotel_idx on public.votes(hotel_id);

alter table public.trips enable row level security;
alter table public.hotels enable row level security;
alter table public.votes enable row level security;

-- Viagens e hotéis: só leitura para o site. Editam-se no painel do Supabase.
create policy "trips leitura publica" on public.trips for select to anon, authenticated using (true);
create policy "hotels leitura publica" on public.hotels for select to anon, authenticated using (true);
-- Votos: qualquer pessoa com o link pode votar e mudar o voto (um por nome e por viagem).
create policy "votes leitura publica" on public.votes for select to anon, authenticated using (true);
create policy "votes inserir" on public.votes for insert to anon, authenticated
  with check (exists (select 1 from public.hotels h where h.id = hotel_id and h.trip_id = votes.trip_id));
create policy "votes mudar" on public.votes for update to anon, authenticated
  using (true)
  with check (exists (select 1 from public.hotels h where h.id = hotel_id and h.trip_id = votes.trip_id));
