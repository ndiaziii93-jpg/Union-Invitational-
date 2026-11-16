-- ---------------------------------------------------------------------------
-- THE CLUBHOUSE, PART 5: a card is judged by the day it was PLAYED.
--
-- Run once, after supabase-club.sql, -club-2, -club-3 and -club-4. Nothing to
-- fill in. Safe to run twice: it replaces club_write whole.
--
-- THE PROBLEM IT FIXES. A card was judged by the day it was POSTED. Finish
-- your round on the last Sunday of the stop, sit down with a beer, post it at
-- ten past midnight, and the server refused it: "a card for frostbite outside
-- its window". The round was played inside the window; only the typing was
-- late. That card was then stuck on the phone for good, and as more people
-- log more cards it would have happened more often.
--
-- WHAT IT DOES NOW. Every card carries the day it was started. The server
-- reads THAT day, and takes the card if the day played is inside the stop's
-- window — however late it arrives.
--
-- WHAT STOPS IT BEING A BACK DOOR. A card may not claim a day in the future,
-- and may not be posted more than three days after its stop closed. Three
-- days is enough for "finished Sunday, posted Tuesday" and short enough that
-- a stop the commissioner has already crowned does not change under them.
-- A card with no day on it is judged by today, exactly as before.
-- ---------------------------------------------------------------------------

create or replace function public.club_write(
  p_path text, p_doc jsonb, p_merge boolean,
  p_pid text, p_name_pin text, p_role_pin text, p_who text default null)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare r text; held jsonb; is_master boolean; ident boolean := false; k text; why text := null;
        key text; stop_id text; season jsonb; stop jsonb; today text; played text;
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
    elsif key = 'profile__' || p_pid then
      /* Their own page. It holds a Bert, and a face: a link to a photograph
         already in this project's storage and three numbers saying how it is
         cropped. Nothing else belongs in it, and nothing in it is long. */
      if p_doc ? 'face' and jsonb_typeof(p_doc->'face') not in ('object', 'null') then
        why := 'a face that is neither a picture nor nothing';
      elsif jsonb_typeof(p_doc->'face') = 'object'
        and coalesce(p_doc->'face'->>'url', '') !~ '^https://[A-Za-z0-9.-]+/' then
        why := 'a face whose picture is not a link into storage';
      elsif length(p_doc::text) > 1200 then
        why := 'a profile row far longer than a Bert and a crop';
      end if;
    elsif key = 'course__' || p_pid then
      /* the course is theirs to enter and change; the approval is the master's */
      if p_doc ? 'approved' and (p_doc->>'approved')::boolean is true then why := 'a golfer tried to approve their own course'; end if;
      if held is not null and (held->>'approved')::boolean is true and not p_merge then why := 'an approved course can only be changed by the master PIN'; end if;
    elsif key ~ ('^hcard__' || p_pid || '__[0-9]{8}-[a-z0-9]{4}$') then
      /* A round for the number alone. No window: it is not competing, so
         there is nothing for it to be early or late for. */
      if coalesce(p_doc->>'kind', '') <> 'hcp' then why := 'a handicap round that does not say it is one';
      elsif coalesce(p_doc->>'pid', '') <> p_pid then why := 'a handicap round written under somebody else''s name';
      elsif coalesce(p_doc->>'date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then why := 'a handicap round with no day on it';
      elsif p_doc ? 'final' then why := 'a golfer tried to make a round final';
      elsif held is not null and (held->>'final')::boolean is true then why := 'a round the master PIN has made final';
      elsif jsonb_typeof(p_doc->'raw') <> 'array' or jsonb_array_length(p_doc->'raw') <> 18 then why := 'a round that is not eighteen boxes long';
      elsif length(p_doc::text) > 4000 then why := 'a round far longer than a card and a course';
      end if;
    elsif key ~ ('^card__[A-Za-z0-9_.-]+__' || p_pid || '$') then
      /* a card is written while its stop is open, and never once it is final */
      stop_id := split_part(key, '__', 2);
      select doc into season from public.docs where path = 'club/season';
      select s into stop from jsonb_array_elements(coalesce(season->'stops', '[]'::jsonb)) s where s->>'id' = stop_id limit 1;
      today := to_char(now() at time zone 'utc', 'YYYY-MM-DD');
      /* the day it was PLAYED, which the card carries; an old card with no
         day on it is judged by today, as every card was before this */
      played := coalesce(nullif(p_doc->>'date', ''), today);
      if played !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then played := today; end if;
      if stop is null then why := 'a card for a stop that is not on the season';
      elsif played > today then why := 'a card claiming a day that has not happened';
      elsif played < (stop->>'from') or played > (stop->>'to') then why := 'a card played outside ' || stop_id || '''s window';
      elsif today > ((stop->>'to')::date + 3)::text then why := 'a card posted more than three days after ' || stop_id || ' closed';
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

-- What you should see: one row, club_write.
select p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'club_write';
