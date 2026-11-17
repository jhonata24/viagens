-- Preços de cada hotel por site, ex.: {"Booking.com": 1880.43, "eDreams": 1632}
alter table public.hotels add column prices jsonb not null default '{}'::jsonb;
