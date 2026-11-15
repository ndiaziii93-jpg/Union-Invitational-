# Working on the Union Invitational

## Anything made for the group must be shareable without Claude

Not everyone on the trip has Claude. A claude.ai artifact link is private by
default and asks people to sign in, so it is never the deliverable for the
group.

- Briefings, guides, mockups the group will see, and anything else meant for
  other people go on the public GitHub Pages site, under `docs/`, committed
  and pushed: https://ndiaziii93-jpg.github.io/Union-Invitational-/
  (briefings live in `docs/brief/`; the day's recap is a page of its own at
  `docs/recap/?r=<round>`, built by `tools/recap.py` after `tools/pwa.py`).
- Pages must be self-contained: their own `<!doctype html>` and head, relative
  links between them, and no links to claude.ai.
- A Claude artifact may be used as a private preview for the commissioner,
  but the link given to share is always the GitHub Pages one.

## Never put secrets in the repo

The repository is public. No PINs, API keys, the Supabase service_role key or
database password, in code, fixtures, commits or pages.

## SQL goes in the chat, ready to copy

The commissioner runs SQL from a phone, in the Supabase editor. Pointing at a
file in the repo means opening GitHub on that phone and scrolling a code view
to select it, which is miserable and error-prone.

So: whenever a change needs SQL run, print the whole statement in the reply,
in a fenced block, complete and ready to paste. Never say only "run
`docs/supabase-….sql`". Commit the file to `docs/` as well — it belongs in
the repo and in `docs/SETUP.md` in sequence — but the copy in the chat is the
deliverable, not the pointer to it.

- Print it in full even when it is long, and even when it was printed earlier
  in the conversation: do not make anyone scroll back for it.
- Say in one line what it changes, and what the editor should show when it
  worked.
- A migration that replaces a function wholesale is safe to run twice; say so,
  so nobody has to wonder whether they already did.
