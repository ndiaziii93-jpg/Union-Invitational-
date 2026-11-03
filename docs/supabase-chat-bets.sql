-- The Union Invitational — chat and bets
--
-- Paste into Supabase -> SQL Editor -> New query -> Run. Safe to run more
-- than once. The editor will warn about `drop policy`; the policy is
-- recreated on the very next line, exactly as in part one.
--
-- The database only lets the book create documents under the folders it
-- knows. Chat and bets are two new folders: `chat/` for messages and
-- reactions, `market/` for the exchange's markets, trades and orders.
-- `notes/` (the golfers' own notes on My round) is listed here too, so it
-- is allowed whether or not it was added by hand before.

drop policy if exists docs_insert on public.docs;
create policy docs_insert on public.docs
  for insert with check (
    jsonb_typeof(doc) = 'object'
    and path ~ '^(config|people|pairs|scores|bbb|notes|recaps|photos|chat|market|diag)/[A-Za-z0-9_.-]{1,80}$'
  );

-- Did it work? The rule shown should include chat and market.
select policyname, with_check from pg_policies
 where tablename = 'docs' and policyname = 'docs_insert';
