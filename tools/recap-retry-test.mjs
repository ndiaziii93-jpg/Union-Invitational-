/* A REPORT THAT RUNS OUT OF ROOM. The writer has a ceiling on how long an
   answer may be, and its thinking counts against it, so a long day can be
   cut off part-way. The paragraphs that finished are kept and the writer is
   asked to carry the story on from the next one until the day has its long
   read; the extras (voices, honours) are asked for on their own.
   Run: node tools/recap-retry-test.mjs */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
writeFileSync(S + '/retry.html', '<!doctype html><html><head><meta charset="utf-8"></head><body>' + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');
const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };
const P = n => 'This is paragraph number ' + n + ' of the day, long enough to be a real paragraph about the golf and the banter.';
const story = (ns, extra = {}) => JSON.stringify({ headline: 'DP runs away with it', narrative: ns.map(P), ...extra });
const cutAfter = (ns, k) => { const s = story(ns); return s.slice(0, s.indexOf(P(k + 1)) + 20); };
const extras = JSON.stringify({ voices: [], swing: { value: '4 points', caption: 'The swing.' }, pairNotes: {}, honours: [{ slot: 'round_of_the_day', winner: 'g10', citation: 'DP.' }] });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
async function run(a) {
  const ctx = await b.newContext();
  await ctx.addInitScript(a => {
    window.__asked = []; let i = 0, j = 0;
    const fn = async input => { const q = String(input); window.__asked.push(q);
      if (/THE EXTRAS ONLY/.test(q)) return { text: a.extras, truncated: false };
      if (/CARRY THE STORY ON/.test(q)) return a.more[Math.min(j++, a.more.length - 1)];
      return a.story[Math.min(i++, a.story.length - 1)]; };
    window.claude = { use: async name => name === 'sample' ? fn : null };
  }, a);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('file://' + S + '/retry.html'); await p.waitForTimeout(3000);
  await p.evaluate(() => { const x = document.createElement('button'); x.dataset.act = 'recapGen'; x.dataset.a = 'r2'; document.getElementById('app').appendChild(x); x.click(); });
  await p.waitForTimeout(1800);
  const out = await p.evaluate(() => ({ kinds: window.__asked.map(q => /THE EXTRAS ONLY/.test(q) ? 'extras' : /CARRY THE STORY ON/.test(q) ? 'more' : /KEEP IT SHORTER/.test(q) ? 'shorter' : 'story'),
    from: (window.__asked.find(q => /CARRY THE STORY ON/.test(q)) || '').match(/from paragraph (\d+)/), body: (window.__T.recaps.r2 || {}).body || null }));
  await ctx.close();
  return { ...out, from: out.from ? +out.from[1] : null, errs };
}
const len = r => r.body && r.body.narrative.length;

console.log('\ncut off after three paragraphs');
let r = await run({ story: [{ text: cutAfter([1, 2, 3, 4, 5, 6, 7, 8, 9], 3), truncated: true }], more: [{ text: story([4, 5, 6, 7, 8, 9]), truncated: false }], extras });
ok('the three that finished are kept and the writer carries on from the fourth', [r.kinds, r.from], [['story', 'more', 'extras'], 4]);
ok('so the day still gets its long read, in order', [len(r), r.body && r.body.narrative[3]], [9, P(4)]);
ok('with the extras', r.body && r.body.honours.length, 1);

console.log('\ncut off twice on the way');
r = await run({ story: [{ text: cutAfter([1, 2, 3, 4, 5, 6, 7, 8, 9], 2), truncated: true }],
  more: [{ text: cutAfter([3, 4, 5, 6, 7, 8, 9], 5), truncated: true }, { text: story([6, 7, 8, 9]), truncated: false }], extras });
ok('it carries on again from wherever it stopped', [r.kinds, len(r)], [['story', 'more', 'more', 'extras'], 9]);

console.log('\na short story that fits');
r = await run({ story: [{ text: story([1, 2, 3, 4, 5]), truncated: false }], more: [{ text: story([6, 7, 8, 9]), truncated: false }], extras });
ok('is carried on to the long read too', [r.kinds, len(r)], [['story', 'more', 'extras'], 9]);

console.log('\na long story that fits');
r = await run({ story: [{ text: story([1, 2, 3, 4, 5, 6, 7, 8, 9]), truncated: false }], more: [], extras });
ok('is asked for once, and the extras separately', [r.kinds, len(r)], [['story', 'extras'], 9]);

console.log('\na placeholder where a paragraph should be');
r = await run({ story: [{ text: JSON.stringify({ headline: 'H', narrative: [P(1), 'paragraph two', P(3), P(4), P(5), P(6), P(7), P(8), P(9)] }), truncated: false }], more: [], extras });
ok('is dropped, the real paragraphs kept', [len(r), r.body && r.body.narrative.includes('paragraph two')], [8, false]);

console.log('\nthe writer will not carry on');
r = await run({ story: [{ text: cutAfter([1, 2, 3, 4, 5, 6, 7, 8, 9], 4), truncated: true }], more: [{ text: 'sorry', truncated: false }], extras });
ok('what finished still goes out', len(r), 4);
ok('no errors on the way', r.errs, []);
await b.close();
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
