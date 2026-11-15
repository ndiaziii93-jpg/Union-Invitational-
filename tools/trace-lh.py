#!/usr/bin/env python3
"""Trace a club's own published hole maps into the shapes the 3D hole is built from.

WHERE THE SHAPES COME FROM. The club publishes a map of each hole on its own
website. This reads those maps and measures them: where the turf runs, which
way the hole bends, where the short grass, the green, the sand, the water and
the trees are. What it writes out is geometry — numbers, as a fraction of the
hole's own length — not the club's picture. The picture is never copied into
the app and never shipped; only the shape of the ground is, the same way a
yardage book records a hole without reproducing anyone's photograph. The raw
maps stay outside the repository.

The maps are drawn from above with the tee at one end and the green at the
other, and they are drawn close enough to scale that a fairway measures like a
fairway and a green like a green. The length is still the card's: everything
here is normalised to the line from the tee to the green, and holes3d.js
multiplies it by the yardage the member entered.

The hard part is which end is which, because a tee box and a putting green are
painted the same colour. Three things tell them apart — the green has sand by
it, a tee is a long rectangle while a green is round, and the fairway runs out
towards the green. Where those disagree, END below says which end is the green
and the trace does as it is told.

  Run:  python3 tools/trace-lh.py --course leatherhead --maps <dir>

<dir> holds hole-1.png ... hole-18.png as the club publishes them. The result
is written into the TRACED_LH block of src/holes3d.js.
"""
import argparse, json, os, re, sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'src')
BINS = 24
GREEN_T = 0.965          # where the model puts the green along the line

# WHICH END IS THE GREEN. A tee box and a putting green are painted the same
# colour, so the map alone cannot always say. A club draws its eighteen maps to
# one house style, so --green-end names that style once (Leatherhead draws every
# hole with the tee at the upper-left end of the axis and the green at the
# lower-right, so it is 'hi'), and END names the odd hole that breaks it.
# 'lo' is the low end of the axis fixed in axis() below, 'hi' the high end.
END = {}


# ---------- the geometry, shared with tools/trace-holes.py ----------
def _helpers():
    """trace-holes.py is not importable by name, so load it by path."""
    import importlib.util
    p = os.path.join(ROOT, 'tools', 'trace-holes.py')
    spec = importlib.util.spec_from_file_location('trace_holes', p)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


H = _helpers()
comps, smooth, fill, grow, close = H.comps, H.smooth, H.fill, H.grow, H.close
outline, simplify, boxblur, otsu = H.outline, H.simplify, H.boxblur, H.otsu


def biggest(mask):
    """The largest blob of a mask, alone."""
    best = None
    for pts in comps(mask):
        if best is None or len(pts) > len(best):
            best = pts
    out = np.zeros_like(mask)
    if best:
        out[[p[0] for p in best], [p[1] for p in best]] = True
    return out


def holes_fill(mask):
    """A mask with its interior holes filled: flood the background from the border."""
    pad = np.pad(mask, 1)
    free = np.zeros_like(pad)
    from collections import deque
    q = deque([(0, 0)])
    free[0, 0] = True
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < pad.shape[0] and 0 <= nx < pad.shape[1] and not pad[ny, nx] and not free[ny, nx]:
                free[ny, nx] = True
                q.append((ny, nx))
    return ~free[1:-1, 1:-1]


def erode(m, k=1):
    for _ in range(k):
        m = ~grow(~m)
    return m


def kbands(v, k=4, iters=30):
    """k brightness bands over one image's grass, as cuts between them.

    Otsu splits a histogram in two and guesses badly when rough outnumbers
    everything else; k means on the brightness alone lands on the bands a
    painter actually used — canopy, rough, semi rough, short grass — and the
    cuts are the midpoints between neighbouring centres.
    """
    v = np.asarray(v, float)
    c = np.percentile(v, np.linspace(5, 95, k))
    for _ in range(iters):
        lab = np.abs(v[:, None] - c[None, :]).argmin(1)
        for i in range(k):
            if (lab == i).any():
                c[i] = v[lab == i].mean()
        c.sort()
    return [(c[i] + c[i + 1]) / 2 for i in range(k - 1)], c


