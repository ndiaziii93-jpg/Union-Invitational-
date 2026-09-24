/* The forecast: reading somebody else's JSON without trusting it, and the
   strip that shows it. Run: node tools/weather-test.mjs */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
writeFileSync(S + '/wt.html', '<!doctype html><html><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width, initial-scale=1">'
  + '</head><body>' + readFileSync('dist/union-invitational-sandbox.html', 'utf8') + '</body></html>');

const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };

const W = await import('../src/weather.js');

/* ---- 1. the pictures and the numbers ---- */
ok('a clear sky by day is the sun', W.look(0, true).glyph, 'sun');
ok('and by night the moon', W.look(0, false).glyph, 'moon');
ok('rain is rain', W.look(65).word, 'Rain');
ok('a code nobody has heard of says so rather than guessing', W.look(4242).word, '—');
ok('degrees round', W.degrees(21.6, 'C'), '22°');
ok('and convert', W.degrees(21.6, 'F'), '71°');
ok('and a temperature that is not a number is not shown as one', W.degrees(null, 'C'), '—');
ok('nor is an infinity', W.degrees(Infinity, 'C'), '—');

/* ---- 2. reading a stranger's JSON ----
   This is the whole reason the module exists. Everything below is a shape
   the forecast could come back in on a bad day, and none of it may produce a
   strip that shows NaN° or throws on the way past. */
const now = Date.UTC(2026, 9, 28, 12, 0);
const iso = ms => new Date(ms).toISOString().slice(0, 16);
const good = () => ({
  utc_offset_seconds: 10800, timezone: 'Europe/Istanbul',
  current: { time: iso(now), temperature_2m: 24.3, apparent_temperature: 25.1, is_day: 1, weather_code: 2 },
  hourly: {
    time: Array.from({ length: 30 }, (_, i) => iso(now - 4 * 3600e3 + i * 3600e3)),
    temperature_2m: Array.from({ length: 30 }, (_, i) => 20 + i * 0.5),
    weather_code: Array.from({ length: 30 }, () => 3),
  },
  daily: { temperature_2m_max: [27.9], temperature_2m_min: [17.2] },
});

for (const [name, body] of [
  ['nothing at all', null],
  ['an empty object', {}],
  ['a string', 'sorry'],
  ['the API refusing', { error: true, reason: 'Daily API request limit exceeded.' }],
  ['no current reading', { hourly: good().hourly }],
  ['a current reading that is not a number', { current: { temperature_2m: 'warm' } }],
  ['a current reading that is null', { current: { temperature_2m: null } }],
  ['a NaN', { current: { temperature_2m: NaN } }],
]) ok('refused: ' + name, W.read(body, now), null);

const f = W.read(good(), now);
ok('a good forecast reads its temperature', f.c, 24.3);
ok('and the day’s range', [f.max, f.min], [27.9, 17.2]);
ok('and the resort’s offset from UTC', f.offset, 10800);
ok('it keeps twelve hours', f.hours.length, 12);
ok('starting from the present, not this morning', f.hours[0].at >= now - 3600e3, true);

/* Partial answers still give what they can, rather than nothing. */
const noHours = good(); delete noHours.hourly;
ok('no hourly run still gives a reading', W.read(noHours, now).c, 24.3);
ok('and simply has no hours', W.read(noHours, now).hours.length, 0);
const noDaily = good(); delete noDaily.daily;
ok('no daily block still gives a reading', W.read(noDaily, now).c, 24.3);
ok('and no high or low', [W.read(noDaily, now).max, W.read(noDaily, now).min], [null, null]);
const holey = good();
holey.hourly.temperature_2m[6] = null; holey.hourly.temperature_2m[7] = 'x';
delete holey.hourly.weather_code;
const hf = W.read(holey, now);
ok('a hole in the hourly run is stepped over, not shown',
  hf.hours.every(h => typeof h.c === 'number' && isFinite(h.c)), true);
ok('and a missing code is a code of none', hf.hours[0].code, null);

ok('the next hour reads as now', W.hourLabel(now + 600e3, 10800, now), 'Now');
ok('and a later one on the resort’s clock', W.hourLabel(now + 4 * 3600e3, 10800, now), '7pm');

