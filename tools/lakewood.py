#!/usr/bin/env python3
"""Lakewood Country Club, as eighteen drawings.

WHERE THIS COMES FROM. The commissioner walked the course in a golf GPS app
and sent the hole-by-hole flyovers. Those pictures are somebody else's
artwork and none of them is in this repository. What IS here is what they
told us about the golf course: which way each hole bends, how wide the
fairway runs, which side the water is on, where the sand sits and how far
out, and which side the trees line. Every number below was read off a
flyover by hand and written here in the drawing format src/holes3d.js
already understands, so the window builds Lakewood in our own renderer the
same way it builds Leatherhead.

Distances on those flyovers read FROM THE TEE, so a bunker at 279 on a 365
yard hole sits at t = 279/365 = 0.76 along the line. That is how every `t`
below was worked out.

Everything is a fraction of the hole's own length, so the shapes hold
whichever tee the group plays off.
"""
import json, math, re, pathlib

N = 24                      # samples along the line, as the LH tracer uses
OUT = pathlib.Path(__file__).resolve().parent.parent / 'src' / 'holes3d.js'
KEY = 'lakewood-country-club'

def smooth(stops, n=N):
    """A width profile from a few (t, value) stops, eased between them."""
    out = []
    for i in range(n):
        t = (i + .5) / n
        lo = max([s for s in stops if s[0] <= t], key=lambda s: s[0], default=stops[0])
        hi = min([s for s in stops if s[0] >= t], key=lambda s: s[0], default=stops[-1])
        if hi[0] == lo[0]:
            out.append(lo[1])
        else:
            u = (t - lo[0]) / (hi[0] - lo[0])
            u = u * u * (3 - 2 * u)                 # smoothstep
            out.append(lo[1] + (hi[1] - lo[1]) * u)
    return [round(v, 4) for v in out]

def line(t0, t1, dd, count=16, spread=.026):
    """A stand of trees down one side, from t0 to t1 at offset dd.

    Evenly spaced trees at one offset read as an orchard, not a wood. So the
    spacing and the offset both wander, on two incommensurate sines so the
    pattern never repeats, and every third tree stands a row further back."""
    out = []
    sgn = 1 if dd > 0 else -1
    for i in range(count):
        u = i / max(1, count - 1)
        u += math.sin(i * 1.7 + (1.3 if dd > 0 else 0)) * .45 / count   # uneven spacing
        t = t0 + (t1 - t0) * min(1, max(0, u))
        j = math.sin(i * 2.399 + (0.8 if dd > 0 else 0)) * spread
        if i % 3 == 2:
            j += sgn * spread * .55                                      # a second row behind
        out.append([round(t, 4), round(dd + j, 4)])
    return out

def box(t0, t1, d0, d1):
    """A water body as a four-corner outline in [t, offset]."""
    return [[t0, d0], [t1, d0], [t1, d1], [t0, d1]]

# The White tee, in metres, hole by hole, off the club's printed card. Only
# used to size the sand: a bunker is about so many metres across whether the
# hole is 127 metres or 475, so a size written as a fraction of the length
# would shrink the sand on the short holes to a speck.
WHITE_M = [374, 356, 127, 302, 179, 400, 452, 308, 453,
           355, 326, 186, 358, 435, 295, 326, 163, 475]

def bunk(t, d, L, rx=8.6, rz=5.6):
    """Sand at `t` along and `d` across, sized in metres."""
    return {'t': round(t, 4), 'd': round(d, 4),
            'rx': round(rx / L, 5), 'rz': round(rz / L, 5)}

