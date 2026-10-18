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
        F = np.array([fx.mean(), fy.max() + 4.0])      # the foot of the flag: the green
    else:                                              # no flag at all: the top-right end of the turf
        ty0, tx0 = np.nonzero(turf); k = tx0 - ty0; top = k >= np.percentile(k, 99.6)
        F = np.array([tx0[top].mean(), ty0[top].mean()])
    ty, tx = np.nonzero(turf)
    d = np.hypot(tx - F[0], ty - F[1])
    far = d >= np.percentile(d, 99.6)
    T = np.array([tx[far].mean(), ty[far].mean()])     # the tee: the far end of the turf
    u = (F - T); D = np.hypot(*u); u = u / D
    v = np.array([-u[1], u[0]])                        # the golfer's right, in a picture with y down
    AX = D / GREEN_T                                   # the whole line, the green at .965 of it
    def tv(ys, xs):
        P = np.stack([xs - T[0], ys - T[1]], 1)
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
    # the water, side by side, slice by slice: [t, inner, outer] as fractions of the line
    wy, wx = np.nonzero(water)
    water_out = {'L': [], 'R': []}
    if len(wx):
        wt, wd = tv(wy, wx)
        for i in range(BINS):
            lo, hi = i / BINS - .01, (i + 1) / BINS + .01
            for side, sgn in (('L', -1), ('R', 1)):
                s = (wt >= lo) & (wt < hi) & (np.sign(wd - np.interp((lo + hi) / 2, ts, cen)) == sgn)
                if s.sum() < 30: continue
                rel = np.abs(wd[s] - np.interp((lo + hi) / 2, ts, cen))
                water_out[side].append([round(ts[i], 3), round(float(np.percentile(rel, 4)), 4), round(float(np.percentile(rel, 97)), 4)])
        # water the line crosses: below the tee, in front of the green
        for side in ('L', 'R'):
            water_out[side] = [w for w in water_out[side] if w[2] - w[1] > .006]
    # the sand: round blobs, not the cart path's long lines
    bunk = []
    for pts in comps(sand):
        if len(pts) < 14: continue
        ys = np.array([p[0] for p in pts]); xs = np.array([p[1] for p in pts])
        h = ys.max() - ys.min() + 1; w = xs.max() - xs.min() + 1
        if max(h, w) / max(1, min(h, w)) > 4.2 or len(pts) / (h * w) < .3: continue
        bt, bd = tv(ys.astype(float), xs.astype(float))
        t = float(bt.mean()); dn = float(bd.mean() - np.interp(t, ts, cen))
        if t < .2 or t > 1.05: continue                 # nothing near the tee: that is paths and trunks
        bunk.append({'t': round(t, 3), 'd': round(dn, 4), 'rx': round(float(w / AX / 2), 4), 'rz': round(float(h / AX / 2), 4)})
    # the trees: how they split, left and right
    yy, xx = np.nonzero(tree)
    tl = tr = 0
    if len(xx):
        at, ad = tv(yy, xx)
        rel = ad - np.interp(np.clip(at, 0, 1), ts, cen)
        tl = int((rel < 0).sum()); tr = int((rel > 0).sum())
    tot = max(1, tl + tr)
    widths = [round(float(x), 4) for x in half]
    return {'cl': cl, 'half': widths, 'water': water_out, 'bunkers': bunk[:8],
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
    wet = sorted(k for k, v in out.items() if v['water']['L'] or v['water']['R'])
    print(len(out), 'holes traced;', len(wet), 'with water:', ', '.join(wet))

if __name__ == '__main__':
    main()
