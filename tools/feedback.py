#!/usr/bin/env python3
"""THE FEEDBACK PAGE. The same form the book puts up, as a page of its own
for the link in the WhatsApp: docs/feedback/index.html. It talks to the
database's feedback_submit directly (the publishable key is safe in a page)
and remembers on the phone that it was answered, under the same key the
book uses, so the book stops asking too.
Run: python3 tools/feedback.py"""
import os, sys, json
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'src')
OUT = os.path.join(ROOT, 'docs', 'feedback')
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import build  # noqa: E402

SITE = 'https://ndiaziii93-jpg.github.io/Union-Invitational-/'
HEAD = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>How was it? · The Union Invitational</title>
<meta name="description" content="Two minutes of feedback on the Union Invitational, Belek 2026. Only the commissioner sees your answers.">
<meta property="og:title" content="How was it? · The Union Invitational">
<meta property="og:description" content="Two minutes. Only the commissioner sees your answers.">
<meta name="theme-color" content="#1E3A2B">
<link rel="icon" href="../app/icon-192.png">
<style>{fonts}</style>
<style>{styles}</style>
<style>
html,body{{margin:0;background:var(--paper);color:var(--ink)}}
.fbpage{{max-width:560px;margin:0 auto;padding:14px 14px 40px}}
.fbbox{{background:var(--page);border:1px solid var(--rule);border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,.14);overflow:hidden}}
.fbband{{background:var(--pine);color:var(--onpine);padding:16px 18px 14px;border-bottom:3px solid var(--gold-up)}}
.fbband small{{display:block;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--gold-up);font-weight:800}}
.fbband h1{{margin:4px 0 2px;font-size:24px;line-height:1.1;font-family:var(--serif)}}
.fbband p{{margin:6px 0 0;font-size:14px;opacity:.9;font-style:italic}}
.fbbody{{padding:16px 18px 18px}}
.fbbtn{{display:block;width:100%;padding:13px;border-radius:12px;border:0;background:var(--pine);color:var(--onpine);font:inherit;font-weight:800;font-size:16px;cursor:pointer;margin-top:6px}}
.fbbtn.ghost{{background:none;border:1px solid var(--rule);color:var(--ink);font-weight:600;margin-top:8px}}
.fbbtn[disabled]{{opacity:.6}}
.fbnote{{font-size:13px;color:var(--turf);text-align:center;margin:12px 0 0}}
.fbnote a{{color:var(--pine)}}
</style>
</head>
<body>
<div class="fbpage">
  <div class="fbbox">
    <div class="fbband"><small>The Union Invitational · Belek 2026</small><h1>How was it?</h1><p>Two minutes. Only the commissioner sees your answers.</p></div>
    <div class="fbbody" id="fb"><p class="fb-intro">Loading…</p></div>
  </div>
  <p class="fbnote">The book: <a href="../app/">open the app</a></p>
