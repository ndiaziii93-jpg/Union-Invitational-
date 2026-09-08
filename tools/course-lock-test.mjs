/* The course card must be locked while it is verified, and only a PIN may move
   that lock once PINs are armed. Checks both states of PINS_ENABLED.
   Run: node tools/course-lock-test.mjs */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const S = '/tmp/claude-0/-home-user-Union-Invitational-/8bcdc9be-12b5-528d-a069-2403e068b315/scratchpad';
const SRC = readFileSync('/home/user/Union-Invitational-/dist/union-invitational.html', 'utf8');
const HEAD = '<!doctype html><html><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width, initial-scale=1">'
  + '<style>:root{color-scheme:light}body{margin:0;font:14px system-ui}img{max-width:100%}</style></head><body>';

function preview(name, pinsArmed) {
  let html = SRC;
  if (pinsArmed) {
    const before = html;
    html = html.replace('const PINS_ENABLED = false', 'const PINS_ENABLED = true');
    if (html === before) throw new Error('could not arm PINS_ENABLED in the build');
  }
  const f = S + '/' + name + '.html';
  writeFileSync(f, HEAD + html + '</body></html>');
  return 'file://' + f;
}

const fails = [];
const ok = (n, got, want) => {
  const good = got === want;
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(got) + (good ? '' : '  want ' + JSON.stringify(want)));
  if (!good) fails.push(n);
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

// ---------- PINs off: the lock still holds, it just opens without a prompt ----------
{
  console.log('\nPINs off (how the book runs today)');
  const p = await (await b.newContext({ viewport: { width: 1400, height: 1100 } })).newPage();
  await p.goto(preview('lock-off', false)); await p.waitForTimeout(1400);
  await p.locator('[data-act="modalCancel"]').click().catch(() => {});
  await p.locator('.tab', { hasText: 'Course Setup' }).click(); await p.waitForTimeout(400);

  ok('verified card shows no par selects', await p.locator('.cardsel').count(), 0);
  ok('verified card shows no yardage fields', await p.locator('.cardin').count(), 0);
  ok('footer says it is locked', (await p.locator('.cfoot-note').innerText()).startsWith('Par, stroke index and yardages are locked'), true);

  await p.locator('[data-act="verifyCourse"]').click(); await p.waitForTimeout(500);
  ok('reopening needs no prompt while PINs are off', await p.locator('#pinField').count(), 0);
  ok('reopened card offers par selects', await p.locator('.cardsel').count(), 18);

  const par1 = p.locator('.cardsel').first();
  await par1.selectOption('5'); await p.waitForTimeout(500);
  ok('par edit lands while open', await p.locator('.cardsel').first().inputValue(), '5');

  await p.locator('[data-act="verifyCourse"]').click(); await p.waitForTimeout(500);
  ok('verifying locks it again', await p.locator('.cardsel').count(), 0);
  ok('the edit survived the lock', (await p.locator('.scard tbody tr').first().locator('.cardval').first().innerText()), '5');
  await p.close();
}

// ---------- PINs armed: only a PIN may move the lock ----------
{
  console.log('\nPINs armed (how it will run in Belek)');
  const p = await (await b.newContext({ viewport: { width: 1400, height: 1100 } })).newPage();
  await p.goto(preview('lock-on', true)); await p.waitForTimeout(1400);
  await p.locator('[data-act="modalCancel"]').click().catch(() => {});

  await p.locator('.tab', { hasText: 'Course Setup' }).click(); await p.waitForTimeout(400);
  ok('a signed-out viewer gets no verify control', await p.locator('[data-act="verifyCourse"]').count(), 0);

  await p.locator('[data-act="signIn"]').first().click(); await p.waitForTimeout(250);
  await p.locator('#pinField').fill('2000');                      // scorer 1
  await p.locator('[data-act="modalOk"]').click(); await p.waitForTimeout(400);
  await p.locator('.tab', { hasText: 'Course Setup' }).click(); await p.waitForTimeout(400);
  ok('a signed-in scorer sees the verify control', await p.locator('[data-act="verifyCourse"]').count(), 1);
  ok('the card is still locked', await p.locator('.cardsel').count(), 0);

  await p.locator('[data-act="verifyCourse"]').click(); await p.waitForTimeout(350);
  ok('reopening asks for a PIN', await p.locator('#pinField').count(), 1);

  await p.locator('#pinField').fill('9999');                      // not a PIN on the list
  await p.locator('[data-act="modalOk"]').click(); await p.waitForTimeout(350);
  ok('a wrong PIN is refused', (await p.locator('.modal .err').innerText()).length > 0, true);
  ok('and the card stays locked', await p.locator('.cardsel').count(), 0);

  await p.locator('#pinField').fill('2000');
  await p.locator('[data-act="modalOk"]').click(); await p.waitForTimeout(500);
  ok('a real PIN reopens it', await p.locator('.cardsel').count(), 18);

  await p.locator('[data-act="verifyCourse"]').click(); await p.waitForTimeout(350);
  ok('locking asks for a PIN too', await p.locator('#pinField').count(), 1);
  await p.locator('#pinField').fill('1000');                      // master
  await p.locator('[data-act="modalOk"]').click(); await p.waitForTimeout(500);
  ok('the master PIN locks it', await p.locator('.cardsel').count(), 0);
  await p.close();
}

await b.close();
console.log(fails.length ? '\nFAILED: ' + fails.join(', ') : '\nThe course card locks and unlocks only as intended.');
process.exit(fails.length ? 1 : 0);
