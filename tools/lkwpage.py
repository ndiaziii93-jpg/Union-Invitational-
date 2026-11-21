#!/usr/bin/env python3
"""The Lakewood preview: eighteen holes as the book now draws them.

For the commissioner to check the reading against the real golf course,
hole by hole, on a phone, without Claude and without signing in to
anything. Writes docs/preview/lakewood/.

Run AFTER tools/lakewood-shots.mjs has made the pictures.
"""
import pathlib, shutil, html
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
SHOTS = pathlib.Path('/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad/lkwshots')
OUT = ROOT / 'docs' / 'preview' / 'lakewood'

# par, stroke index and White yardage off the club's printed card
CARD = [(4,7,409),(4,3,389),(3,17,139),(4,15,330),(3,13,196),(4,1,437),(5,9,494),(4,11,337),(5,5,495),
        (4,2,388),(4,10,356),(3,12,203),(4,4,391),(5,14,476),(4,18,323),(4,8,356),(3,16,178),(5,6,519)]

READ = {
 1:"A gentle opener. The fairway drifts right, trees down the right the whole way, sand on both sides of the green.",
 2:"Water the entire left side, tee to green — it never leaves the hole. Trees the whole right. One bunker right of the fairway, one short-right of the green.",
 3:"The signature short hole. A lake crosses wall to wall: a full forced carry that starts at the 62 yard marker and runs to the front edge. Raised green beyond it, sand front-left and front-right, trees across the back.",
 4:"Narrow and straight. Heavy trees down both sides the whole way, no water — the corridor is the entire defence. Sand left and right of the drive, and right of the green.",
 5:"The long par 3, straight down an avenue of trees. Bunker right of the green, another short-left. A pond sits well left and long, off the edge of play.",
 6:"Stroke one. A dogleg right with the creek on the inside of it: water the whole right side, then it cuts hard in at about 40% and pinches the landing area. Big bunker front-right of the green, one back-left. Heavy trees down the entire left.",
 7:"Doglegs left and climbs to a green tucked in the corner. Fairway bunker out right in the driving zone, one at the inside-left corner, one front-left of the green. Dense trees down the left.",
 8:"Short, but a wall of trees down the left and a second line right. Straight up the middle. Sand right of the drive, then left and right at the green.",
 9:"Wide and generous off the tee, waisting in at about halfway. Trees down the entire left. The lake takes the whole right side from mid-hole past the green. Bunkers ring the green.",
 10:"Second hardest. Uphill all the way, bending gently left, to a green on the crest you must thread between a big bunker front-left and one front-right.",
 11:"The lake holds the left for the first half of the hole; the fairway bends right away from it. Trees down the right and across the back. Fairway bunker right in the driving zone, one right of the green.",
 12:"Miss it left and it is wet — water along the whole left, and a second pond up and left beyond the green. Miss it right and it is sand: two bunkers out there. Shallow green, bunker tight front-left.",
 13:"Long, straight and uphill, tree-lined both sides. Sand on both sides of the drive — a big sprawling one right, one left — then two short-left of the green and one right.",
 14:"A long avenue of trees, no water, a waist in the middle. Green at the far end with a long bunker short-left and one right.",
 15:"The kindest hole on the card. Short, up a gentle rise, trees both sides and round the back. Three bunkers guard the green: a big one out left, one short-left against the fairway, one right.",
 16:"Bends left and climbs. Thick trees down the left, scattered right. One big bunker owns the right of the driving zone — the only real hazard off the tee. Sand right of the green.",
 17:"A shelf green with sand out front on both sides: one well out front-left, and a big sprawling one front-right that eats the whole right approach. Trees right and across the back, open to the left.",
 18:"Uphill home. Bends gently right then back left. Trees both sides the whole way, and a pair of bunkers pinching the lay-up — one left, one right. Sand both sides of the green.",
}

