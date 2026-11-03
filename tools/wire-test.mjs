/* THE WIRE ON A BAD DAY. What the book does on the course when the signal
   comes and goes and two phones write the same card:
     - a correction saved while an older word on the same hole still waits
       in the outbox lands AFTER it, never before it (the old word never wins);
     - holes that landed come out of the outbox and only those: a hole saved
       while they were on the wire stays queued, the landed ones are not sent
       again over what another phone wrote meanwhile;
     - a row the socket dropped is found by the sweep, even after this phone
       read its own card back (which used to move the sweep's mark past it);
     - an answer from the server flushes the outbox at once, without waiting
       for the phone to announce a signal;
     - in a pocket the socket is closed, and opened again on the way out.
   Run: node tools/wire-test.mjs */
const mem = new Map();
globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
const docL = {}, winL = {};
globalThis.document = { visibilityState: 'visible', get hidden() { return this.visibilityState === 'hidden'; }, addEventListener(n, f) { (docL[n] = docL[n] || []).push(f); } };
const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const fire = (L, n) => (L[n] || []).forEach(f => f());

/* the server, as the SQL folds a card; updated_at is microsecond-ish and monotonic */
const rows = new Map(); const handlers = [];
let quiet = false, down = false, slow = 0, opened = 0, removed = 0;
let tick = Date.parse('2026-11-01T09:00:00Z');
const stamp = () => new Date(tick += 1000).toISOString();
const echo = path => { if (quiet) return; const r = rows.get(path); handlers.forEach(h => h({ eventType: 'UPDATE', new: r })); };
const offline = () => ({ data: null, error: { message: 'Failed to fetch' } });
function fold(a) {
  const path = 'scores/' + a.p_rid + '__' + a.p_pid, held = rows.get(path);
  const d = held ? JSON.parse(JSON.stringify(held.doc)) : { raw: Array(18).fill(null), by: {}, at: {}, marks: {}, pu: {}, mF: false, mB: false, bb: false };
  for (const [k, c] of Object.entries(a.p_cells)) {
    if ('raw' in c) d.raw[+k] = c.raw;
    for (const f of ['by', 'at', 'pu', 'marks', 'putts']) if (f in c) { d[f] = d[f] || {}; if (c[f] == null) delete d[f][k]; else d[f][k] = c[f]; }
  }
  Object.assign(d, a.p_card); d.rev = (d.rev || 0) + 1;
  rows.set(path, { path, doc: d, updated_at: stamp() }); echo(path);
}
let sweeps = 0;
function client() {
  const q = (filter) => {
    const b = { _f: filter || {}, select() { return b; }, order() { return b; }, limit() { return b; }, gt(_c, v) { b._f.gt = v; return b; }, like(_c, v) { b._f.like = v; return b; }, eq(_c, v) { b._f.eq = v; return b; }, abortSignal() { return b; },
      then(res) { if (down) return Promise.resolve(offline()).then(res); let out = [...rows.values()];
        if (b._f.eq) out = out.filter(r => r.path === b._f.eq); if (b._f.like) out = out.filter(r => r.path.startsWith(b._f.like.replace('%', '')));
        if (b._f.gt) { sweeps++; out = out.filter(r => r.updated_at > b._f.gt); }
        return Promise.resolve({ data: out, error: null }).then(res); } };
    return b;
  };
  return {
    from: () => ({ ...q(), upsert: async r => { if (down) return offline(); rows.set(r.path, { ...r, updated_at: stamp() }); echo(r.path); return { error: null }; }, delete: () => ({ eq: async () => ({ error: null }) }) }),
    rpc(name, a) { const b = { abortSignal() { return b; }, async then(res) {
      if (down) return res(offline());
      if (name === 'score_mark') { if (slow) await wait(slow); if (down) return res(offline()); fold(a); return res({ data: 'ok', error: null }); }
      if (name === 'verify_pin') return res({ data: 'master', error: null });
      return res({ data: null, error: { code: 'PGRST202', message: 'could not find the function' } }); } }; return b; },
    channel() { opened++; const ch = { on(_e, _c, fn) { handlers.push(fn); return ch; }, subscribe(fn) { fn('SUBSCRIBED'); return ch; } }; return ch; },
    removeChannel() { removed++; }, removeAllChannels() {},
  };
}
globalThis.window = { __supabase: { createClient: () => client() }, __napMs: 300, addEventListener(n, f) { (winL[n] = winL[n] || []).push(f); } };
rows.set('config/tournament', { path: 'config/tournament', doc: { rev: 1, rounds: { r3: { state: 'open' } } }, updated_at: stamp() });

