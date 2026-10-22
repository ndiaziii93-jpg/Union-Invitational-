#!/usr/bin/env python3
"""Assemble the single-file Union Invitational artifact.

Compresses the hole diagrams to WebP data URIs, flattens the ES modules into
one inline script (no bundler, no network), and writes dist/union-invitational.html.
"""
import base64, io, json, os, re, sys, glob, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'src')
DIST = os.path.join(ROOT, 'dist')
WEB = os.path.join(SRC, 'assets', 'web')

MODULE_ORDER = ['data', 'config', 'rules', 'resort', 'weather', 'engine', 'holes3d', 'hole3d', 'dbsupa', 'store', 'app']

"""Two copies come out of one source. The artifact keeps the platform store it
   already holds a real tournament in; the installable app talks to the book's
   own database. Emitting both every time means neither can be forgotten, and
   the wrong one can never be published by mistake."""
SUPABASE_URL = 'https://zolsghkbgceularukood.supabase.co'
SUPABASE_KEY = 'sb_publishable_g8feql6XYrOP60S6bFNz9A_rTKMPrZw'

EXPORT_RE = re.compile(r'^export\s+(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)', re.M)
IMPORT_RE = re.compile(r"^import\s+(.+?)\s+from\s+'\./(\w+)\.js';\s*$", re.M)


def outline(im, cols=130, rows=184):
    """The convex hull of a sheet's drawn pixels, as [x, y] fractions,
    read off a coarse mask so a tree's last twig does not matter."""
    a = im.getchannel('A').point(lambda v: 255 if v > 24 else 0).resize((cols, rows))
    px = a.load()
    pts = sorted({(x / cols, y / rows) for y in range(rows) for x in range(cols) if px[x, y]})
    if len(pts) < 3:
        return [[0, 0], [1, 0], [1, 1], [0, 1]]
    def cross(o, p, q): return (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0])
    lo, up = [], []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0: lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(up) >= 2 and cross(up[-2], up[-1], p) <= 0: up.pop()
        up.append(p)
    return [[round(x, 3), round(y, 3)] for x, y in lo[:-1] + up[:-1]]


