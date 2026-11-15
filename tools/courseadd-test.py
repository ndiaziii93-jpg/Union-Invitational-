#!/usr/bin/env python3
"""READING A PUBLISHED SCORECARD.

tools/course-add.py is what puts a club in the book without anybody typing
fifty-four numbers. The numbers it reads decide which holes a member gets a
shot on for a whole season, so it is held to two things: it must read the real
shapes clubs actually publish, and it must refuse a card it cannot vouch for.

The first fixture is the shape Leatherhead's own site uses — one row per hole,
the tees across the top, each followed by its own Par and SI, and a <thead>
whose cells sit loose with no <tr> round them. The second is the other common
shape — one column per hole, with a Par row, a Handicap row and a row per tee.
The rest are cards that are wrong in the ways real cards are wrong.

Run: python3 tools/courseadd-test.py
"""
import importlib.util, io, os, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location('course_add', os.path.join(ROOT, 'tools', 'course-add.py'))
CA = importlib.util.module_from_spec(spec)
spec.loader.exec_module(CA)

fails = []
def ok(name, got, want):
    good = got == want
    print(('  PASS  ' if good else '  FAIL  ') + name + '  got ' + repr(got) + ('' if good else '  want ' + repr(want)))
    if not good:
        fails.append(name)

PAR_W = [5, 3, 4, 5, 4, 4, 4, 5, 3, 4, 4, 3, 4, 4, 3, 5, 4, 3]
SI_W = [18, 8, 4, 14, 10, 2, 12, 6, 16, 1, 11, 5, 15, 13, 7, 3, 17, 9]
YDS_W = [483, 176, 402, 507, 361, 447, 372, 534, 188, 423, 284, 196, 255, 296, 198, 503, 300, 203]
PAR_R = [4, 3, 4, 4, 4, 4, 4, 5, 3, 4, 4, 3, 4, 4, 3, 5, 4, 3]
SI_R = [9, 15, 7, 1, 17, 3, 11, 5, 13, 2, 14, 12, 18, 10, 4, 8, 16, 6]
YDS_R = [429, 142, 338, 433, 292, 398, 345, 491, 162, 370, 245, 166, 248, 278, 175, 479, 282, 182]


def rows_are_holes(si_w=SI_W, par_w=PAR_W):
    """One row per hole, two tees across, loose <th> in the head."""
    head = "<thead><th>Hole</th><th>White</th><th>Par</th><th>SI</th><th>Red</th><th>Par</th><th>SI</th></thead>"
    body = ''.join("<tr><td>%d</td><td>%d</td><td>%d</td><td>%s</td><td>%d</td><td>%d</td><td>%d</td></tr>"
                   % (i + 1, YDS_W[i], par_w[i], si_w[i], YDS_R[i], PAR_R[i], SI_R[i]) for i in range(18))
    # a club prints Out / In / Total lines in the middle of the card
    body += "<tr><td>Out</td><td>3470</td><td>37</td><td></td><td>3030</td><td>35</td><td></td></tr>"
    return "<html><table>" + head + "<tbody>" + body + "</tbody></table></html>"


def rows_are_measures():
    """One column per hole: a Par row, a Handicap row, a row per tee."""
    hdr = '| Hole | ' + ' | '.join(str(i + 1) for i in range(18)) + ' |'
    sep = '|' + '---|' * 19
    par = '| Par | ' + ' | '.join(str(p) for p in PAR_W) + ' |'
    hcp = '| Handicap | ' + ' | '.join(str(s) for s in SI_W) + ' |'
    whi = '| White | ' + ' | '.join(str(y) for y in YDS_W) + ' |'
    red = '| Red | ' + ' | '.join(str(y) for y in YDS_R) + ' |'
    return '\n'.join(['some prose', '', hdr, sep, par, hcp, whi, red, '', 'more prose'])


def read(doc, suffix='.html'):
    fd, p = tempfile.mkstemp(suffix=suffix)
    os.close(fd)
    io.open(p, 'w', encoding='utf-8').write(doc)
    try:
        return CA.read(p)
    finally:
        os.remove(p)


print("the shape a club's own site uses")
cards = read(rows_are_holes())
ok('both tee sets are found, named off the heading', [c['tee'] for c in cards], ['White', 'Red'])
w = next(c for c in cards if c['tee'] == 'White')
r = next(c for c in cards if c['tee'] == 'Red')
ok('the white card comes back whole', [[h['par'] for h in w['holes']], [h['si'] for h in w['holes']], [h['y'] for h in w['holes']]],
   [PAR_W, SI_W, YDS_W])
# a tee's Par and SI belong to the tee they sit under, not to the first one
ok('the red tees keep their OWN par and index', [[h['par'] for h in r['holes']], [h['si'] for h in r['holes']]], [PAR_R, SI_R])
ok('both are usable', [CA.verdict(w), CA.verdict(r)], ['', ''])
ok('the Out line is not mistaken for a hole', len(w['holes']), 18)

print('\nthe shape a scorecard site uses')
cards = read(rows_are_measures(), '.md')
ok('a tee row each, the par and index rows shared', [c['tee'] for c in cards], ['White', 'Red'])
w = next(c for c in cards if c['tee'] == 'White')
ok('and the numbers land on the right holes',
   [[h['par'] for h in w['holes']], [h['si'] for h in w['holes']], [h['y'] for h in w['holes']]],
   [PAR_W, SI_W, YDS_W])

print('\ncards it must refuse')
# The stroke index is the one number the book cannot do without, so a card
# missing it, or carrying a broken one, is reported rather than patched.
no_si = read(rows_are_holes(si_w=[''] * 18))
ok('no stroke index at all', CA.verdict(next(c for c in no_si if c['tee'] == 'White')), 'no stroke index on this card')
dup = SI_W[:]; dup[5] = dup[0]
twice = read(rows_are_holes(si_w=dup))
ok('an index used twice', CA.verdict(next(c for c in twice if c['tee'] == 'White')), 'the stroke index is not 1 to 18 once each')
odd = PAR_W[:]; odd[3] = 9
badpar = read(rows_are_holes(par_w=odd))
ok('a par of 9', CA.verdict(next(c for c in badpar if c['tee'] == 'White')), 'a par is outside 3 to 6')
short = rows_are_holes().replace("<tr><td>18</td>", "<tr><td>99</td>")
ok('a card of seventeen holes', CA.verdict(read(short)[0]), 'a par is missing')
ok('a page with no card at all', read('<html><p>no tables here</p></html>'), [])

print('\nwhat it would write')
entry = CA.js_entry('x-white', "O'Hara Golf Club", 'Sligo, Ireland', 'https://example.com/card', w)
ok('the club name is escaped, so an apostrophe cannot break the file', "\\'Hara" in entry, True)
ok('the source page is recorded with the card', "src: 'https://example.com/card'" in entry, True)
ok('and the eighteen pars go in as the card has them', ('[' + ', '.join(map(str, PAR_W)) + ']') in entry, True)

print('\n' + (str(len(fails)) + ' FAILED: ' + ' | '.join(fails) if fails else '0 fails'))
sys.exit(1 if fails else 0)
