-- ---------------------------------------------------------------------------
-- THE LOCKDOWN. Run once, in Supabase → SQL Editor, as the project owner.
-- Safe to run again: everything here replaces itself.
--
-- Before this, the book checked PINs on the phone, and the PINs themselves
-- sat in the shared config document where anyone reading the database could
-- see them — so anyone who read the code could write any score, roster or
-- round straight into the table with the public key. After this:
--
--   * PINs live in their own table, hashed (bcrypt), unreadable from outside.
--   * Every write to the tournament itself — config, people (handicaps), pairs,
--     scores, bingo, recaps — goes through write_doc()/delete_doc(), which
--     check the PIN on the server before anything lands. Scorers' PINs reach
--     the cards, the bingo, the recaps and a round's own fields; the roster,
--     the handicaps, the pairs, the courses, the calendar and the PINs need
--     the master PIN.
--   * A name is claimed with a four-digit PIN that is hashed on the server and
--     never readable, and every post, bet, reaction and note is signed by a
--     name the server has checked: nobody posts, bets or reacts as anyone
--     else, and nobody edits or removes what another phone wrote. The
--     bleachers (guests) sign with the phone that registered them.
--   * The public key can write only photos, push addresses and phone logs.
--     A write to anything else with the public key is not an error — it is
--     silently dropped and LOGGED, with the device, the address and the time.
--   * Everything refused is logged in security_log, which only the master PIN
--     can read (from Setup → Security in the book). A phone that keeps
--     trying is blocked for 24 hours, automatically, and that is logged too.
--     Wrong guesses count against the phone that made them, never against
--     the group: a right PIN always passes. A name with ten wrong guesses
--     against it is closed for ten minutes.
--   * A scorer's PIN writes a card only while its round is open; a locked
--     round takes the master PIN. Every change to the tournament's own
--     rows is kept in docs_history, with the phone that made it, and the
--     master PIN can put any earlier version back (the History on a card).
--   * Role PINs are six digits or more when changed. A guest cannot take a
--     roster name. A photo comes down only by the phone that put it up or
--     the master PIN, and a photo's picture cannot be swapped.
--
-- TYPE THE PINS INTO THE THREE PLACEHOLDERS NEAR THE BOTTOM BEFORE RUNNING,
-- then clear this query from the editor's history (⋯ → delete): the SQL
-- editor keeps every query. Six digits or more for the master PIN. Never
-- paste the PINs anywhere else.
-- ---------------------------------------------------------------------------

create extension if not exists pgcrypto with schema extensions;

-- ---- what is kept out of reach ---------------------------------------------
create table if not exists public.pins (
  role       text primary key check (role in ('master', 's1', 's2')),
  hash       text not null,
  changed_at timestamptz not null default now()
);
alter table public.pins enable row level security;      -- and no policies: nobody outside reads it
revoke all on table public.pins from anon, authenticated;

create table if not exists public.pin_tries (at timestamptz not null default now(), who text);
alter table public.pin_tries add column if not exists who text;
alter table public.pin_tries enable row level security;
revoke all on table public.pin_tries from anon, authenticated;

-- every refusal, with who and where from
create table if not exists public.security_log (
  id     bigserial primary key,
  at     timestamptz not null default now(),
  kind   text not null,          -- direct | pin | denied | blocked | signin | claim
  path   text,
  who    text,                   -- the phone's device id, as it gave it
  pid    text,                   -- the name it claimed, if any
  ip     text,                   -- where the request came from
  agent  text,                   -- what it said it was
  detail text
);
alter table public.security_log enable row level security;
revoke all on table public.security_log from anon, authenticated;
create index if not exists security_log_at on public.security_log (at desc);

create table if not exists public.blocked_devices (
  dev   text primary key,
  until timestamptz not null,
  why   text
);
alter table public.blocked_devices enable row level security;
revoke all on table public.blocked_devices from anon, authenticated;

