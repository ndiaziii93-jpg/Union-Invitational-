-- ---------------------------------------------------------------------------
-- THE FEEDBACK FORM, PART 2: the book remembers who answered. Run once,
-- after supabase-feedback.sql. An answer may carry the name the phone chose
-- in the book; feedback_done says whether a phone, a chosen name or a typed
-- name has answered, and nothing more, so the form stops asking on every
-- copy of the book a person has.
-- ---------------------------------------------------------------------------

alter table public.feedback add column if not exists pid text;

create or replace function public.feedback_submit(p_dev text, p_doc jsonb, p_pid text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare r text;
begin
  r := public.feedback_submit(p_dev, p_doc);
  if r = 'ok' and p_pid ~ '^[A-Za-z0-9_.-]{1,40}$' then update public.feedback set pid = p_pid where dev = p_dev; end if;
  return r;
end $$;
grant execute on function public.feedback_submit(text, jsonb, text) to anon, authenticated;

create or replace function public.feedback_done(p_dev text, p_pid text default null, p_name text default null)
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.feedback
    where dev = p_dev
       or (p_pid is not null and p_pid <> '' and pid = p_pid)
       or (p_name is not null and length(trim(p_name)) >= 3 and lower(trim(doc->>'name')) = lower(trim(p_name)))
  )
$$;
grant execute on function public.feedback_done(text, text, text) to anon, authenticated;
