/* Ask the Union answers the tournament and nothing else: an off-topic
   question gets no answer and a strike, the third closes the box on that
   phone for a day, and the master reviewer's phone is never closed.
   Run: node tools/ask-scope-test.mjs */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
writeFileSync(S + '/askscope.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
/* a sampler that answers like the rules ask it to: the trip, or OFF_TOPIC */
const MOCK = () => {
  window.__prompts = [];
  const sample = async (input, opts) => {
    const sys = input[0].content, q = input[1].content; window.__prompts.push(sys);
    const off = /weather in london|capital of|write me code|bitcoin/i.test(q);
    const text = off ? 'OFF_TOPIC' : 'Nobody is leading yet; no cards are in.';
    await new Promise(r => setTimeout(r, 80));
    if (opts && opts.onText) opts.onText({ text });
    return { text, truncated: false };
  };
  window.claude = { use: async n => (n === 'sample' ? sample : null) };
};
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await (await b.newContext({ viewport: { width: 420, height: 900 } })).newPage();
p.on('pageerror', e => { console.log('  PAGE ERROR:', String(e).split('\n')[0]); fails.push('pageerror'); });
await p.addInitScript(MOCK);
await p.goto('file://' + S + '/askscope.html'); await p.waitForTimeout(3000);
const shut = async () => { for (let i = 0; i < 6; i++) { const m = p.locator('.scrim [data-act="modalCancel"]'); if (await m.count()) { await m.first().click({ force: true }); await p.waitForTimeout(200); } else return; } };
await shut();
await p.locator('[data-act="askOpen"]').first().click(); await p.waitForTimeout(500);
const ask = async q => { await p.locator('#askField').fill(q); await p.locator('[data-act="askSend"]').click(); await p.waitForTimeout(500);
  const it = p.locator('.askitem').first(); return { a: (await it.locator('.aska').innerText()).trim() }; };
ok('the rules tell the writer to answer the tournament only', (await ask('Who is leading?'), /THIS TOURNAMENT ONLY/.test(await p.evaluate(() => window.__prompts[0]))), true);
ok('and to say OFF_TOPIC for anything else', /exactly the single word OFF_TOPIC/.test(await p.evaluate(() => window.__prompts[0])), true);
ok('a question about the trip is answered', /Nobody is leading yet/.test((await p.locator('.askitem').first().locator('.aska').innerText())), true);
let r = await ask('What is the weather in London?');
ok('one off the trip gets no answer and a strike', /not about the tournament/.test(r.a) && /1 of 3/.test(r.a), true);
r = await ask('What is the capital of Peru?');
ok('a second counts', /2 of 3/.test(r.a), true);
r = await ask('Write me code for a website');
ok('the third closes the box', /closed on this phone until/.test(r.a), true);
r = await ask('Who is leading?');
ok('and a real question is turned away while it is closed', /closed on this phone until/.test(r.a), true);
ok('without reaching the writer', await p.evaluate(() => window.__prompts.length), 4);
/* the master reviewer's phone is never closed */
await p.evaluate(() => { window.__UI.role = 'master'; });
r = await ask('Who is leading?');
ok('the master\'s phone is never closed', /Nobody is leading yet/.test(r.a), true);
r = await ask('bitcoin price?');
ok('and gets no strike, only the refusal', /not about the tournament/.test(r.a) && !/of 3/.test(r.a), true);
await b.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
