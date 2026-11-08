#!/usr/bin/env python3
"""Build the practice manual page: docs/manual/index.html.

One link a golfer, read live from the shared book, laid out for a phone and
for paper (Save as PDF is the browser's own print):

    https://ndiaziii93-jpg.github.io/Union-Invitational-/manual/?p=g3

Run after tools/build.py and tools/pwa.py:

    python3 tools/build.py && python3 tools/pwa.py && python3 tools/manual.py
"""
import os, sys, json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import build  # noqa: E402
import recap  # noqa: E402  — the crest, borrowed the same way

SRC = os.path.join(ROOT, 'src')
OUT = os.path.join(ROOT, 'docs', 'manual')
SITE = 'https://ndiaziii93-jpg.github.io/Union-Invitational-/'
MODULES = ['data', 'config', 'rules', 'engine', 'drills', 'drillart', 'manual', 'report', 'dbsupa', 'store', 'recappage', 'manualpage']

HEAD = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#3E5C43">
<meta name="description" content="A practice manual a golfer from the Union Invitational: the drills picked from their report card, with drawings, scores and the coaches on video.">
<meta property="og:title" content="The Practice Manual · The Union Invitational">
<meta property="og:description" content="The drills picked from your report card, with drawings, a way to score each and a coach on video.">
<meta property="og:type" content="article">
<meta property="og:image" content="{site}app/icon-512.png">
<link rel="icon" href="../app/icon-192.png" type="image/png">
<link rel="apple-touch-icon" href="../app/apple-touch-icon.png">
<title>The Practice Manual · The Union Invitational</title>
<style>
{fonts}
</style>
<style>
{styles}
</style>
<style>
/* A page, not a window. */
html, body {{ margin: 0; background: var(--paper); }}
body {{ padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); font-family: 'Source Serif 4', 'Source Serif', Georgia, serif; color: var(--ink); }}
.mnpage {{ max-width: 760px; margin: 0 auto; padding: 0 0 36px; }}
.mnpage .manual {{ background: var(--page); box-shadow: 0 0 0 .5px rgba(29,46,33,.16); }}
.mnbar {{ max-width: 760px; margin: 0 auto; display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; padding: 10px 14px; }}
.mnbar .btn {{ text-decoration: none; }}
.mn-foot2 {{ max-width: 760px; margin: 0 auto; padding: 0 16px 28px; font-size: 12px; color: var(--turf); text-align: center; line-height: 1.5; }}
.mn-foot2 a {{ color: var(--green); }}
@media (min-width: 700px) {{ .mnpage {{ padding-top: 16px; }} .mnpage .manual {{ border-radius: 20px; overflow: hidden; }} }}
@media print {{
  @page {{ margin: 14mm; }}
  html, body {{ background: #fff; padding: 0; }}
  .mnbar, .mn-foot2 {{ display: none !important; }}
  .mnpage {{ max-width: none; padding: 0; }}
  .mnpage .manual {{ box-shadow: none; background: #fff; }}
  .mn-drill {{ break-inside: avoid; page-break-inside: avoid; }}
  .mn-band {{ break-after: avoid; }}
  .mn-video {{ color: var(--ink); }}
  .mn-video::after {{ content: ' ' attr(href); font-size: 10px; color: var(--turf); display: block; }}
  .da * {{ animation: none !important; }}
}}
</style>
</head>
<body>
<div class="mnbar" id="mnbar" hidden>
  <button class="btn ghost" onclick="window.print()">Save as PDF</button>
  <button class="btn ghost" id="mnshare" onclick="(navigator.share ? navigator.share({{ title: document.title, url: location.href }}) : navigator.clipboard.writeText(location.href)).catch(function(){{}})">Share</button>
</div>
<div class="mnpage">
  <div id="manual"><div class="manual"><div class="rp-band mn-band"><small>Practice manual</small><h2>Reading the book…</h2></div></div></div>
</div>
<p class="mn-foot2">The Union Invitational · Belek, Türkiye · 2026 · <a href="../recap/?r=report">the players report</a> · <a href="../app/">the whole book</a></p>
<script>
{images}
</script>
<script>
{vendor}
</script>
<script>
{bundle}
__m_manualpage.boot({{ url: {url}, key: {key} }});
</script>
</body>
</html>
"""


def main():
    fonts = open(os.path.join(SRC, 'assets', 'fonts', 'source-serif.css'), encoding='utf-8').read()
    fonts = fonts.replace("url('fonts/", "url('../app/fonts/")
    styles = open(os.path.join(SRC, 'styles.css'), encoding='utf-8').read()
    vendor = os.path.join(SRC, 'vendor', 'supabase.min.js')
    vendor_js = open(vendor, encoding='utf-8').read() if os.path.exists(vendor) else ''
    bundle = '\n'.join(build.flatten(m) for m in MODULES)
    bundle = (bundle.replace('__BUILD__', 'manual')
              .replace('__SUPABASE_URL__', build.SUPABASE_URL)
              .replace('__SUPABASE_KEY__', build.SUPABASE_KEY))
    os.makedirs(OUT, exist_ok=True)
    doc = HEAD.format(site=SITE, fonts=fonts, styles=styles, images=recap.images(), vendor=vendor_js, bundle=bundle,
                      url=json.dumps(build.SUPABASE_URL), key=json.dumps(build.SUPABASE_KEY))
    p = os.path.join(OUT, 'index.html')
    open(p, 'w', encoding='utf-8').write(doc)
    print('%-46s %8.1f KB' % (os.path.relpath(p, ROOT), os.path.getsize(p) / 1024))
    print('\nthe manual page is ready: %smanual/' % SITE)


if __name__ == '__main__':
    main()
