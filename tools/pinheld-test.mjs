/* A WRITE REFUSED FOR A PIN IS NOT A WRITE WAITING FOR A SIGNAL.
   Six people filled in their sign-up, their phone showed it, and the server
   never took a word of it: the refusal was queued like a lost signal, went
   again on every flush, and earned each phone ten refusals in ten minutes
   and a day's block. This holds the server to the new bargain — the write is
   held still until a PIN is confirmed, counted so the screen can say so, and
   sent the moment one is.
   Run: node tools/pinheld-test.mjs */
const mem = new Map();
globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
globalThis.document = { visibilityState: 'visible', addEventListener() {} };
const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };
const wait = ms => new Promise(r => setTimeout(r, ms));

/* ---- the server, as the real one behaves ---- */
const rows = new Map(); const handlers = [];
const stamp = () => new Date(Date.now()).toISOString();
const echo = path => { const r = rows.get(path); handlers.forEach(h => h({ eventType: 'UPDATE', new: r })); };
let clubCalls = [];          // every club_write the phone attempts
let accept = false;          // the server starts out refusing this phone's PIN
function client() {
  const q = (filter) => {
    const b = { _f: filter || {}, select() { return b; }, order() { return b; }, limit() { return b; }, gt() { return b; },
      like(_c, v) { b._f.like = v; return b; }, eq(_c, v) { b._f.eq = v; return b; }, in() { return b; },
      then(res) { let out = [...rows.values()]; if (b._f.eq) out = out.filter(r => r.path === b._f.eq);
        if (b._f.like) out = out.filter(r => r.path.startsWith(b._f.like.replace('%', '')));
        return Promise.resolve({ data: out, error: null }).then(res); } };
    return b;
  };
  return {
    from: () => ({ ...q(), upsert: async r => { rows.set(r.path, { ...r, updated_at: stamp() }); echo(r.path); return { error: null }; },
      delete: () => ({ eq: async () => ({ error: null }) }) }),
    async rpc(name, a) {
      if (name === 'club_write') {
        clubCalls.push(a.p_path);
        /* exactly what the real club_write says when check_name says no */
        if (!accept) return { data: 'denied: PIN not accepted: confirm the PIN for your name', error: null };
        rows.set(a.p_path, { path: a.p_path, doc: a.p_doc, updated_at: stamp() }); echo(a.p_path);
        return { data: 'ok', error: null };
      }
      if (name === 'write_doc') { rows.set(a.p_path, { path: a.p_path, doc: a.p_doc, updated_at: stamp() }); echo(a.p_path); return { data: 'ok', error: null }; }
      if (name === 'verify_pin') return { data: 'master', error: null };
      return { data: null, error: { code: 'PGRST202', message: 'could not find the function' } };
    },
    channel() { const ch = { on(_e, _c, fn) { handlers.push(fn); return ch; }, subscribe(fn) { fn('SUBSCRIBED'); return ch; } }; return ch; },
    removeChannel() {}, removeAllChannels() {},
  };
}
globalThis.window = { __supabase: { createClient: () => client() }, addEventListener() {} };
rows.set('config/tournament', { path: 'config/tournament', doc: { rev: 1, rounds: {} }, updated_at: stamp() });

const { createStore } = await import('../src/store.js');
let meta = {};
const store = createStore((T, m) => { meta = m || {}; });
store.pin = '123456';
store.who = { pid: 'g3', pin: '' };          /* the name is chosen; the PIN was never asked for */
await store.connect(); await wait(400);

console.log('\na sign-up written on a phone the server will not accept');
clubCalls = [];
store.writeClub('signup__g3', { pid: 'g3', status: 'in', shirt: 'XL' }, true);
await wait(500);
ok('the phone tried once', clubCalls.length, 1);
ok('and the book has nothing', rows.has('club/signup__g3'), false);
ok('the change is counted as held for a PIN', meta.pinHeld, 1);

console.log('\nthe phone goes on being used, and it must NOT try again');
/* every one of these used to flush the outbox and earn another refusal */
clubCalls = [];
for (let i = 0; i < 6; i++) { store.writeClub('travel__g3', { pid: 'g3', out: { no: 'BA' + i } }, true); await wait(140); }
const tries = clubCalls.filter(p => p === 'club/signup__g3').length;
ok('the held sign-up was not sent again, however much else happened', tries, 0);
ok('so the server never sees ten refusals from this phone', clubCalls.length <= 6, true);
ok('and the later writes were held too, not lost', meta.pinHeld >= 2, true);

/* The hold cannot depend on somebody touching the PIN. A phone shut out for
   a day gets this same refusal, and when the block lifts nobody goes near
   the PIN — so anything that lands has to release the rest. */
console.log('\nthe server starts accepting again, with nobody touching the PIN');
accept = true;
clubCalls = [];
store.writeClub('money__g3', { pid: 'g3', paid: 1 }, true);
await wait(900);
ok('the new write lands', rows.has('club/money__g3'), true);
ok('and the writes held behind it go too, unprompted', rows.has('club/signup__g3'), true);
ok('nothing is left held', meta.pinHeld, 0);

/* back to a refusing server for the last act */
accept = false;
store.who = { pid: 'g3', pin: '' };
store.writeClub('signup__g3', { pid: 'g3', status: 'maybe' }, true);
await wait(400);
ok('a later refusal is held again', meta.pinHeld >= 1, true);

console.log('\nand when the PIN is finally confirmed, everything goes');
accept = true;
clubCalls = [];
store.who = { pid: 'g3', pin: '4821' };      /* the prompt the app now shows */
await wait(900);
ok('what was held goes through on the PIN alone', rows.get('club/signup__g3').doc.status, 'maybe');
ok('and nothing is left held', meta.pinHeld, 0);

console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