-- ---- the log, and the automatic block --------------------------------------
create or replace function public.log_security(p_kind text, p_path text, p_who text, p_pid text, p_detail text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare hdr json; ip text; ua text; n int;
begin
  begin
    hdr := current_setting('request.headers', true)::json;
    ip := coalesce(split_part(hdr->>'x-forwarded-for', ',', 1), hdr->>'cf-connecting-ip');
    ua := left(hdr->>'user-agent', 160);
  exception when others then ip := null; ua := null; end;
  insert into public.security_log (kind, path, who, pid, ip, agent, detail)
  values (p_kind, left(p_path, 120), left(p_who, 40), left(p_pid, 40), left(ip, 64), ua, left(p_detail, 240));
  /* a phone that keeps at it is shut out for a day: ten refusals in ten minutes */
  if p_who is not null and p_who <> '' and p_kind in ('direct', 'pin', 'denied') then
    select count(*) into n from public.security_log
     where who = p_who and at > now() - interval '10 minutes' and kind in ('direct', 'pin', 'denied');
    if n >= 10 and not exists (select 1 from public.blocked_devices where dev = p_who and until > now()) then
      insert into public.blocked_devices (dev, until, why) values (p_who, now() + interval '24 hours', n || ' refusals in ten minutes')
      on conflict (dev) do update set until = excluded.until, why = excluded.why;
      insert into public.security_log (kind, path, who, pid, ip, agent, detail)
      values ('blocked', null, p_who, p_pid, left(ip, 64), ua, 'blocked for 24 hours after ' || n || ' refusals in ten minutes');
    end if;
  end if;
end $$;
revoke execute on function public.log_security(text, text, text, text, text) from public, anon, authenticated;

create or replace function public.is_blocked(p_who text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$ select exists (select 1 from public.blocked_devices where dev = p_who and until > now()) $$;
revoke execute on function public.is_blocked(text) from public, anon, authenticated;

-- ---- which role a PIN proves -----------------------------------------------
-- 'master', 's1', 's2'; null for a wrong one; 'throttled' when the minute is
-- used up. It never raises, so the log it writes is kept.
-- A RIGHT PIN IS NEVER THROTTLED. The first version counted wrong guesses
-- for everyone together and refused everything once the minute was spent —
-- which meant twelve wrong guesses a minute from one phone would have
-- frozen every scorer's writes on the course: a denial of service for the
-- price of a loop. Now a PIN is checked first and a right one always
-- passes; wrong guesses count against the phone that made them, and a
-- phone over its allowance is refused, logged and (by log_security)
-- blocked for a day. What makes guessing hopeless is the PINs themselves:
-- six digits or more for the master, bcrypt behind each, and the log
-- showing the commissioner the attempt while it is still going.
create or replace function public.pin_role(p_pin text, p_who text default null)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare r text; n int;
begin
  if p_pin is null or p_pin !~ '^[0-9]{4,8}$' then return null; end if;
  select role into r from public.pins where hash = crypt(p_pin, hash) limit 1;
  if r is not null then return r; end if;
  delete from public.pin_tries where at < now() - interval '10 minutes';
  insert into public.pin_tries (at, who) values (now(), p_who);
  select count(*) into n from public.pin_tries where at > now() - interval '1 minute' and who is not distinct from p_who;
  if n > 12 then
    perform public.log_security('pin', null, p_who, null, 'throttled: too many wrong PINs this minute');
    return 'throttled';
  end if;
  perform public.log_security('pin', null, p_who, null, 'wrong role PIN (' || length(p_pin) || ' digits)');
  return null;
end $$;
revoke execute on function public.pin_role(text, text) from public, anon, authenticated;

-- the phone asks this when someone signs in: the role, 'throttled', or nothing
create or replace function public.verify_pin(p_pin text, p_who text default null)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare r text;
begin
  if public.is_blocked(p_who) then return 'blocked'; end if;
  r := public.pin_role(p_pin, p_who);
  if r in ('master', 's1', 's2') then perform public.log_security('signin', null, p_who, null, 'signed in as ' || r); end if;
  return r;
end $$;
grant execute on function public.verify_pin(text, text) to anon, authenticated;

-- ---- the only way into the tournament's own rows ---------------------------
-- Returns 'ok', or 'denied: …' (never an error, so the refusal is logged).
create or replace function public.write_doc(p_path text, p_doc jsonb, p_merge boolean, p_pin text, p_who text default null)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare r text; bad text[]; why text;
begin
  if jsonb_typeof(p_doc) <> 'object' then return 'denied: write_doc expects an object'; end if;
  if p_path !~ '^(config|people|pairs|scores|bbb|recaps)/[A-Za-z0-9_.-]{1,80}$' then
    perform public.log_security('denied', p_path, p_who, null, 'write_doc on a path it is not for');
    return 'denied: PIN not accepted for that row';
  end if;
  if public.is_blocked(p_who) then return 'denied: PIN not accepted: this phone is blocked for a while'; end if;
  r := public.pin_role(p_pin, p_who);
  if r = 'throttled' then return 'denied: Too many PIN attempts. Wait a minute and try again.'; end if;
  if r is null then
    perform public.log_security('denied', p_path, p_who, null, 'write with a wrong or missing role PIN');
    return 'denied: PIN not accepted';
  end if;
  if r <> 'master' then
    why := null;
    if p_path !~ '^(scores|bbb|recaps)/' and p_path <> 'config/tournament' then
      why := 'a scorer PIN (' || r || ') tried to write ' || p_path || ': that needs the master PIN';
    elsif p_path ~ '^(scores|bbb)/' then
      /* A CARD IS WRITTEN WHILE ITS ROUND IS OPEN. Once the round is locked
         (or before it is opened) a scorer's PIN cannot touch it: a card
         changed the next morning takes the master PIN, and the history
         below shows what it was. */
      declare rid text; st text;
      begin
        rid := case when p_path ~ '^scores/' then split_part(substr(p_path, 8), '__', 1) else substr(p_path, 5) end;
        select doc->'rounds'->rid->>'state' into st from public.docs where path = 'config/tournament';
        if st is distinct from 'open' then
          why := 'a scorer PIN (' || r || ') tried to write ' || p_path || ' while the round is ' || coalesce(st, 'not set up') || ': that needs the master PIN';
        end if;
      end;
    elsif p_path = 'config/tournament' then
      -- a scorer finishes a group, marks the turn, names the closest to the
      -- pin, picks a tee time: `rounds` and `teePicks`. The rest is master's.
      select array_agg(k) into bad from jsonb_object_keys(p_doc) k where k not in ('rev', 'rounds', 'teePicks');
      if not p_merge or bad is not null then
        why := 'a scorer PIN (' || r || ') tried to change ' || coalesce(array_to_string(bad, ','), 'the whole config') || ': that needs the master PIN';
      end if;
    end if;
    if why is not null then
      perform public.log_security('denied', p_path, p_who, null, why);
      return 'denied: PIN not accepted: that needs the master PIN';
    end if;
  end if;
  if p_merge then
    insert into public.docs (path, doc, writer) values (p_path, p_doc, p_who)
    on conflict (path) do update set doc = public.docs.doc || excluded.doc, writer = excluded.writer;
  else
    insert into public.docs (path, doc, writer) values (p_path, p_doc, p_who)
    on conflict (path) do update set doc = excluded.doc, writer = excluded.writer;
  end if;
  return 'ok';
end $$;
grant execute on function public.write_doc(text, jsonb, boolean, text, text) to anon, authenticated;

create or replace function public.delete_doc(p_path text, p_pin text, p_who text default null)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare r text;
begin
  if p_path !~ '^(people|pairs|scores|bbb|recaps)/[A-Za-z0-9_.-]{1,80}$' then
    perform public.log_security('denied', p_path, p_who, null, 'delete_doc on a path it is not for');
    return 'denied: PIN not accepted for that row';
  end if;
  if public.is_blocked(p_who) then return 'denied: PIN not accepted: this phone is blocked for a while'; end if;
  r := public.pin_role(p_pin, p_who);
  if r = 'throttled' then return 'denied: Too many PIN attempts. Wait a minute and try again.'; end if;
  if r is null or (r <> 'master' and p_path !~ '^(scores|bbb|recaps)/') then
    perform public.log_security('denied', p_path, p_who, null, 'delete with ' || coalesce('a ' || r || ' PIN', 'a wrong or missing PIN'));
    return 'denied: PIN not accepted';
  end if;
  delete from public.docs where path = p_path;
  return 'ok';
end $$;
grant execute on function public.delete_doc(text, text, text) to anon, authenticated;

-- the master reviewer changes a PIN from Setup, proving the master PIN first
create or replace function public.set_pin(p_master text, p_role text, p_new text, p_who text default null)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if public.pin_role(p_master, p_who) is distinct from 'master' then
    perform public.log_security('denied', 'pins/' || p_role, p_who, null, 'tried to change a PIN without the master PIN');
    return 'denied: PIN not accepted';
  end if;
  if p_role not in ('master', 's1', 's2') or p_new !~ '^[0-9]{6,8}$' then return 'denied: A PIN is 6 to 8 digits'; end if;
  insert into public.pins (role, hash) values (p_role, crypt(p_new, gen_salt('bf', 8)))
  on conflict (role) do update set hash = excluded.hash, changed_at = now();
  perform public.log_security('signin', 'pins/' || p_role, p_who, null, 'the ' || p_role || ' PIN was changed');
  return 'ok';
end $$;
grant execute on function public.set_pin(text, text, text, text) to anon, authenticated;

-- ---- a name and its PIN ----------------------------------------------------
create or replace function public.claim_name(p_pid text, p_pin text, p_who text default null)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_pid !~ '^[A-Za-z0-9_.-]{1,40}$' or p_pin !~ '^[0-9]{4}$' then return 'denied: A name''s PIN is four digits'; end if;
  if public.is_blocked(p_who) then return 'denied: PIN not accepted: this phone is blocked for a while'; end if;
  if exists (select 1 from public.docs where path = 'chat/id_' || p_pid) then
    perform public.log_security('claim', 'chat/id_' || p_pid, p_who, p_pid, 'tried to claim a name that already has a PIN');
    return 'taken';
  end if;
  insert into public.docs (path, doc, writer)
  values ('chat/id_' || p_pid, jsonb_build_object('id', 'id_' || p_pid, 'k', 'id', 'pid', p_pid, 'at', (extract(epoch from now()) * 1000)::bigint,
                                                  'dev', p_who, 'hash', crypt(p_pin, gen_salt('bf', 6))), p_who);
  return 'ok';
end $$;
grant execute on function public.claim_name(text, text, text) to anon, authenticated;

create or replace function public.check_name(p_pid text, p_pin text, p_who text default null)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare h text; n int;
begin
  if p_pin !~ '^[0-9]{4}$' then return false; end if;
  if public.is_blocked(p_who) then return false; end if;
  select doc->>'hash' into h from public.docs where path = 'chat/id_' || p_pid;
  if h is null then return false; end if;
  /* a name with ten wrong guesses against it in ten minutes is closed for
     ten minutes — that name alone, whoever is guessing — since four digits
     are few. A right guess inside that window is refused too: the window
     is the point. */
  delete from public.pin_tries where at < now() - interval '10 minutes';
  select count(*) into n from public.pin_tries where who = 'name:' || p_pid and at > now() - interval '10 minutes';
  if n >= 10 then
    perform public.log_security('pin', 'chat/id_' || p_pid, p_who, p_pid, 'name closed: ten wrong PINs in ten minutes');
    return false;
  end if;
  if h = crypt(p_pin, h) then return true; end if;
  insert into public.pin_tries (at, who) values (now(), 'name:' || p_pid);
  perform public.log_security('pin', 'chat/id_' || p_pid, p_who, p_pid, 'wrong name PIN');
  return false;
end $$;
grant execute on function public.check_name(text, text, text) to anon, authenticated;

-- ---- what a name may write: its own posts, bets, reactions and notes -------
create or replace function public.social_write(p_path text, p_doc jsonb, p_merge boolean, p_pid text, p_name_pin text, p_role_pin text, p_who text default null)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare r text; held jsonb; is_master boolean; ident boolean := false; k text; bad boolean := false; why text := null;
begin
  if jsonb_typeof(p_doc) <> 'object' then return 'denied: social_write expects an object'; end if;
  if p_path !~ '^(chat|market|notes)/[A-Za-z0-9_.-]{1,80}$' or p_path ~ '^chat/id_' then
    perform public.log_security('denied', p_path, p_who, p_pid, 'social_write on a row it is not for');
    return 'denied: PIN not accepted for that row';
  end if;
  if public.is_blocked(p_who) then return 'denied: PIN not accepted: this phone is blocked for a while'; end if;
  r := case when p_role_pin ~ '^[0-9]{4,8}$' then public.pin_role(p_role_pin, p_who) else null end;
  if r = 'throttled' then return 'denied: Too many PIN attempts. Wait a minute and try again.'; end if;
  is_master := (r = 'master');
  select doc into held from public.docs where path = p_path;

  if not is_master then
    /* who is writing: a name with its PIN, or a guest with the phone that registered them */
    if p_pid ~ '^x' then
      ident := p_path = 'chat/guest_' || p_pid
        or exists (select 1 from public.docs where path = 'chat/guest_' || p_pid and doc->>'dev' = p_who);
    else
      ident := public.check_name(p_pid, p_name_pin, p_who);
    end if;
    if not ident then
      perform public.log_security('denied', p_path, p_who, p_pid, 'post without a name PIN the server accepts');
      return 'denied: PIN not accepted: confirm the PIN for your name';
    end if;

    if p_path ~ '^chat/guest_' then
      if p_path <> 'chat/guest_' || p_pid or p_merge then why := 'a guest tried to write another name';
      elsif held is not null and held->>'dev' is distinct from p_who then why := 'a guest name on another phone';
      elsif exists (
        /* the bleachers cannot pass for anyone on the trip: not the name as
           listed, not a first name on its own, not one wrapped round it */
        select 1 from public.docs d, lateral (select lower(regexp_replace(coalesce(d.doc->>'display', d.doc->>'name', ''), '[^a-z0-9 ]+', ' ', 'gi')) as n) x,
               lateral (select lower(regexp_replace(coalesce(p_doc->>'name', ''), '[^a-z0-9 ]+', ' ', 'gi')) as t) y
         where d.path like 'people/%' and length(trim(x.n)) > 1
           and (trim(y.t) = trim(x.n) or trim(y.t) = split_part(trim(x.n), ' ', 1) or (' ' || trim(y.t) || ' ') like ('% ' || trim(x.n) || ' %'))
      ) then why := 'a guest tried to take a roster name: ' || coalesce(p_doc->>'name', '?');
      end if;
    elsif p_path ~ '^notes/' then
      if split_part(substr(p_path, 7), '__', 2) <> p_pid then why := 'notes written under another name'; end if;
    elsif p_merge then
      /* a reaction carries this phone's own keys; anything else is only on your own post, or a ref confirming a ruling */
      for k in select jsonb_object_keys(p_doc) loop
        if k not in ('id', 'rev') and k !~ ('^rx(by|sent)?_' || p_who || '$') then bad := true; end if;
      end loop;
      if bad then
        if held is null then why := 'a change to a post that is not there';
        elsif held->>'dev' is distinct from p_who then
          if not (held->>'k' = 'r' and r in ('s1', 's2')
                  and not exists (select 1 from jsonb_object_keys(p_doc) kk where kk not in ('id', 'rev', 'ok'))) then
            why := 'tried to change another phone''s post';
          end if;
        end if;
      end if;
    else
      if held is not null and held->>'dev' is distinct from p_who then why := 'tried to replace another phone''s post';
      elsif p_doc->>'dev' is distinct from p_who then why := 'a post carrying another phone''s id';
      elsif (p_doc->>'k') in ('m', 'o', 'q', 't') and p_doc->>'pid' is distinct from p_pid then why := 'a post signed as ' || coalesce(p_doc->>'pid', '?') || ' by ' || p_pid;
      elsif p_doc->>'k' = 'r' and p_doc->>'by' is not null and p_doc->>'by' <> p_pid then why := 'a ruling asked in another name';
      end if;
    end if;
    if why is not null then
      perform public.log_security('denied', p_path, p_who, p_pid, why);
      return 'denied: PIN not accepted: not yours to write';
    end if;
  end if;

  if p_merge then
    insert into public.docs (path, doc, writer) values (p_path, p_doc, p_who)
    on conflict (path) do update set doc = public.docs.doc || excluded.doc, writer = excluded.writer;
  else
    insert into public.docs (path, doc, writer) values (p_path, p_doc, p_who)
    on conflict (path) do update set doc = excluded.doc, writer = excluded.writer;
  end if;
  return 'ok';
end $$;
grant execute on function public.social_write(text, jsonb, boolean, text, text, text, text) to anon, authenticated;

create or replace function public.social_delete(p_path text, p_pid text, p_name_pin text, p_role_pin text, p_who text default null)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare r text; held jsonb; ident boolean := false;
begin
  if p_path !~ '^(chat|market|notes)/[A-Za-z0-9_.-]{1,80}$' then
    perform public.log_security('denied', p_path, p_who, p_pid, 'social_delete on a row it is not for');
    return 'denied: PIN not accepted for that row';
  end if;
  if public.is_blocked(p_who) then return 'denied: PIN not accepted: this phone is blocked for a while'; end if;
  r := case when p_role_pin ~ '^[0-9]{4,8}$' then public.pin_role(p_role_pin, p_who) else null end;
  if r = 'throttled' then return 'denied: Too many PIN attempts. Wait a minute and try again.'; end if;
  if r is distinct from 'master' then
    if p_path ~ '^chat/id_' then
      perform public.log_security('denied', p_path, p_who, p_pid, 'tried to clear a name''s PIN without the master PIN');
      return 'denied: PIN not accepted: only the master PIN clears a name';
    end if;
    select doc into held from public.docs where path = p_path;
    if held is null then return 'ok'; end if;
    if p_pid ~ '^x' then ident := exists (select 1 from public.docs where path = 'chat/guest_' || p_pid and doc->>'dev' = p_who);
    else ident := public.check_name(p_pid, p_name_pin, p_who); end if;
    if not ident or held->>'dev' is distinct from p_who then
      perform public.log_security('denied', p_path, p_who, p_pid, 'tried to remove another phone''s post');
      return 'denied: PIN not accepted: not yours to remove';
    end if;
  end if;
  delete from public.docs where path = p_path;
  return 'ok';
end $$;
grant execute on function public.social_delete(text, text, text, text, text) to anon, authenticated;

-- ---- the master reviewer reads the log, and lifts a block ------------------
create or replace function public.security_recent(p_pin text, p_who text default null, p_limit int default 200)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare r text; ev jsonb; bl jsonb;
begin
  r := public.pin_role(p_pin, p_who);
  if r is distinct from 'master' then
    perform public.log_security('denied', 'security_log', p_who, null, 'tried to read the security log without the master PIN');
    return jsonb_build_object('denied', true);
  end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.at desc), '[]'::jsonb) into ev
    from (select id, at, kind, path, who, pid, ip, agent, detail from public.security_log order by at desc limit greatest(1, least(p_limit, 500))) x;
  select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) into bl from (select dev, until, why from public.blocked_devices where until > now()) b;
  return jsonb_build_object('events', ev, 'blocked', bl, 'now', now());