const { createStore } = await import('../src/store.js');
const a = createStore(() => {}), b = createStore(() => {});
a.pin = '123456'; b.pin = '123456';
await a.connect(); await b.connect(); await wait(400);
const box = () => JSON.parse(mem.get([...mem.keys()].find(k => /outbox/.test(k))) || '{}');
const server = (pid = 'g1') => rows.get('scores/r3__' + pid).doc.raw;
const raw = (s, pid = 'g1') => ((s.T.scores['r3__' + pid] || {}).raw || []);

console.log('\na correction while the older word still waits');
down = true;
await a.writeCard('r3', 'g1', c => { c.raw[2] = 6; c.by[2] = 's1'; }); await wait(100);
ok('hole 3 = 6 waits on the phone', box()['scores/r3__g1#score'].doc.cells['2'].raw, 6);
down = false;                                                   // the signal is back, but nothing has told the phone yet
await a.writeCard('r3', 'g1', c => { c.raw[2] = 4; }); await wait(1100);
ok('the correction is what the book holds, and the old word never landed after it', server()[2], 4);
ok('and the outbox is empty', box()['scores/r3__g1#score'] || null, null);

console.log('\na hole saved while the last ones are on the wire');
down = true;
await a.writeCard('r3', 'g1', c => { c.raw[3] = 5; }); await wait(100);
down = false; slow = 700;                                       // the next send takes a while to answer
fire(winL, 'online'); await wait(150);                          // the retry is in flight with hole 4
await a.writeCard('r3', 'g1', c => { c.raw[4] = 3; }); await wait(100);   // folds into the entry behind it
ok('the new hole waits in the same entry', Object.keys(box()['scores/r3__g1#score'].doc.cells).sort(), ['3', '4']);
await wait(900); slow = 0;
const left = box()['scores/r3__g1#score'];
ok('the landed hole is out of the outbox, the new one still in it', left ? Object.keys(left.doc.cells) : [], ['4']);
quiet = true; await b.writeCard('r3', 'g1', c => { c.raw[3] = 7; }); quiet = false; await wait(100);   // another phone's later word on hole 4
fire(winL, 'online'); await wait(1100);
ok('and hole 4 is the other phone\'s later word, not this phone\'s resent one', [server()[3], server()[4]], [7, 3]);

console.log('\nthe socket drops a row');
quiet = true; await b.writeCard('r3', 'g2', c => { c.raw[0] = 4; }); quiet = false; await wait(200);
ok('phone A never heard it', raw(a, 'g2')[0] == null, true);
await a.writeCard('r3', 'g1', c => { c.raw[5] = 4; }); await wait(300);   // A saves a hole: it reads its own card back, newer than the dropped row
const before = sweeps;
fire(winL, 'online'); await wait(1200);                          // a sweep
ok('the sweep ran, and found the row the socket dropped', [sweeps > before, raw(a, 'g2')[0]], [true, 4]);

console.log('\nan answer from the server is a signal');
down = true;
await b.writeCard('r3', 'g1', c => { c.raw[6] = 5; }); await wait(100);
ok('the hole waits', !!box()['scores/r3__g1#score'], true);
down = false;
fire(docL, 'visibilitychange'); await wait(1300);                // nothing told the phone the signal is back but a sweep answered
ok('a sweep that answers sends it', [server()[6], box()['scores/r3__g1#score'] || null], [5, null]);

console.log('\nin a pocket');
const o0 = opened, r0 = removed;
document.visibilityState = 'hidden'; fire(docL, 'visibilitychange'); await wait(500);
ok('hidden for a while, the socket is closed (twice: two phones)', removed - r0, 2);
document.visibilityState = 'visible'; fire(docL, 'visibilitychange'); await wait(1200);
ok('back on screen it opens again and looks', [opened - o0, sweeps > before + 1], [2, true]);
quiet = true; await b.writeCard('r3', 'g1', c => { c.raw[7] = 4; }); quiet = false; await wait(100);
fire(docL, 'visibilitychange'); await wait(1200);
ok('and what was written meanwhile is caught up', raw(a)[7], 4);

console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
