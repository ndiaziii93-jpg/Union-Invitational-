#!/usr/bin/env python3
"""Build the installable book.

The artifact host wraps our page in a document of its own — charset, viewport,
a small reset — so `src/index.html` is a fragment. A PWA has no host: it needs
a whole document, a manifest, icons and a service worker, which is what this
writes. Run after tools/build.py:

    python3 tools/build.py && python3 tools/pwa.py && python3 tools/recap.py

Output lands in docs/app/, which is what GitHub Pages serves; tools/recap.py
then builds the recap page beside it, in docs/recap/.
"""
import os, re, io, sys, json, shutil, datetime, base64, hashlib

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


IMG_INLINE = 6 * 1024   # a picture smaller than this stays in the page: a request costs more than it would save


def unpack_images(body):
    """THE PICTURES COME OUT OF THE PAGE. The single-file book carried every
    hole diagram and hotel photograph inside it as base64 — seven of its nine
    megabytes — and on one bar of roaming signal that is a page that never
    finishes arriving. Only the words and the code are the book; a picture is
    wanted two taps later, if at all. So each one is written out beside the
    page under a name that carries its own fingerprint, the table in the page
    points at it instead, and the browser fetches it when it is first looked
    at, over whatever signal there is then, and keeps it in the picture cache
    from one build to the next. The crest stays in: it is the first thing on
    screen and it is small."""
    m = re.search(r'window\.UI_IMAGES = (\{.*?\});\n', body)
    if not m:
        return body, []
    table = json.loads(m.group(1))
    dest = os.path.join(OUT, 'img')
    os.makedirs(dest, exist_ok=True)
    keep, written = set(), []
    for key, uri in list(table.items()):
        if not uri.startswith('data:image/webp;base64,'):
            continue
        raw = base64.b64decode(uri.split(',', 1)[1])
        if len(raw) < IMG_INLINE:
            continue
        name = '%s-%s.webp' % (key, hashlib.sha1(raw).hexdigest()[:8])
        path = os.path.join(dest, name)
        if not os.path.exists(path):
            open(path, 'wb').write(raw)
        keep.add(name)
        written.append(path)
        table[key] = 'img/' + name
    for f in os.listdir(dest):             # a picture no longer in the book
        if f not in keep:
            os.remove(os.path.join(dest, f))
    body = body[:m.start()] + 'window.UI_IMAGES = ' + json.dumps(table) + ';\n' + body[m.end():]
    return body, written


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
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="{green}">
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
  /* One palette, the printed one. Declaring it here as well as in the book's
     own stylesheet matters: this is what the phone reads before a single
     rule of ours has parsed, and it is what stops the browser painting its
     own chrome dark behind a cream page. */
  :root {{ color-scheme: light; }}
  html, body {{ margin: 0; background: {paper}; }}
  img {{ max-width: 100%; }}
  [hidden] {{ display: none !important; }}
  /* the phone's own notch and home bar, so nothing important hides under them */
  body {{ padding: env(safe-area-inset-top) env(safe-area-inset-right)
                   env(safe-area-inset-bottom) env(safe-area-inset-left); }}
  /* a newer book has arrived behind this one: one line, one tap */
  #newbook {{ position: fixed; left: 50%; bottom: calc(14px + env(safe-area-inset-bottom)); transform: translateX(-50%);
             z-index: 60; background: {green}; color: {paper}; border: 0; border-radius: 999px; padding: 11px 18px;
             font: 600 14px/1.2 "Source Serif 4", Georgia, serif; box-shadow: 0 6px 22px rgba(0,0,0,.28); }}
  #newbook[hidden] {{ display: none; }}
</style>
"""

FOOT = """
<button id="newbook" type="button" hidden>A newer book is ready — tap to open it</button>
<script>
/* Register the worker that makes the book work with no signal. It is the
   whole point of installing it: Belek is five hours of walking and everyone
   is roaming. A failure here must never stop the page loading. */