end $$;
grant execute on function public.security_recent(text, text, int) to anon, authenticated;

create or replace function public.security_unblock(p_pin text, p_dev text, p_who text default null)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if public.pin_role(p_pin, p_who) is distinct from 'master' then return 'denied: PIN not accepted'; end if;
  delete from public.blocked_devices where dev = p_dev;
  delete from public.security_log where who = p_dev and kind in ('direct', 'pin', 'denied') and at > now() - interval '10 minutes';   -- or it is blocked again at once
  perform public.log_security('signin', null, p_who, null, 'unblocked ' || p_dev);
  return 'ok';
end $$;
grant execute on function public.security_unblock(text, text, text) to anon, authenticated;

-- ---- every change to the tournament's own rows is kept -----------------------
-- What a card, a roster row, a pairing, a round or a recap was before each
-- write, who wrote it (the phone) and when. Only the master PIN reads it,
-- and the master PIN can put any version back.
create table if not exists public.docs_history (
  id     bigserial primary key,
  at     timestamptz not null default now(),
  path   text not null,
  op     text not null,
  before jsonb,
  after  jsonb,
  writer text
);
alter table public.docs_history enable row level security;
revoke all on table public.docs_history from anon, authenticated;
create index if not exists docs_history_path on public.docs_history (path, at desc);

