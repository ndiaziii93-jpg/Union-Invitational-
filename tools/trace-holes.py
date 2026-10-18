#!/usr/bin/env python3
"""Trace the 36 hole drawings into the shapes the 3D hole is built from.

The 3D window used to invent every hole from its par and length alone,
which made every hole a tree-lined parkland hole and left out the water
that defines half of Olympos. This reads each drawing instead:

  the flag is the green; the turf pixel farthest from it is the tee; the
  line between them is the hole. Along that line, in slices, it measures
  where the turf runs (the bend), how wide it is, which side the water
  lies on and how far, where the sand is, and which side the trees are.

Everything is written as a fraction of the hole's own line, so the model
scales it by the card's length. The drawings are drawn, not surveyed, and
the window still says so; but the hole you open is the hole on the page.

Run after the drawings change:  python3 tools/trace-holes.py
"""
import json, os, re, sys
from collections import deque
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'src')
HOLES = os.path.join(SRC, 'assets', 'holes')
BINS = 24
GREEN_T = 0.965          # where the model puts the green along the line
# The drawings look at each hole from above and behind, so the ground is
# squashed top to bottom: its bunkers, which should come out round on the
# average, measure 0.70 as tall as they are wide across all 36 drawings.
# Everything is stood back up by that before it is measured, or a lake
# drawn across the hole reads as a strip running up it.
SQUASH = 0.70

def comps(mask):
    """Connected blobs of a boolean mask, as lists of (y, x)."""
    seen = np.zeros_like(mask, dtype=bool); out = []
    ys, xs = np.nonzero(mask)
    for y0, x0 in zip(ys, xs):
        if seen[y0, x0]: continue
        q = deque([(y0, x0)]); seen[y0, x0] = True; pts = []
        while q:
            y, x = q.popleft(); pts.append((y, x))
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < mask.shape[0] and 0 <= nx < mask.shape[1] and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True; q.append((ny, nx))
        out.append(pts)
    return out

def smooth(v, k=1):
    v = np.array(v, dtype=float); o = v.copy()
    for i in range(len(v)):
        lo, hi = max(0, i - k), min(len(v), i + k + 1)
        w = v[lo:hi]; w = w[~np.isnan(w)]
        o[i] = w.mean() if len(w) else np.nan
    return o

def fill(v):
    v = np.array(v, dtype=float); idx = np.arange(len(v)); ok = ~np.isnan(v)
    if not ok.any(): return np.zeros_like(v)
    return np.interp(idx, idx[ok], v[ok])

def grow(m):
    y = m.copy()
    y[1:] |= m[:-1]; y[:-1] |= m[1:]; y[:, 1:] |= m[:, :-1]; y[:, :-1] |= m[:, 1:]
    return y

def close(m, k=2):
    """Shut the small gaps a lake's highlights and ripples leave in the mask."""
    for _ in range(k): m = grow(m)
    for _ in range(k): m = ~grow(~m)
    return m

DIRS = [(-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1)]   # clockwise, y down

def outline(mask):
    """The outer edge of one blob, walked clockwise (Moore neighbours), as (y, x)."""
    m = np.pad(mask, 1)
    ys, xs = np.nonzero(m)
    i = np.lexsort((xs, ys))[0]; start = (int(ys[i]), int(xs[i]))
    p, b = start, 6                                    # came in from the west, which is clear
    pts = [p]; first = None
    for _ in range(200000):
        for k in range(1, 9):
            di = (b + k) % 8
            q = (p[0] + DIRS[di][0], p[1] + DIRS[di][1])
            if m[q]:
                pv = (p[0] + DIRS[(di - 1) % 8][0], p[1] + DIRS[(di - 1) % 8][1])
                p, b = q, DIRS.index((pv[0] - q[0], pv[1] - q[1]))
                break
        else:
            return [(start[0] - 1, start[1] - 1)]       # a single pixel
        if first is None: first = (p, b)
        elif (p, b) == first: break
        pts.append(p)
    return [(y - 1, x - 1) for y, x in pts]

def simplify(pts, eps):
    """Douglas-Peucker on an open run of points."""
    pts = np.asarray(pts, dtype=float)
    if len(pts) < 3: return pts
    a, b = pts[0], pts[-1]; ab = b - a; n = np.hypot(*ab)
    d = np.abs(ab[0] * (pts[:, 1] - a[1]) - ab[1] * (pts[:, 0] - a[0])) / n if n else np.hypot(*(pts - a).T)
    i = int(d.argmax())
    if d[i] <= eps: return np.array([a, b])
    return np.vstack([simplify(pts[:i + 1], eps)[:-1], simplify(pts[i:], eps)])

