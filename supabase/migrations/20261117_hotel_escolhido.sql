-- Hotel escolhido por viagem (ponto de partida e chegada das rotas) e coordenadas dos hotéis.
alter table public.hotels add column lat double precision, add column lng double precision;
alter table public.trips add column hotel_id uuid references public.hotels(id) on delete set null;

-- O site só pode mudar o hotel escolhido da viagem e as coordenadas dos hotéis.
revoke update on public.trips from anon, authenticated;
grant update (hotel_id) on public.trips to anon, authenticated;
create policy "trips escolher hotel" on public.trips for update to anon, authenticated
  using (true)
  with check (hotel_id is null or exists (select 1 from public.hotels h where h.id = hotel_id and h.trip_id = trips.id));

revoke update on public.hotels from anon, authenticated;
grant update (lat, lng) on public.hotels to anon, authenticated;
create policy "hotels coordenadas" on public.hotels for update to anon, authenticated using (true) with check (true);