create or replace function public.docs_remember()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare p text;
begin
  p := case when tg_op = 'DELETE' then old.path else new.path end;
  if p !~ '^(config|people|pairs|scores|bbb|recaps)/' then return null; end if;
  if tg_op = 'UPDATE' and old.doc = new.doc then return null; end if;
  insert into public.docs_history (path, op, before, after, writer)
  values (p, tg_op, case when tg_op = 'INSERT' then null else old.doc end, case when tg_op = 'DELETE' then null else new.doc end,
          case when tg_op = 'DELETE' then old.writer else new.writer end);
  return null;
end $$;
drop trigger if exists docs_remember on public.docs;
create trigger docs_remember after insert or update or delete on public.docs
  for each row execute function public.docs_remember();

create or replace function public.history_recent(p_pin text, p_path text default null, p_who text default null, p_limit int default 60)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare r text; ev jsonb;
begin
  r := public.pin_role(p_pin, p_who);
  if r is distinct from 'master' then
    perform public.log_security('denied', 'docs_history', p_who, null, 'tried to read the history without the master PIN');
    return jsonb_build_object('denied', true);
  end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.at desc), '[]'::jsonb) into ev
    from (select id, at, path, op, before, after, writer from public.docs_history
           where p_path is null or path = p_path
           order by at desc limit greatest(1, least(p_limit, 300))) x;
  return jsonb_build_object('rows', ev);
