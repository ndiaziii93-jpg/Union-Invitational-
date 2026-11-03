/* A CARD IS THE SERVER'S. Two phones save holes on the same card, and the
   second has never heard the first's: with whole-card writes it put the
   first phone's holes back as it remembered them, which was not at all.
   Now each save sends only its own holes and the server folds them in, so
   both land, and both phones end up with the whole card. Then the same
   with no signal on the way, and with a server that has no score_mark yet.
   Run: node tools/score-sync-test.mjs */
const mem = new Map();
globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
globalThis.document = { visibilityState: 'visible', addEventListener() {} };
const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };
const wait = ms => new Promise(r => setTimeout(r, ms));

/* the server, as the SQL folds a card */
const rows = new Map(); const handlers = [];
let quiet = false, down = false, hasFold = true, deny = false;
const stamp = () => new Date().toISOString();
const echo = path => { if (quiet) return; const r = rows.get(path); handlers.forEach(h => h({ eventType: 'UPDATE', new: r })); };
const offline = () => ({ data: null, error: { message: 'Failed to fetch' } });
function fold(a) {
  const path = 'scores/' + a.p_rid + '__' + a.p_pid, held = rows.get(path);
  const d = held ? JSON.parse(JSON.stringify(held.doc)) : { raw: Array(18).fill(null), by: {}, at: {}, marks: {}, pu: {}, mF: false, mB: false, bb: false };
  for (const [k, c] of Object.entries(a.p_cells)) {
    if ('raw' in c) d.raw[+k] = c.raw;
    for (const f of ['by', 'at', 'pu', 'marks']) if (f in c) { d[f] = d[f] || {}; if (c[f] == null) delete d[f][k]; else d[f][k] = c[f]; }
  }
  Object.assign(d, a.p_card); d.rev = (d.rev || 0) + 1;
  rows.set(path, { path, doc: d, updated_at: stamp() }); echo(path);
}
function client() {
  const q = (filter) => {
    const b = { _f: filter || {}, select() { return b; }, order() { return b; }, limit() { return b; }, gt() { return b; }, like(_c, v) { b._f.like = v; return b; }, eq(_c, v) { b._f.eq = v; return b; }, in() { return b; },
      then(res) { if (down) return Promise.resolve(offline()).then(res); let out = [...rows.values()]; if (b._f.eq) out = out.filter(r => r.path === b._f.eq); if (b._f.like) out = out.filter(r => r.path.startsWith(b._f.like.replace('%', ''))); return Promise.resolve({ data: out, error: null }).then(res); } };
    return b;
  };
  return {
    from: () => ({ ...q(), upsert: async r => { if (down) return offline(); rows.set(r.path, { ...r, updated_at: stamp() }); echo(r.path); return { error: null }; }, delete: () => ({ eq: async () => ({ error: null }) }) }),
    async rpc(name, a) {
      if (down) return offline();
      if (name === 'score_mark' && hasFold) { if (deny) return { data: 'denied: PIN not accepted', error: null }; fold(a); return { data: 'ok', error: null }; }
      if (name === 'write_doc') { rows.set(a.p_path, { path: a.p_path, doc: a.p_doc, updated_at: stamp() }); echo(a.p_path); return { data: 'ok', error: null }; }
      if (name === 'verify_pin') return { data: 'master', error: null };
      return { data: null, error: { code: 'PGRST202', message: 'could not find the function' } };
    },
    channel() { const ch = { on(_e, _c, fn) { handlers.push(fn); return ch; }, subscribe(fn) { fn('SUBSCRIBED'); return ch; } }; return ch; },
    removeChannel() {}, removeAllChannels() {},
  };
}
globalThis.window = { __supabase: { createClient: () => client() }, addEventListener() {} };
rows.set('config/tournament', { path: 'config/tournament', doc: { rev: 1, rounds: { r2: { state: 'open' } } }, updated_at: stamp() });

const { createStore } = await import('../src/store.js');
const a = createStore(() => {}), b = createStore(() => {});
a.pin = '123456'; b.pin = '123456';
await a.connect(); await b.connect(); await wait(400);
const raw = s => (s.T.scores.r2__g1 || {}).raw;
const hole = (r, n) => r.slice(0, n);

