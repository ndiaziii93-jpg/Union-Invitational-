-- ---------------------------------------------------------------------------
-- THE CLUBHOUSE, PART 2: people add themselves, and the master sees who has
-- been on the app. Run once, after supabase-club.sql. Nothing to fill in.
--
--   club_join    a person not on the roster adds themselves as a golfer,
--                men's or women's tournament, with a four-digit PIN — one
--                people/ row and the name claimed, in one go
--   club_roster  for the master PIN: who has chosen their name, when, and
--                from which phone. No PINs in it.
--   season_guard the closed book, again, letting a name be claimed while
--                it is closed (it did not, and that stopped every new name)
-- ---------------------------------------------------------------------------

create or replace function public.club_join(p_name text, p_division text, p_pin text, p_who text default null)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare nm text; pid text; n int; r text; clash text;
begin
  nm := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  if length(nm) < 2 or length(nm) > 40 or nm !~ '^[[:alpha:]][[:alpha:]0-9 .''’-]*$' then return 'denied: Put in your name, letters only'; end if;
  if p_division not in ('men', 'women') then return 'denied: Men''s or women''s tournament'; end if;
  if p_pin !~ '^[0-9]{4}$' then return 'denied: A name''s PIN is four digits'; end if;
  if public.is_blocked(p_who) then return 'denied: PIN not accepted: this phone is blocked for a while'; end if;
  /* the roster is the roster: a name already on it is tapped, not added again */
  select coalesce(d.doc->>'display', d.doc->>'name') into clash from public.docs d
   where d.path like 'people/%'
     and (lower(btrim(d.doc->>'name')) = lower(nm) or lower(btrim(d.doc->>'display')) = lower(nm)
          or lower(split_part(btrim(d.doc->>'name'), ' ', 1)) = lower(nm))
   limit 1;
  if clash is not null then return 'denied: ' || clash || ' is on the list already: tap that name instead'; end if;
  /* one addition a phone: a second name from the same phone is the commissioner's to make */
  if p_who is not null and exists (select 1 from public.docs d where d.path like 'people/%' and d.doc->>'dev' = p_who and (d.doc->>'joined')::boolean is true) then
    return 'denied: this phone has already added a name: ask the commissioner to add another';
  end if;
  select count(*) into n from public.docs where path like 'people/%';
  pid := 'j' || substr(md5(random()::text || clock_timestamp()::text), 1, 6);
  insert into public.docs (path, doc, writer) values ('people/' || pid, jsonb_build_object(
    'id', pid, 'name', nm, 'display', nm, 'role', 'golfer', 'division', p_division,
    'location', null, 'group', '7-day', 'band', null, 'order', 1000 + n, 'joined', true, 'dev', p_who,
    'at', (extract(epoch from now()) * 1000)::bigint, 'rev', 1), p_who);
  r := public.claim_name(pid, p_pin, p_who);
  if r <> 'ok' then delete from public.docs where path = 'people/' || pid; return r; end if;
  perform public.log_security('signin', 'people/' || pid, p_who, pid, 'added themselves to the roster as ' || nm || ' (' || p_division || ')');
  return 'ok:' || pid;
end $$;
grant execute on function public.club_join(text, text, text, text) to anon, authenticated;

create or replace function public.club_roster(p_pin text, p_who text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare r text; out jsonb;
begin
  r := public.pin_role(p_pin, p_who);
  if r is distinct from 'master' then
    perform public.log_security('denied', 'name_pins', p_who, null, 'tried to read who is on the app without the master PIN');
    return jsonb_build_object('denied', true);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('pid', np.pid, 'at', np.set_at, 'dev', d.doc->>'dev') order by np.set_at), '[]'::jsonb) into out
    from public.name_pins np left join public.docs d on d.path = 'chat/id_' || np.pid;
  return jsonb_build_object('rows', out);
end $$;
grant execute on function public.club_roster(text, text) to anon, authenticated;

-- ---- the closed book lets a name be claimed ------------------------------------
-- A name's PIN lives at chat/id_<pid> and a bleacher pass at chat/guest_…:
-- identity, not the week's chat. The guard above (supabase-club.sql) shut
-- them with the rest of chat/, so nobody could choose a name or add
-- themselves while the 2026 book was closed. The same guard, with those
-- two rows left open.
create or replace function public.season_guard()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare p text; shut boolean;
begin
  p := case when tg_op = 'DELETE' then old.path else new.path end;
  if p ~ '^(club|arc|diag|push|people)/' or p ~ '^chat/(id|guest)_' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select coalesce((doc->>'frozen')::boolean, false) into shut from public.docs where path = 'club/season';
  if coalesce(shut, false) then
    raise exception 'the book is closed: reopen it from Manage before changing %', p using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists season_guard on public.docs;
create trigger season_guard before insert or update or delete on public.docs
  for each row execute function public.season_guard();

select proname from pg_proc where proname in ('club_join', 'club_roster', 'season_guard') order by 1;