end $$;
grant execute on function public.history_recent(text, text, text, int) to anon, authenticated;

create or replace function public.history_revert(p_pin text, p_id bigint, p_who text default null)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare h public.docs_history; r text;
begin
  r := public.pin_role(p_pin, p_who);
  if r is distinct from 'master' then
    perform public.log_security('denied', 'docs_history', p_who, null, 'tried to revert without the master PIN');
    return 'denied: PIN not accepted';
  end if;
  select * into h from public.docs_history where id = p_id;
  if h.id is null then return 'denied: no such change'; end if;
  if h.before is null then
    delete from public.docs where path = h.path;
  else
    insert into public.docs (path, doc, writer) values (h.path, h.before, p_who)
    on conflict (path) do update set doc = excluded.doc, writer = excluded.writer;
  end if;
  perform public.log_security('signin', h.path, p_who, null, 'put back the version from before change #' || p_id);
  return 'ok';
end $$;
grant execute on function public.history_revert(text, bigint, text) to anon, authenticated;

-- ---- a photo comes down only by the phone that put it up, or the master PIN --
create or replace function public.photo_delete(p_path text, p_role_pin text, p_who text default null)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare held jsonb; r text;
begin
  if p_path !~ '^photos/[A-Za-z0-9_.-]{1,80}$' then return 'denied: PIN not accepted for that row'; end if;
  if public.is_blocked(p_who) then return 'denied: PIN not accepted: this phone is blocked for a while'; end if;
  select doc into held from public.docs where path = p_path;
  if held is null then return 'ok'; end if;
  r := case when p_role_pin ~ '^[0-9]{4,8}$' then public.pin_role(p_role_pin, p_who) else null end;
  if r is distinct from 'master' and (p_who is null or held->>'dev' is distinct from p_who) then
    perform public.log_security('denied', p_path, p_who, null, 'tried to remove another phone''s photo');
    return 'denied: PIN not accepted: not yours to remove';
  end if;
  delete from public.docs where path = p_path;
  return 'ok';