console.log('\ntwo phones, one card, and the second never heard the first');
quiet = true;
await a.writeCard('r2', 'g1', c => { c.raw[0] = 5; c.raw[1] = 4; c.by[0] = c.by[1] = 's1'; }); await wait(200);
ok('the first phone\'s holes are in the book', hole(rows.get('scores/r2__g1').doc.raw, 3), [5, 4, null]);
ok('and the second phone has not heard them', b.T.scores.r2__g1 ? hole(raw(b), 3) : null, null);
quiet = false;
await b.writeCard('r2', 'g1', c => { c.raw[2] = 8; c.by[2] = 's2'; c.pu = { 2: true }; c.mF = true; }); await wait(300);
ok('the second phone\'s hole goes in beside them, nothing put back', hole(rows.get('scores/r2__g1').doc.raw, 3), [5, 4, 8]);
ok('with its pick-up, its mulligan and who wrote each hole', [rows.get('scores/r2__g1').doc.pu, rows.get('scores/r2__g1').doc.mF, rows.get('scores/r2__g1').doc.by], [{ 2: true }, true, { 0: 's1', 1: 's1', 2: 's2' }]);
ok('the second phone now holds the whole card', hole(raw(b), 3), [5, 4, 8]);
ok('and so does the first, which had saved holes of its own', hole(raw(a), 3), [5, 4, 8]);

console.log('\na correction on one hole touches only that hole');
await a.writeCard('r2', 'g1', c => { c.raw[1] = 3; }); await wait(300);
ok('hole 2 is now 3 and the rest stand', hole(rows.get('scores/r2__g1').doc.raw, 3), [5, 3, 8]);

console.log('\nno signal on the course');
down = true;
await b.writeCard('r2', 'g1', c => { c.raw[3] = 4; }); await wait(100);
await b.writeCard('r2', 'g1', c => { c.raw[4] = 6; }); await wait(100);
ok('both holes wait on the phone, in one entry for the card', b.T && JSON.parse(mem.get('union-invitational:outbox') || mem.get([...mem.keys()].find(k => /outbox/.test(k))) || '{}')['scores/r2__g1#score'] ? Object.keys(JSON.parse(mem.get([...mem.keys()].find(k => /outbox/.test(k))))['scores/r2__g1#score'].doc.cells).sort() : null, ['3', '4']);
ok('and the phone still shows them', hole(raw(b), 5), [5, 3, 8, 4, 6]);
down = false;
await a.writeCard('r2', 'g1', c => { c.raw[5] = 5; }); await wait(200);
for (let i = 0; i < 40 && b.T && JSON.parse(mem.get([...mem.keys()].find(k => /outbox/.test(k))) || '{}')['scores/r2__g1#score']; i++) await wait(250);
ok('when the signal is back they land, beside the hole saved meanwhile', hole(rows.get('scores/r2__g1').doc.raw, 6), [5, 3, 8, 4, 6, 5]);
await wait(300);
ok('and both phones hold the lot', [hole(raw(a), 6), hole(raw(b), 6)], [[5, 3, 8, 4, 6, 5], [5, 3, 8, 4, 6, 5]]);

console.log('\nthe server turns a save down, and the app is closed and opened again');
deny = true;
await b.writeCard('r2', 'g1', c => { c.raw[6] = 7; }); await wait(200);
const box = () => JSON.parse(mem.get([...mem.keys()].find(k => /outbox/.test(k))) || '{}');
ok('the hole waits on the phone', !!box()['scores/r2__g1#score'], true);
const c2 = createStore(() => {}); c2.pin = '123456';
await c2.connect(); await wait(600);
ok('opened again, the phone still shows the hole that is waiting', hole(raw(c2), 7), [5, 3, 8, 4, 6, 5, 7]);
await c2.writeCard('r2', 'g9', c => { c.raw[0] = 4; }); await wait(400);
ok('and a refusal on the way out keeps it in the outbox, not thrown away', !!box()['scores/r2__g1#score'], true);
deny = false;
await c2.writeCard('r2', 'g9', c => { c.raw[1] = 4; }); await wait(300);
for (let i = 0; i < 40 && box()['scores/r2__g1#score']; i++) await wait(250);
ok('once the PIN is accepted it lands', rows.get('scores/r2__g1').doc.raw[6], 7);
deny = true;
await c2.writeCard('r2', 'g7', c => { c.raw[0] = 6; c.raw[1] = 5; }); await wait(200);
const c3 = createStore(() => {}); c3.pin = '123456';
await c3.connect(); await wait(600);
ok('a card the server has never had still shows its waiting holes when opened again', c3.T.scores.r2__g7 ? hole(c3.T.scores.r2__g7.raw, 3) : null, [6, 5, null]);
deny = false;

console.log('\na server without score_mark yet');
hasFold = false;
await a.writeCard('r2', 'g2', c => { c.raw[0] = 4; }); await wait(300);
ok('the card is written, as before', rows.get('scores/r2__g2') && rows.get('scores/r2__g2').doc.raw[0], 4);
quiet = true;
await a.writeCard('r2', 'g2', c => { c.raw[1] = 5; }); await wait(200);
quiet = false;
await b.writeCard('r2', 'g2', c => { c.raw[2] = 6; }); await wait(300);
ok('and a phone that never heard a hole does not write over it', rows.get('scores/r2__g2').doc.raw.slice(0, 3), [4, 5, 6]);
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
