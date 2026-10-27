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
--   * A name is claimed with a four-digit PIN that is hashed on the server,
--     never readable, and every post, bet, reaction and note is signed by a
--     name the server has checked: nobody posts, bets or reacts as anyone
--     else, and nobody edits or removes what another phone wrote. The
--     bleachers (guests) sign with the phone that registered them.
--   * Handicaps are on the roster, which only the master PIN may write.
--   * Only the photos, each phone's push address and its own log stay open
--     to the public key.
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
      select array_agg(k) into bad from jsonb_object_keys(p_doc) k where k not in ('rev', 'rounds', 'teePicks');
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

-- ---- a name and its PIN ----------------------------------------------------
-- The first phone to take a name sets its PIN; the server keeps only the
-- hash. After that the name is proved, never read, and only the master PIN
-- can clear it (social_delete) so a new one can be set.
create or replace function public.claim_name(p_pid text, p_pin text, p_who text default null)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_pid !~ '^[A-Za-z0-9_.-]{1,40}$' or p_pin !~ '^[0-9]{4}$' then
    raise exception 'A name''s PIN is four digits';
  end if;
  if exists (select 1 from public.docs where path = 'chat/id_' || p_pid) then
    raise exception 'That name already has a PIN' using errcode = '23505';
  end if;
  insert into public.docs (path, doc, writer)
  values ('chat/id_' || p_pid, jsonb_build_object('id', 'id_' || p_pid, 'k', 'id', 'pid', p_pid, 'at', (extract(epoch from now()) * 1000)::bigint,
                                                  'dev', p_who, 'hash', crypt(p_pin, gen_salt('bf', 6))), p_who);
end $$;
grant execute on function public.claim_name(text, text, text) to anon, authenticated;

