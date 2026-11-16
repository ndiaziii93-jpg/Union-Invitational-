"""The edge functions, as pages you can copy from on a phone.

The commissioner runs this trip from an iPhone. A function that lives only in
the repository may as well not exist to him: GitHub on a phone shows a code
view he cannot select out of, and a chat window is no better for three hundred
lines. So each function gets a page on the site with one button that puts the
whole file on the clipboard.
"""
import html, os, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
FNS = [('notify', 'The notifications function',
        'Buzzes everyone when somebody posts in the chat, a bet is settled, '
        'or a round gets its first hole. Paste it over the whole of '
        'Edge Functions → notify → Edit, then Deploy.')]

PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#1D2E21">
<meta name="robots" content="noindex">
<link rel="icon" href="../../app/icon-192.png">
<title>{title}</title>
<style>
:root{{color-scheme:light;--paper:#E3DBCB;--page:#EEE8D5;--ink:#1D2E21;--turf:#5C6B55;--rule:#C4B896;--gold:#8C6B2F;--onpine:#EFE9D8;--pine:#3E5C43}}
*,*::before,*::after{{box-sizing:border-box}}
body{{margin:0;background:var(--paper);color:var(--ink);font:16px/1.45 'Iowan Old Style',Georgia,serif;
  padding:22px max(14px,env(safe-area-inset-right,0px)) 60px max(14px,env(safe-area-inset-left,0px))}}
.wrap{{max-width:1100px;margin:0 auto}}
h1{{margin:0 0 6px;font-size:clamp(22px,4vw,30px)}}
p{{margin:0 0 14px;color:var(--turf);max-width:76ch}}
.bar{{position:sticky;top:0;z-index:2;background:var(--paper);padding:10px 0 12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}}
button{{font:inherit;border:1px solid var(--ink);background:var(--pine);color:var(--onpine);
  border-radius:3px;padding:11px 18px;font-weight:600;cursor:pointer}}
button.ghost{{background:none;color:var(--ink);border-color:var(--rule)}}
.said{{font-size:13px;color:var(--gold);font-weight:700}}
pre{{margin:0;background:#17231A;color:#DCE7D8;border-radius:12px;padding:14px;overflow:auto;
  font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;max-height:70vh;-webkit-overflow-scrolling:touch}}
.foot{{margin-top:18px;font-size:13px;color:var(--turf);border-top:1px solid var(--rule);padding-top:12px}}
</style>
</head>
<body>
<div class="wrap">
  <h1>{title}</h1>
  <p>{blurb}</p>
  <div class="bar">
    <button id="copy">Copy the whole file</button>
    <button class="ghost" id="sel">Select it instead</button>
    <span class="said" id="said"></span>
  </div>
  <pre id="src">{body}</pre>
  <p class="foot">{lines} lines · <a href="../../">The Union Invitational</a></p>
</div>
<script>
(function () {{
  var src = document.getElementById('src'), said = document.getElementById('said');
  function tell(t) {{ said.textContent = t; setTimeout(function () {{ said.textContent = ''; }}, 2600); }}
  document.getElementById('copy').addEventListener('click', function () {{
    var text = src.textContent;
    if (navigator.clipboard && navigator.clipboard.writeText) {{
      navigator.clipboard.writeText(text).then(function () {{ tell('Copied — paste it over the function.'); }},
        function () {{ tell('Could not copy. Use Select it instead.'); }});
      return;
    }}
    tell('Could not copy. Use Select it instead.');
  }});
  document.getElementById('sel').addEventListener('click', function () {{
    var r = document.createRange(); r.selectNodeContents(src);
    var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    tell('Selected — hold and choose Copy.');
  }});
}}());
</script>
</body>
</html>
"""

def main():
    for name, title, blurb in FNS:
        src = (ROOT / 'supabase' / 'functions' / name / 'index.ts').read_text(encoding='utf-8')
        out = ROOT / 'docs' / 'setup' / name
        out.mkdir(parents=True, exist_ok=True)
        (out / 'index.html').write_text(PAGE.format(
            title=html.escape(title), blurb=html.escape(blurb),
            body=html.escape(src), lines=len(src.splitlines())), encoding='utf-8')
        print('  docs/setup/%s/index.html  (%d lines)' % (name, len(src.splitlines())))

if __name__ == '__main__':
    main()
