/* A REPORT THAT RUNS OUT OF ROOM. The writer has a ceiling on how long an
   answer may be; a long day can hit it mid-sentence. The book asks once more
   for a tighter report, and if that is cut off too, keeps the paragraphs
   that did come back rather than showing nothing.
   Run: node tools/recap-retry-test.mjs */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
writeFileSync(S + '/retry.html', '<!doctype html><html><head><meta charset="utf-8"></head><body>' + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };
const P = n => 'Paragraph ' + n + ' of the day, long enough to be a real paragraph about the golf and the banter.';
const full = JSON.stringify({ headline: 'DP runs away with it', narrative: [1, 2, 3, 4, 5, 6].map(P) });
const cut = full.slice(0, full.indexOf(P(4)) + 20);
const extras = JSON.stringify({ voices: [], swing: { value: '4 points', caption: 'The swing.' }, pairNotes: {}, honours: [{ slot: 'round_of_the_day', winner: 'g10', citation: 'DP.' }] });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
async function run(answers) {
  const ctx = await b.newContext();
  await ctx.addInitScript(a => {
    window.__asked = []; let i = 0;
    /* the story answers come from the list in turn; the extras answer is always the same */
    const fn = async input => { const q = String(input); window.__asked.push(q);
      if (/THE EXTRAS ONLY/.test(q)) return { text: a.extras, truncated: false };
      return a.story[Math.min(i++, a.story.length - 1)]; };
    window.claude = { use: async name => name === 'sample' ? fn : null };
  }, answers);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('file://' + S + '/retry.html'); await p.waitForTimeout(3000);
  await p.evaluate(() => { const x = document.createElement('button'); x.dataset.act = 'recapGen'; x.dataset.a = 'r2'; document.getElementById('app').appendChild(x); x.click(); });
  await p.waitForTimeout(1500);
  const out = await p.evaluate(() => ({ asked: window.__asked.filter(q => /THE STORY ONLY/.test(q)).length, extras: window.__asked.filter(q => /THE EXTRAS ONLY/.test(q)).length,
    shorter: /KEEP IT SHORTER/.test(window.__asked[1] || ''), body: (window.__T.recaps.r2 || {}).body || null }));
  await ctx.close();
  return { ...out, errs };
}
console.log('\ncut off once, then a tighter report fits');
let r = await run({ story: [{ text: cut, truncated: true }, { text: full, truncated: false }], extras });
ok('it asks once more, for a shorter report', [r.asked, r.shorter], [2, true]);
ok('and keeps the one that fits', r.body && r.body.narrative.length, 6);
console.log('\ncut off twice');
r = await run({ story: [{ text: cut, truncated: true }, { text: cut, truncated: true }], extras });
ok('the paragraphs that finished are kept, not an error', [r.asked, r.body && r.body.headline, r.body && r.body.narrative], [2, 'DP runs away with it', [P(1), P(2), P(3)]]);
console.log('\nnot cut off');
r = await run({ story: [{ text: full, truncated: false }], extras });
ok('a story that fits is asked for once, and the extras separately', [r.asked, r.extras, r.body && r.body.narrative.length, r.body && r.body.honours.length], [1, 1, 6, 1]);
console.log('\na placeholder where a paragraph should be');
r = await run({ story: [{ text: JSON.stringify({ headline: 'H', narrative: [P(1), 'paragraph two', P(3), P(4)] }), truncated: false }], extras });
ok('is dropped, the real paragraphs kept', r.body && r.body.narrative, [P(1), P(3), P(4)]);
ok('no errors on the way', r.errs, []);
await b.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