def build_images(force=False):
    """Re-encode the extracted PNGs as WebP and emit the data-URI table."""
    out_js = os.path.join(SRC, 'assets', 'images.js')
    if os.path.exists(out_js) and not force:
        return out_js
    from PIL import Image
    os.makedirs(WEB, exist_ok=True)
    table = {}
    # Where the hole is on each sheet: the outline round its drawn pixels —
    # a convex hull, as fractions of the sheet — so the plate can lay the
    # sheet back into the page and still know where the hole's own edges
    # land once it is tilted. A box would carry its empty corners with it.
    hulls = {}
    for f in sorted(glob.glob(os.path.join(SRC, 'assets', 'holes', '*.png'))):
        key = os.path.basename(f)[:-4]
        im = Image.open(f).convert('RGBA')
        hulls[key] = outline(im)
        buf = io.BytesIO(); im.save(buf, 'WEBP', quality=82, method=6)
        d = buf.getvalue()
        open(os.path.join(WEB, key + '.webp'), 'wb').write(d)
        table[key] = 'data:image/webp;base64,' + base64.b64encode(d).decode()
    for key, fn in (('course_aspendos', '1168e907-ae08-408a-9ce8-f178f078bf3f.jpg'),
                    ('course_olympos', '8d395123-ac87-4fb0-86d3-b9434cbdeb2a.jpg')):
        im = Image.open(os.path.join(SRC, 'assets', 'brand', fn)).convert('RGB')
        buf = io.BytesIO(); im.save(buf, 'WEBP', quality=80, method=6)
        d = buf.getvalue()
        open(os.path.join(WEB, key + '.webp'), 'wb').write(d)
        table[key] = 'data:image/webp;base64,' + base64.b64encode(d).decode()
    hero = os.path.join(SRC, 'assets', 'brand', '463041d4-578c-40c2-82ab-413ba30c2b68.jpg')
    im = Image.open(hero).convert('RGB')
    buf = io.BytesIO(); im.save(buf, 'WEBP', quality=80, method=6)
    d = buf.getvalue()
    open(os.path.join(WEB, 'hero.webp'), 'wb').write(d)
    table['hero'] = 'data:image/webp;base64,' + base64.b64encode(d).decode()
    # The resort's own site plan, if we have been given a copy of it. The tab
    # draws its own schematic when we have not, so this is allowed to be absent
    # and the build must not fall over when it is.
    # The site plan is the one picture in the book that gets magnified, so it
    # keeps every pixel it came with. It used to be shrunk to 1800 and then
    # squeezed at quality 82 on top of an already lossy JPEG, and the zoom was
    # magnifying the compression as much as the drawing. The master is the
    # lossless PNG now, kept at its own size, encoded once and gently.
    plan = os.path.join(SRC, 'assets', 'brand', 'resort-map.png')
    if os.path.exists(plan):
        im = Image.open(plan).convert('RGB')
        buf = io.BytesIO(); im.save(buf, 'WEBP', quality=95, method=6)
        d = buf.getvalue()
        open(os.path.join(WEB, 'resortmap.webp'), 'wb').write(d)
        table['resortmap'] = 'data:image/webp;base64,' + base64.b64encode(d).decode()

    # The head of The Titanic tab is the hotel's aerial now (rp_aerial, below);
    # the dusk photograph that used to sit there is no longer shipped.
    # The hotel's own photographs, for the Titanic tab: the aerial that is its
    # map, an area shot for each part of the grounds, and a picture of most of
    # the places to eat and drink. Credited to the hotel wherever they show
    # (see assets/resort/CREDITS.md). Each comes in twice: a card-sized copy,
    # and a thumbnail so a list of thirty rows is not decoding thirty photos.
    for f in sorted(glob.glob(os.path.join(SRC, 'assets', 'resort', '*.jpg'))):
        key = os.path.basename(f)[:-4]
        im = Image.open(f).convert('RGB')
        big = im.copy()
        big.thumbnail((1700 if key == 'aerial' else 900, 1700), Image.LANCZOS)
        buf = io.BytesIO(); big.save(buf, 'WEBP', quality=72, method=6)
        table['rp_' + key] = 'data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode()
        sm = im.copy()
        w, h = sm.size; c = min(w, h)
        sm = sm.crop(((w - c) // 2, (h - c) // 2, (w - c) // 2 + c, (h - c) // 2 + c)).resize((128, 128), Image.LANCZOS)
        buf = io.BytesIO(); sm.save(buf, 'WEBP', quality=70, method=6)
        table['rt_' + key] = 'data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode()

    crest = os.path.join(SRC, 'assets', 'brand', 'efed30fc-173f-48a7-b168-923ebf5d103f.png')
    im = Image.open(crest).convert('RGBA')
    im.thumbnail((620, 620), Image.LANCZOS)
    buf = io.BytesIO(); im.save(buf, 'WEBP', quality=88, method=6)
    d = buf.getvalue()
    open(os.path.join(WEB, 'crest.webp'), 'wb').write(d)
    table['crest'] = 'data:image/webp;base64,' + base64.b64encode(d).decode()
    with open(out_js, 'w') as fh:
        fh.write('// GENERATED by tools/build.py — do not edit by hand.\n')
        fh.write('window.UI_IMAGES = ' + json.dumps(table) + ';\n')
        fh.write('window.UI_ART_HULL = ' + json.dumps(hulls) + ';\n')
    return out_js


def flatten(name):
    """Turn one ES module into an IIFE that returns its exports."""
    src = open(os.path.join(SRC, name + '.js'), encoding='utf-8').read()
    names = EXPORT_RE.findall(src)
    aliases = []
    for clause, dep in IMPORT_RE.findall(src):
        clause = clause.strip()
        m = re.match(r'^\*\s+as\s+([A-Za-z_$][\w$]*)$', clause)
        aliases.append('const %s = __m_%s;' % (m.group(1), dep) if m
                       else 'const %s = __m_%s;' % (clause, dep))
    body = IMPORT_RE.sub('', src)
    body = re.sub(r'^export\s+', '', body, flags=re.M)
    return ('const __m_%s = (function(){\n%s\n%s\nreturn {%s};\n})();\n'
            % (name, '\n'.join(aliases), body, ', '.join(names)))


def main():
    force = '--images' in sys.argv
    images_js = build_images(force)
    css = open(os.path.join(SRC, 'styles.css'), encoding='utf-8').read()
    shell = open(os.path.join(SRC, 'index.html'), encoding='utf-8').read()
    # The crest is lifted out of the image table and served first, on its
    # own, with the script that puts it on screen. Everything else in that
    # table is a hole diagram nobody sees for another two taps; the crest is
    # the first thing anyone sees, and behind two and a half megabytes of
    # company it was arriving a second late. One copy, moved to the front —
    # the table gets it back by reference a line later in the shell.
    images = open(images_js, encoding='utf-8').read()
    # one statement a line: the image table, and the outlines of the holes
    lines = {l.split(' = ', 1)[0]: l.split(' = ', 1)[1].rstrip(';') for l in images.splitlines() if l.startswith('window.')}
    table = json.loads(lines['window.UI_IMAGES'])
    crest_uri = table.pop('crest', '')
    images = ('// GENERATED by tools/build.py — do not edit by hand.\n'
              + 'window.UI_IMAGES = ' + json.dumps(table) + ';\n'
              + 'window.UI_ART_HULL = ' + lines.get('window.UI_ART_HULL', '{}') + ';\n')
    opening = ('window.UI_CREST = ' + json.dumps(crest_uri) + ';\n'
               + open(os.path.join(SRC, 'opening.js'), encoding='utf-8').read())
    bundle = '\n'.join(flatten(m) for m in MODULE_ORDER) + '\n__m_app.boot();\n'
    # the Supabase client, bundled by tools/vendor.sh, has to have run before
    # the store looks for window.__supabase
    vendor = os.path.join(SRC, 'vendor', 'supabase.min.js')
    vendor_js = open(vendor, encoding='utf-8').read() if os.path.exists(vendor) else ''
    # the 3D library behind the hole window, in both copies
    three = os.path.join(SRC, 'vendor', 'three.min.js')
    three_js = open(three, encoding='utf-8').read() if os.path.exists(three) else ''
    # a stamp the book can show, so a phone holding an old copy gives itself away
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M')
    bundle = bundle.replace('__BUILD__', stamp)
    os.makedirs(DIST, exist_ok=True)
    for name, url, kkey, vend in (
            ('union-invitational.html', '', '', ''),                    # the artifact
            ('union-invitational-app.html', SUPABASE_URL, SUPABASE_KEY, vendor_js)):
        page = (shell
                .replace('/*STYLES*/', css)
                .replace('/*CREST*/', opening)
                .replace('/*IMAGES*/', images)
                .replace('/*VENDOR*/', vend)
                .replace('/*THREE*/', three_js)
                .replace('/*BUNDLE*/', bundle
                         .replace('__SUPABASE_URL__', url)
                         .replace('__SUPABASE_KEY__', kkey)))
        out = os.path.join(DIST, name)
        open(out, 'w', encoding='utf-8').write(page)
        print('%-46s %.2f MB  %s' % (name, os.path.getsize(out) / 1048576,
                                     'supabase' if url else 'artifact store'))


if __name__ == '__main__':
    main()
