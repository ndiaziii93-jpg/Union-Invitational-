#!/usr/bin/env python3
"""Build the recap page: docs/recap/index.html.

The day's report as a page anyone can open from the WhatsApp group, on any
phone, with nothing installed and no sign-in — laid out exactly as the book
lays it out, read live from the shared book. One link a round:

    https://ndiaziii93-jpg.github.io/Union-Invitational-/recap/?r=r1

Run after tools/build.py and tools/pwa.py (it borrows the app's fonts and
course pictures from docs/app/):

    python3 tools/build.py && python3 tools/pwa.py && python3 tools/recap.py
"""
import os, re, sys, json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import build  # noqa: E402  — flatten() and the database address

SRC = os.path.join(ROOT, 'src')
OUT = os.path.join(ROOT, 'docs', 'recap')
APP = os.path.join(ROOT, 'docs', 'app')
SITE = 'https://ndiaziii93-jpg.github.io/Union-Invitational-/'
MODULES = ['data', 'config', 'rules', 'engine', 'dbsupa', 'store', 'recappage']

HEAD = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#3E5C43">
<meta name="description" content="The day's recap from the Union Invitational: the report, the Pairs Championship, every card, the MVP race and the photos.">
<meta property="og:title" content="The Day's Recap · The Union Invitational">
<meta property="og:description" content="The report, the Pairs Championship, every card, the MVP race and the photos from the round.">
<meta property="og:type" content="article">
<meta property="og:image" content="{site}app/icon-512.png">
<link rel="icon" href="../app/icon-192.png" type="image/png">
<link rel="apple-touch-icon" href="../app/apple-touch-icon.png">
<title>The Day's Recap · The Union Invitational</title>
<style>
{fonts}
</style>
<style>
{styles}
</style>
<style>
/* A page, not a window. The book raises the recap over a screen; here it is
   the screen, so the sheet sits on the paper with the pine strip at its
   head, and everything else is as the book has it. */
html, body {{ margin: 0; background: var(--paper); }}
body {{ padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); }}
.recappage {{ max-width: 1120px; margin: 0 auto; padding: 0 0 36px; }}
.recappage .recapbox {{ width: auto; max-height: none; overflow: visible; border-radius: 0; box-shadow: 0 0 0 .5px rgba(29,46,33,.16); }}
.recappage .recaptop .rm {{ text-decoration: none; display: inline-flex; align-items: center; }}
.recappage .chip {{ text-decoration: none; }}
.recappage .rt-who, .recappage .who {{ text-align: left; }}
.rp-foot {{ max-width: 1120px; margin: 0 auto; padding: 0 16px 28px; font-size: 12px; color: var(--turf); text-align: center; line-height: 1.5; }}
.rp-foot a {{ color: var(--green); }}
@media (min-width: 700px) {{ .recappage {{ padding-top: 24px; }} .recappage .recapbox {{ border-radius: 20px; }} }}
</style>
</head>
<body>
<div class="recappage">
  <div id="recap"><div class="recapbox"><div class="recaptop"><b>The Day's Recap</b><span class="rt-s">Reading the book…</span></div>
    <p class="empty" style="padding:28px 0">Reading the book…</p></div></div>
</div>
<p class="rp-foot">The Union Invitational · Belek, Türkiye · 26 October to 2 November 2026 · <a href="../app/">the whole book, boards and photos</a></p>
<script>
{images}
</script>
<script>
{vendor}
</script>
<script>
{bundle}
__m_recappage.boot({{ url: {url}, key: {key} }});
</script>
</body>
</html>
"""


def images():
    """The crest and the course pictures, borrowed from the built app."""
    page = os.path.join(APP, 'index.html')
    if not os.path.exists(page):
        sys.exit('run tools/pwa.py first — no docs/app/index.html')
    body = open(page, encoding='utf-8').read()
    table = {}
    m = re.search(r'window\.UI_IMAGES = (\{.*?\});\n', body)
    if m:
        for k, v in json.loads(m.group(1)).items():
            if k.startswith('course_'):
                table[k] = ('../app/' + v) if v.startswith('img/') else v
    m = re.search(r'window\.UI_CREST = ("data:[^"]*");', body)
    if m:
        table['crest'] = json.loads(m.group(1))
    return 'window.UI_IMAGES = ' + json.dumps(table) + ';'


def main():
    fonts = open(os.path.join(SRC, 'assets', 'fonts', 'source-serif.css'), encoding='utf-8').read()
    fonts = fonts.replace("url('fonts/", "url('../app/fonts/")
    styles = open(os.path.join(SRC, 'styles.css'), encoding='utf-8').read()
    vendor = os.path.join(SRC, 'vendor', 'supabase.min.js')
    vendor_js = open(vendor, encoding='utf-8').read() if os.path.exists(vendor) else ''
    bundle = '\n'.join(build.flatten(m) for m in MODULES)
    bundle = (bundle.replace('__BUILD__', 'recap')
              .replace('__SUPABASE_URL__', build.SUPABASE_URL)
              .replace('__SUPABASE_KEY__', build.SUPABASE_KEY))
    os.makedirs(OUT, exist_ok=True)
    doc = HEAD.format(site=SITE, fonts=fonts, styles=styles, images=images(), vendor=vendor_js, bundle=bundle,
                      url=json.dumps(build.SUPABASE_URL), key=json.dumps(build.SUPABASE_KEY))
    p = os.path.join(OUT, 'index.html')
    open(p, 'w', encoding='utf-8').write(doc)
    print('%-46s %8.1f KB' % (os.path.relpath(p, ROOT), os.path.getsize(p) / 1024))
    print('\nthe recap page is ready: %srecap/?r=r1' % SITE)


if __name__ == '__main__':
    main()