def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    (OUT / 'h').mkdir(parents=True)
    cards = []
    for n in range(1, 19):
        src = SHOTS / ('h%02d.png' % n)
        im = Image.open(src).convert('RGB')
        # the app's own footer bar repeats the par and the yardage, which the
        # card beside the picture already says, so it comes off
        im = im.crop((0, 0, im.width, int(im.height * .865)))
        im = im.resize((im.width // 2, im.height // 2), Image.LANCZOS)
        im.save(OUT / 'h' / ('%02d.jpg' % n), quality=74, optimize=True)
        par, si, yds = CARD[n - 1]
        cards.append(
          '<article class="hole"><div class="shot"><img src="h/%02d.jpg" width="%d" height="%d" '
          'alt="The %s hole at Lakewood, as the book draws it" loading="lazy"></div>'
          '<div class="say"><h2>The %s</h2>'
          '<p class="card"><b>Par %d</b><span>Stroke index %d</span><span>%d yds · White</span></p>'
          '<p>%s</p></div></article>'
          % (n, im.width, im.height, ORD[n], ORD[n], par, si, yds, html.escape(READ[n])))
    (OUT / 'index.html').write_text(PAGE.replace('@@HOLES@@', '\n'.join(cards)), encoding='utf-8')
    kb = sum(f.stat().st_size for f in OUT.rglob('*')) / 1024
    print('docs/preview/lakewood/  %d holes, %.0f KB' % (18, kb))
    print('https://ndiaziii93-jpg.github.io/Union-Invitational-/preview/lakewood/')

ORD = {1:'1st',2:'2nd',3:'3rd',4:'4th',5:'5th',6:'6th',7:'7th',8:'8th',9:'9th',
       10:'10th',11:'11th',12:'12th',13:'13th',14:'14th',15:'15th',16:'16th',17:'17th',18:'18th'}

PAGE = """<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lakewood, hole by hole &middot; Union Invitational</title>
<meta name="description" content="Lakewood Country Club as the Union Invitational book now draws it, hole by hole, to check against the real golf course.">
<style>
  :root{--paper:#E3DBCB;--page:#EEE8D5;--card:#F7F2E6;--ink:#1D2E21;--turf:#515E4B;
        --green:#3E5C43;--rule:#C4B896;--hair:#DCD1B4;--gold:#715726;--pine:#1D2E21;--onpine:#EEE8D5}
  *{box-sizing:border-box}
  html{-webkit-text-size-adjust:100%}
  body{margin:0;background:var(--page);color:var(--ink);
       font:16px/1.55 ui-serif,Georgia,'Times New Roman',serif;padding:0 16px 64px}
  .wrap{max-width:980px;margin:0 auto}
  header{padding:40px 0 8px;border-bottom:2px solid var(--rule)}
  h1{margin:0 0 6px;font-size:clamp(28px,6vw,44px);letter-spacing:-.01em}
  .sub{margin:0;color:var(--turf);font-size:15px}
  .note{margin:22px 0 0;padding:14px 16px;background:var(--card);border:1px solid var(--hair);
        border-radius:12px;font-size:14.5px;color:var(--turf)}
  .note b{color:var(--ink)}
  .holes{display:grid;gap:30px;margin:30px 0 0}
  .hole{display:grid;grid-template-columns:1fr;gap:14px;background:var(--card);
        border:1px solid var(--hair);border-radius:16px;padding:16px;align-items:start}
  .shot{background:var(--paper);border-radius:12px;overflow:hidden;line-height:0}
  .shot img{width:100%;height:auto;display:block}
  .say h2{margin:0 0 8px;font-size:22px}
  .card{margin:0 0 10px;display:flex;flex-wrap:wrap;gap:8px 14px;align-items:baseline;
        font-size:13.5px;color:var(--turf);text-transform:uppercase;letter-spacing:.06em}
  .card b{font-size:15px;color:var(--gold);letter-spacing:.04em}
  .say p{margin:0;font-size:15.5px}
  footer{margin:46px 0 0;padding-top:18px;border-top:1px solid var(--rule);
         font-size:14px;color:var(--turf)}
  footer a{color:var(--green)}
  @media (min-width:760px){
    .hole{grid-template-columns:272px 1fr;gap:24px}
    .say h2{font-size:25px}
  }
  @media (prefers-color-scheme:dark){
    :root:not([data-theme="light"]){--page:#141C16;--card:#1B251D;--paper:#101710;
      --ink:#E7E2D2;--turf:#A9B7A4;--rule:#3A4A3B;--hair:#2C3A2E;--gold:#C9A253;--green:#9FC2A2}
  }
</style>
</head><body><div class="wrap">
<header>
  <h1>Lakewood, hole by hole</h1>
  <p class="sub">Lakewood Country Club &middot; 3101 Carson Street, Lakewood, California &middot; par 72</p>
</header>

<p class="note"><b>What this is.</b> Every hole at Lakewood now stands up in the book
the same way Leatherhead does. The shapes were read by hand off the hole-by-hole
flyovers &mdash; which way each hole bends, how wide the fairway runs, which side the
water is on, where the sand sits and how far out &mdash; and then built in the book's
own renderer. The pictures below are what the book draws, not the flyovers.
<b>Not a survey.</b> It is a reading, and the window in the app says so on every hole.
If any of it is wrong about the golf course, say which hole and what, and it gets fixed.</p>

<div class="holes">
@@HOLES@@
</div>

<footer>
Union Invitational &middot; <a href="../../">back to the book</a>
</footer>
</div></body></html>
"""

if __name__ == '__main__':
    main()
