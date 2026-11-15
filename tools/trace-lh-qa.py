#!/usr/bin/env python3
"""Draw what tools/trace-lh.py read off each published hole map, so a person can check it.

For every hole it lays the trace back over a faded copy of the map: the line
from the tee to the green, the tee as a square and the green as a circle, the
green's outline, the sand, the water and the fairway. Then it writes a contact
sheet of all eighteen. Nothing here ships; it exists to be looked at.

  Run:  python3 tools/trace-lh-qa.py --course leatherhead-golf-club \
            --maps <dir> --out <dir>
"""
import argparse, importlib.util, os
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load():
    spec = importlib.util.spec_from_file_location('trace_lh', os.path.join(ROOT, 'tools', 'trace-lh.py'))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--course', required=True)
    ap.add_argument('--maps', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--green-end', default='auto', choices=['auto', 'lo', 'hi'])
    args = ap.parse_args()
    L = load()
    os.makedirs(args.out, exist_ok=True)
    tiles = []
    for n in range(1, 19):
        f = os.path.join(args.maps, 'hole-%d.png' % n)
        if not os.path.exists(f):
            continue
        key = '%s_%d' % (args.course, n)
        t, dbg = L.trace(f, key, args.green_end)
        base = Image.open(f).convert('RGB')
        im = Image.blend(base, Image.new('RGB', base.size, (255, 255, 255)), 0.55)
        d = ImageDraw.Draw(im, 'RGBA')
        if t is None:
            d.text((12, 12), 'hole %d FAILED %s' % (n, dbg), fill=(200, 0, 0))
        else:
            T = np.array(dbg['T']); G = np.array(dbg['G'])
            u = np.array(dbg['u']); v = np.array([-u[1], u[0]]); AX = dbg['AX']
            px = lambda tt, dd: tuple(T + u * (tt * AX) + v * (dd * AX))

            def poly(p, outline, width=2, fill=None):
                if not p or len(p) < 3:
                    return
                pts = [px(a, b + np.interp(np.clip(a, 0, 1), TS, CEN)) for a, b in p]
                d.polygon(pts, outline=outline, fill=fill, width=width)

            TS = dbg['ts']; CEN = dbg['cen']        # the line the polys were measured from

            for gpoly in (t['ground'] or []):
                poly(gpoly, (90, 90, 90, 190), 2)
            for fw in (t['fairways'] or []):
                poly(fw, (30, 150, 60, 230), 3)
            for lk in (t['lakes'] or []):
                poly(lk, (20, 90, 220, 230), 3, fill=(20, 90, 220, 70))
            for bk in (t['bunkers'] or []):
                if bk.get('poly'):
                    poly(bk['poly'], (230, 140, 10, 240), 2, fill=(255, 210, 90, 110))
            if t['green']:
                poly(t['green'], (220, 20, 20, 255), 3, fill=(255, 60, 60, 90))
            # the line of play
            line = [px(a, b) for a, b in zip(TS, CEN)]
            d.line(line, fill=(0, 0, 0, 230), width=5)
            d.line(line, fill=(255, 230, 0, 240), width=2)
            for st in (t['stands'] or []):
                x, y = px(st[0], st[1] + np.interp(np.clip(st[0], 0, 1), TS, CEN))
                d.ellipse([x - 3, y - 3, x + 3, y + 3], fill=(10, 90, 30, 170))
            d.rectangle([T[0] - 11, T[1] - 11, T[0] + 11, T[1] + 11], outline=(0, 0, 0), width=4)
            d.rectangle([T[0] - 11, T[1] - 11, T[0] + 11, T[1] + 11], outline=(255, 255, 255), width=2)
            d.ellipse([G[0] - 13, G[1] - 13, G[0] + 13, G[1] + 13], outline=(0, 0, 0), width=4)
            d.ellipse([G[0] - 13, G[1] - 13, G[0] + 13, G[1] + 13], outline=(255, 60, 60), width=2)
            d.text((T[0] - 6, T[1] - 7), 'T', fill=(0, 0, 0))
            d.text((G[0] - 6, G[1] - 7), 'G', fill=(170, 0, 0))
            lab = 'HOLE %d    green n=%d t=%.2f elong=%.1f    bunkers %d   water %d   trees %d' % (
                n, dbg['gn'], dbg['gt'], dbg['gelong'], dbg['bunkers'], dbg['lakes'], dbg['trees'])
            d.rectangle([0, 0, im.size[0], 20], fill=(255, 255, 255, 230))
            d.text((8, 6), lab, fill=(0, 0, 0))
        im.save(os.path.join(args.out, 'qa-%02d.png' % n))
        tiles.append(im)
    if tiles:
        w = max(t.size[0] for t in tiles) // 2
        h = max(t.size[1] for t in tiles) // 2
        cols, rows = 3, (len(tiles) + 2) // 3
        sheet = Image.new('RGB', (cols * w, rows * h), (255, 255, 255))
        for i, t in enumerate(tiles):
            sheet.paste(t.resize((w, h)), ((i % cols) * w, (i // cols) * h))
        sheet.save(os.path.join(args.out, 'sheet.png'))
        print('wrote', os.path.join(args.out, 'sheet.png'), sheet.size)


if __name__ == '__main__':
    main()