var BOOK_BUILD = '__STAMP__';
var swReg = null;
/* the book is never shown inside somebody else's page, where a tap could be
   aimed at a button they have put under the finger */
try { if (window.top !== window.self) { window.top.location = window.self.location; } } catch (e) { document.documentElement.style.display = 'none'; }
if ('serviceWorker' in navigator) {
  /* THE PAGE ON THE PHONE OPENS FIRST, ALWAYS. The worker serves the copy it
     holds and fetches the newer one behind it, so the book is on screen in
     a second whatever the signal. When the newer copy has taken over, the
     page is told — and reloads itself only while nobody is looking at it,
     or at a tap, never under a hole half entered. */
  var hadWorker = !!navigator.serviceWorker.controller;
  var newBook = false;
  var bar = document.getElementById('newbook');
  function openNewBook() {
    if (!newBook || document.querySelector('.savebar.dirty')) return;
    newBook = false; location.reload();
  }
  bar.addEventListener('click', openNewBook);
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (!hadWorker) { hadWorker = true; return; }    // the first worker taking hold is not an update
    newBook = true;
    if (document.hidden) openNewBook(); else bar.hidden = false;
  });
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      swReg = reg;
      /* the worker only looks for a newer copy of itself once a day; a phone
         coming back to the book looks every time */
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) return;
        if (newBook) openNewBook(); else reg.update().catch(function () {});
      });
    }).catch(function () { /* offline is a bonus, not a requirement */ });
  });
}
/* THE BOOK IN HAND IS THE BOOK PUBLISHED. A home-screen app is not closed
   by leaving it: it is resumed, hours later, exactly where it was. So every
   return reads the build stamp off the server and, when it has moved on,
   asks the worker for the newer copy; the worker says when it is in. */
function checkBuild() {
  if (document.hidden || navigator.onLine === false) return;
  fetch('sw.js', { cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : ''; }).then(function (t) {
    var m = /Build (\S+)\./.exec(t);
    if (m && m[1] !== BOOK_BUILD) { if (swReg) swReg.update().catch(function () {}); else if (!document.querySelector('.savebar.dirty')) location.reload(); }
  }).catch(function () {});
}
document.addEventListener('visibilitychange', checkBuild);
window.addEventListener('pageshow', function (e) { if (e.persisted) checkBuild(); });
</script>
</body>
</html>
"""


SW = """/* The Union Invitational — offline shell.
   Build {stamp}.

   THE COPY ON THE PHONE IS THE ONE THAT OPENS. A page served network-first
   does not fail on a weak signal, it crawls — and a phone on one bar sat on
   blank paper for a minute before the worker gave up and showed the copy it
   had all along. So the page is served from the cache the instant it is
   there, and refreshed behind the screen when the signal allows. A new
   build installs a new worker, which fetches the new page into a new cache
   before it takes over; the page is told when that has happened.

   The pictures live outside the page, in a cache of their own that outlasts
   builds: a hole diagram fetched on Tuesday is still on the phone on Sunday
   whatever has been changed in the words beside it. Fonts and icons never
   change under a given URL either, so they are served from the cache the
   instant they are in it.

   Anything that is not a GET — every score, every photo — is left entirely
   alone. Writes are the store's business, and it queues them itself. */

const CACHE = 'union-{stamp}';
const PICTURES = 'union-pictures';
const SHELL = ['./', './index.html', './manifest.webmanifest',
               './icon-192.png', './icon-512.png', './apple-touch-icon.png',
               './fonts/source-serif-latin-normal.woff2',
               './fonts/source-serif-latin-italic.woff2'];
const FRESH_MS = 15 * 60 * 1000;   // a page cached this recently is not fetched again behind the screen

self.addEventListener('install', e => {{
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
}});

self.addEventListener('activate', e => {{
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== PICTURES).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
}});

