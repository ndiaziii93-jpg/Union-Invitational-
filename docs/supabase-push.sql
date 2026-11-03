-- The Union Invitational — chat notifications
--
-- Paste into Supabase -> SQL Editor -> New query -> Run. Safe to run more
-- than once; the `drop policy` warning is the same recreate-on-the-next-line
-- pattern as before.
--
-- A phone that turns notifications on leaves its push address at
-- push/<its device id>, so the notify function knows where to send. This adds
-- `push/` to the folders the book may create documents in. A push address on
-- its own cannot send anything: only the private key, kept in a Supabase
-- secret, can sign a notification.

drop policy if exists docs_insert on public.docs;
create policy docs_insert on public.docs
  for insert with check (
    jsonb_typeof(doc) = 'object'
    and path ~ '^(config|people|pairs|scores|bbb|notes|recaps|photos|chat|market|push|diag)/[A-Za-z0-9_.-]{1,80}$'
  );

-- Did it work? This should come back true.
select with_check like '%market|push%' as push_on
  from pg_policies where tablename = 'docs' and policyname = 'docs_insert';
