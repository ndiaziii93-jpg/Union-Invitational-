# The stop covers

One picture a stop for the band at the head of the You tab, and Las Vegas
for the HQ tab. 1400 × 786 WebP, 36 to 59 KB each, which is what flat
arcade art costs.

**The direction.** Retro video-game cabinet art: a glowing fairway grid
running to a banded pixel sun, a dotted flight arc, scanlines. It is on the
nose on purpose, because these competitions really are played virtually, on
a screen, on eleven different home courses. Earlier passes were a painted
travel poster and a gold club crest; both were handsome and both read as a
ceremony rather than a game.

**The recipe**, so the ones still to come match:

* the same glowing grid, banded sun, dotted flight arc and scanlines every
  time; only the weather and the accent colour change
* deep pine green and warm cream as the base, one bright accent a month:
  gold and red in December, ice blue in January, hot pink in February, and
  orange and neon pink over the Strip for Vegas
* the sun, the flag and the ball right of centre, the left third dark and
  flat, because the kicker, the headline and the day's one button are laid
  over it
* the horizon across the vertical middle, so one picture survives the
  phone's 2:1 crop and the laptop's 4.4:1 band
* no words, no letters, no numbers: the headline is the book's

**How the book finds them.** By the stop's own id. The Merry Mulligan Open
is `mulligan`, so its cover is `stop_mulligan`; the season's own is
`stop_vegas`. A stop can name a different one in its `art` field, a key or
a link, which the commissioner sets under Manage without a new build.

`renditions/` and `renditions2/` hold the eighteen that were not chosen.
Full-resolution originals are in the commissioner's Blueprint Studio
library.

## The mascot

He belongs to the TOURNAMENT, not to the app. One character — a golf ball for
a head, a wry grin, flat bold outlines, pine green and cream — in different
clothes for each stop, so a tournament looks like itself:

| File | Worn for | Dressed in |
|---|---|---|
| `mascot_mulligan` | The Merry Mulligan Open, December | santa hat, snowflake jumper, scarf, holly on the club |
| `mascot_frostbite` | The Frostbite Open, January | bobble hat, quilted jacket, mittens, a puff of cold breath, an icicle on the club head |
| `mascot_sweetheart` | The Sweetheart Scramble, February | flat cap, a heart on the sweater, a rose at the collar |
| `mascot_vegas` | Las Vegas 2027, and anything with no drawing of its own | cowboy hat, bolo tie, boots, club over the shoulder |

`mascot_hello` is the older neutral drawing, kept only as a last fallback.

**How the book finds them.** By the stop's own id, the same way the covers
work: `mascotFor(stop)` looks for `mascot_<stop id>` and falls back to Vegas.
Adding a stop called `putterbowl` and dropping in `mascot_putterbowl.webp` is
the whole of it — no code to change.

Transparent WebP, 470px, 38–68 KB each, so they drop onto paper without a box
round them. They turn up twice: over the course form, and again in the gold
panel the moment a card goes on the board.

**Re-encoding.** `tools/build.py` skips the image table when `src/assets/
images.js` already exists, so a new or changed drawing needs
`python3 tools/build.py --images` or it will not reach the app.
