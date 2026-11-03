-- Immo Verwaltung: Cloud-Abgleich. Eigene Tabellen mit Präfix, bestehende Tabellen (z. B. public.items) bleiben unberührt.
create table if not exists public.immo_records (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null,
  id text not null,
  data jsonb,
  deleted boolean not null default false,
  client_updated_at text not null default '',
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, kind, id)
);
create index if not exists immo_records_pull_idx on public.immo_records (user_id, updated_at);

create or replace function public.immo_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;
drop trigger if exists immo_records_touch on public.immo_records;
create trigger immo_records_touch before insert or update on public.immo_records
  for each row execute function public.immo_touch();

alter table public.immo_records enable row level security;
create policy "immo_records_own" on public.immo_records
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Dateien (Belege, Fotos, Briefe): privater Speicher, je Nutzer ein Ordner
insert into storage.buckets (id, name, public) values ('immo-files', 'immo-files', false) on conflict (id) do nothing;
create policy "immo_files_select" on storage.objects for select to authenticated
  using (bucket_id = 'immo-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "immo_files_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'immo-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "immo_files_update" on storage.objects for update to authenticated
  using (bucket_id = 'immo-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "immo_files_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'immo-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