def masks(path):
    """Every surface on one published map, as a boolean mask.

    The map fades to white at its edge through a pale ring. That ring is not
    sand, not grass and not ground, and the quickest way to be rid of it is to
    build everything from the grass outwards: grass is green dominant, the ring
    is not, so the ring never gets in.
    """
    a = np.array(Image.open(path).convert('RGB')).astype(float)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = a.max(2), a.min(2)
    page = (mn > 226) & (mx - mn < 14)
    ink = close(~page, 2)

    water = ink & (b + 30 > g) & (b > r) & (mn < 215)
    bright = ink & (mx > 205)
    grass = ink & (g - b >= 30) & (g >= r - 10) & ~bright

    body = holes_fill(biggest(close(grass | water, 5)))
    water = water & body
    grass = grass & body
    inner = erode(body, 3)                               # the pale ring hugs the edge
    # SAND. A bunker is far paler than the shortest grass on the map — its core
    # runs to near white where mown grass tops out well below that — and it
    # keeps a warm cast, which is what parts it from the grey of a cart path.
    core = body & inner & bright & (g - b > 25)
    halo_ok = body & inner & (mx > 182) & (g - b > 22) & ~water
    sand = core                                          # grow the core out to the lip
    for _ in range(7):
        sand = sand | (grow(sand) & halo_ok)
    path = body & inner & bright & (g - b <= 25) & ~water

    gb = boxblur(np.where(grass, g, 0), 3) / np.maximum(boxblur(grass.astype(float), 3), 1e-6)
    cuts, cen = (kbands(gb[grass], 4) if grass.sum() > 400 else ([100, 130, 165], []))
    tree = grass & (gb <= cuts[0])
    mown = grass & (gb > cuts[-1])
    turf = (grass & ~tree) | sand | water                # what the hole is played over
    return dict(a=a, body=body, ink=ink, water=water, sand=sand, tree=tree, path=path,
                mown=close(mown, 1), turf=turf, greenish=grass, inner=inner,
                gb=gb, cuts=cuts, cen=list(cen))


def axis(body):
    """The hole's long axis, from the shape of the ground.

    The sign a singular vector comes back with means nothing, so it is pinned
    here: the axis always points rightwards across the page, and downwards
    when the hole runs nearly straight up and down. That makes 'the low end'
    and 'the high end' the same two ends every time, which is what GREEN_END
    and END below are allowed to name.
    """
    ys, xs = np.nonzero(body)
    P = np.stack([xs, ys], 1).astype(float)
    C = P.mean(0)
    _, _, V = np.linalg.svd(P - C, full_matrices=False)
    u = V[0] / np.hypot(*V[0])
    if (u[0] if abs(u[0]) > 0.2 else u[1]) < 0:
        u = -u
    return C, u


def patches(m, C, u):
    """Every patch of short grass on the map, placed along the hole's axis.

    One of them is the fairway (much the biggest). Near the low end sit the
    tee boxes, long and straight-sided; near the high end sits the putting
    green, round and with sand beside it.
    """
    v = np.array([-u[1], u[0]])
    ys, xs = np.nonzero(m['body'])
    sall = (np.stack([xs, ys], 1) - C) @ u
    lo, hi = np.percentile(sall, 1), np.percentile(sall, 99)
    span = max(1.0, hi - lo)
    out = []
    for pts in comps(m['mown']):
        if len(pts) < 50:
            continue
        by = np.array([p[0] for p in pts], float)
        bx = np.array([p[1] for p in pts], float)
        q = np.stack([bx, by], 1) - C
        al, ac = q @ u, q @ v
        h = al.max() - al.min() + 1
        w = ac.max() - ac.min() + 1
        out.append(dict(n=len(pts), y=by, x=bx,
                        t=float((al.mean() - lo) / span),
                        run=float(h / span), across=float(w / span),
                        elong=max(h, w) / max(1.0, min(h, w)),
                        fill=len(pts) / (h * w),
                        c=np.array([bx.mean(), by.mean()])))
    out.sort(key=lambda z: -z['n'])
    return out, lo, hi, span


