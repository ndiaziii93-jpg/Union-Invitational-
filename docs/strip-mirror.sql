-- The Union Invitational — take the old roster copy out of the config
--
-- Paste into Supabase -> SQL Editor -> New query. Run the three steps IN
-- ORDER and read the output of step 1 before running step 2.
--
-- ---------------------------------------------------------------------------
-- WHY
--
-- The config document still carries a `people` and `pairs` list inside it —
-- a mirror of the roster as it stood before the roster moved into documents
-- of its own. Nothing reads it any more. It is kept only because deleting
-- data is harder to undo than keeping it.
--
-- But it is a copy of the roster from BEFORE anybody was ever removed, and
-- the book has been caught writing it back over the real one: a golfer taken
-- off the trip reappearing after a reload. Two of the ways that could happen
-- are now fixed in the app, and at least one more has not been found.
--
-- This removes the thing itself. With no old copy in the config there is
-- nothing for anybody to be resurrected FROM, whatever the remaining fault
-- turns out to be. It closes the whole class rather than the instances.
--
-- It is safe: the roster the book actually uses lives in people/ and pairs/
-- documents, which this does not touch.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- STEP 1 — look before you leap. Run this on its own first.
-- ===========================================================================
select
  (select count(*) from public.docs where path like 'people/%') as people_documents,
  (select count(*) from public.docs where path like 'pairs/%')  as pair_documents,
  jsonb_array_length(coalesce(doc->'people', '[]'::jsonb))      as stale_people_in_config,
  jsonb_array_length(coalesce(doc->'pairs',  '[]'::jsonb))      as stale_pairs_in_config,
  doc->>'rosterInDocs'                                          as roster_in_docs_flag,
  coalesce((doc->>'rev')::int, 0)                               as config_rev
from public.docs
where path = 'config/tournament';

-- WHAT YOU SHOULD SEE, and what to do about it:
--
--   people_documents        a number matching your roster — everyone on the
--                           trip, golfers and officials. If this is 0, STOP:
--                           the config mirror is the only roster there is and
--                           removing it would take the tournament with it.
--   stale_people_in_config  probably a LARGER number. That difference is the
--                           ghosts: people removed since the roster moved out.
--   roster_in_docs_flag     on this book it reads NULL, and step 2 explains
--                           why and sets it. Either null or true is fine.
--
-- Only go on when people_documents matches your roster.


-- ===========================================================================
-- STEP 2 — keep a copy, mark the move, then take the mirror out.
-- ===========================================================================
--
-- ABOUT THE FLAG. On the live book `roster_in_docs_flag` comes back NULL:
-- the roster was moved into documents by the migration, but the config was
-- never marked to record that it had happened. That is the state in which
-- the book can look at a config full of people, decide the roster has never
-- been split out, and write the old copy back — so the flag is set here as
-- well, and it is worth setting even on its own.
--
-- The guard is therefore the EVIDENCE rather than the flag, because the flag
-- is the thing that is missing: the people documents must number at least
-- half of what the config's old copy claims. Fifteen documents against a
-- copy of twenty-three passes. Three documents against twenty-three does
-- not, and nothing happens.

begin;

-- the whole config as it is right now, parked where the app never looks.
-- Undoing this is the rollback at the foot of the file, and it costs one row.
insert into public.docs (path, doc, writer)
select 'backup/config-before-mirror-strip', doc, 'mirror-strip'
from public.docs where path = 'config/tournament'
on conflict (path) do update set doc = excluded.doc, writer = excluded.writer;

update public.docs d
set doc = (d.doc - 'people' - 'pairs')
          || jsonb_build_object(
               'rosterInDocs', true,
               'rev', coalesce((d.doc->>'rev')::int, 0) + 1),
    writer = 'mirror-strip'
where d.path = 'config/tournament'
  and (select count(*) from public.docs p where p.path like 'pairs/%') > 0
  and (select count(*) from public.docs p where p.path like 'people/%')
      >= greatest(1, jsonb_array_length(coalesce(d.doc->'people', '[]'::jsonb)) / 2);

commit;


-- ===========================================================================
-- STEP 3 — check it took.
-- ===========================================================================
select
  (select count(*) from public.docs where path like 'people/%') as people_documents,
  (doc ? 'people')                                              as config_still_has_people,
  (doc ? 'pairs')                                               as config_still_has_pairs,
  doc->>'rosterInDocs'                                          as roster_in_docs_flag,
  coalesce((doc->>'rev')::int, 0)                               as config_rev
from public.docs
where path = 'config/tournament';

-- Expect: people_documents unchanged from step 1, both `config_still_has_*`
-- now false, the flag now true, and config_rev one higher than step 1.
--
-- If config_still_has_people is still true, the guard refused. Nothing has
-- been changed — that is the point of it. Send me step 1's output.


-- ===========================================================================
-- IF YOU EVER WANT IT BACK
-- ===========================================================================
-- update public.docs d
-- set doc = (select doc from public.docs where path = 'backup/config-before-mirror-strip'),
--     writer = 'mirror-restore'
-- where d.path = 'config/tournament';
