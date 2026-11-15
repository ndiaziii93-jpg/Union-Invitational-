# Putting a club in the book

A member should not copy fifty-four numbers off a scorecard, and nobody should
pay a subscription so that twenty-three people can enter their home clubs once.
Almost every club publishes its own card on its own website. That is the most
authoritative copy there is, and `tools/course-add.py` reads it.

## The shape of it

Fetching is not the hard part, and it is different every time — a club page, a
scorecard site, a PDF, a photo, a database that grants access later. So the
tool takes a **file** that already holds the card and the fetching is done
outside it, by whatever suits. What lives inside the tool is the part that has
to be right every time: reading the numbers, and refusing a card it cannot
vouch for.

```
# 1. get the card into a file, however you like
curl -sS -o card.html "https://theclub.example/the_course"

# 2. read it and look at what came out
python3 tools/course-add.py --from card.html \
    --name "Leatherhead Golf Club" --place "Leatherhead, Surrey, England" \
    --source "https://theclub.example/the_course"

# 3. check the numbers against the club's own page, then
python3 tools/course-add.py --from card.html ... --write
python3 tools/build.py && python3 tools/sandbox.py
```

For a club whose site the container cannot reach, scrape it to Markdown with
whatever tool is to hand and pass that file instead: the reader takes HTML or
Markdown.

## What it reads

Both shapes clubs actually print:

- **One row per hole** — `Hole | White | Par | SI | Yellow | Par | SI | …`.
  Each tee's Par and SI belong to the tee they sit under, so a course whose
  reds play a different par and a different stroke index comes out right.
  Leatherhead is one of those: par 71 off the whites, 69 off the reds, and the
  reds make the 4th the hardest hole rather than the 10th.
- **One column per hole** — a `Par` row, a `Handicap` row, and a row per tee.

It survives the things real pages do: a `<thead>` whose cells sit loose with no
`<tr>`, `Out`/`In`/`Total` lines in the middle of the card, thousands commas,
and cells that ship yards and metres run together (`505462` is 505 yards and
462 metres, not a 5,054-yard hole).

Where a card prints two pars, men's and ladies', it takes the men's and says so.

## What it refuses

The stroke index is the one number the book cannot do without. It decides which
holes a member gets a shot on, so a wrong one quietly spoils every net score
all season.

A tee set is written only if it is **eighteen holes, every par between 3 and 6,
and every index 1 to 18 exactly once**. Anything else is printed with the reason
and left out — no stroke index, an index used twice, a par of 9, a short card.
Nothing is ever guessed to make a card look complete: a missing number stays
missing, and the member fills it in from their own scorecard.

That is why step 3 exists. The tool checks that a card is *coherent*; only a
person can check it is *correct*. Compare the printed card against the club's
own page before `--write`.

## What goes in

One entry per usable tee set, in `COURSE_LIB` in `src/club.js`, keyed
`<club>-<tee>`, with the page it came from recorded in `src`. From then on the
course is in the book: found by the search instantly, with no network, by every
member.

## Checking it

`python3 tools/courseadd-test.py` runs the reader over both shapes and over
cards that are wrong in the ways real cards are wrong. The Leatherhead card is
the control: the tool reads the club's live page back to exactly the three
cards that were typed in by hand.

## Why there is no live course API

There is one wired up — `supabase/functions/courses/index.ts`, against a
30,000-course database — and it is **off**, because it needs a paid key. See
`docs/SETUP.md` §7. It costs nothing sitting there, and the book works without
it: the search holds what we have put in, which is instant, works with no
signal, and grows by itself as members save their own clubs.

`opengc.net` is an open, community-built course database with the right data
and a free research tier, by request. If the book ever wants thirty thousand
courses rather than the twenty the group plays, that is the door to knock on,
and the right thing to do in return is contribute the cards we have checked.
