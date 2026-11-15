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

## Union Bert

The character has a name now: **Union Bert**. He belongs to the TOURNAMENT,
not to the app — one character, a golf ball for a head, a wry grin, flat bold
outlines, pine green and cream, in different clothes for each stop, so a
tournament looks like itself.

| File | Bert | Worn for | Dressed in |
|---|---|---|---|
| `mascot_house` | Union Bert | year round, and any stop with no drawing of its own | green polo, cream trousers, no occasion |
| `mascot_mulligan` | Merry Mulligan Bert | The Merry Mulligan Open, December | santa hat, snowflake jumper, scarf, holly on the club |
| `mascot_frostbite` | Frostbite Bert | The Frostbite Open, January | bobble hat, quilted jacket, mittens, a puff of cold breath, an icicle on the club head |
| `mascot_sweetheart` | Sweetheart Bert | The Sweetheart Scramble, February | flat cap, a heart on the sweater, a rose at the collar |
| `mascot_vegas` | Desert Showdown Bert | Las Vegas 2027 | cowboy hat, bolo tie, boots, club over the shoulder |

`mascot_hello` is the oldest drawing, in a different hand entirely. It is kept
only as a last fallback and is not offered in the picker.

**How the book finds them.** By the stop's own id, the same way the covers
work: `mascotFor(stop)` looks for `mascot_<stop id>` and falls back to the
house Bert. Adding a stop called `putterbowl` and dropping in
`mascot_putterbowl.webp` is the whole of it — no code to change.

**Where a face goes.** A member can set their own photograph into Bert's head.
Where that circle sits is different for every costume, because the hat sits
differently on each of them, so each Bert carries three numbers in `C.BERTS`:
the centre of the face as a share of the picture's width and height, and its
radius as a share of the width again.

```
house       49.5  20.5  15.0
mulligan    48.9  24.4  16.3
frostbite   37.5  27.5  14.0
sweetheart  49.0  23.5  14.5
vegas       45.0  24.0  15.0
```

**A NEW BERT NEEDS HIS OWN THREE NUMBERS.** Measure them by laying a circle
over the drawing and looking: it has to fall inside the ball and below the
brim of whatever he is wearing, or a photograph eats the costume. A Bert
without them falls back to the house figures and will very likely be wrong.

Transparent WebP, 560px tall, 38–54 KB each, so they drop onto paper without a
box round them. Bert turns up on the course form, in the gold panel the moment
a card goes on the board, in the corner of every Clubhouse screen, on the
Golfers tiles and on the player card.

**Re-encoding.** `tools/build.py` skips the image table when `src/assets/
images.js` already exists, so a new or changed drawing needs
`python3 tools/build.py --images` or it will not reach the app.