def boxblur(x, k):
    c = np.cumsum(np.cumsum(np.pad(x, ((k + 1, k), (k + 1, k))), 0), 1)
    return (c[2*k+1:, 2*k+1:] - c[:-2*k-1, 2*k+1:] - c[2*k+1:, :-2*k-1] + c[:-2*k-1, :-2*k-1]) / ((2 * k + 1) ** 2)

def otsu(v):
    h, e = np.histogram(v, 64); c = (e[:-1] + e[1:]) / 2
    best, thr = -1, c[len(c) // 2]
    for i in range(1, 63):
        w0, w1 = h[:i].sum(), h[i:].sum()
        if not w0 or not w1: continue
        m0, m1 = (h[:i] * c[:i]).sum() / w0, (h[i:] * c[i:]).sum() / w1
        b = w0 * w1 * (m0 - m1) ** 2
        if b > best: best, thr = b, c[i]
    return thr

def trace(path):
    a = np.array(Image.open(path).convert('RGBA')).astype(int)
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    solid = al > 200
    water = solid & (b > r + 40) & (b > g - 5)
    flag = solid & (r > 170) & (g < 70) & (b < 70)
    sand = solid & (r > 200) & (g > 192) & (b > 160) & (np.abs(r - b) < 60) & ~water
    turf = solid & (g > r + 25) & (g > b + 25) & (g > 120)
    tree = solid & (g >= r) & (g <= 120) & ~water & ~turf
    fy, fx = np.nonzero(flag)
    if len(fx) < 20:                                   # a white flag with a red edge: a looser red
        fy, fx = np.nonzero(solid & (r > 150) & (g < 100) & (b < 100) & (r > g + 60))
    if len(fx):
        F = np.array([fx.mean(), (fy.max() + 4.0) / SQUASH])   # the foot of the flag: the green
    else:                                              # no flag at all: the top-right end of the turf
        ty0, tx0 = np.nonzero(turf); k = tx0 - ty0; top = k >= np.percentile(k, 99.6)
        F = np.array([tx0[top].mean(), ty0[top].mean() / SQUASH])
    ty, tx = np.nonzero(turf)
    d = np.hypot(tx - F[0], ty / SQUASH - F[1])
    far = d >= np.percentile(d, 99.6)
    T = np.array([tx[far].mean(), ty[far].mean() / SQUASH])   # the tee: the far end of the turf
    u = (F - T); D = np.hypot(*u); u = u / D
    v = np.array([-u[1], u[0]])                        # the golfer's right, in a picture with y down
    AX = D / GREEN_T                                   # the whole line, the green at .965 of it
    def tv(ys, xs):
        P = np.stack([xs - T[0], ys / SQUASH - T[1]], 1)
        return P @ u / AX, P @ v / AX
    tt, dd = tv(ty, tx)
    cen, half = [], []
    for i in range(BINS):
        lo, hi = i / BINS, (i + 1) / BINS
        s = (tt >= lo) & (tt < hi)
        if s.sum() < 25: cen.append(np.nan); half.append(np.nan); continue
        q10, q50, q90 = np.percentile(dd[s], [10, 50, 90])
        cen.append(q50); half.append((q90 - q10) / 2)
    cen = smooth(fill(cen), 2); half = smooth(fill(half), 1)
    ts = [(i + .5) / BINS for i in range(BINS)]
    # the line: five points along it, from the tee
    cl = [[0.0, 0.0]]
    for t in (0.22, 0.44, 0.66, 0.88, 1.0):
        cl.append([round(float(np.interp(t, ts, cen) - np.interp(0.02, ts, cen)), 4), t])
    cenAt = lambda t: np.interp(np.clip(t, 0, 1), ts, cen)
    # THE WATER, AS THE DRAWING HAS IT: each lake's own outline, walked round
    # its edge and written as [t, d] from the hole's line. A lake that crosses
    # the hole in front of the tee is one lake, not a strip down each side.
    def rings(mask, min_px, eps=1.2, keep=None):
        """Each blob's outer edge, walked and simplified, as [t, d] from the line."""
        out = []
        for pts in comps(mask):
            if len(pts) < min_px: continue
            ys = np.array([p[0] for p in pts]); xs = np.array([p[1] for p in pts])
            if keep and not keep(ys, xs): continue
            blob = np.zeros_like(mask); blob[ys, xs] = True
            ring = outline(blob)
            if len(ring) < 8: continue
            j = len(ring) // 2                         # simplify as two halves, so the ends stay put
            poly = np.vstack([simplify(ring[:j + 1], eps)[:-1], simplify(ring[j:] + ring[:1], eps)[:-1]])
            pt, pd = tv(poly[:, 0].astype(float), poly[:, 1].astype(float))
            out.append((len(pts), [[round(float(a), 4), round(float(b - cenAt(a)), 4)] for a, b in zip(pt, pd)]))
        out.sort(key=lambda x: -x[0])
        return [q for _, q in out]
    wmask = close(water)
    lakes = rings(wmask, 120)
    # EVERY SURFACE AS ITS OWN OUTLINE. The fairway is the lighter turf: the
    # stripes make single pixels useless, so it is read off a blurred
    # brightness, cut where that drawing's own two greens part (each drawing
    # is painted a little lighter or darker than the next).
    gb = boxblur(np.where(turf, g, 0).astype(float), 5) / np.maximum(boxblur(turf.astype(float), 5), 1e-6)
    cut = otsu(gb[turf]) if turf.any() else 160
    fmask = close(turf & (gb > cut), 2)
    fmask = ~grow(~fmask) ; fmask = grow(fmask)       # open: no specks
    fairways = rings(fmask & close(turf, 2), 160, 1.4)
    # the green: the lightest turf round the foot of the flag
    yy0, xx0 = np.mgrid[0:a.shape[0], 0:a.shape[1]]
    # THE GREEN is drawn as a checked patch inside a thin darker line, the
    # same colour as the fairway round it. So it is found by filling out from
    # the foot of the flag over the light turf until that line stops it,
    # kept to a ring round the flag in case the line has a gap.
    rad = np.hypot(xx0 - F[0], yy0 / SQUASH - F[1])
    near = rad < .085 * AX
    rim = near & (rad > .075 * AX)
    fy0, fx0 = int(round(F[1] * SQUASH)), int(round(F[0]))
    green = None
    for lim in (156, 162, 168, 174, 180):             # stricter until the line holds
        light = near & solid & (g >= lim) & (g > r + 25) & (g > b + 40)
        best = None
        for pts in comps(light):
            if len(pts) < 40: continue
            ys = np.array([q[0] for q in pts]); xs = np.array([q[1] for q in pts])
            dmin = np.min(np.hypot(xs - fx0, ys - fy0))
            if best is None or dmin < best[0]: best = (dmin, ys, xs)
        if best is None or best[0] > 14: break
        if rim[best[1], best[2]].sum() > 12: continue  # it ran out to the edge of the search: leaked
        gm = np.zeros_like(light); gm[best[1], best[2]] = True
        gr = rings(close(gm, 2), 40, 1.0)
        green = gr[0] if gr else None
        break
    # the cart paths: long grey ribbons
    grey = solid & (np.abs(r - g) < 16) & (np.abs(g - b) < 18) & (r > 140)      # paths are grey or near white
    paths = rings(close(grey, 1), 60, 1.2, keep=lambda ys, xs: max(np.ptp(ys), np.ptp(xs)) > 30)
    # the ground: turf, water, sand, paths, and the trees standing on it
    base = turf | water | sand | grey
    for _ in range(6): base = base | (grow(base) & tree)
    # every piece of it: a path across the hole can part the turf in two
    # A path across the hole is drawn as a gap in the turf; bridging the gaps
    # keeps the hole in one piece, and what was bridged, long and thin, is the
    # path. Tree clumps standing off on their own are not ground.
    G6 = close(base, 6)
    gap = G6 & ~close(base, 1)
    paths = paths + rings(gap, 60, 1.2, keep=lambda ys, xs: max(np.ptp(ys), np.ptp(xs)) > 30
                          and len(ys) / max(1, max(np.ptp(ys), np.ptp(xs))) < 9
                          and turf[np.clip(ys + 6, 0, turf.shape[0] - 1), xs].mean() > .3
                          and turf[np.clip(ys - 6, 0, turf.shape[0] - 1), xs].mean() > .3)
    ground = rings(G6, 400, 1.6, keep=lambda ys, xs: turf[ys, xs].mean() > .3 and turf[ys, xs].sum() > 800)
    # THE GROUND: how far the turf and the water reach on each side, slice by
    # slice, so the island is the shape of the hole on the page and holds its
    # lakes, instead of the same width both ways.
    edgeL, edgeR = [], []
    wt_, wd_ = tv(*np.nonzero(wmask)) if wmask.any() else (np.array([]), np.array([]))
    for i in range(BINS):
        lo, hi = i / BINS, (i + 1) / BINS; c = np.interp((lo + hi) / 2, ts, cen)
        s = (tt >= lo) & (tt < hi)
        l = r = np.nan
        if s.sum() >= 25:
            l = c - np.percentile(dd[s], 2); r = np.percentile(dd[s], 98) - c
        w = (wt_ >= lo - .02) & (wt_ < hi + .02)
        if w.sum() >= 10:
            rel = wd_[w] - c
            l = np.nanmax([l, -rel.min()]); r = np.nanmax([r, rel.max()])
        edgeL.append(l); edgeR.append(r)
    edgeL = smooth(fill(edgeL), 1); edgeR = smooth(fill(edgeR), 1)
    # the sand: round blobs, not the cart path's long lines
    bunk = []
    for pts in comps(sand):
        if len(pts) < 14: continue
        ys = np.array([p[0] for p in pts]); xs = np.array([p[1] for p in pts])
        h = ys.max() - ys.min() + 1; w = xs.max() - xs.min() + 1
        if max(h, w) / max(1, min(h, w)) > 4.2 or len(pts) / (h * w) < .3: continue
        bt, bd = tv(ys.astype(float), xs.astype(float))
        t = float(bt.mean()); dn = float(bd.mean() - cenAt(t))
        if t < .2 or t > 1.05: continue                 # nothing near the tee: that is paths and trunks
        blob = np.zeros_like(sand); blob[ys, xs] = True
        poly = rings(blob, 14, .8)
        bunk.append({'t': round(t, 3), 'd': round(dn, 4), 'rx': round(float(w / AX / 2), 4), 'rz': round(float(h / SQUASH / AX / 2), 4),
                     'poly': poly[0] if poly else None})
    # the trees: how they split, left and right, and where they stand
    yy, xx = np.nonzero(tree)
    tl = tr = 0; stands = []
    if len(xx):
        at_, ad = tv(yy + 5.0, xx.astype(float))       # a canopy is drawn above its trunk
        rel = ad - cenAt(at_)
        tl = int((rel < 0).sum()); tr = int((rel > 0).sum())
        CELL = .03; cells = {}
        for a, b in zip(at_, rel):
            if -.05 < a < 1.08: cells.setdefault((int(np.floor(a / CELL)), int(np.floor(b / CELL))), []).append((a, b))
        full = (CELL * AX) ** 2 * SQUASH
        for k, v in cells.items():
            if len(v) < full * .22: continue
            v = np.array(v); stands.append((len(v), round(float(v[:, 0].mean()), 4), round(float(v[:, 1].mean()), 4)))
        stands = [[a, b] for _, a, b in sorted(stands, reverse=True)[:80]]
    tot = max(1, tl + tr)
    widths = [round(float(x), 4) for x in half]
    r4 = lambda v: [round(float(x), 4) for x in v]
    return {'cl': cl, 'half': widths, 'edgeL': r4(edgeL), 'edgeR': r4(edgeR), 'lakes': lakes, 'stands': stands, 'bunkers': bunk[:10],
            'ground': ground, 'fairways': fairways[:6], 'green': green, 'paths': paths[:6],
            'treesL': round(tl / tot, 2), 'treesR': round(tr / tot, 2), 'treeAmt': round(min(1.0, (tl + tr) / max(1, int(turf.sum()))), 3)}

def main():
    out = {}
    for f in sorted(os.listdir(HOLES)):
        m = re.match(r'hole_(\w+)_(\d+)\.png$', f)
        if not m: continue
        t = trace(os.path.join(HOLES, f))
        if t: out[m.group(1) + '_' + m.group(2)] = t
        else: print('no flag found on', f, file=sys.stderr)
    js = os.path.join(SRC, 'holes3d.js')
    s = open(js, encoding='utf-8').read()
    block = ('/* TRACED:BEGIN — written by tools/trace-holes.py from the drawings; do not edit by hand */\n'
             'export const TRACED = ' + json.dumps(out, separators=(',', ':')) + ';\n/* TRACED:END */')
    if '/* TRACED:BEGIN' in s:
        s = re.sub(r'/\* TRACED:BEGIN.*?/\* TRACED:END \*/', lambda _: block, s, flags=re.S)
    else:
        s = s.replace('/** A traced hole: the same fields the generator makes, written by hand. */', block + '\n\n/** A traced hole: the same fields the generator makes, written by hand. */')
    open(js, 'w', encoding='utf-8').write(s)
    wet = sorted(k for k, v in out.items() if v['lakes'])
    print(len(out), 'holes traced;', len(wet), 'with water:', ', '.join(wet))

if __name__ == '__main__':
    main()
