/* CHAT NOTIFICATIONS: the sealing and signing in supabase/functions/notify.
   The function runs on Supabase, which this machine cannot reach, so its
   Web Push code is lifted out and run here against a phone made with Node's
   own crypto: what it seals, only that phone can open; what it signs, the
   book's public key verifies; and a push service gets the headers the
   standard asks for. (Checked once against the reference http_ece library
   too; this test keeps to what ships with Node.)
   Run: node tools/push-test.mjs */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createECDH, randomBytes, createHmac, createDecipheriv, createPublicKey, verify } from 'node:crypto';
import http from 'node:http';

const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };

const src = readFileSync('supabase/functions/notify/index.ts', 'utf8');
const part = src.slice(src.indexOf('// ---- web push ----'), src.indexOf('// ---- end web push ----'));
const dir = mkdtempSync(join(tmpdir(), 'push-'));
writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
writeFileSync(join(dir, 'push.ts'), part + '\nexport { seal, vapidToken, sendPush, b64u, unb64u };\n');
const { seal, vapidToken, sendPush, b64u, unb64u } = await import(join(dir, 'push.ts'));

/* the phone's side of RFC 8291, done with Node's crypto rather than the browser's */
function open(body, phone, auth) {
  const salt = body.subarray(0, 16), idlen = body[20], as = body.subarray(21, 21 + idlen), sealed = body.subarray(21 + idlen);
  const h = (k, d) => createHmac('sha256', k).update(d).digest();
  const ua = phone.getPublicKey();
  const prkKey = h(auth, phone.computeSecret(as));
  const ikm = h(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), ua, as, Buffer.from([1])]));
  const prk = h(salt, ikm);
  const cek = h(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = h(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
  const d = createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(sealed.subarray(sealed.length - 16));
  const out = Buffer.concat([d.update(sealed.subarray(0, sealed.length - 16)), d.final()]);
  return out.subarray(0, out.lastIndexOf(2)).toString('utf8');      // drop the padding delimiter
}

console.log('\nthe keys, as the key page makes them');
const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
const VAPID = { publicKey: b64u(await crypto.subtle.exportKey('raw', kp.publicKey)), privateKey: jwk.d, subject: 'https://example.org/' };
ok('a 65-byte public key and a 32-byte private one', [unb64u(VAPID.publicKey).length, unb64u(VAPID.privateKey).length], [65, 32]);

console.log('\na message, sealed for one phone');
const phone = createECDH('prime256v1'); phone.generateKeys();
const auth = randomBytes(16);
const sub = { endpoint: '', keys: { p256dh: b64u(phone.getPublicKey()), auth: b64u(auth) } };
const msg = JSON.stringify({ title: 'Becky · Round 2', body: 'Ray, you OK? 😂', room: 'r2', tag: 'chat-r2' });
const sealed = Buffer.from(await seal(msg, sub.keys.p256dh, sub.keys.auth));
ok('that phone can open it', open(sealed, phone, auth), msg);
const other = createECDH('prime256v1'); other.generateKeys();
let threw = false; try { open(sealed, other, auth); } catch (e) { threw = true; }
ok('no other phone can', threw, true);
ok('and each sealing is different', Buffer.from(await seal(msg, sub.keys.p256dh, sub.keys.auth)).equals(sealed), false);

console.log('\nsigned by the book');
const tok = await vapidToken('https://web.push.apple.com/abc', VAPID.publicKey, VAPID.privateKey, VAPID.subject);
const [h, p, s] = tok.split('.');
const pub = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(unb64u(VAPID.publicKey).slice(1, 33)), y: b64u(unb64u(VAPID.publicKey).slice(33)) }, format: 'jwk' });
ok('the public key verifies the signature', verify('sha256', Buffer.from(h + '.' + p), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(unb64u(s))), true);
const claims = JSON.parse(Buffer.from(unb64u(p)).toString());
ok('addressed to the push service it is going to, for twelve hours at most', [claims.aud, claims.sub, claims.exp - Date.now() / 1000 <= 12 * 3600 + 5], ['https://web.push.apple.com', 'https://example.org/', true]);

console.log('\nsent to a push service');
let got = null;
const srv = http.createServer((req, res) => { const parts = []; req.on('data', d => parts.push(d)); req.on('end', () => { got = { h: req.headers, body: Buffer.concat(parts) }; res.statusCode = 201; res.end(); }); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
sub.endpoint = 'http://127.0.0.1:' + srv.address().port + '/push/abc';
ok('it takes it', await sendPush(sub, msg, VAPID), 201);
srv.close();
ok('with the headers Web Push asks for', [got.h['content-encoding'], got.h.ttl, got.h.urgency, /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/.test(got.h.authorization)], ['aes128gcm', '3600', 'high', true]);
ok('and the phone reads the message', open(got.body, phone, auth), msg);

console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
