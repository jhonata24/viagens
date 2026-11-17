-- Roteiro, atrações e contas. O site é aberto a quem tem o link (uso em família):
-- quem tem o link pode ler e editar estes dados.

-- Pessoas da viagem (para votos e contas)
create table public.trip_members (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  created_at timestamptz not null default now(),
  unique (trip_id, name)
);

-- Roteiro: paragens por dia
create table public.itinerary_stops (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  day date not null,
  position int not null default 0,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  address text,
  lat double precision,
  lng double precision,
  notes text,
  created_at timestamptz not null default now()
);
create index itinerary_trip_day_idx on public.itinerary_stops(trip_id, day, position);

-- Ficheiros do roteiro (PDF)
create table public.trip_files (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  kind text not null default 'roteiro',
  name text not null,
  path text not null unique,
  created_at timestamptz not null default now()
);

-- Atrações: checklist
create table public.attractions (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  category text,
  notes text,
  url text,
  done boolean not null default false,
  done_by text,
  done_at timestamptz,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index attractions_trip_idx on public.attractions(trip_id, position);

-- Contas: despesas divididas em partes iguais pelas pessoas escolhidas
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  description text not null check (char_length(btrim(description)) between 1 and 120),
  amount numeric(10,2) not null check (amount > 0),
  currency text not null default 'EUR' check (currency in ('EUR','GBP','USD')),
  paid_by uuid not null references public.trip_members(id) on delete cascade,
  spent_on date not null default current_date,
  created_at timestamptz not null default now()
);
create index expenses_trip_idx on public.expenses(trip_id, spent_on);

create table public.expense_shares (
  expense_id uuid not null references public.expenses(id) on delete cascade,
  member_id uuid not null references public.trip_members(id) on delete cascade,
  primary key (expense_id, member_id)
);

alter table public.votes add column member_id uuid references public.trip_members(id) on delete cascade;

-- RLS
alter table public.trip_members enable row level security;
alter table public.itinerary_stops enable row level security;
alter table public.trip_files enable row level security;
alter table public.attractions enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_shares enable row level security;

do $$
declare t text;
begin
  foreach t in array array['trip_members','itinerary_stops','trip_files','attractions','expenses','expense_shares'] loop
    execute format('create policy "%1$s ler" on public.%1$I for select to anon, authenticated using (true)', t);
    execute format('create policy "%1$s criar" on public.%1$I for insert to anon, authenticated with check (true)', t);
    execute format('create policy "%1$s mudar" on public.%1$I for update to anon, authenticated using (true) with check (true)', t);
    execute format('create policy "%1$s apagar" on public.%1$I for delete to anon, authenticated using (true)', t);
  end loop;
end $$;

-- Bucket público para os PDFs do roteiro (só PDF, até 20 MB)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('roteiros', 'roteiros', true, 20971520, array['application/pdf'])
on conflict (id) do nothing;

create policy "roteiros enviar" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'roteiros');
create policy "roteiros apagar" on storage.objects for delete to anon, authenticated
  using (bucket_id = 'roteiros');
create policy "roteiros ler" on storage.objects for select to anon, authenticated
  using (bucket_id = 'roteiros');
