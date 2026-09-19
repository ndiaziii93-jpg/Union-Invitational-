#!/usr/bin/env python3
"""Build the installable book.

The artifact host wraps our page in a document of its own — charset, viewport,
a small reset — so `src/index.html` is a fragment. A PWA has no host: it needs
a whole document, a manifest, icons and a service worker, which is what this
writes. Run after tools/build.py:

    python3 tools/build.py && python3 tools/pwa.py

Output lands in docs/app/, which is what GitHub Pages serves.
"""
import os, re, io, sys, json, shutil, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'src')
DIST = os.path.join(ROOT, 'dist')
OUT = os.path.join(ROOT, 'docs', 'app')

GREEN = '#3E5C43'       # --green, the pine printing ink of the crest
PAPER = '#E3DBCB'       # --paper, the cover stock
NAME = 'The Union Invitational'
SHORT = 'Union Inv.'

FONTDIR = os.path.join(SRC, 'assets', 'fonts')


def icons():
    """The crest, squared onto the cover stock, at the sizes a phone asks for.

    A maskable icon must survive being cropped to a circle, so the crest sits
    inside the middle 60% with paper all around it. The plain icon is tighter.
    """
    from PIL import Image
    os.makedirs(OUT, exist_ok=True)
    crest = Image.open(os.path.join(SRC, 'assets', 'brand',
                                    'efed30fc-173f-48a7-b168-923ebf5d103f.png')).convert('RGBA')

    def square(size, inset, bg):
        canvas = Image.new('RGBA', (size, size), bg)
        c = crest.copy()
        box = int(size * inset)
        c.thumbnail((box, box), Image.LANCZOS)
        canvas.paste(c, ((size - c.width) // 2, (size - c.height) // 2), c)
        return canvas.convert('RGB')

    paper = tuple(int(PAPER[i:i + 2], 16) for i in (1, 3, 5)) + (255,)
    written = []
    for size in (192, 512):
        p = os.path.join(OUT, 'icon-%d.png' % size)
        square(size, 0.82, paper).save(p, 'PNG', optimize=True)
        written.append(p)
    # cropped to a circle on Android, so keep well inside the safe zone
    p = os.path.join(OUT, 'icon-maskable-512.png')
    square(512, 0.56, paper).save(p, 'PNG', optimize=True)
    written.append(p)
    # iOS does not mask, and puts its own rounded corners on
    p = os.path.join(OUT, 'apple-touch-icon.png')
    square(180, 0.84, paper).save(p, 'PNG', optimize=True)
    written.append(p)
    return written


def fonts():
    """Copy the typeface in beside the book, and return its stylesheet.

    An installed book must not need Google to be reachable to look like
    itself — the whole point is that it works on the 14th with no bars.
    """
    css = os.path.join(FONTDIR, 'source-serif.css')
    if not os.path.exists(css):
        sys.exit('run tools/fonts.py first — no src/assets/fonts/source-serif.css')
    dest = os.path.join(OUT, 'fonts')
    os.makedirs(dest, exist_ok=True)
    out = []
    for f in sorted(os.listdir(FONTDIR)):
        if f.endswith('.woff2') or f == 'OFL.txt':
            shutil.copyfile(os.path.join(FONTDIR, f), os.path.join(dest, f))
            out.append(os.path.join(dest, f))
    return open(css, encoding='utf-8').read(), out


def manifest():
    return {
        'name': NAME,
        'short_name': SHORT,
        'description': 'The yardage book for the Union Invitational — '
                       'Titanic Deluxe Golf Belek, Antalya, 26 October to 2 November 2026.',
        'start_url': './',
        'scope': './',
        'display': 'standalone',
        'orientation': 'portrait',
        'background_color': PAPER,
        'theme_color': GREEN,
        'categories': ['sports', 'utilities'],
        'icons': [
            {'src': 'icon-192.png', 'sizes': '192x192', 'type': 'image/png', 'purpose': 'any'},
            {'src': 'icon-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'any'},
            {'src': 'icon-maskable-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'maskable'},
        ],
    }


HEAD = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="{green}" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#16201A" media="(prefers-color-scheme: dark)">
<meta name="description" content="The yardage book for the Union Invitational.">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="{short}">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="mobile-web-app-capable" content="yes">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="icon" href="icon-192.png" type="image/png">
<link rel="preload" href="fonts/source-serif-latin-normal.woff2" as="font" type="font/woff2" crossorigin>
<style>
  :root {{ color-scheme: light dark; }}
  html, body {{ margin: 0; background: {paper}; }}
  @media (prefers-color-scheme: dark) {{ html, body {{ background: #16201A; }} }}
  img {{ max-width: 100%; }}
  [hidden] {{ display: none !important; }}
  /* the phone's own notch and home bar, so nothing important hides under them */
  body {{ padding: env(safe-area-inset-top) env(safe-area-inset-right)
                   env(safe-area-inset-bottom) env(safe-area-inset-left); }}
</style>
"""

FOOT = """
<script>
/* Register the worker that makes the book work with no signal. It is the
   whole point of installing it: Belek is five hours of walking and everyone
   is roaming. A failure here must never stop the page loading. */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function () { /* offline is a bonus, not a requirement */ });
  });
}
</script>
</body>
</html>
"""


SW = """/* The Union Invitational — offline shell.
   Build {stamp}.

   The book is one file, so there is little to cache and no dependency graph
   to get wrong. The page itself is served network-first, so a phone picks up
   a new build the moment it has signal, and falls back to the copy it already
   has when it does not. Fonts and icons never change under a given URL, so
   they are served from the cache the instant they are in it.

   Anything that is not a GET — every score, every photo — is left entirely
   alone. Writes are the store's business, and it queues them itself. */

const CACHE = 'union-{stamp}';
const SHELL = ['./', './index.html', './manifest.webmanifest',
               './icon-192.png', './icon-512.png', './apple-touch-icon.png',
               './fonts/source-serif-latin-normal.woff2',
               './fonts/source-serif-latin-italic.woff2'];

self.addEventListener('install', e => {{
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
}});

self.addEventListener('activate', e => {{
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
}});

self.addEventListener('fetch', e => {{
  const req = e.request;
  if (req.method !== 'GET') return;                       // never touch a write
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;             // the database talks for itself

  // the typeface and the icons: whatever is in the cache is right, and both
  // ship with the book, so there is nothing cross-origin left to wait on
  const immutable = /\\.(png|webp|woff2?|ico)$/.test(url.pathname);
  if (immutable) {{
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {{
      if (res.ok || res.type === 'opaque') {{
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }}
      return res;
    }}).catch(() => hit)));
    return;
  }}

  // the book itself: newest if there is signal, the copy on the phone if not
  e.respondWith(fetch(req).then(res => {{
    if (res && res.ok) {{
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
    }}
    return res;
  }}).catch(() => caches.match(req).then(hit => hit || caches.match('./index.html'))));
}});
"""


def main():
    page = os.path.join(DIST, 'union-invitational-app.html')
    if not os.path.exists(page):
        sys.exit('run tools/build.py first — no dist/union-invitational-app.html')
    body = open(page, encoding='utf-8').read()

    # the fragment carries its own <title> and font link; the document needs
    # them in the head, so lift them out rather than nesting them in <body>
    title = re.search(r'<title>.*?</title>', body, re.S)
    body = body.replace(title.group(0), '', 1) if title else body
    body = re.sub(r'<link rel="(?:preconnect|stylesheet)"[^>]*>\s*', '', body)

    stamp = re.search(r"BUILD = '([^']+)'", body)
    stamp = stamp.group(1) if stamp else datetime.datetime.now(
        datetime.timezone.utc).strftime('%Y%m%d-%H%M')

    os.makedirs(OUT, exist_ok=True)
    written = icons()

    face_css, face_files = fonts()
    written += face_files

    head = HEAD.format(green=GREEN, paper=PAPER, short=SHORT)
    head += (title.group(0) if title else '<title>%s</title>' % NAME) + '\n'
    head += '<style>\n' + face_css + '</style>\n</head>\n<body>\n'
    doc = head + body + FOOT

    p = os.path.join(OUT, 'index.html')
    open(p, 'w', encoding='utf-8').write(doc)
    written.append(p)

    p = os.path.join(OUT, 'manifest.webmanifest')
    open(p, 'w', encoding='utf-8').write(json.dumps(manifest(), indent=2) + '\n')
    written.append(p)

    p = os.path.join(OUT, 'sw.js')
    open(p, 'w', encoding='utf-8').write(SW.format(stamp=stamp))
    written.append(p)

    # GitHub Pages runs Jekyll otherwise, which drops files it does not like
    p = os.path.join(ROOT, 'docs', '.nojekyll')
    open(p, 'w').write('')
    written.append(p)

    for f in written:
        print('%-46s %8.1f KB' % (os.path.relpath(f, ROOT), os.path.getsize(f) / 1024))
    print('\nbuild %s — docs/app/ is ready to serve' % stamp)


if __name__ == '__main__':
    main()
