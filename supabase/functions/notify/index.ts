/* Notifications — a buzz when somebody posts in the chat, or puts a bet on you.
 *
 * A phone that turns notifications on leaves its push address in the book,
 * at push/<its device id>. When someone posts in the chat, their phone asks
 * this function to pass the message on, and it sends it to every other phone
 * that asked — in their own words, under their name, from the chat it was
 * posted in. Tapping the notification opens the book on that chat.
 *
 * A bet made about people — tagged on it, or named as its answers — is
 * passed on the same way, but only to the phones of the people on it.
 * Tapping that one opens the bet.
 *
 * Someone called out by name with @ gets the message as their own
 * ("called you out"), and someone replied to gets it as a reply. A reaction to a message goes only to whoever wrote it,
 * once per person reacting, however often they change their mind.
 *
 * Deploy: Supabase dashboard -> Edge Functions -> Deploy a new function ->
 * name it `notify` -> paste this file -> Deploy.
 * Then Edge Functions -> Secrets, and add the two keys made on the book's
 * key page (docs/setup/push-keys/), in the browser, never sent anywhere:
 *   VAPID_PUBLIC_KEY   and   VAPID_PRIVATE_KEY
 * The private key is what proves a notification came from this book. It
 * lives in that secret and nowhere else: not in the repository, not in the
 * app, not in a message.
 *
 * Called with the project's publishable key, like the recap function, and
 * it reads the book with that same key: it can see exactly what any phone
 * can, and nothing more.
 *
 * SECURITY ALERTS. A database webhook (Database -> Webhooks: table
 * security_log, on insert, HTTP POST to this function) calls this with a
 * header `x-security-secret` that matches the SECURITY_WEBHOOK_SECRET set in
 * this function's secrets; the row it carries goes as a push to the phones
 * that hold the master PIN, and to nobody else. A call without the matching
 * secret is treated as what it is: not an alert.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from 'jsr:@supabase/server@^1';
import { createClient } from 'npm:@supabase/supabase-js@2';

/* Who the notifications say they are from, if a push service ever asks. A
   web address, so no email address has to sit in a public repository. */
const SUBJECT = 'https://ndiaziii93-jpg.github.io/Union-Invitational-/';
const FRESH_MS = 10 * 60 * 1000;   // a message older than this is not news

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });

// ---- web push ----
/* Web Push, written out with the platform's own cryptography (RFC 8291 for
   the message, RFC 8292 for the signature), so nothing here depends on a
   Node library behaving inside the edge runtime. */
const enc = new TextEncoder();
const b64u = (bytes: ArrayBuffer | Uint8Array): string => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s: string): Uint8Array => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(s).length + 3) % 4)), c => c.charCodeAt(0));
const cat = (...parts: Uint8Array[]): Uint8Array => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let i = 0; for (const p of parts) { out.set(p, i); i += p.length; } return out; };
async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}
/** The signed token that says this book sent it. */
async function vapidToken(endpoint: string, publicKey: string, privateKey: string, subject: string): Promise<string> {
  const pub = unb64u(publicKey);
  const jwk = { kty: 'EC', crv: 'P-256', d: privateKey, x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), ext: true };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(head + '.' + body));
  return head + '.' + body + '.' + b64u(sig);
}
/** The message, sealed so only the phone it is for can open it. */
async function seal(payload: string, p256dh: string, auth: string): Promise<Uint8Array> {
  const ua = unb64u(p256dh), secret = unb64u(auth);
  const mine = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const as = new Uint8Array(await crypto.subtle.exportKey('raw', mine.publicKey));
  const theirs = await crypto.subtle.importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: theirs }, mine.privateKey, 256));
  const prkKey = await hmac(secret, shared);
  const ikm = await hmac(prkKey, cat(enc.encode('WebPush: info\0'), ua, as, new Uint8Array([1])));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, enc.encode('Content-Encoding: aes128gcm\0\x01'))).slice(0, 16);
  const nonce = (await hmac(prk, enc.encode('Content-Encoding: nonce\0\x01'))).slice(0, 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, cat(enc.encode(payload), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]);                       // 4096, the record size
  return cat(salt, rs, new Uint8Array([as.length]), as, sealed);
}
/** One notification to one phone. Resolves to the push service's status. */
type Keys = { publicKey: string; privateKey: string; subject: string };
type Sub = { endpoint: string; keys: { p256dh: string; auth: string } };
/* A push goes to a push service and nowhere else. The address comes from a
   row any phone can write, so without this the function could be pointed
   at any URL on the internet with a signed POST. */
