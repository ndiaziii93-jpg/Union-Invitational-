# The Union Invitational

Yardage book and live scoring for The Union Invitational — Titanic Deluxe Golf Belek,
Antalya, 26 October to 2 November 2026.

One HTML page, no build server, no network calls at runtime. It ships as a Claude
Artifact and keeps its state in the artifact's shared database, so the two scorers on
the course, the master reviewer and every spectator all read the same card.

## What it does

Six competitions off a single scorecard:

| Competition | How it is won |
|---|---|
| Team Competition | Lowest cumulative net better ball across rounds 1–3 |
| Tournament MVP | Lowest individual net to par across rounds 1–3 |
| Bingo Bango Bongo | Most points banked — three a hole, 162 across the week |
| Closest to the Pin | Nearest tee shot on the green, one nominated par 3 a round |
| Longest Drive | Longest drive in the fairway, one nominated hole a round |
| Ryder Cup — UK v USA | Most match points: fourballs Thu and Fri, singles Sun |

## Playing bands

Every golfer plays off a 15, 20 or 25 band, assigned on the Roster screen. The band is
the total strokes received across eighteen holes:

- **15** — one stroke on stroke index 1–15
- **20** — one a hole, a second on stroke index 1–2
- **25** — one a hole, a second on stroke index 1–7

A golfer with no band is excluded from every leaderboard rather than guessed at.

## Entering a score

A hole is entered, then saved. Strokes tapped on a hole are a draft held on that
scorer's device — nothing reaches a card or a leaderboard until **Save hole** is
pressed, which (with PINs armed) asks for a PIN. Leaving a hole with an unsaved
draft prompts: save it, discard it, or stay. The card records who saved each
hole and when, so a score on a leaderboard is always one somebody signed off.

## How the shared book loads

The factory roster in `src/data.js` seeds the store **once**, on a first-ever
open. After that it can never be written again: seeding needs both a live
subscription and a confirming read to agree the store is empty, and once any
stored data has been seen in a page load, seeding is off for that load. If the
store cannot be read at all, the page stays read-only and says so rather than
risk writing defaults over a real tournament.

Nothing is editable until the stored book has arrived, so a tap during a slow
load cannot write the factory roster over the real one.

## Who can score

**PINs are currently OFF.** Anyone who can open the page can enter scores, open a
round and lock it. Flip `PINS_ENABLED` in `src/data.js` to `true` and rebuild to
arm them — nothing else needs to change.

When on, three PINs, set by the master reviewer in Setup:

- **Master** — opens and locks rounds, reopens a locked round, reads and changes every PIN
- **Scorer 1** and **Scorer 2** — open rounds, enter scores, lock a round

A round must be *opened* with a PIN before anything can be entered, and the PIN is
required again to *lock and conclude* it. Everyone without a PIN reads the whole book
and writes nothing.

A signed-in role is remembered on that device until you sign out.

This is a courtesy lock, not security. The PINs live in the shared database and a
determined reader can find them in the page. They exist to stop an accidental tap,
not an attacker.

## Data provenance

A course card is locked while it is verified: par, stroke index and both
yardages read as plain figures and cannot be edited. Reopening it asks for a
scorer or master PIN once PINs are armed — one PIN, once. The card then locks
itself again when that scorer leaves Course Setup or switches to the other
card, and **Done — lock card** closes it on the spot; neither costs a second
PIN. Verifying a card this device did not open still asks. The lock is enforced
on the write, not just on the controls.

Real and verified: both Cullinan Links scorecards (par, stroke index, White and Yellow
metres, course rating and slope), all 36 hole diagrams, the roster, the trip calendar,
the golf days and the first tee times.

Not in this repo: player scores. Cards start empty and fill in only from score entry.
The clock is the real one, in Antalya local time (UTC+3, no DST).

## Layout

```
src/data.js        courses, roster, calendar, rounds — the verified data
src/rules.js       competition rules and relief
src/engine.js      pure scoring: bands, caps, net, boards, match play
src/store.js       shared state over the artifact db, localStorage fallback
src/app.js         screens and dispatch
src/styles.css     design tokens, light and dark
src/index.html     page shell
src/assets/holes/  36 hole diagrams as extracted (PNG)
src/assets/web/    the same diagrams re-encoded for the page (WebP)
tools/build.py     inlines everything into dist/union-invitational.html
docs/              the original design canvas this was built from
```

## Tests

```sh
node tools/db-race-test.mjs    # shared-store writes survive a hostile database
node tools/mobile-audit.mjs    # no screen scrolls sideways; every tap target clears 44px
node tools/course-lock-test.mjs # a verified course card locks, and only a PIN moves that lock
node tools/no-clobber-test.mjs  # the stored tournament is never overwritten by the factory roster
```

The mobile audit loads the page through a wrapper carrying the same head the
artifact host adds — charset, viewport, reset. Without it a local file lays out
at 980px and scales down, so a phone test measures a shrunken desktop rather
than a phone.

The race test drives the real UI against a mocked shared store that behaves
badly on purpose:
it drops keys whose value is null, echoes a stale version of a document after a
write, and takes a realistic round trip to save. Both of the first two silently
reverted edits in earlier builds. Requires `npm install playwright`.

## Build

```sh
python3 tools/build.py            # rebuild the page
python3 tools/build.py --images   # also re-encode the diagrams (needs Pillow)
```

Output is `dist/union-invitational.html` — about 2 MB, self-contained apart from the
Google Fonts stylesheet.
