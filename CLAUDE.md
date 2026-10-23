# Working on the Union Invitational

## Anything made for the group must be shareable without Claude

Not everyone on the trip has Claude. A claude.ai artifact link is private by
default and asks people to sign in, so it is never the deliverable for the
group.

- Briefings, guides, mockups the group will see, and anything else meant for
  other people go on the public GitHub Pages site, under `docs/`, committed
  and pushed: https://ndiaziii93-jpg.github.io/Union-Invitational-/
  (briefings live in `docs/brief/`).
- Pages must be self-contained: their own `<!doctype html>` and head, relative
  links between them, and no links to claude.ai.
- A Claude artifact may be used as a private preview for the commissioner,
  but the link given to share is always the GitHub Pages one.

## Never put secrets in the repo

The repository is public. No PINs, API keys, the Supabase service_role key or
database password, in code, fixtures, commits or pages.