end $$;
grant execute on function public.photo_delete(text, text, text) to anon, authenticated;

-- the files themselves stay where they are: nothing with the public key
-- removes one. A photo taken down is taken off the page; the file is
-- cleared by the commissioner from the Storage tab if it ever matters.
drop policy if exists photos_remove on storage.objects;
create policy photos_remove on storage.objects for delete using (false);

-- ---- a direct write with the public key: dropped on the floor, and logged ---
-- The row-level rules let the public key's write reach this trigger, which
-- keeps it only for the photos, the push addresses and the phone logs — and
-- for the notify function marking a reaction as sent. Everything else is
-- dropped without an error, so the write is logged and the attacker learns
-- nothing. The book's own functions run as the owner and pass straight
-- through.
create or replace function public.docs_guard()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare p text; open_path boolean; only_sent boolean;
begin
  if current_user not in ('anon', 'authenticated') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  p := case when tg_op = 'DELETE' then old.path else new.path end;
  open_path := p ~ '^(photos|push|diag)/[A-Za-z0-9_.-]{1,80}$';
  /* a photo: anyone adds one; a change can only be a heart (hv_<phone>);
     taking one down goes through photo_delete */
  if p ~ '^photos/' then
    if tg_op = 'INSERT' then return new; end if;
    if tg_op = 'UPDATE' then
      select coalesce(bool_and(k like 'hv\_%' or k in ('rev', 'id')), true) into only_sent
        from jsonb_object_keys(new.doc) k where new.doc->k is distinct from old.doc->k;
      if only_sent and old.doc->>'url' is not distinct from new.doc->>'url' then return new; end if;
    end if;
    open_path := false;
  end if;
  if tg_op = 'UPDATE' and p ~ '^chat/' and not open_path then
    /* the notify function, with the public key, marks a reaction as sent */
    select coalesce(bool_and(k like 'rxsent\_%'), false) into only_sent
      from jsonb_object_keys(new.doc) k where new.doc->k is distinct from old.doc->k;
    if only_sent then return new; end if;
  end if;
  if open_path then
    if tg_op <> 'DELETE' and jsonb_typeof(new.doc) <> 'object' then return null; end if;
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  perform public.log_security('direct', p, case when tg_op = 'DELETE' then old.writer else coalesce(new.writer, old.writer) end, null,
                              tg_op || ' with the public key, straight at the table');
  return null;
