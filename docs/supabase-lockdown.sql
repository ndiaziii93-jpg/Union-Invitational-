-- ---------------------------------------------------------------------------
-- THE LOCKDOWN. Run once, in Supabase → SQL Editor, as the project owner.
--
-- Before this, the book checked PINs on the phone, and the PINs themselves
-- sat in the shared config document where anyone reading the database could
-- see them — so anyone who read the code could write any score, roster or
-- round straight into the table with the public key. After this:
--
--   * PINs live in their own table, hashed (bcrypt), unreadable from outside.
--   * Every write to the tournament itself — config, people, pairs, scores,
--     bingo, recaps — goes through write_doc()/delete_doc(), which check the
--     PIN on the server before anything lands. The public key cannot write
--     those rows directly any more: the row-level rules refuse it.
--   * Scorers' PINs may write scores, bingo and recaps, and change a round's
--     own fields (finishing a group, the turn, closest to the pin). The
--     roster, the pairs, the courses, the calendar and the PINs need master.
--   * Guesses are throttled: twelve wrong PINs a minute, for everyone.
--   * The chat, the bets, the photos, the golfers' own notes and each phone's
--     push address stay open to the public key, as a group chat is.
--
-- TYPE THE PINS INTO THE THREE PLACEHOLDERS BELOW BEFORE RUNNING, then close
-- the editor: the SQL editor keeps a history, so clear this query from it
-- afterwards (⋯ → delete) rather than leaving the PINs in it. Six digits or
-- more for the master PIN. Never paste the PINs anywhere else.
-- ---------------------------------------------------------------------------

create extension if not exists pgcrypto with schema extensions;

-- ---- where the PINs live --------------------------------------------------
create table if not exists public.pins (
  role       text primary key check (role in ('master', 's1', 's2')),
  hash       text not null,
  changed_at timestamptz not null default now()
);
alter table public.pins enable row level security;      -- and no policies: nobody outside reads it
revoke all on table public.pins from anon, authenticated;

-- wrong guesses, so a script cannot run through every four-digit PIN
create table if not exists public.pin_tries (at timestamptz not null default now());
alter table public.pin_tries enable row level security;
revoke all on table public.pin_tries from anon, authenticated;

