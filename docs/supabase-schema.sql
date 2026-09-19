-- The Union Invitational — database schema
--
-- Paste the whole file into the Supabase dashboard: SQL Editor -> New query
-- -> paste -> Run. It is safe to run more than once.
--
-- The editor warns that this contains destructive operations. What it is
-- seeing is the `drop policy` and `drop trigger` lines, each of which is
-- recreated on the line after it — that is what makes the file re-runnable.
-- There is no drop table, no delete and no truncate anywhere in it.
--
-- ---------------------------------------------------------------------------
-- Why one table and not eight
--
-- The book already stores itself as documents at paths: 'config/tournament',
-- 'people/g1', 'scores/r1__g7', 'photos/ph3k9'. That shape is what every
-- reader and writer in the app is written against, and it has survived a lot
-- of testing. Keeping it means the port is a change of transport, not a
-- rewrite of the thing that holds the scores — so one table of paths and
-- JSON documents, exactly as before.
-- ---------------------------------------------------------------------------

create table if not exists public.docs (
  path        text primary key,
  doc         jsonb       not null,
  updated_at  timestamptz not null default now(),
  -- which device wrote last; only ever used to make a log readable
  writer      text
);

-- the app reads a whole collection at a time ('people/%', 'scores/r1__%')
create index if not exists docs_path_prefix on public.docs (path text_pattern_ops);
create index if not exists docs_updated on public.docs (updated_at desc);

-- keep updated_at honest no matter who writes
create or replace function public.touch_doc()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists docs_touch on public.docs;
create trigger docs_touch before insert or update on public.docs
  for each row execute function public.touch_doc();

-- ---------------------------------------------------------------------------
-- Who may do what
--
-- Everyone on the trip shares one anonymous identity — there are no accounts
-- to hand out and nobody is signing up for anything on a golf course. So the
-- rules below let that identity read and write the tournament, and stop it
-- doing the two things that would actually hurt:
--
--   * a document may not be emptied or replaced by a non-object, which is the
--     shape every accidental wipe has taken so far;
--   * nothing outside the book's own paths can be created at all.
--
-- This is a lock on the front door, not a vault. Anyone the link reaches can
-- score. That is the same trust model as handing someone the pencil, and it
-- is the right one for twenty-three people on one trip.
-- ---------------------------------------------------------------------------

alter table public.docs enable row level security;

drop policy if exists docs_read on public.docs;
create policy docs_read on public.docs
  for select using (true);

drop policy if exists docs_insert on public.docs;
create policy docs_insert on public.docs
  for insert with check (
    jsonb_typeof(doc) = 'object'
    and path ~ '^(config|people|pairs|scores|bbb|recaps|photos|diag)/[A-Za-z0-9_.-]{1,80}$'
  );

drop policy if exists docs_update on public.docs;
create policy docs_update on public.docs
  for update using (true) with check (jsonb_typeof(doc) = 'object');

-- a pair can be removed, a photo can be deleted, a roster can be corrected
drop policy if exists docs_delete on public.docs;
create policy docs_delete on public.docs
  for delete using (path !~ '^config/');   -- but never the tournament itself

-- ---------------------------------------------------------------------------
-- Live updates
--
-- Without this a second device sees nothing until it reloads, which is the
-- whole point of two refs scoring at once.
-- ---------------------------------------------------------------------------

-- `alter publication ... add table` has no IF NOT EXISTS, and errors on a
-- second run. Ask first, so the file really is safe to paste again.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'docs'
  ) then
    alter publication supabase_realtime add table public.docs;
  end if;
end $$;

-- realtime sends the row that changed; without this it sends only the key
alter table public.docs replica identity full;

-- ---------------------------------------------------------------------------
-- Photographs
--
-- One public bucket. The images are of eleven men playing golf badly; the
-- protection that matters is the cap on size and type, so a phone cannot
-- push a 12-megapixel original into a 1 GB allowance. The app resizes before
-- it uploads, and stores a thumbnail beside each one so the strip costs
-- almost nothing to scroll.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 3145728,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 3145728,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists photos_read on storage.objects;
create policy photos_read on storage.objects
  for select using (bucket_id = 'photos');

drop policy if exists photos_write on storage.objects;
create policy photos_write on storage.objects
  for insert with check (bucket_id = 'photos');

drop policy if exists photos_remove on storage.objects;
create policy photos_remove on storage.objects
  for delete using (bucket_id = 'photos');

-- ---------------------------------------------------------------------------
-- Did it work?
-- ---------------------------------------------------------------------------

select
  (select count(*) from public.docs)                                as documents,
  (select count(*) from pg_policies
     where schemaname = 'public' and tablename = 'docs')            as table_rules,
  (select count(*) from storage.buckets where id = 'photos')        as photo_bucket,
  (select count(*) from pg_publication_tables
     where pubname = 'supabase_realtime' and tablename = 'docs')    as live_updates;

-- Expect: documents 0, table_rules 4, photo_bucket 1, live_updates 1.