# ---------------------------------------------------------------------------
# The eighteen, read off the flyovers.
#   cl      the line, [lateral, along], both as a fraction of the length
#   w       half-width stops along the line, (t, value)
#   trees   stands of trees, each (t0, t1, offset, count)
#   lakes   water, each a (t0, t1, near, far) box; negative is LEFT
#   bunkers sand, each (t, offset[, rx, rz])
#   amt     how thickly the hole is wooded; sideR how much of it is on the right
# Offsets are measured from the line, so they bend with the hole.
# ---------------------------------------------------------------------------
HOLES = {
 1: dict(note="par 4, SI 7. A gentle opener. Trees down the right, sand both sides of the green.",
    cl=[(0,0),(.01,.25),(.025,.5),(.03,.75),(.02,1)], w=[(0,.085),(.5,.088),(1,.09)],
    trees=[(.05,1,.105,18),(.45,1,-.125,8)], lakes=[], amt=.34, sideR=.72,
    bunkers=[(.93,-.075),(.94,.078)]),

 2: dict(note="par 4, SI 3. Water the whole left side, trees the whole right.",
    cl=[(0,0),(.02,.25),(.04,.5),(.035,.75),(.015,1)], w=[(0,.082),(.5,.086),(1,.084)],
    trees=[(.02,1,.105,20)], lakes=[(-.02,1.0,-.085,-.23)], amt=.46, sideR=.9,
    bunkers=[(.68,.095),(.93,.072)]),

 3: dict(note="par 3, SI 17. The lake runs wall to wall between the tee and a raised green.",
    cl=[(0,0),(0,.5),(0,1)], w=[(0,.09),(1,.09)],
    trees=[(0,.16,-.23,6),(0,.16,.23,6),(.66,1,-.32,8),(.66,1,.32,8)],
    lakes=[(.44,.86,-.34,.34),(.80,1.0,.17,.36)], amt=.42, sideR=.5,
    bunkers=[(.91,-.115),(.91,.115)]),

 4: dict(note="par 4, SI 15. A narrow straight corridor; the trees are the whole defence.",
    cl=[(0,0),(.005,.5),(0,1)], w=[(0,.07),(.5,.066),(1,.072)],
    trees=[(.03,1,-.088,22),(.03,1,.088,22)], lakes=[], amt=.78, sideR=.5,
    bunkers=[(.59,-.085),(.75,.085),(.95,.072)]),

 5: dict(note="par 3, SI 13. The long one, straight down an avenue of trees.",
    cl=[(0,0),(0,.5),(0,1)], w=[(0,.085),(1,.088)],
    trees=[(.02,1,-.098,18),(.02,1,.098,20)], lakes=[(.86,1.0,-.30,-.20)], amt=.64, sideR=.54,
    bunkers=[(.88,-.09),(.91,.095)]),

 6: dict(note="par 4, SI 1. Stroke one: a dogleg right with the creek on the inside of it.",
    cl=[(0,0),(0,.22),(.02,.44),(.08,.66),(.14,.85),(.16,1)], w=[(0,.086),(.5,.082),(1,.088)],
    trees=[(.02,1,-.125,22)], lakes=[(-.02,.42,.13,.29),(.40,.58,.05,.26)], amt=.52, sideR=.16,
    bunkers=[(.93,.095,12.5,6.5),(.995,-.08)]),

 7: dict(note="par 5, SI 9. Doglegs left and climbs to a green tucked in the corner.",
    cl=[(0,0),(0,.2),(-.02,.4),(-.08,.6),(-.14,.8),(-.17,1)], w=[(0,.09),(.5,.086),(1,.088)],
    trees=[(.02,1,-.12,22),(.1,1,.115,12)], lakes=[], amt=.5, sideR=.3,
    bunkers=[(.40,.095),(.62,-.115),(.94,-.08)]),

 8: dict(note="par 4, SI 11. Short, but a wall of trees down the left and no room right.",
    cl=[(0,0),(.01,.5),(.005,1)], w=[(0,.072),(.5,.068),(1,.074)],
    trees=[(.02,1,-.092,22),(.05,1,.098,16)], lakes=[], amt=.7, sideR=.34,
    bunkers=[(.78,.085),(.92,-.068),(.95,.072)]),

 9: dict(note="par 5, SI 5. Wide off the tee, then the lake takes the whole right side home.",
    cl=[(0,0),(.01,.25),(0,.5),(-.02,.75),(-.02,1)], w=[(0,.105),(.55,.078),(1,.095)],
    trees=[(.02,1,-.12,22)], lakes=[(.48,1.0,.13,.27)], amt=.48, sideR=.14,
    bunkers=[(.884,-.08),(.95,.085),(.97,-.09)]),

10: dict(note="par 4, SI 2. Uphill all the way to a crested green you must thread between sand.",
    cl=[(0,0),(-.025,.25),(-.045,.5),(-.035,.75),(-.02,1)], w=[(0,.095),(.5,.085),(1,.082)],
    trees=[(.02,1,-.108,20),(.3,1,.12,10)], lakes=[], amt=.44, sideR=.3,
    bunkers=[(.944,-.09,11.0,6.5),(.939,.078)]),

11: dict(note="par 4, SI 10. The lake holds the left for the first half; sand guards the right.",
    cl=[(0,0),(.02,.25),(.04,.5),(.035,.75),(.02,1)], w=[(0,.088),(.5,.085),(1,.086)],
    trees=[(.05,1,.11,20),(.8,1,-.14,8)], lakes=[(-.02,.52,-.26,-.11)], amt=.44, sideR=.8,
    bunkers=[(.76,.09),(.926,.075)]),

12: dict(note="par 3, SI 12. Miss it left and it is wet; miss it right and it is sand.",
    cl=[(0,0),(0,.5),(0,1)], w=[(0,.082),(1,.08)],
    trees=[(.78,1,-.30,5),(.78,1,.30,6)], lakes=[(-.02,.62,-.33,-.16),(.86,1.0,-.40,-.26)],
    amt=.2, sideR=.55,
    bunkers=[(.912,-.075),(.984,.085),(.995,.115)]),

13: dict(note="par 4, SI 4. Long, straight and uphill, with sand on both sides of the drive.",
    cl=[(0,0),(.005,.5),(0,1)], w=[(0,.09),(.6,.082),(1,.074)],
    trees=[(.02,1,-.105,22),(.02,1,.105,22)], lakes=[], amt=.6, sideR=.5,
    bunkers=[(.598,.105,11.5,6.8),(.695,-.11),(.93,-.05),(.95,-.078),(.96,.08)]),

14: dict(note="par 5, SI 14. A long avenue of trees, no water, a waist in the middle.",
    cl=[(0,0),(.01,.5),(.015,1)], w=[(0,.092),(.55,.072),(1,.088)],
    trees=[(.02,1,-.105,20),(.02,1,.108,24)], lakes=[], amt=.68, sideR=.58,
    bunkers=[(.949,-.08,12.5,5.4),(.962,.085)]),

15: dict(note="par 4, SI 18. The kindest hole on the card, but three bunkers around the green.",
    cl=[(0,0),(-.01,.5),(-.015,1)], w=[(0,.095),(.5,.09),(1,.086)],
    trees=[(.02,1,-.105,20),(.05,1,.108,18),(.9,1,-.16,6)], lakes=[], amt=.56, sideR=.5,
    bunkers=[(.88,-.135),(.90,-.075),(.92,.09)]),

16: dict(note="par 4, SI 8. Bends left and climbs; one big bunker owns the right of the drive.",
    cl=[(0,0),(-.015,.25),(-.035,.5),(-.045,.75),(-.05,1)], w=[(0,.088),(.5,.084),(1,.082)],
    trees=[(.02,1,-.108,22),(.15,1,.125,12)], lakes=[], amt=.5, sideR=.28,
    bunkers=[(.60,.115,12.5,7.2),(.945,.08)]),

17: dict(note="par 3, SI 16. A shelf green with sand out front on both sides.",
    cl=[(0,0),(0,.5),(0,1)], w=[(0,.085),(1,.082)],
    trees=[(.35,1,.125,14),(.85,1,-.17,6)], lakes=[], amt=.36, sideR=.78,
    bunkers=[(.874,.105,12.5,7.5),(.934,-.115)]),

18: dict(note="par 5, SI 6. Uphill home, with a pair of bunkers pinching the lay-up.",
    cl=[(0,0),(.015,.25),(.04,.5),(.03,.75),(.01,1)], w=[(0,.095),(.5,.086),(1,.082)],
    trees=[(.02,1,-.105,22),(.02,1,.108,22)], lakes=[], amt=.58, sideR=.5,
    bunkers=[(.815,-.095),(.88,.09),(.96,-.075),(.965,.08)]),
}


