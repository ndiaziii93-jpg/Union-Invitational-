-- ---------------------------------------------------------------------------
-- THE FEEDBACK FORM. Run once in the Supabase SQL editor (after the lockdown).
--
-- Answers go into a table of their own that no key can read: no grant, row
-- security on with no policy. A phone sends its answers through
-- feedback_submit (one row a phone, a later send replacing the earlier), and
-- they come out only through feedback_list, with the master PIN, logged each
-- time — the same arrangement as the player PINs. The last line opens the
-- form in the book.
-- ---------------------------------------------------------------------------

create table if not exists public.feedback (
  dev    text primary key,
  doc    jsonb not null,
  at     timestamptz not null default now()
);
revoke all on public.feedback from anon, authenticated, public;
alter table public.feedback enable row level security;

-- a phone's answers: the shape is checked, the size is capped, nothing else is read
create or replace function public.feedback_submit(p_dev text, p_doc jsonb)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare k text; s jsonb; sk text;
begin
  if p_dev !~ '^[A-Za-z0-9_.-]{1,40}$' or jsonb_typeof(p_doc) <> 'object' then return 'denied: not a feedback form'; end if;
  if public.is_blocked(p_dev) then return 'denied: this phone is blocked for a while'; end if;
  if length(p_doc::text) > 12000 then return 'denied: too long'; end if;
  for k in select jsonb_object_keys(p_doc) loop
    if k not in ('name', 'was', 'stars', 'best', 'keep', 'change', 'add', 'again', 'v') then return 'denied: not a feedback form (' || k || ')'; end if;
  end loop;
  if p_doc ? 'stars' then
    s := p_doc->'stars';
    if jsonb_typeof(s) <> 'object' then return 'denied: not a feedback form (stars)'; end if;
    for sk in select jsonb_object_keys(s) loop
      if sk !~ '^[a-z_]{1,24}$' or jsonb_typeof(s->sk) <> 'number' or not ((s->>sk)::numeric between 1 and 5) then return 'denied: not a feedback form (stars.' || sk || ')'; end if;
    end loop;
  end if;
  foreach k in array array['name', 'was', 'best', 'keep', 'change', 'add', 'again', 'v'] loop
    if p_doc ? k and jsonb_typeof(p_doc->k) not in ('string', 'null') then return 'denied: not a feedback form (' || k || ')'; end if;
  end loop;
  insert into public.feedback (dev, doc, at) values (p_dev, p_doc, now())
  on conflict (dev) do update set doc = excluded.doc, at = now();
  return 'ok';
end $$;
grant execute on function public.feedback_submit(text, jsonb) to anon, authenticated;

-- every answer, for the master PIN only
create or replace function public.feedback_list(p_pin text, p_who text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare r text; out jsonb;
begin
  r := public.pin_role(p_pin, p_who);
  if r is distinct from 'master' then
    perform public.log_security('denied', 'feedback', p_who, null, 'tried to read the feedback without the master PIN');
    return jsonb_build_object('denied', true);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('dev', dev, 'at', at, 'doc', doc) order by at desc), '[]'::jsonb) into out from public.feedback;
  perform public.log_security('signin', 'feedback', p_who, null, 'read the feedback');
  return jsonb_build_object('rows', out);
end $$;
grant execute on function public.feedback_list(text, text) to anon, authenticated;

-- how many have answered: a number anyone may see, so the form can say so
create or replace function public.feedback_count()
returns integer
language sql
security definer
set search_path = public, extensions
as $$ select count(*)::integer from public.feedback $$;
grant execute on function public.feedback_count() to anon, authenticated;

-- and the form is open in the book from now
update public.docs set doc = doc || jsonb_build_object('feedback', jsonb_build_object('live', true)) where path = 'config/tournament';