def pick_green(ps, m, C, u, span):
    """The putting green: a short-grass patch at the end of the hole, no wider
    than a green, with sand by it.

    Size alone does not find it. On a long hole the fairway is much the biggest
    patch; on a short one there is barely any fairway and the green complex IS
    the biggest patch. What always holds is the ground each covers: a fairway
    runs a long way along the hole, a green occupies a fifth of it at most in
    any direction. So a patch is judged by how far it reaches, not by its area.
    """
    if not ps:
        return None
    sy, sx = np.nonzero(m['sand'])
    sand = np.stack([sx, sy], 1).astype(float) if len(sx) else None
    best = None
    for z in ps:
        if z['n'] < 300 or z['t'] < 0.66 or z['elong'] > 2.6:
            continue
        if z['run'] > 0.24 or z['across'] > 0.24:        # that is fairway, not green
            continue
        near = 0
        if sand is not None:
            near = int((np.hypot(*(sand - z['c']).T) < 0.16 * span).sum())
        score = (min(z['n'], 6000) ** 0.6                 # size, with the gain flattening off
                 * (1.9 if near > 40 else 1.0)            # sand beside it: that is a green
                 * np.exp(-3.0 * (1.0 - min(z['t'], 1.0)))  # and it is at the end of the hole
                 / max(1.0, z['elong']))
        if best is None or score > best[0]:
            best = (score, z)
    if best:
        return tighten(best[1], m)
    # nothing green-shaped at the end: the last of the biggest patch stands in
    fair = ps[0]
    al = (np.stack([fair['x'], fair['y']], 1) - C) @ u
    keep = al >= np.percentile(al, 88)
    return dict(n=int(keep.sum()), y=fair['y'][keep], x=fair['x'][keep], t=0.95,
                run=0.1, across=0.1, elong=1.0, fill=1.0,
                c=np.array([fair['x'][keep].mean(), fair['y'][keep].mean()]), loose=True)


def tighten(z, m):
    """The putting surface inside the patch, without the apron around it.

    A green is painted brighter than the collar it sits in, and both come back
    as one patch. Keeping the brighter half of the patch, and then its largest
    piece, leaves the surface the yardages to the front and back are measured
    to, instead of a green a chipping area wider than it really is.
    """
    gb = m['gb'][z['y'].astype(int), z['x'].astype(int)]
    cut = np.percentile(gb, 45)
    keep = gb >= cut
    if keep.sum() < 150:
        return z
    sub = np.zeros_like(m['mown'])
    sub[z['y'][keep].astype(int), z['x'][keep].astype(int)] = True
    sub = biggest(close(sub, 1))
    ys, xs = np.nonzero(sub)
    if len(xs) < 150:
        return z
    out = dict(z)
    out.update(n=len(xs), y=ys.astype(float), x=xs.astype(float),
               c=np.array([xs.mean(), ys.mean()]))
    return out


def pick_tee(ps, m, C, u, span):
    """The tee: the middle of the boxes cut at the near end of the hole.

    There are usually two or three of them in a line, one per colour, and the
    card's yardage is measured from whichever the member plays. The map cannot
    say which box is which, so the middle of the group stands for all three and
    holes3d.js stretches the hole to the length on the card.
    """
    near = [z for z in ps if z['t'] < 0.34 and z['n'] >= 250 and z['run'] < 0.3]
    if not near:
        near = [z for z in ps if z['t'] < 0.42 and z['n'] >= 120 and z['run'] < 0.3]
    if near:
        w = np.array([z['n'] for z in near], float)
        c = np.stack([z['c'] for z in near])
        return (c * w[:, None]).sum(0) / w.sum()
    ys, xs = np.nonzero(m['body'])
    s = (np.stack([xs, ys], 1) - C) @ u
    far = s <= np.percentile(s, 1.5)
    return np.array([xs[far].mean(), ys[far].mean()])