create or replace function public.check_name(p_pid text, p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare h text; n int;
begin
  if p_pin !~ '^[0-9]{4}$' then return false; end if;
  select doc->>'hash' into h from public.docs where path = 'chat/id_' || p_pid;
  if h is null then return false; end if;
  if h = crypt(p_pin, h) then return true; end if;
  -- a wrong name PIN counts against the same minute as a wrong role PIN
  delete from public.pin_tries where at < now() - interval '10 minutes';
  select count(*) into n from public.pin_tries where at > now() - interval '1 minute';
  insert into public.pin_tries default values;
  if n >= 12 then raise exception 'Too many PIN attempts. Wait a minute and try again.' using errcode = '42501'; end if;
  return false;
end $$;
grant execute on function public.check_name(text, text) to anon, authenticated;

-- ---- what a name may write: its own posts, bets, reactions and notes ------
create or replace function public.social_write(p_path text, p_doc jsonb, p_merge boolean, p_pid text, p_name_pin text, p_role_pin text, p_who text default null)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare r text; held jsonb; is_master boolean; ident boolean := false; k text; bad boolean := false;
begin
  if jsonb_typeof(p_doc) <> 'object' then raise exception 'social_write expects an object'; end if;
  if p_path !~ '^(chat|market|notes)/[A-Za-z0-9_.-]{1,80}$' then
    raise exception 'social_write is for the chat, the bets and the notes' using errcode = '42501';
  end if;
  if p_path ~ '^chat/id_' then
    raise exception 'PIN not accepted: a name is claimed, not written' using errcode = '42501';
  end if;
  r := case when p_role_pin ~ '^[0-9]{4,8}$' then public.pin_role(p_role_pin) else null end;
  is_master := (r = 'master');
  select doc into held from public.docs where path = p_path;

  if not is_master then
    /* who is writing: a name with its PIN, or a guest with the phone that registered them */
    if p_pid ~ '^x' then
      ident := p_path = 'chat/guest_' || p_pid
        or exists (select 1 from public.docs where path = 'chat/guest_' || p_pid and doc->>'dev' = p_who);
    else
      ident := public.check_name(p_pid, p_name_pin);
    end if;
    if not ident then raise exception 'PIN not accepted: confirm the PIN for your name' using errcode = '42501'; end if;

    if p_path ~ '^chat/guest_' then
      if p_path <> 'chat/guest_' || p_pid or p_merge then raise exception 'PIN not accepted: not your name' using errcode = '42501'; end if;
      if held is not null and held->>'dev' is distinct from p_who then raise exception 'PIN not accepted: that name is on another phone' using errcode = '42501'; end if;
    elsif p_path ~ '^notes/' then
      if split_part(substr(p_path, 7), '__', 2) <> p_pid then raise exception 'PIN not accepted: not your notes' using errcode = '42501'; end if;
    elsif p_merge then
      /* a reaction carries this phone's own keys; anything else is only on your own post, or a ref confirming a ruling */
      for k in select jsonb_object_keys(p_doc) loop
        if k not in ('id', 'rev') and k !~ ('^rx(by|sent)?_' || p_who || '$') then bad := true; end if;
      end loop;
      if bad then
        if held is null then raise exception 'PIN not accepted: nothing there to change' using errcode = '42501'; end if;
        if held->>'dev' is distinct from p_who then
          if not (held->>'k' = 'r' and r in ('s1', 's2')
                  and not exists (select 1 from jsonb_object_keys(p_doc) kk where kk not in ('id', 'rev', 'ok'))) then
            raise exception 'PIN not accepted: not yours to change' using errcode = '42501';
          end if;
        end if;
      end if;
    else
      if held is not null and held->>'dev' is distinct from p_who then raise exception 'PIN not accepted: not yours to replace' using errcode = '42501'; end if;
      if p_doc->>'dev' is distinct from p_who then raise exception 'PIN not accepted: a post carries its own phone' using errcode = '42501'; end if;
      if (p_doc->>'k') in ('m', 'o', 'q', 't') and p_doc->>'pid' is distinct from p_pid then
        raise exception 'PIN not accepted: a post is signed by its own name' using errcode = '42501';
      end if;
      if p_doc->>'k' = 'r' and p_doc->>'by' is not null and p_doc->>'by' <> p_pid then
        raise exception 'PIN not accepted: a ruling is asked in your own name' using errcode = '42501';
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
grant execute on function public.social_write(text, jsonb, boolean, text, text, text, text) to anon, authenticated;

create or replace function public.social_delete(p_path text, p_pid text, p_name_pin text, p_role_pin text, p_who text default null)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare r text; held jsonb; ident boolean := false;
begin
  if p_path !~ '^(chat|market|notes)/[A-Za-z0-9_.-]{1,80}$' then
    raise exception 'social_delete is for the chat, the bets and the notes' using errcode = '42501';
  end if;
  r := case when p_role_pin ~ '^[0-9]{4,8}$' then public.pin_role(p_role_pin) else null end;
  if r <> 'master' or r is null then
    if p_path ~ '^chat/id_' then raise exception 'PIN not accepted: only the master PIN clears a name' using errcode = '42501'; end if;
    select doc into held from public.docs where path = p_path;
    if held is null then return; end if;
    if p_pid ~ '^x' then ident := exists (select 1 from public.docs where path = 'chat/guest_' || p_pid and doc->>'dev' = p_who);
    else ident := public.check_name(p_pid, p_name_pin); end if;
    if not ident or held->>'dev' is distinct from p_who then
      raise exception 'PIN not accepted: not yours to remove' using errcode = '42501';
    end if;
  end if;
  delete from public.docs where path = p_path;
end $$;
grant execute on function public.social_delete(text, text, text, text, text) to anon, authenticated;

-- ---- the public key keeps only the photos, the push addresses, the logs ---
drop policy if exists docs_insert on public.docs;
create policy docs_insert on public.docs
  for insert with check (
    jsonb_typeof(doc) = 'object'
    and path ~ '^(photos|push|diag)/[A-Za-z0-9_.-]{1,80}$'
  );

drop policy if exists docs_update on public.docs;
create policy docs_update on public.docs
  for update using (path ~ '^(photos|push|diag)/')
  with check (jsonb_typeof(doc) = 'object' and path ~ '^(photos|push|diag)/');

drop policy if exists docs_delete on public.docs;
create policy docs_delete on public.docs
  for delete using (path ~ '^(photos|push|diag)/');

-- the name PINs that were kept in the clear are hashed where they stand, and
-- the clear copies dropped. (Anyone who read the database before today may
-- know them: to make everyone choose afresh, run the commented line too.)
update public.docs
   set doc = (doc - 'pin') || jsonb_build_object('hash', crypt(doc->>'pin', gen_salt('bf', 6)))
 where path like 'chat/id\_%' and doc ? 'pin';
-- delete from public.docs where path like 'chat/id\_%';

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
select count(*) as names_with_pins_in_the_clear from public.docs where path like 'chat/id\_%' and doc ? 'pin';   -- should be 0