/* ---- 3. the strip ---- */
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errs = [];
const open = async (stub) => {
  const pg = await b.newPage({ viewport: { width: 390, height: 844 } });
  pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await pg.addInitScript(s => {
    window.fetch = async (u) => {
      if (!String(u).includes('open-meteo')) return { ok: false, status: 404, json: async () => ({}) };
      let dead = s.dead;
      try { if (localStorage.getItem('__wt_offline')) dead = true; } catch (e) {}
      if (dead) throw new Error('offline');
      return { ok: s.ok !== false, status: s.ok === false ? 500 : 200, json: async () => s.body };
    };
  }, stub);
  await pg.goto('file://' + S + '/wt.html');
  await pg.waitForTimeout(4200);
  for (let i = 0; i < 6; i++) { const d = pg.locator('[data-act="modalCancel"]');
    if (await d.count()) { await d.first().click({ force: true }); await pg.waitForTimeout(150); } else break; }
  await pg.click('[data-act="go"][data-a="resort"]');
  await pg.waitForTimeout(900);
  return pg;
};

/* A live forecast, generated around the real now so the hours are ahead of it. */
const live = () => {
  const t = Date.now(), i = ms => new Date(ms).toISOString().slice(0, 16);
  const hs = Array.from({ length: 24 }, (_, k) => t + k * 3600e3);
  return { utc_offset_seconds: 10800,
    current: { time: i(t), temperature_2m: 24.3, apparent_temperature: 25.1, is_day: 1, weather_code: 2 },
    hourly: { time: hs.map(i), temperature_2m: hs.map((_, k) => 24.3 - k * 0.4), weather_code: hs.map(() => 0) },
    daily: { temperature_2m_max: [27.9], temperature_2m_min: [17.2] } };
};

const pg = await open({ body: live() });
ok('the strip shows a picture and a temperature',
  [await pg.locator('.wx .sky.big').count(), await pg.locator('.wx-t').innerText()], [1, '24°']);
ok('and nothing else — no hour-by-hour run', await pg.locator('.wx-h').count(), 0);

await pg.click('[data-act="wxUnit"][data-a="F"]');
await pg.waitForTimeout(250);
ok('the switch moves the big figure', await pg.locator('.wx-t').innerText(), '76°');
ok('and the day’s range', (await pg.locator('.wx-s span').innerText()).includes('82°'), true);

/* The scale is a setting of the handset, so it has to survive a reload. */
await pg.reload();
await pg.waitForTimeout(4400);
for (let i = 0; i < 6; i++) { const d = pg.locator('[data-act="modalCancel"]');
  if (await d.count()) { await d.first().click({ force: true }); await pg.waitForTimeout(150); } else break; }
await pg.click('[data-act="go"][data-a="resort"]');
await pg.waitForTimeout(900);
ok('and the phone remembers which scale it reads in',
  await pg.locator('[data-act="wxUnit"][data-a="F"]').getAttribute('aria-pressed'), 'true');

/* The reading is kept, so a phone that loses signal still says something —
   and says plainly that it is old rather than pretending it is current. */
await pg.evaluate(() => { try { localStorage.setItem('__wt_offline', '1'); } catch (e) {} });
await pg.reload();
await pg.waitForTimeout(4400);
for (let i = 0; i < 6; i++) { const d = pg.locator('[data-act="modalCancel"]');
  if (await d.count()) { await d.first().click({ force: true }); await pg.waitForTimeout(150); } else break; }
await pg.click('[data-act="go"][data-a="resort"]');
await pg.waitForTimeout(1200);
ok('with no signal the last reading is still there', await pg.locator('.wx-t').count(), 1);
ok('and the strip says when it was reached',
  (await pg.locator('.wx').innerText()).toLowerCase().includes('last reached'), true);
await pg.close();

/* Nothing kept and nothing reachable: say so, and do not invent a number. */
for (const [name, stub] of [['a dead network', { dead: true }],
                            ['a 500', { ok: false, body: {} }],
                            ['nonsense', { body: { hello: 'there' } }]]) {
  const p2 = await open(stub);
  await p2.evaluate(() => { try { localStorage.removeItem('union-invitational:wx');
    localStorage.removeItem('__wt_offline'); } catch (e) {} });
  await p2.reload();
  await p2.waitForTimeout(4400);
  for (let i = 0; i < 6; i++) { const d = p2.locator('[data-act="modalCancel"]');
    if (await d.count()) { await d.first().click({ force: true }); await p2.waitForTimeout(150); } else break; }
  await p2.click('[data-act="go"][data-a="resort"]');
  await p2.waitForTimeout(1200);
  const txt = await p2.locator('.wx').innerText();
  ok('on ' + name + ' it shows no temperature', await p2.locator('.wx-t').count(), 0);
  ok('and says why, without a NaN in it', /nan|undefined|null/i.test(txt), false);
  ok('and the switch is still there', await p2.locator('[data-act="wxUnit"]').count(), 2);
  await p2.close();
}

ok('and nothing threw anywhere', errs, []);
await b.close();
console.log(fails.length ? '\nFAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