const PUSH_HOSTS = /^([a-z0-9-]+\.)*(googleapis\.com|push\.apple\.com|push\.services\.mozilla\.com|notify\.windows\.com|push\.samsungosp\.com)$/;
function pushService(endpoint: string): boolean {
  try { const u = new URL(endpoint); return u.protocol === 'https:' && PUSH_HOSTS.test(u.hostname); } catch { return false; }
}
async function sendPush(sub: Sub, payload: string, keys: Keys): Promise<number> {
  if (!pushService(sub.endpoint)) return 400;
  const body = await seal(payload, sub.keys.p256dh, sub.keys.auth);
  const token = await vapidToken(sub.endpoint, keys.publicKey, keys.privateKey, keys.subject);
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: { 'content-encoding': 'aes128gcm', 'content-type': 'application/octet-stream', ttl: '3600', urgency: 'high',
               authorization: 'vapid t=' + token + ', k=' + keys.publicKey },
    body,
  });
  return res.status;
}
// ---- end web push ----

async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const keys = { publicKey: Deno.env.get('VAPID_PUBLIC_KEY') || '', privateKey: Deno.env.get('VAPID_PRIVATE_KEY') || '', subject: SUBJECT };
  if (!keys.publicKey || !keys.privateKey) return json({ error: 'not_set_up', message: 'The notification keys are not set on this project.' }, 503);

  /* A phone asking how to sign up: the public half of the key is all it needs. */
  if (req.method === 'GET') return json({ publicKey: keys.publicKey });
  if (req.method !== 'POST') return json({ error: 'bad_request' }, 405);

  let path = '', rx = '', body: any = null, settled = false;
  try { body = await req.json(); path = String(body?.path || ''); rx = String(body?.rx || ''); settled = body?.settled === true; } catch { /* falls through */ }

  /* a row of the security log, from the database's own webhook */
  const secret = Deno.env.get('SECURITY_WEBHOOK_SECRET') || '';
  const given = req.headers.get('x-security-secret') || '';
  if (given && secret && given.length === secret.length && given === secret && body && body.record) {
    const r = body.record;
    if (r.kind === 'signin') return json({ sent: 0, skipped: 'signin' });
    const word: Record<string, string> = { direct: 'Public-key write dropped', pin: 'Wrong PIN', denied: 'Write refused', blocked: 'Phone blocked', claim: 'Name claim refused' };
    const secPayload = JSON.stringify({
      title: '⚠️ ' + (word[String(r.kind)] || String(r.kind)),
      body: [r.path, r.who ? 'phone ' + r.who : '', r.pid ? 'as ' + r.pid : '', r.ip ? 'from ' + r.ip : '', r.detail].filter(Boolean).join(' · ').slice(0, 180),
      room: '', tag: 'security',
    });
    const apikey2 = req.headers.get('apikey') || '';
    const db2 = createClient(Deno.env.get('SUPABASE_URL') || '', apikey2, { auth: { persistSession: false } });
    const { data: msubs } = await db2.from('docs').select('path,doc').like('path', 'push/%');
    let msent = 0;
    await Promise.all((msubs || []).map(async (row: { path: string; doc: any }) => {
      const s = row.doc;
      if (!s || !s.on || !s.sub || !s.sub.endpoint || s.master !== true) return;
      try { const status = await sendPush(s.sub, secPayload, keys); if (status < 300) msent++; } catch (e) { console.error('push', String(e).slice(0, 200)); }
    }));
    return json({ sent: msent, security: true });
  }
  if (!/^(chat\/m|market\/q)[a-z0-9]{4,40}$/.test(path)) return json({ error: 'bad_request', message: 'Send {"path": "chat/m…"} or {"path": "market/q…"}' }, 400);
  const isBet = path.startsWith('market/');

  const apikey = req.headers.get('apikey') || '';
  const db = createClient(Deno.env.get('SUPABASE_URL') || '', apikey, { auth: { persistSession: false } });

  /* The message is read from the book, never taken from the caller, so this
     can only ever pass on something that was really posted — once. */
  const { data: rows, error } = await db.from('docs').select('doc').eq('path', path).limit(1);
  if (error) return json({ error: 'upstream_error', message: error.message }, 502);
  const m = rows && rows[0] && rows[0].doc;
  if (!m || (isBet ? m.k !== 'q' || !m.q : m.k !== 'm' || !m.text)) return json({ error: 'not_found' }, 404);
  /* ONCE. A message is passed on one time, however often the function is
     asked: the mark is made with the service key, which no phone holds, so
     nobody can make a message buzz the whole trip again and again. */
  if (!rx && !settled) {
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (serviceKey) {
      if (m.notified_at) return json({ sent: 0, already: true });
      const asOwner = createClient(Deno.env.get('SUPABASE_URL') || '', serviceKey, { auth: { persistSession: false } });
      await asOwner.rpc('merge_doc', { p: path, patch: { notified_at: Date.now() }, who: 'notify' });
    }
  }
  /* A reaction: to whoever wrote the message, once per person reacting. */
  if (rx) {
    if (isBet || !/^[A-Za-z0-9_-]{1,64}$/.test(rx)) return json({ error: 'bad_request' }, 400);
    const emoji = String(m['rx_' + rx] || '');
    if (!emoji) return json({ sent: 0, none: true });
    if (m['rxsent_' + rx]) return json({ sent: 0, already: true });
    await db.rpc('merge_doc', { p: path, patch: { ['rxsent_' + rx]: Date.now() }, who: 'notify' });
    const rroom = String(m.rid || 'trip');
    const said = String(m.text);
    const rxPayload = JSON.stringify({
      title: emoji + ' ' + String(m['rxby_' + rx] || 'Someone').slice(0, 40) + ' reacted to your message',
      body: '“' + (said.length > 120 ? said.slice(0, 118) + '…' : said) + '”',
      room: rroom, tag: 'rx-' + path.slice('chat/'.length),
    });
    const { data: rsubs } = await db.from('docs').select('path,doc').like('path', 'push/%');
    let rsent = 0;
    await Promise.all((rsubs || []).map(async (r: { path: string; doc: any }) => {
      const s = r.doc;
      if (!s || !s.on || !s.sub || !s.sub.endpoint || s.dev === rx) return;
      if (!(m.pid && s.pid === m.pid) && !(m.dev && s.dev === m.dev)) return;    // only the one who wrote it
      try {
        const status = await sendPush(s.sub, rxPayload, keys);
        if (status === 404 || status === 410) await db.from('docs').delete().eq('path', r.path);
        else if (status < 300) rsent++;
      } catch (e) { console.error('push', String(e).slice(0, 200)); }
    }));
    return json({ sent: rsent });
  }
  /* A BET HAS SETTLED. Who hit, and what it paid, worked out from the trades
     in the book — never from the caller — and sent to everyone once. */
  if (isBet && settled) {
    const done = m.void === true || !!m.result || (Array.isArray(m.winners) && m.winners.length > 0);
    if (!done) return json({ sent: 0, open: true });
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const asOwner = serviceKey ? createClient(Deno.env.get('SUPABASE_URL') || '', serviceKey, { auth: { persistSession: false } }) : null;
    if (m.settled_notified) return json({ sent: 0, already: true });
    if (asOwner) await asOwner.rpc('merge_doc', { p: path, patch: { settled_notified: Date.now() }, who: 'notify' });
    const qid = path.slice('market/'.length);
    const { data: trows } = await db.from('docs').select('doc').like('path', 'market/t%');
    const { data: prows } = await db.from('docs').select('path,doc').like('path', 'people/%');
    const names: Record<string, string> = {};
    (prows || []).forEach((r: { path: string; doc: any }) => { names[r.path.slice('people/'.length)] = String(r.doc?.display || r.doc?.name || ''); });
    const { data: grows } = await db.from('docs').select('doc').like('path', 'chat/guest_%');
    (grows || []).forEach((r: { doc: any }) => { if (r.doc?.pid) names[String(r.doc.pid)] = String(r.doc.name || ''); });
    const winners: string[] = Array.isArray(m.winners) ? m.winners.map(String) : [];
    const isVoid = m.void === true || m.result === 'void';
    const rounds = (x: number) => Math.round(x * 4) / 4;
    const paid: Record<string, number> = {}, spent: Record<string, number> = {};
    for (const r of trows || []) {
      const t = r.doc; if (!t || t.k !== 't' || !t.m || !t.pid) continue;
      const mid = String(t.m);
      let onThis = false, win = false;
      if (mid === qid) { onThis = true; win = isVoid ? false : t.side === m.result; }
      else if (mid.startsWith(qid + '__')) { onThis = true; const w = mid.slice(qid.length + 2); win = isVoid ? false : (winners.includes(w) ? t.side === 'yes' : t.side === 'no'); }
      if (!onThis) continue;
      spent[t.pid] = (spent[t.pid] || 0) + Number(t.cost || 0);
      if (isVoid) paid[t.pid] = (paid[t.pid] || 0) + Math.max(0, Number(t.cost || 0));
      else if (win) paid[t.pid] = (paid[t.pid] || 0) + Number(t.n || 0);
    }
    const beer = (n: number) => { const q = Math.round(Math.abs(n) * 4), w = Math.floor(q / 4), f = ['', '¼', '½', '¾'][q % 4]; return (w || !f ? String(w) : '') + f; };
    const hits = Object.keys(paid).map(p => ({ p, paid: rounds(paid[p]), net: rounds(paid[p] - (spent[p] || 0)) })).filter(x => x.net > 1e-4).sort((a, b) => b.net - a.net);
    const what = isVoid ? 'Void' : winners.length ? 'It was ' + winners.map(w => names[w] || 'someone').join(' and ') : m.result === 'yes' ? 'Yes' : 'No';
    const line = hits.length ? hits.slice(0, 4).map(x => (names[x.p] || 'Someone') + ' cashed ' + beer(x.paid) + ' 🍺').join(', ') + (hits.length > 4 ? ' and more' : '') : (isVoid ? 'Everyone got their beers back' : 'Nobody hit it');
    const settledPayload = JSON.stringify({ title: '🏆 Bet settled: ' + what, body: (String(m.q).slice(0, 120) + ' — ' + line).slice(0, 240), bet: qid, tag: 'settled-' + qid });
    const { data: ssubs } = await db.from('docs').select('path,doc').like('path', 'push/%');
    let ssent = 0;
    await Promise.all((ssubs || []).map(async (r: { path: string; doc: any }) => {
      const s = r.doc;
      if (!s || !s.on || !s.sub || !s.sub.endpoint) return;
      try { const status = await sendPush(s.sub, settledPayload, keys); if (status === 404 || status === 410) { await db.from('docs').delete().eq('path', r.path); } else if (status < 300) ssent++; }
      catch (e) { console.error('push', String(e).slice(0, 200)); }
    }));
    return json({ sent: ssent, settled: true });
  }
  /* a bet goes only to the people it is about */
  const onIt: string[] = isBet ? [].concat(m.tags || [], m.opts || []).map(String) : [];
  if (isBet && !onIt.length) return json({ sent: 0, nobody: true });
  if (m.notified) return json({ sent: 0, already: true });
  if (Date.now() - (m.at || 0) > FRESH_MS) return json({ sent: 0, stale: true });
  await db.rpc('merge_doc', { p: path, patch: { notified: Date.now() }, who: 'notify' });

  const room = String(m.rid || 'trip');
  const where = room === 'trip' ? 'The trip' : room === 'practice' ? 'Practice' : 'Round ' + room.replace(/^r/, '');
  const payload = isBet
    ? JSON.stringify({
        title: (m.byName || 'Someone') + (m.opts && m.opts.length ? ' put you in a bet' : ' put a bet on you'),
        body: String(m.q).slice(0, 240),
        bet: path.slice('market/'.length), tag: 'bet-' + path.slice('market/'.length),
      })
    : JSON.stringify({
        title: (m.name || 'Someone') + (m.re ? ' heckled' : '') + ' · ' + where,
        body: String(m.text).slice(0, 240),
        room, tag: 'chat-' + room,
      });

  /* someone called out by name gets it as theirs, and it stays on their screen
     beside the room's own line rather than replacing it */
  const ment: string[] = !isBet && Array.isArray(m.ment) ? m.ment.map(String) : [];
  /* whoever was answered gets it as a reply to them */
  const rto = !isBet && m.to && m.rto ? String(m.rto) : '';
  const repliedTo = rto ? JSON.stringify({
    title: '↩️ ' + (m.name || 'Someone') + ' replied to you · ' + where,
    body: String(m.text).slice(0, 240),
    room, tag: 'reply-' + path.slice('chat/'.length),
  }) : payload;
  const calledOut = ment.length ? JSON.stringify({
    title: '📣 ' + (m.name || 'Someone') + ' called you out · ' + where,
    body: String(m.text).slice(0, 240),
    room, tag: 'ment-' + path.slice('chat/'.length),
  }) : payload;

  const { data: subs } = await db.from('docs').select('path,doc').like('path', 'push/%');
  let sent = 0, gone = 0;
  await Promise.all((subs || []).map(async (r: { path: string; doc: any }) => {
    const s = r.doc;
    if (!s || !s.on || !s.sub || !s.sub.endpoint) return;
    if (s.dev === m.dev || (m.pid && s.pid === m.pid)) return;    // not back to whoever posted it
    if (isBet && !onIt.includes(String(s.pid))) return;          // a bet, only to the people on it
    try {
      const status = await sendPush(s.sub, ment.includes(String(s.pid)) ? calledOut : rto && String(s.pid) === rto ? repliedTo : payload, keys);
      if (status === 404 || status === 410) { gone++; await db.from('docs').delete().eq('path', r.path); }
      else if (status < 300) sent++;
      else console.error('push', status, new URL(s.sub.endpoint).host);
    } catch (e) { console.error('push', String(e).slice(0, 200)); }
  }));
  return json({ sent, gone });
}

export default {
  fetch: withSupabase({ auth: ['publishable', 'secret'] }, handler),
};