</div>
<script>
{bundle}
(function () {{
  var F = __m_feedback, URL = {url}, KEY = {key};
  var DONE = 'union-invitational:feedback', DRAFT = 'union-invitational:feedback-draft', DEV = 'union-invitational:device', PEND = 'union-invitational:feedback-pending', WHO = 'union-invitational:whoami';
  var get = function (k) {{ try {{ return localStorage.getItem(k); }} catch (e) {{ return null; }} }};
  var put = function (k, v) {{ try {{ if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); }} catch (e) {{}} }};
  var dev = get(DEV); if (!dev) {{ dev = 'd' + Math.random().toString(36).slice(2, 8); put(DEV, dev); }}
  var box = document.getElementById('fb');
  var esc = function (s) {{ return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {{ return {{ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }}[c]; }}); }};
  var sent = null; try {{ sent = JSON.parse(get(DONE) || 'null'); }} catch (e) {{ sent = null; }}
  var draft = null; try {{ draft = JSON.parse(get(DRAFT) || 'null'); }} catch (e) {{ draft = null; }}
  function when(ms) {{ try {{ var d = new Date(ms); return d.toLocaleString(); }} catch (e) {{ return ''; }} }}
  function thanks(again) {{
    box.innerHTML = '<div class="fb-thanks"><b>Thank you.</b>That has gone to the commissioner.' + (again ? ' Sending again replaces your earlier answers.' : '') + '</div>'
      + '<button class="fbbtn ghost" id="edit">Edit my answers</button>';
    document.getElementById('edit').addEventListener('click', function () {{ form(sent && sent.doc); }});
  }}
  function form(a) {{
    box.innerHTML = (sent ? '<p class="fb-intro">You answered on ' + esc(when(sent.at)) + '. Sending again replaces it.</p>' : '<p class="fb-intro">Skip anything you have no view on.</p>')
      + F.formHtml(a) + '<p class="fb-err" id="err" hidden></p><button class="fbbtn" id="send">Send my answers</button><p class="fb-foot">Goes only to the commissioner. You can\\'t see anyone else\\'s.</p>';
    box.addEventListener('click', function (e) {{
      var b = e.target.closest('[data-act]'); if (!b) return;
      if (b.dataset.act === 'fbStar') {{ var all = b.parentNode.querySelectorAll('.fb-star'), n = +b.dataset.a; all.forEach(function (x, i) {{ x.classList.toggle('on', i < n); x.setAttribute('aria-pressed', i + 1 === n); }}); keep(); }}
      if (b.dataset.act === 'fbChip') {{ b.parentNode.querySelectorAll('.fb-chip').forEach(function (x) {{ x.classList.toggle('on', x === b); }}); keep(); }}
    }});
    box.addEventListener('input', keep);
    document.getElementById('send').addEventListener('click', send);
  }}
  function keep() {{ put(DRAFT, JSON.stringify(F.readForm(box))); }}
  function send() {{
    var doc = F.tidy(F.readForm(box)), err = document.getElementById('err'), btn = document.getElementById('send');
    if (F.empty(doc)) {{ err.textContent = 'Nothing filled in yet.'; err.hidden = false; return; }}
    btn.disabled = true; btn.textContent = 'Sending…'; err.hidden = true;
    post(doc).then(function () {{
      var was = !!sent; sent = {{ at: Date.now(), doc: doc }}; put(DONE, JSON.stringify(sent)); put(DRAFT, null); put(PEND, null); thanks(was);
    }}, function (e) {{
      btn.disabled = false; btn.textContent = 'Send my answers';
      if (e && e.code === 'refused') {{ err.textContent = 'The book turned it down: ' + e.message; err.hidden = false; return; }}
      put(PEND, JSON.stringify(doc));
      err.textContent = 'No signal just now. Your answers are kept on this phone; open this page again with a signal and they will go.'; err.hidden = false;
    }});
  }}
  function post(doc) {{
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null; if (ctl) setTimeout(function () {{ ctl.abort(); }}, 20000);
    var who = get(WHO) || '';
    var body = who ? {{ p_dev: dev, p_doc: doc, p_pid: who }} : {{ p_dev: dev, p_doc: doc }};
    return fetch(URL + '/rest/v1/rpc/feedback_submit', {{ method: 'POST', headers: {{ 'content-type': 'application/json', apikey: KEY, authorization: 'Bearer ' + KEY }}, body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined }})
      .then(function (r) {{ return r.text().then(function (t) {{ var v; try {{ v = JSON.parse(t); }} catch (e) {{ v = t; }} if (!r.ok) {{ var e2 = new Error(typeof v === 'object' && v && v.message ? v.message : 'HTTP ' + r.status); e2.code = r.status >= 400 && r.status < 500 ? 'refused' : 'down'; throw e2; }} if (v !== 'ok') {{ var e3 = new Error(String(v).replace(/^denied:\\s*/, '')); e3.code = 'refused'; throw e3; }} return true; }}); }});
  }}
  var pend = null; try {{ pend = JSON.parse(get(PEND) || 'null'); }} catch (e) {{ pend = null; }}
  /* the book's own word on whether this phone (or the name it chose in the book) has answered, so a form sent from the app is not asked for again here */
  if (!sent && !pend) {{
    fetch(URL + '/rest/v1/rpc/feedback_done', {{ method: 'POST', headers: {{ 'content-type': 'application/json', apikey: KEY, authorization: 'Bearer ' + KEY }}, body: JSON.stringify({{ p_dev: dev, p_pid: get(WHO) || null, p_name: null }}) }})
      .then(function (r) {{ return r.ok ? r.json() : false; }}).then(function (v) {{ if (v === true && !get(DONE)) {{ sent = {{ at: Date.now(), remote: true }}; put(DONE, JSON.stringify(sent)); if (!draft) thanks(false); }} }}, function () {{}});
  }}
  if (pend) {{ post(pend).then(function () {{ sent = {{ at: Date.now(), doc: pend }}; put(DONE, JSON.stringify(sent)); put(PEND, null); put(DRAFT, null); thanks(false); }}, function () {{ form(pend); }}); }}
  else if (sent && !draft) thanks(false);
  else form(draft || (sent && sent.doc) || null);
}})();
</script>
</body>
</html>
"""


def main():
    fonts = open(os.path.join(SRC, 'assets', 'fonts', 'source-serif.css'), encoding='utf-8').read().replace("url('fonts/", "url('../app/fonts/")
    styles = open(os.path.join(SRC, 'styles.css'), encoding='utf-8').read()
    bundle = build.flatten('feedback')
    os.makedirs(OUT, exist_ok=True)
    doc = HEAD.format(fonts=fonts, styles=styles, bundle=bundle, url=json.dumps(build.SUPABASE_URL), key=json.dumps(build.SUPABASE_KEY))
    p = os.path.join(OUT, 'index.html')
    open(p, 'w', encoding='utf-8').write(doc)
    print('%-46s %8.1f KB' % (os.path.relpath(p, ROOT), os.path.getsize(p) / 1024))
    print('\nthe feedback page: %sfeedback/' % SITE)


if __name__ == '__main__':
    main()
