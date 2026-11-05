-- Immo Verwaltung: Härtung (Datenform, Größe, Tageslimit für die KI-Funktion).

-- 1) Form und Größe der Datensätze begrenzen (gilt für neue und geänderte Zeilen).
alter table public.immo_records drop constraint if exists immo_records_shape;
alter table public.immo_records add constraint immo_records_shape check (
  kind ~ '^_?[a-z]{2,24}$'
  and length(id) between 1 and 80
  and length(client_updated_at) <= 40
  and (data is null or octet_length(data::text) <= 1048576)
) not valid;

-- 2) Tageslimit für die KI-Funktion je Nutzer. Die Tabelle ist nur über die Funktion unten erreichbar.
create table if not exists public.immo_ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  used int not null default 0,
  primary key (user_id, day)
);
alter table public.immo_ai_usage enable row level security; -- bewusst ohne Policy: kein direkter Zugriff

create or replace function public.immo_ai_take(p_limit int default 40) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_day date := (now() at time zone 'Europe/Berlin')::date;
  v_used int;
begin
  if v_user is null then return false; end if;
  delete from public.immo_ai_usage where user_id = v_user and day < v_day - 30;
  insert into public.immo_ai_usage as u (user_id, day, used) values (v_user, v_day, 1)
  on conflict (user_id, day) do update set used = u.used + 1 where u.used < greatest(1, least(p_limit, 500))
  returning u.used into v_used;
  return v_used is not null;
end $$;
revoke all on function public.immo_ai_take(int) from public, anon;
grant execute on function public.immo_ai_take(int) to authenticated;
