-- The Union Invitational — part two
--
-- Paste into Supabase -> SQL Editor -> New query -> Run, same as before.
-- Safe to run more than once. The editor will warn about `drop function`;
-- it is the same recreate-on-the-next-line pattern as part one.
--
-- ---------------------------------------------------------------------------
-- Why this needs to be a database function
--
-- Nearly every write in the book replaces a whole document, and the last
-- writer wins — which is right for a scorecard, because only one ref is
-- filling in any given card.
--
-- The tournament config is the exception. It is one document holding the tee
-- times, the round states, the schedule and the course edits, and two people
-- genuinely do touch it at once: one setting Friday's tee times while another
-- opens Round 1. Replacing the whole document there would mean whoever saved
-- second silently undid the other — the exact failure that made tee times
-- look like they "reset themselves" for a fortnight.
--
-- So config writes send only the fields that changed, and this merges them
-- into whatever is already there. `||` on jsonb is a top-level merge, which
-- is the level the book changes fields at.
-- ---------------------------------------------------------------------------

drop function if exists public.merge_doc(text, jsonb, text);

create function public.merge_doc(p text, patch jsonb, who text default null)
returns void
language plpgsql
security invoker           -- the caller's row-level rules still apply
set search_path = public
as $$
begin
  if jsonb_typeof(patch) <> 'object' then
    raise exception 'merge_doc expects an object';
  end if;

  insert into public.docs (path, doc, writer)
  values (p, patch, who)
  on conflict (path) do update
    set doc    = public.docs.doc || excluded.doc,
        writer = excluded.writer;
end $$;

-- the book talks to the database as the anonymous role, like every viewer
grant execute on function public.merge_doc(text, jsonb, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Did it work?
-- ---------------------------------------------------------------------------

-- prove the merge really merges rather than replaces
select public.merge_doc('diag/selftest', '{"a": 1, "b": 2}'::jsonb, 'setup');
select public.merge_doc('diag/selftest', '{"b": 99, "c": 3}'::jsonb, 'setup');

select doc as should_be_a1_b99_c3 from public.docs where path = 'diag/selftest';

delete from public.docs where path = 'diag/selftest';

-- Expect one row: {"a": 1, "b": 99, "c": 3}
