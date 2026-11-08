-- ---------------------------------------------------------------------------
-- THE CLUBHOUSE: the season between tournaments, and the closed book.
-- Run once, after supabase-lockdown.sql, in Supabase → SQL Editor. Nothing
-- here moves a row of the 2026 book: the season adds rows beside it under
-- club/…, and a switch on club/season closes the 2026 rows to every write.
--
--   club/season              the season: phase, stops, packages, rooms   master
--   club/money__<pid>        what a person has paid                      master
--   club/signup__<pid>       In / Maybe / Out, package, shirt            the person
--   club/travel__<pid>       flights                                     the person
--   club/course__<pid>       the home course (approved: master only)     the person
--   club/card__<stop>__<pid> a virtual round, while its stop is open     the person
--
-- "The person" is a name on the roster with its name PIN, the same proof the
-- chat and the bets take. The master PIN writes any of them.
-- ---------------------------------------------------------------------------

-- ---- the season's rows ------------------------------------------------------
create or replace function public.club_write(p_path text, p_doc jsonb, p_merge boolean, p_pid text, p_name_pin text, p_role_pin text, p_who text default null)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare r text; held jsonb; is_master boolean; ident boolean := false; k text; why text := null;
        key text; stop_id text; season jsonb; stop jsonb; today text;
begin
  if jsonb_typeof(p_doc) <> 'object' then return 'denied: club_write expects an object'; end if;
  if p_path !~ '^club/[A-Za-z0-9_.-]{1,80}$' then
    perform public.log_security('denied', p_path, p_who, p_pid, 'club_write on a row it is not for');
    return 'denied: PIN not accepted for that row';
  end if;
  if public.is_blocked(p_who) then return 'denied: PIN not accepted: this phone is blocked for a while'; end if;
  r := case when p_role_pin ~ '^[0-9]{4,8}$' then public.pin_role(p_role_pin, p_who) else null end;
  if r = 'throttled' then return 'denied: Too many PIN attempts. Wait a minute and try again.'; end if;
  is_master := coalesce(r = 'master', false);   -- never null: a null here skipped every check below
  key := substr(p_path, 6);
  select doc into held from public.docs where path = p_path;

  if not is_master then
    /* who is writing: a name on the roster with its PIN; never a guest */
    if p_pid !~ '^[A-Za-z0-9_.-]{1,40}$' or p_pid ~ '^x' then ident := false;
    else ident := public.check_name(p_pid, p_name_pin, p_who); end if;
    if not ident then
      perform public.log_security('denied', p_path, p_who, p_pid, 'a season row without a name PIN the server accepts');
      return 'denied: PIN not accepted: confirm the PIN for your name';
    end if;
    if key in ('signup__' || p_pid, 'travel__' || p_pid) then
      why := null;
    elsif key = 'course__' || p_pid then
      /* the course is theirs to enter and change; the approval is the master's */
      if p_doc ? 'approved' and (p_doc->>'approved')::boolean is true then why := 'a golfer tried to approve their own course'; end if;
      if held is not null and (held->>'approved')::boolean is true and not p_merge then why := 'an approved course can only be changed by the master PIN'; end if;
    elsif key ~ ('^card__[A-Za-z0-9_.-]+__' || p_pid || '$') then
      /* a card is written while its stop is open, and never once it is final */
      stop_id := split_part(key, '__', 2);
      select doc into season from public.docs where path = 'club/season';
      select s into stop from jsonb_array_elements(coalesce(season->'stops', '[]'::jsonb)) s where s->>'id' = stop_id limit 1;
      today := to_char(now() at time zone 'utc', 'YYYY-MM-DD');
      if stop is null then why := 'a card for a stop that is not on the season';
      elsif today < (stop->>'from') or today > (stop->>'to') then why := 'a card for ' || stop_id || ' outside its window';
      elsif held is not null and (held->>'final')::boolean is true then why := 'a card the master PIN has made final';
      elsif p_doc ? 'final' then why := 'a golfer tried to make a card final';
      end if;
    else
      why := 'not theirs to write: ' || key;
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
grant execute on function public.club_write(text, jsonb, boolean, text, text, text, text) to anon, authenticated;

