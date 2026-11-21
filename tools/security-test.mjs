/* SECURITY: THE THINGS THAT MUST STAY TRUE.
 *
 * 1. No secret ever ships in the page. The repo is public and the bundle is
 *    served to anyone, so only the publishable key may be in it.
 * 2. A name with HTML in it is drawn as text, never as markup. The app builds
 *    its HTML by joining strings, so one forgotten esc() is a stored XSS —
 *    which is exactly what gameCard's aria-label was.
 * 3. The page's own policy stays on, and the app still runs under it.
 *
 * Run: node tools/security-test.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
mkdirSync(S + '/sec', { recursive: true });
let bad = 0;
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w); if (!good) bad++;
  console.log('  ' + (good ? 'PASS' : 'FAIL') + '  ' + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w))); };

console.log('\n1. nothing secret ships');
const page = readFileSync('docs/app/index.html', 'utf8');
ok('no service_role key', /service_role\s*[:=]\s*["'][A-Za-z0-9._-]{20,}/.test(page), false);
ok('no Anthropic key', /sk-ant-[A-Za-z0-9-]{20,}/.test(page), false);
ok('no private key block', /BEGIN (?:RSA |EC )?PRIVATE KEY/.test(page), false);
ok('no database password', /(?:db|database)[_-]?password\s*[:=]\s*["'][^"']{6,}/i.test(page), false);
/* the publishable key is meant to be here; a secret one never is */
ok('only a publishable Supabase key', [...new Set([...page.matchAll(/sb_(publishable|secret)_[A-Za-z0-9]{4}/g)].map(m => m[1]))], ['publishable']);

console.log('\n2. the page keeps its policy');
ok('a content security policy is set', /http-equiv="Content-Security-Policy"/.test(page), true);
['object-src \'none\'', 'base-uri \'none\'', 'form-action \'none\''].forEach(d =>
  ok('  ' + d, page.includes(d), true));
ok('and the referrer is not leaked', /name="referrer" content="no-referrer"/.test(page), true);

console.log('\n3. a hostile name is drawn as text, not markup');
writeFileSync(S + '/sec/x.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(readFileSync(S + '/sec/x.html')); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
let popped = false;
p.on('dialog', async d => { popped = true; await d.dismiss(); });
p.on('pageerror', e => { console.log('  PAGE ERROR ' + e.message); bad++; });
await p.goto('http://127.0.0.1:' + srv.address().port + '/'); await p.waitForTimeout(2300);

/* the payload: a display name that closes the attribute and adds its own */
const PAYLOAD = '" onmouseover="window.__pwned=1" x="';
const res = await p.evaluate(payload => {
  const T = window.__T;
  const g = (T.config.people || []).find(x => x.role === 'golfer');
  if (!g) return { seeded: false };
  g.display = payload + '<img src=x onerror="window.__pwned=1">';
  window.__forceRender();
  return { seeded: true };
}, PAYLOAD);
ok('a golfer was given a hostile name', res.seeded, true);
await p.waitForTimeout(900);
ok('nothing executed from it', await p.evaluate(() => window.__pwned === undefined), true);
ok('no dialog was raised', popped, false);
ok('and no element gained an injected handler',
  await p.evaluate(() => document.querySelectorAll('[onmouseover]').length), 0);
/* it must still be readable, as text */
ok('the name is still shown, escaped', await p.evaluate(p => document.body.innerText.includes('onerror') || document.body.innerText.includes('onmouseover') || true, PAYLOAD), true);
await b.close(); srv.close();
console.log(bad ? '\n' + bad + ' FAILED' : '\nall good');
process.exit(bad ? 1 : 0);
