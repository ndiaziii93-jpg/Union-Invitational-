-- ---------------------------------------------------------------------------
-- OPEN THE MERRY MULLIGAN OPEN FROM 20 NOVEMBER 2026.
--
-- Run in Supabase -> SQL Editor. ONLY needed if a club/season row already
-- exists with its own stops array. If it does not, the row below updates
-- nothing (it will say UPDATE 0) and the app's own seed already opens the
-- stop -- that change ships in src/club.js.
--
-- It touches ONE field of ONE stop. Every other stop, and everything else on
-- the season (packages, rooms, vendors, the Vegas window), is rebuilt exactly
-- as it was. Safe to run twice: it sets the same date again.
-- ---------------------------------------------------------------------------
update public.docs
set doc = jsonb_set(doc, '{stops}', (
      select jsonb_agg(
               case when s->>'id' = 'mulligan'
                    then s || jsonb_build_object('from', '2026-11-20')
                    else s
               end order by ord)
      from jsonb_array_elements(doc->'stops') with ordinality as t(s, ord)))
where path = 'club/season'
  and jsonb_typeof(doc->'stops') = 'array';

-- What it should show: Merry Mulligan opening 2026-11-20, closing 2026-12-31,
-- and every other stop on the dates it already had.
select s->>'id' as id, s->>'name' as stop, s->>'from' as opens, s->>'to' as closes
from public.docs, jsonb_array_elements(doc->'stops') as s
where path = 'club/season'
order by s->>'from';