create or replace function public.club_delete(p_path text, p_pid text, p_name_pin text, p_role_pin text, p_who text default null)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare r text; key text; ident boolean := false;
begin
  if p_path !~ '^club/[A-Za-z0-9_.-]{1,80}$' then
    perform public.log_security('denied', p_path, p_who, p_pid, 'club_delete on a row it is not for');
    return 'denied: PIN not accepted for that row';
  end if;
  if public.is_blocked(p_who) then return 'denied: PIN not accepted: this phone is blocked for a while'; end if;
  r := case when p_role_pin ~ '^[0-9]{4,8}$' then public.pin_role(p_role_pin, p_who) else null end;
  if r = 'throttled' then return 'denied: Too many PIN attempts. Wait a minute and try again.'; end if;
  key := substr(p_path, 6);
  if r is distinct from 'master' then
    /* a person may take back their own flights or an unfinished card; nothing else */
    if p_pid ~ '^[A-Za-z0-9_.-]{1,40}$' and p_pid !~ '^x' then ident := public.check_name(p_pid, p_name_pin, p_who); end if;
    if not ident or not (key = 'travel__' || p_pid or key ~ ('^card__[A-Za-z0-9_.-]+__' || p_pid || '$')) then
      perform public.log_security('denied', p_path, p_who, p_pid, 'tried to remove a season row that is not theirs');
      return 'denied: PIN not accepted: not yours to remove';
    end if;
  end if;
  delete from public.docs where path = p_path;
  return 'ok';
end $$;
grant execute on function public.club_delete(text, text, text, text, text) to anon, authenticated;

-- ---- the closed book ----------------------------------------------------------
-- When club/season says frozen, the 2026 rows take no write at all: not a
-- score, not a photo, not a post, not a heart, from any PIN. The master
-- reopens the book from Manage (frozen off), makes the correction, and
-- closes it again. The roster, the season's own rows and the phones' logs
-- are not the 2026 book and stay open.
create or replace function public.season_guard()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare p text; shut boolean;
begin
  p := case when tg_op = 'DELETE' then old.path else new.path end;
  if p ~ '^(club|arc|diag|push|people)/' then
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


-- ---- a gap closed --------------------------------------------------------------
-- social_write (the chat, the bets, the notes) decided "is this the master?"
-- with r = 'master', and r is NULL for a phone sending no role PIN at all, so
-- the test came out NULL, `if not NULL` did not run, and every check below it
-- was skipped: a phone with no PIN could post as anyone. The same function
-- again, with that one line made false instead of null. Everything else in
-- it is as it was.
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
  is_master := coalesce(r = 'master', false);   -- was (r = 'master'): null with no role PIN, which skipped every check below
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
      /* a trade or an order with numbers no honest ticket could carry: the
         price is worked out on the phone, so the server keeps it within
         the bounds of a beer ledger and the history keeps every one */
      elsif p_doc->>'k' = 't' and not (
              coalesce((p_doc->>'cost')::numeric, 0) between -50 and 50
              and coalesce((p_doc->>'n')::numeric, 0) between -5000 and 5000
              and sign(coalesce((p_doc->>'cost')::numeric, 0)) = sign(coalesce((p_doc->>'n')::numeric, 0))
              and abs(coalesce((p_doc->>'n')::numeric, 0)) >= abs(coalesce((p_doc->>'cost')::numeric, 0)) * 0.99) then why := 'a trade with numbers no ticket could carry';
      elsif p_doc->>'k' = 'o' and not (coalesce((p_doc->>'stake')::numeric, 0) between 0 and 50) then why := 'an order with a stake no ticket could carry';
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

-- ---- check ----------------------------------------------------------------------
select proname from pg_proc where proname in ('club_write', 'club_delete', 'season_guard') order by 1;