def trace(path, key, green_end='auto'):
    m = masks(path)
    C, u = axis(m['body'])
    ps, lo, hi, span = patches(m, C, u)
    if not ps:
        return None, 'no short grass found'
    told = END.get(key, green_end if green_end in ('lo', 'hi') else None)
    if told == 'lo':                                     # run the axis tee -> green
        u = -u
        ps, lo, hi, span = patches(m, C, u)
    gp = pick_green(ps, m, C, u, span)
    T = pick_tee(ps, m, C, u, span)
    G = gp['c']
    v = np.array([-u[1], u[0]])                          # the golfer's right, y down

    D = float(np.hypot(*(G - T)))
    if D < 40:
        return None, 'tee and green came out on top of each other'
    AX = D / GREEN_T

    def tv(ys, xs):
        P = np.stack([np.asarray(xs, float) - T[0], np.asarray(ys, float) - T[1]], 1)
        return P @ u / AX, P @ v / AX

    turf = m['turf']
    ty, tx = np.nonzero(turf)
    tt, dd = tv(ty, tx)
    cen, half = [], []
    for i in range(BINS):
        loq, hiq = i / BINS, (i + 1) / BINS
        s = (tt >= loq) & (tt < hiq)
        if s.sum() < 25:
            cen.append(np.nan); half.append(np.nan); continue
        q10, q50, q90 = np.percentile(dd[s], [10, 50, 90])
        cen.append(q50); half.append((q90 - q10) / 2)
    cen = smooth(fill(cen), 2); half = smooth(fill(half), 1)
    ts = [(i + .5) / BINS for i in range(BINS)]
    cenAt = lambda t: np.interp(np.clip(t, 0, 1), ts, cen)

    # the line of the hole, five points from the tee
    cl = [[0.0, 0.0]]
    for t in (0.22, 0.44, 0.66, 0.88, 1.0):
        cl.append([round(float(np.interp(t, ts, cen) - np.interp(0.02, ts, cen)), 4), t])

    def rings(mask, min_px, eps=1.2, keep=None):
        out = []
        for pts in comps(mask):
            if len(pts) < min_px:
                continue
            ys = np.array([p[0] for p in pts]); xs = np.array([p[1] for p in pts])
            if keep and not keep(ys, xs):
                continue
            blob = np.zeros_like(mask); blob[ys, xs] = True
            ring = outline(blob)
            if len(ring) < 8:
                continue
            j = len(ring) // 2
            poly = np.vstack([simplify(ring[:j + 1], eps)[:-1], simplify(ring[j:] + ring[:1], eps)[:-1]])
            pt, pd = tv(poly[:, 0], poly[:, 1])
            out.append((len(pts), [[round(float(p), 4), round(float(q - cenAt(p)), 4)] for p, q in zip(pt, pd)]))
        out.sort(key=lambda z: -z[0])
        return [q for _, q in out]

    wmask = close(m['water'], 2)
    lakes = rings(wmask, 90)
    fairways = rings(close(m['mown'], 2), 220, 1.4)
    gm = np.zeros_like(m['mown']); gm[gp['y'].astype(int), gp['x'].astype(int)] = True
    gr = rings(close(gm, 2), 40, 1.0)
    green = gr[0] if gr else None
    # the green is one of the mown patches: do not draw it twice
    fairways = [f for f in fairways if not (green and f == green)][:6]

    grounds = rings(close(m['body'], 4), 400, 1.6)

    # how far the ground reaches each side, slice by slice
    edgeL, edgeR = [], []
    by, bx = np.nonzero(m['body'])
    bt, bd = tv(by, bx)
    for i in range(BINS):
        loq, hiq = i / BINS, (i + 1) / BINS
        c = np.interp((loq + hiq) / 2, ts, cen)
        s = (bt >= loq) & (bt < hiq)
        l = rr = np.nan
        if s.sum() >= 25:
            l = c - np.percentile(bd[s], 2); rr = np.percentile(bd[s], 98) - c
        edgeL.append(l); edgeR.append(rr)
    edgeL = smooth(fill(edgeL), 1); edgeR = smooth(fill(edgeR), 1)

    # the sand: round blobs inside the hole, not the pale fade at its edge
    bunk = []
    for pts in comps(close(m['sand'], 1)):
        if len(pts) < 16:
            continue
        ys = np.array([p[0] for p in pts]); xs = np.array([p[1] for p in pts])
        h = ys.max() - ys.min() + 1; w = xs.max() - xs.min() + 1
        if max(h, w) / max(1, min(h, w)) > 4.2 or len(pts) / (h * w) < .3:
            continue
        bt_, bd_ = tv(ys, xs)
        t = float(bt_.mean()); dn = float(bd_.mean() - cenAt(t))
        if t < .12 or t > 1.06:
            continue
        blob = np.zeros_like(m['sand']); blob[ys, xs] = True
        poly = rings(blob, 16, .8)
        bunk.append((len(pts), {'t': round(t, 3), 'd': round(dn, 4),
                                'rx': round(float(w / AX / 2), 4), 'rz': round(float(h / AX / 2), 4),
                                'poly': poly[0] if poly else None}))
    bunk = [z for _, z in sorted(bunk, key=lambda z: -z[0])[:10]]

    # the trees, and which side of the hole they stand
    yy, xx = np.nonzero(m['tree'])
    tl = tr = 0; stands = []
    if len(xx):
        at_, ad = tv(yy, xx)
        rel = ad - cenAt(at_)
        tl = int((rel < 0).sum()); tr = int((rel > 0).sum())
        CELL = .03; cells = {}
        for p, q in zip(at_, rel):
            if -.05 < p < 1.08:
                cells.setdefault((int(np.floor(p / CELL)), int(np.floor(q / CELL))), []).append((p, q))
        full = (CELL * AX) ** 2
        for _, vv in cells.items():
            if len(vv) < full * .22:
                continue
            vv = np.array(vv)
            stands.append((len(vv), round(float(vv[:, 0].mean()), 4), round(float(vv[:, 1].mean()), 4)))
        stands = [[p, q] for _, p, q in sorted(stands, reverse=True)[:80]]
    tot = max(1, tl + tr)
    r4 = lambda vv: [round(float(x), 4) for x in vv]
    out = {'cl': cl, 'half': r4(half), 'edgeL': r4(edgeL), 'edgeR': r4(edgeR),
           'lakes': lakes[:4], 'stands': stands, 'bunkers': bunk,
           'ground': grounds[:2], 'fairways': fairways, 'green': green, 'paths': [],
           'treesL': round(tl / tot, 2), 'treesR': round(tr / tot, 2),
           'treeAmt': round(min(1.0, (tl + tr) / max(1, int(m['greenish'].sum()))), 3)}
    dbg = dict(T=T.tolist(), G=G.tolist(), u=u.tolist(), AX=AX, px=D,
               cen=[float(x) for x in cen], ts=[float(x) for x in ts],
               end=told or 'hi', patches=len(ps),
               gn=int(gp['n']), gelong=round(float(gp['elong']), 2), gt=round(float(gp['t']), 2),
               bunkers=len(bunk), lakes=len(lakes), trees=len(stands),
               green='yes' if green else 'NONE')
    return out, dbg


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--course', required=True, help="the course key, e.g. leatherhead-golf-club")
    ap.add_argument('--maps', required=True, help='a directory of hole-1.png .. hole-18.png')
    ap.add_argument('--green-end', default='auto', choices=['auto', 'lo', 'hi'],
                    help="which end of the axis the green is on in this club's house style")
    ap.add_argument('--json', help='write the traced shapes here instead of into holes3d.js')
    args = ap.parse_args()

    out, report = {}, []
    for n in range(1, 19):
        f = os.path.join(args.maps, 'hole-%d.png' % n)
        if not os.path.exists(f):
            print('missing', f, file=sys.stderr); continue
        key = '%s_%d' % (args.course, n)
        t, dbg = trace(f, key, args.green_end)
        if t is None:
            print('hole %-2d  FAILED: %s' % (n, dbg), file=sys.stderr); continue
        out[key] = t
        report.append((n, dbg))

    for n, d in report:
        print('hole %-2d  tee(%4.0f,%3.0f) green(%4.0f,%3.0f)  %4.0fpx  green end %s  '
              'green patch n=%-5d t=%.2f elong=%.1f  bunkers %2d  water %d  trees %2d  %s'
              % (n, d['T'][0], d['T'][1], d['G'][0], d['G'][1], d['px'], d['end'],
                 d['gn'], d['gt'], d['gelong'], d['bunkers'], d['lakes'], d['trees'],
                 '' if d['green'] == 'yes' else 'NO GREEN OUTLINE'))

    if args.json:
        json.dump(out, open(args.json, 'w'), separators=(',', ':'))
        print('\nwrote', args.json, '(%d holes)' % len(out))
        return
    js = os.path.join(SRC, 'holes3d.js')
    s = open(js, encoding='utf-8').read()
    block = ('/* TRACED_LH:BEGIN — written by tools/trace-lh.py from clubs’ own published hole maps;\n'
             '   geometry only, measured not copied. Do not edit by hand. */\n'
             'export const TRACED_LH = ' + json.dumps(out, separators=(',', ':')) + ';\n/* TRACED_LH:END */')
    if '/* TRACED_LH:BEGIN' in s:
        s = re.sub(r'/\* TRACED_LH:BEGIN.*?/\* TRACED_LH:END \*/', lambda _: block, s, flags=re.S)
    else:
        s = s.replace('/* TRACED:END */', '/* TRACED:END */\n\n' + block)
    open(js, 'w', encoding='utf-8').write(s)
    print('\n%d holes written into src/holes3d.js' % len(out))


if __name__ == '__main__':
    main()
