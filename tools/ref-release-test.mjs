/* A ref can hand back a mulligan or the breakfast ball spent by mistake,
   as the master reviewer can: a separate release beside the spent chip, a
   confirm, and the shot is in the golfer's hands again. A reader cannot.
   Run with the PINs armed: node tools/ref-release-test.mjs */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
const html = readFileSync('dist/union-invitational.html', 'utf8').replace('const PINS_ENABLED = false', 'const PINS_ENABLED = true');
if (!html.includes('const PINS_ENABLED = true')) throw new Error('could not arm the PINs');
writeFileSync(S + '/release.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' + html + '</body></html>');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const run = async (role, pin) => {
  const p = await (await b.newContext({ viewport: { width: 420, height: 900 } })).newPage();
  p.on('pageerror', e => { console.log('  PAGE ERROR:', String(e).split('\n')[0]); fails.push('pageerror'); });
  await p.addInitScript(([role, pin]) => { try { if (role) localStorage.setItem('union-invitational:role', JSON.stringify({ role, pin })); } catch (e) {} }, [role, pin]);
  await p.goto('file://' + S + '/release.html'); await p.waitForTimeout(3000);
  for (let i = 0; i < 6; i++) { const m = p.locator('.scrim [data-act="modalCancel"]'); if (await m.count()) { await m.first().click({ force: true }); await p.waitForTimeout(200); } else break; }
  /* a round open, the front mulligan of the first golfer of the first group spent */
  const pid = await p.evaluate(() => { const T = window.__T, rid = window.__UI.entryRound; T.config.rounds[rid].state = 'open';
    const g = window.__T.config.rounds[rid]; const first = (T.config.pairs[0] || {}).members ? T.config.pairs[0].members[0] : 'g1';
    T.scores[rid + '__' + first] = { raw: Array(18).fill(null), by: {}, at: {}, marks: {}, mF: true, mB: false, bb: false };
    window.__UI.screen = 'entry'; window.__forceRender(); return first; });
  await p.waitForTimeout(500);
  return { p, pid };
};
console.log('\na ref');
{
  const { p, pid } = await run('s1', '2000');
  await p.locator('.ptile[data-act="padOpen"][data-a="' + pid + '"]').dispatchEvent('click'); await p.waitForTimeout(300);
  ok('the spent mulligan reads Used', /Used/.test(await p.locator('.keypad .mchip', { hasText: 'Front mulligan' }).innerText()), true);
  ok('and a ref gets the release beside it', await p.locator('.keypad [data-act="unspend"][data-b="mF"]').count(), 1);
  await p.locator('.keypad [data-act="unspend"][data-b="mF"]').click(); await p.waitForTimeout(400);
  ok('which asks first', await p.locator('.modal [data-act="confirmOk"]').count(), 1);
  await p.locator('[data-act="confirmOk"]').click(); await p.waitForTimeout(500);
  ok('and then hands it back', await p.evaluate(([pid]) => window.__T.scores[window.__UI.entryRound + '__' + pid].mF, [pid]), false);
  /* a ref scores; the golfers' questions are not put to him */
  ok('a ref is not offered My round', await p.locator('.lanes').count(), 0);
  await p.evaluate(([pid]) => { const T = window.__T, rid = window.__UI.entryRound; const c = T.scores[rid + '__' + pid];
    c.raw[1] = 7; c.at = { 1: Date.now() }; window.__UI.me = pid; window.__UI.screen = 'today'; window.__forceRender(); }, [pid]);
  await p.waitForTimeout(400);
  ok('nor asked how a hole felt, even on a double', await p.locator('.feelbar').count(), 0);
}
console.log('\nsomebody with no PIN');
{
  const { p, pid } = await run(null, '');
  ok('sees no tile to open and no release', await p.locator('.ptile[data-act="padOpen"], [data-act="unspend"]').count(), 0);
  /* a release button forged into the page and tapped at once */
  await p.evaluate(([pid]) => { const el = document.createElement('button'); el.dataset.act = 'unspend'; el.dataset.a = pid; el.dataset.b = 'mF';
    document.getElementById('app').appendChild(el); el.click(); }, [pid]);
  await p.waitForTimeout(400);
  ok('and a forged tap does nothing', [await p.locator('.modal [data-act="confirmOk"]').count(), await p.evaluate(([pid]) => window.__T.scores[window.__UI.entryRound + '__' + pid].mF, [pid])], [0, true]);
}
await b.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