const keep = (name, req, res) => {{
  if (res && (res.ok || res.type === 'opaque')) {{
    const copy = res.clone();
    caches.open(name).then(c => c.put(req, copy));
  }}
  return res;
}};

self.addEventListener('fetch', e => {{
  const req = e.request;
  if (req.method !== 'GET') return;                       // never touch a write
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;             // the database talks for itself
  if (/\\/sw\\.js$/.test(url.pathname)) return;             // the page reads the build off the wire, on purpose

  // the pictures, the typeface and the icons: whatever is in the cache is right
  const picture = /\\/img\\/.*\\.webp$/.test(url.pathname);
  const immutable = picture || /\\.(png|webp|woff2?|ico)$/.test(url.pathname);
  if (immutable) {{
    const bin = picture ? PICTURES : CACHE;
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => keep(bin, req, res)).catch(() => hit)));
    return;
  }}

  // the book itself: the copy on the phone, now; the wire behind it, when the copy is old enough to be worth asking
  e.respondWith(caches.match(req, {{ ignoreSearch: true }}).then(hit => {{
    if (hit) {{
      const at = Date.parse(hit.headers.get('date') || '') || 0;
      if (!at || Date.now() - at > FRESH_MS) e.waitUntil(fetch(req).then(res => keep(CACHE, req, res)).catch(() => {{}}));
      return hit;
    }}
    return fetch(req).then(res => keep(CACHE, req, res)).catch(() => caches.match('./index.html'));
  }}));
}});

/* A chat message from someone else, while the book is closed or in a pocket.
   Every push shows a notification — a phone that is sent one and shows
   nothing loses the right to be sent any. One a chat at a time: a busy chat
   updates the one on the lock screen rather than stacking twenty. */
self.addEventListener('push', e => {{
  let d = {{}};
  try {{ d = e.data ? e.data.json() : {{}}; }} catch (x) {{ d = {{ body: e.data ? e.data.text() : '' }}; }}
  const shown = self.registration.showNotification(d.title || 'The Union Invitational', {{
    body: d.body || 'New in the chat', tag: d.tag || 'chat', renotify: true,
    icon: './icon-192.png', badge: './icon-192.png', data: {{ room: d.room || '', bet: d.bet || '' }},
  }});
  const badge = self.navigator && self.navigator.setAppBadge ? self.navigator.setAppBadge().catch(() => {{}}) : null;
  e.waitUntil(Promise.all([shown, badge]));
}});

/* Tapped: back into the book, on the chat it came from, or the bet it is
   about — the open book if there is one, a new one if not. */
self.addEventListener('notificationclick', e => {{
  e.notification.close();
  const d = e.notification.data || {{}};
  const msg = d.bet ? {{ bet: d.bet }} : {{ chat: d.room || '' }};
  const url = d.bet ? './?bet=' + encodeURIComponent(d.bet) : './?chat=' + encodeURIComponent(d.room || '');
  e.waitUntil(self.clients.matchAll({{ type: 'window', includeUncontrolled: true }}).then(cs => {{
    for (const c of cs) {{ if ('focus' in c) {{ c.postMessage(msg); return c.focus(); }} }}
    return self.clients.openWindow(url);
  }}));
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

    body, pictures = unpack_images(body)
    written += pictures

    head = HEAD.format(green=GREEN, paper=PAPER, short=SHORT)
    head += (title.group(0) if title else '<title>%s</title>' % NAME) + '\n'
    head += '<style>\n' + face_css + '</style>\n</head>\n<body>\n'
    doc = head + body + FOOT.replace('__STAMP__', stamp)

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
        if f in pictures:
            continue
        print('%-46s %8.1f KB' % (os.path.relpath(f, ROOT), os.path.getsize(f) / 1024))
    print('%-46s %8.1f KB in %d files' % ('docs/app/img/', sum(os.path.getsize(f) for f in pictures) / 1024, len(pictures)))
    print('\nbuild %s — docs/app/ is ready to serve' % stamp)


if __name__ == '__main__':
    main()
