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

| File | Bert | Worn for | Dressed in, and how he stands |
|---|---|---|---|
| `mascot_house` | Union Bert | year round, and any stop with no drawing of its own | The house one — a polo and no occasion. |
| `mascot_mulligan` | Merry Mulligan Bert | The Merry Mulligan Open, 2026-12 | Santa hat, snowflake jumper, a sprig of holly. |
| `mascot_frostbite` | Frostbite Bert | The Frostbite Open, 2027-01 | Bobble hat, puffer, and a club with an icicle on it. |
| `mascot_sweetheart` | Sweetheart Bert | The Sweetheart Scramble, 2027-02 | Flat cap, a rose, and a heart on his jumper. |
| `mascot_lucky` | Lucky Links Bert | The Lucky Links Classic, 2027-03 | Emerald waistcoat and a clover, mid heel-click. |
| `mascot_bloom` | Bloom Bert | The Bloom Invitational, 2027-04 | Straw boater and pink argyle, down on a knee reading a putt. |
| `mascot_fiesta` | Fiesta Bert | The Fairway Fiesta, 2027-05 | Serape and pompoms, dancing with the club overhead. |
| `mascot_summer` | Summer Bert | The Summer Swing, 2027-06 | Bucket hat and shorts, a hand up shading his eyes. |
| `mascot_firecracker` | Firecracker Bert | The Firecracker Cup, 2027-07 | Stars, stripes and a sparkler, at the top of the follow-through. |
| `mascot_dogdays` | Dog Days Bert | The Dog Days Derby, 2027-08 | Visor, towel and one bead of sweat, sat flat on the ground. |
| `mascot_harvest` | Harvest Bert | The Harvest Classic, 2027-09 | Tweed and plus fours, arms folded, surveying. |
| `mascot_pumpkin` | Pumpkin Bert | The Pumpkin Putter Open, 2027-10 | Cape and a lantern, creeping up on tiptoes. |
| `mascot_turkeyshoot` | Turkey Shoot Bert | nothing — see below | Buckled pilgrim hat, stood over the ball. |
| `mascot_santa` | Santa Swing Bert | The Santa Swing, 2027-12 | The whole red suit, striding with the sack over his shoulder. |
| `mascot_vegas` | Desert Showdown Bert | Las Vegas 2027, the week itself | The hat and the boots. Las Vegas only. |

**Turkey Shoot Bert wears no occasion.** The Turkey Shoot was dropped: it fell
in November beside the week in Las Vegas, and nobody wanted to be asked for a
card days before the flight. The drawing stayed, with its `stop` set to `null`,
so he is simply a costume anybody may choose. If the tournament ever comes
back, give him his stop id again and nothing else needs doing.

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
house         49.5  20.5  15.0
mulligan      48.9  24.4  16.3
frostbite     37.5  27.5  14.0
sweetheart    49.0  23.5  14.5
lucky         51.0  25.0  15.0
bloom         44.5  22.0  15.0
fiesta        48.5  22.5  15.0
summer        45.5  21.0  15.0
firecracker   50.0  21.0  15.0
dogdays       47.0  20.5  15.0
harvest       46.0  20.0  15.0
pumpkin       48.5  22.0  15.0
turkeyshoot   50.0  23.0  15.0
santa         47.5  21.0  15.0
vegas         45.0  24.0  15.0
```

**EVERY BERT STANDS DIFFERENTLY**, which is the point of him — a heel-click,
a crouch over a putt, a man sat flat on the ground — and the pose moves his
head as much as the hat does. **A NEW BERT NEEDS HIS OWN THREE NUMBERS**, and
they can only be measured once the drawing is final. Measure them by laying a circle
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