-- ---- which role a PIN proves ---------------------------------------------
create or replace function public.pin_role(p_pin text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare r text; n int;
begin
  if p_pin is null or p_pin !~ '^[0-9]{4,8}$' then return null; end if;
  delete from public.pin_tries where at < now() - interval '10 minutes';
  select count(*) into n from public.pin_tries where at > now() - interval '1 minute';
  if n >= 12 then
    raise exception 'Too many PIN attempts. Wait a minute and try again.' using errcode = '42501';
  end if;
  select role into r from public.pins where hash = crypt(p_pin, hash) limit 1;
  if r is null then insert into public.pin_tries default values; end if;
  return r;
end $$;
revoke execute on function public.pin_role(text) from public, anon, authenticated;

-- the phone asks this when someone signs in: the role, or nothing
create or replace function public.verify_pin(p_pin text)
returns text
language sql
security definer
set search_path = public, extensions
as $$ select public.pin_role(p_pin) $$;
grant execute on function public.verify_pin(text) to anon, authenticated;

-- ---- the only way into the tournament's own rows --------------------------
create or replace function public.write_doc(p_path text, p_doc jsonb, p_merge boolean, p_pin text, p_who text default null)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare r text; bad text[];
begin
  if jsonb_typeof(p_doc) <> 'object' then
    raise exception 'write_doc expects an object';
  end if;
  if p_path !~ '^(config|people|pairs|scores|bbb|recaps)/[A-Za-z0-9_.-]{1,80}$' then
    raise exception 'write_doc is for the tournament''s own rows' using errcode = '42501';
  end if;
  r := public.pin_role(p_pin);
  if r is null then
    raise exception 'PIN not accepted' using errcode = '42501';
  end if;
  if r <> 'master' then
    if p_path !~ '^(scores|bbb|recaps)/' and p_path <> 'config/tournament' then
      raise exception 'PIN not accepted: that needs the master PIN' using errcode = '42501';
    end if;
    if p_path = 'config/tournament' then
      -- a scorer finishes a group, marks the turn, names the closest to the
      -- pin: all inside `rounds`. Everything else in the config is master's.
      select array_agg(k) into bad from jsonb_object_keys(p_doc) k where k not in ('rev', 'rounds');
      if not p_merge or bad is not null then
        raise exception 'PIN not accepted: a scorer may change only the rounds' using errcode = '42501';
      end if;
    end if;
  end if;
  if p_merge then
    insert into public.docs (path, doc, writer) values (p_path, p_doc, p_who)
    on conflict (path) do update set doc = public.docs.doc || excluded.doc, writer = excluded.writer;
  else
    insert into public.docs (path, doc, writer) values (p_path, p_doc, p_who)
    on conflict (path) do update set doc = excluded.doc, writer = excluded.writer;
  end if;
end $$;
grant execute on function public.write_doc(text, jsonb, boolean, text, text) to anon, authenticated;

create or replace function public.delete_doc(p_path text, p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare r text;
begin
  if p_path !~ '^(people|pairs|scores|bbb|recaps)/[A-Za-z0-9_.-]{1,80}$' then
    raise exception 'delete_doc is for the tournament''s own rows, never the config' using errcode = '42501';
  end if;
  r := public.pin_role(p_pin);
  if r is null or (r <> 'master' and p_path !~ '^(scores|bbb|recaps)/') then
    raise exception 'PIN not accepted' using errcode = '42501';
  end if;
  delete from public.docs where path = p_path;
end $$;
grant execute on function public.delete_doc(text, text) to anon, authenticated;

-- the master reviewer changes a PIN from Setup, proving the master PIN first
create or replace function public.set_pin(p_master text, p_role text, p_new text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if public.pin_role(p_master) is distinct from 'master' then
    raise exception 'PIN not accepted' using errcode = '42501';
  end if;
  if p_role not in ('master', 's1', 's2') or p_new !~ '^[0-9]{4,8}$' then
    raise exception 'A PIN is 4 to 8 digits';
  end if;
  insert into public.pins (role, hash) values (p_role, crypt(p_new, gen_salt('bf', 8)))
  on conflict (role) do update set hash = excluded.hash, changed_at = now();
end $$;
grant execute on function public.set_pin(text, text, text) to anon, authenticated;

-- ---- the public key keeps the chat, the bets, the photos, the notes ------
drop policy if exists docs_insert on public.docs;
create policy docs_insert on public.docs
  for insert with check (
    jsonb_typeof(doc) = 'object'
    and path ~ '^(notes|photos|chat|market|push|diag)/[A-Za-z0-9_.-]{1,80}$'
  );

drop policy if exists docs_update on public.docs;
create policy docs_update on public.docs
  for update using (path ~ '^(notes|photos|chat|market|push|diag)/')
  with check (jsonb_typeof(doc) = 'object' and path ~ '^(notes|photos|chat|market|push|diag)/');

drop policy if exists docs_delete on public.docs;
create policy docs_delete on public.docs
  for delete using (path ~ '^(notes|photos|chat|market|push|diag)/');

-- merge_doc runs as the caller, so the rules above now stop it touching the
-- tournament's rows too: nothing to change there.

-- the PINs come out of the shared config document, where they never belonged
update public.docs set doc = doc - 'pins' - 'pinsChanged' where path = 'config/tournament';

-- ---- the PINs themselves: TYPE THEM IN, RUN, THEN CLEAR THIS QUERY ---------
insert into public.pins (role, hash) values
  ('master', crypt('TYPE-THE-MASTER-PIN-HERE',   gen_salt('bf', 8))),
  ('s1',     crypt('TYPE-SCORER-1-PIN-HERE',     gen_salt('bf', 8))),
  ('s2',     crypt('TYPE-SCORER-2-PIN-HERE',     gen_salt('bf', 8)))
on conflict (role) do update set hash = excluded.hash, changed_at = now();

-- Did it work? Three rows, and the config has no pins in it.
select role, changed_at from public.pins;
select path, doc ? 'pins' as still_has_pins from public.docs where path = 'config/tournament';