end $$;
drop trigger if exists docs_guard on public.docs;
create trigger docs_guard before insert or update or delete on public.docs
  for each row execute function public.docs_guard();

-- the public key's writes all reach the guard, which decides
drop policy if exists docs_insert on public.docs;
create policy docs_insert on public.docs for insert with check (true);
drop policy if exists docs_update on public.docs;
create policy docs_update on public.docs for update using (true) with check (true);
drop policy if exists docs_delete on public.docs;
create policy docs_delete on public.docs for delete using (true);

-- merge_doc runs as the caller, so it meets the guard too: nothing to change there.

-- ---- what was in the clear, taken out of it ---------------------------------
update public.docs set doc = doc - 'pins' - 'pinsChanged' where path = 'config/tournament';
update public.docs
   set doc = (doc - 'pin') || jsonb_build_object('hash', crypt(doc->>'pin', gen_salt('bf', 6)))
 where path like 'chat/id\_%' and doc ? 'pin';
-- Anyone who read the database before today may know the old name PINs. To
-- make everyone choose afresh the next time they open the chat, run this too:
-- delete from public.docs where path like 'chat/id\_%';

-- ---- the PINs themselves: TYPE THEM IN, RUN, THEN CLEAR THIS QUERY ----------
insert into public.pins (role, hash) values
  ('master', crypt('TYPE-THE-MASTER-PIN-HERE',   gen_salt('bf', 8))),
  ('s1',     crypt('TYPE-SCORER-1-PIN-HERE',     gen_salt('bf', 8))),
  ('s2',     crypt('TYPE-SCORER-2-PIN-HERE',     gen_salt('bf', 8)))
on conflict (role) do update set hash = excluded.hash, changed_at = now();

-- Did it work? Three rows; the config has no pins; no name PIN in the clear;
-- the guard is on.
select role, changed_at from public.pins;
select path, doc ? 'pins' as still_has_pins from public.docs where path = 'config/tournament';
select count(*) as names_with_pins_in_the_clear from public.docs where path like 'chat/id\_%' and doc ? 'pin';
select tgname, tgenabled from pg_trigger where tgname = 'docs_guard';