def build(n, h):
    L = WHITE_M[n - 1]
    half = smooth(h['w'])
    # A fairway with ruler-straight edges does not look like a fairway. Let it
    # breathe a yard or two, slowly, so the mown line wanders the way a mown
    # line does. Deterministic, so a hole is the same hole every time.
    half = [round(v * 1.16 + .009 * math.sin((i + .5) / N * 4.3 + n * 1.9), 4)
            for i, v in enumerate(half)]
    # A fairway is only as generous as the corridor around it. Drawn too
    # wide, the ground reads as a field with a thread of fairway down it,
    # which is not what any of these holes look like from the air. So the
    # tree line is placed off the mown edge — far enough to leave rough,
    # close enough to make a corridor — and always OUTSIDE the sand, or the
    # wood swallows the bunker.
    widest = {-1: 0., 1: 0.}
    for b in h['bunkers']:
        sg = -1 if b[1] < 0 else 1
        widest[sg] = max(widest[sg], abs(b[1]))
    base = max(half) * .62 + .026          # just off the mown edge
    trees = []
    for (t0, t1, d, c) in h['trees']:
        sg = -1 if d < 0 else 1
        want = max(base, widest[sg] + .028)
        # a stand the hole deliberately puts well back — behind a green, or
        # across water — keeps the distance it was given
        trees.append((t0, t1, sg * (abs(d) if abs(d) > base * 1.6 else want), c))
    h = dict(h, trees=trees)
    # the ground has to reach past the furthest sand on each side, or
    # fromDrawing drops that bunker for sitting off the edge of the island.
    def edge(sign):
        out = []
        for i in range(N):
            t = (i + .5) / N
            w = half[i] + .034
            for b in h['bunkers']:
                bt, bd = b[0], b[1]
                if (bd < 0) == (sign < 0) and abs(bt - t) < .14:
                    w = max(w, abs(bd) + .030)
            for (t0, t1, d0, d1) in h['lakes']:
                for d in (d0, d1):
                    if (d < 0) == (sign < 0) and t0 - .05 <= t <= t1 + .05:
                        w = max(w, abs(d) + .024)
            for (t0, t1, d, _c) in h['trees']:
                if (d < 0) == (sign < 0) and t0 - .05 <= t <= t1 + .05:
                    w = max(w, abs(d) + .022)
            out.append(round(w, 4))
        return out
    stands = []
    for (t0, t1, d, c) in h['trees']:
        stands += line(t0, t1, d, c)
    return {
        'cl': [[round(a, 4), round(b, 4)] for a, b in h['cl']],
        'half': half, 'edgeL': edge(-1), 'edgeR': edge(1),
        'lakes': [box(*L) for L in h['lakes']],
        'stands': stands,
        'bunkers': [bunk(b[0], b[1], L, *b[2:]) for b in h['bunkers']],
        'treesR': h['sideR'], 'treeAmt': h['amt'],
    }

def main():
    rows = []
    for n in range(1, 19):
        h = HOLES[n]
        rows.append('  /* %d — %s */\n  "%s_%d": %s,' % (
            n, h['note'], KEY, n, json.dumps(build(n, h), separators=(',', ':'))))
    block = ('/* TRACED_LKW:BEGIN  built by tools/lakewood.py — do not edit by hand */\n'
             'export const TRACED_LKW = {\n' + '\n'.join(rows) + '\n};\n'
             '/* TRACED_LKW:END */')
    src = OUT.read_text()
    if 'TRACED_LKW:BEGIN' in src:
        src = re.sub(r'/\* TRACED_LKW:BEGIN.*?/\* TRACED_LKW:END \*/', block, src, flags=re.S)
    else:
        src = src.replace('/* TRACED_LH:END */', '/* TRACED_LH:END */\n\n' + block)
    OUT.write_text(src)
    print('lakewood: 18 holes written into', OUT)

if __name__ == '__main__':
    main()
