# Where a hole's shape comes from

A hole in the window can stand on one of three kinds of ground. The window
always says which, on the glass, under the hole.

| On the glass | What it means |
| --- | --- |
| *(nothing)* | Surveyed. Two real fixes, tee and green, in `config.holeGeo`. |
| **Traced from the club's own hole map · not surveyed yet** | Measured off the maps the club publishes for its own members. |
| **Traced from the drawing · not surveyed yet** | Measured off the thirty-six Belek drawings made for the 2026 book. |
| **Shape drawn from the card · not surveyed yet** | Nothing traced: a plausible hole of that par and length. |

Every course starts at the bottom of that table and can be moved up. Nothing is
ever presented as a survey that is not one.

## Tracing a club's published hole maps

Plenty of clubs put a map of each hole on their own website. Those maps are
drawn from above and close enough to scale to be measured. `tools/trace-lh.py`
reads them and writes out **geometry** — where the turf runs, which way the
hole bends, where the short grass, the green, the sand, the water and the trees
are, each as a fraction of the hole's own length.

**The club's pictures are not copied and never ship.** They are downloaded to a
scratch directory, measured, and left there. Only the numbers go into the repo,
the same way a yardage book records a hole without reproducing anybody's
photograph. The length is still the member's own card: `holes3d.js` scales
every number by the yardage they entered, so the same traced shape serves the
white, yellow and red tees.

### Doing it for a course

1. Find the club's hole pages and fetch the maps into a scratch directory as
   `hole-1.png` … `hole-18.png`. Keep them out of the repository.

2. Look at the eighteen first. A club draws all its maps to one house style,
   and the one thing the colours cannot tell you is which end is the tee,
   because a tee box and a putting green are painted the same. Mark the ends:

   ```
   python3 tools/trace-lh.py --course <slug> --maps <dir> --json /dev/null
   ```

   then read `--green-end` off the maps: `hi` if the green is at the
   right-and-down end of each hole, `lo` if it is the other way. `END` at the
   top of the tool names the odd hole that breaks its club's own habit.

3. Trace, and check it by eye — never skip this:

   ```
   python3 tools/trace-lh.py    --course <slug> --maps <dir> --green-end hi
   python3 tools/trace-lh-qa.py --course <slug> --maps <dir> --green-end hi --out <dir>/qa
   ```

   The QA tool lays the trace back over each map: the line from tee to green,
   the green's outline, the sand, the water, the fairway. Open `qa/sheet.png`
   and look at all eighteen. A green on the wrong end, or a centreline that
   misses the dogleg, has to be fixed before it ships — a hole that claims a
   shape it has not got is worse than one that admits it was drawn from the
   card.

4. The slug is the course's name, lowercased, with runs of anything that is not
   a letter or a digit turned into a hyphen — what `courseSlug` in `club.js`
   makes of the name a member types. `Leatherhead Golf Club` is
   `leatherhead-golf-club`. Get it wrong and the shapes are simply never found:
   the hole falls back to being drawn from the card, which is safe but pointless.

### Leatherhead, as it was done

```
python3 tools/trace-lh.py    --course leatherhead-golf-club --maps <dir> --green-end hi
python3 tools/trace-lh-qa.py --course leatherhead-golf-club --maps <dir> --green-end hi --out <dir>/qa
```

Maps from the club's own hole pages, `theleatherheadclub.com/hole_1` … `/hole_18`.
All eighteen are drawn tee at the upper-left, green at the lower-right, so
`--green-end hi` and no per-hole exceptions.

## Surveying a hole properly

Two fixes per hole, tee and green, in `config.holeGeo[courseKey][n]` as
`{tee: [lat, lon], green: [lat, lon]}`. With both, `geoOf` reports the hole
surveyed, the "not surveyed yet" line goes, and the locate button puts the
member's own fix on the ground instead of reading from the tee. Thirty-six
numbers finish a course.

## Running it at all

`numpy` and a working Pillow are needed, and the system Pillow in the cloud
container is broken, so both go in a scratch directory:

```
python3 -m pip install --target <scratch>/pylib numpy pillow
export PYTHONPATH=<scratch>/pylib
```
