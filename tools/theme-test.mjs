/* One palette, whatever the phone is set to.
 *
 * The book used to carry a night version and follow the phone into it. It
 * does not any more, and "does not" has to mean something stronger than
 * "the dark rules were deleted": a page that leaves `color-scheme` alone
 * still gets its SELECTS, TEXT FIELDS, SCROLLBARS and the on-screen keyboard
 * drawn in the system's dark chrome, on top of a cream page. So this opens
 * every build with the operating system set to dark and checks both halves.
 *
 * Run: node tools/theme-test.mjs
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };

/* The printed palette, as the stylesheet states it. */
const PAPER = 'rgb(227, 219, 203)';      // --paper  #E3DBCB
const INK = 'rgb(29, 46, 33)';           // --ink     #1D2E21

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

/* The two artifact copies are fragments: the host wraps them in a document,
   and this wrapper stands in for it — including the host's own reset, so the
   test is not quietly kinder than the real thing. */
const wrap = f => '<!doctype html><html><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width, initial-scale=1">'
  + '<style>body{margin:0}img{max-width:100%}</style></head><body>'
  + readFileSync(f, 'utf8') + '</body></html>';

const BUILDS = [
  ['the book on the shared database', wrap('dist/union-invitational.html'), 'theme-db.html'],
  ['the team test copy', wrap('dist/union-invitational-sandbox.html'), 'theme-sandbox.html'],
  ['the installed app', readFileSync('docs/app/index.html', 'utf8'), 'theme-app.html'],
];

for (const [name, html, file] of BUILDS) {
  writeFileSync(S + '/' + file, html);
  console.log('\n' + name + ', on a phone set to dark');
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true, colorScheme: 'dark' });
  const p = await ctx.newPage();
  p.on('pageerror', e => { console.log('  PAGE ERROR:', String(e).split('\n')[0]); fails.push('pageerror'); });
  await p.goto('file://' + S + '/' + file);
  await p.waitForSelector('.masthead h1', { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(3600);            // past the crest
  for (let i = 0; i < 4; i++) { const m = p.locator('.scrim [data-act="modalCancel"]');
    if (!await m.count()) break; await m.first().click({ force: true }).catch(() => {}); await p.waitForTimeout(220); }

  ok('the operating system really is set to dark', await p.evaluate(
    () => matchMedia('(prefers-color-scheme: dark)').matches), true);
  ok('the page is still printed on cover stock', await p.evaluate(
    () => getComputedStyle(document.body).backgroundColor), PAPER);
  ok('and the type is still pine ink', await p.evaluate(
    () => getComputedStyle(document.body).color), INK);
  /* The half that deleting the rules does not cover: the browser's own
     widgets. Left at the default, `select` and `input` come up dark. */
  ok('the browser is told to draw its own parts light', await p.evaluate(
    () => getComputedStyle(document.documentElement).colorScheme), 'light');

  /* And nothing anywhere still switches on the phone's setting. */
  ok('no rule anywhere waits for a dark phone', await p.evaluate(() =>
    [...document.styleSheets].flatMap(sh => { try { return [...sh.cssRules]; } catch (e) { return []; } })
      .filter(r => (r.conditionText || '').includes('prefers-color-scheme')).length), 0);
  ok('and no night palette is left to be switched to', await p.evaluate(() =>
    [...document.styleSheets].flatMap(sh => { try { return [...sh.cssRules]; } catch (e) { return []; } })
      .filter(r => (r.selectorText || '').includes('data-theme')).length), 0);

  await ctx.close();
}

await b.close();
console.log(fails.length ? '\nFAILED: ' + fails.join(', ')
  : '\nOne palette, in everybody\'s hand.');
process.exit(fails.length ? 1 : 0);
