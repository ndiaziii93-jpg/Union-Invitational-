-- ---------------------------------------------------------------------------
-- THE CLUBHOUSE, PART 3: a golfer's own page — which Union Bert they go by,
-- and the photograph of their face, if they have put one there.
--
-- Run once, after supabase-club.sql and supabase-club-2.sql. Nothing to fill
-- in. Until it is run, the app will offer the look picker and the server will
-- refuse the save: "not yours to write: profile__…".
--
--   club/profile__<pid>   the person's own row, written by them, read by
--                         everyone. The group decided it that way: the cards,
--                         the stats and the faces are all on show.
--
-- The whole change is one line in the list of rows a golfer may write — the
-- same list that already lets them write their sign-up and their flights —
-- plus a size guard, because this row carries a link to a photograph and a
-- crop, and nothing else.
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

-- What you should see: one row, club_write.
select p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'club_write';
