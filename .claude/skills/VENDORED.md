# Vendored skills

Skills copied in from other people's repositories, committed here so every
session on this project picks them up — cloud sessions included, where a
`/plugin marketplace add` would not survive the container.

They are **copies, pinned to a commit**. Nothing here auto-updates. To take a
newer version of one, re-clone its repo at the path below and copy the same
folders over, then update the commit in this table.

| Skill folder(s) | From | Commit | Taken |
|---|---|---|---|
| `ponytail`, `ponytail-review`, `ponytail-audit`, `ponytail-debt`, `ponytail-gain`, `ponytail-help` | [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) `skills/` | `96608e0` | 2026-11-21 |
| `karpathy-guidelines` | [forrestchang/andrej-karpathy-skills](https://github.com/forrestchang/andrej-karpathy-skills) `skills/` | `2c60614` | 2026-11-21 |
| 27 skills: `ask-matt` … `writing-for-agents` | [mattpocock/skills](https://github.com/mattpocock/skills) `skills/engineering/` + `skills/productivity/` | `abeeaf9` | 2026-11-21 |
| `impeccable` | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) `.claude/skills/` | `b49177d` | 2026-11-21 |

Ponytail's README says to install it only from `DietrichGebert/ponytail` on
GitHub or `@dietrichgebert/ponytail` on npm; that is where this copy came from.
`andrej-karpathy-skills` is forked widely — `forrestchang` is the original the
forks credit.

## Only the skill part came across

Three of these ship more than skills upstream. The extra parts are not here,
and some of them cannot work in a cloud session anyway:

- **ponytail** also ships hooks and a "band" above the Claude Code prompt. The
  band needs a terminal or the desktop app; it does not render in cloud
  sessions. The six skills are what is here, and they work anywhere.
- **impeccable** also ships hooks, four sub-agents and a VS Code extension.
  Its skill runs a detector engine that downloads a binary into
  `~/.impeccable/bin/` the first time it is used.
- **mattpocock/skills** ships more buckets than this. Only the two he marks
  as promoted — `engineering/` and `productivity/` — came across.
  `in-progress/`, `misc/` and `deprecated/` did not.

## Two of them shadow something

A skill folder here wins over a built-in of the same name.

- **`code-review`** now means Matt Pocock's, which checks the diff against
  repo standards and against the originating spec. Claude Code's own
  `/code-review`, which hunts bugs in the diff, is shadowed on this project.
  They do different jobs; this is a real change, not a duplicate.
- **`grill-me`** collides with the bundled `anthropic-skills:grill-me`.

To put either built-in back, delete that folder.

## The project's own rules still win

`CLAUDE.md` at the repo root is the authority for this project: everything for
the group goes on GitHub Pages under `docs/`, no secrets in the repo, and SQL
gets printed in full in the chat. Where a vendored skill says otherwise, the
root `CLAUDE.md` is what to follow.
