/* THE BINGO ROW IS THE SERVER'S. A phone that marked a hole must still take
   the other group's marks when the server sends them, even though the server
   folds marks in without the phone's own version number. Two stores, one
   fake server: the second store's marks reach the first.
   Run: node tools/bbb-sync-test.mjs */
const mem = new Map();
globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
globalThis.document = { visibilityState: 'visible', addEventListener() {} };
const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };
const wait = ms => new Promise(r => setTimeout(r, ms));

/* the server: one bingo row, bbb_mark folds a mark in without touching rev, as the SQL does before this fix */
const rows = new Map(); const handlers = [];
const stamp = () => new Date(Date.now()).toISOString();
const echo = path => { const r = rows.get(path); handlers.forEach(h => h({ eventType: 'UPDATE', new: r })); };
function client() {
  const q = (filter) => {
    const b = { _f: filter || {}, select() { return b; }, order() { return b; }, limit() { return b; }, gt() { return b; }, like(_c, v) { b._f.like = v; return b; }, eq(_c, v) { b._f.eq = v; return b; }, in() { return b; },
      then(res) { let out = [...rows.values()]; if (b._f.eq) out = out.filter(r => r.path === b._f.eq); if (b._f.like) out = out.filter(r => r.path.startsWith(b._f.like.replace('%', ''))); return Promise.resolve({ data: out, error: null }).then(res); } };
    return b;
  };
  return {
    from: () => ({ ...q(), upsert: async r => { rows.set(r.path, { ...r, updated_at: stamp() }); echo(r.path); return { error: null }; }, delete: () => ({ eq: async () => ({ error: null }) }) }),
    async rpc(name, a) {
      if (name === 'bbb_mark') {
        const path = 'bbb/' + a.p_rid, held = rows.get(path);
        const d = held ? JSON.parse(JSON.stringify(held.doc)) : { holes: Array.from({ length: 18 }, () => ({})) };
        const cell = d.holes[a.p_hole] = d.holes[a.p_hole] || {};
        cell.g = cell.g || {}; cell.g[a.p_group] = { ...(cell.g[a.p_group] || {}), ...a.p_cell };
        rows.set(path, { path, doc: d, updated_at: stamp() }); echo(path);
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

const cfgRow = { path: 'config/tournament', doc: { rev: 1, rounds: { r1: { state: 'open' } } }, updated_at: stamp() };
rows.set('config/tournament', cfgRow);
rows.set('bbb/r1', { path: 'bbb/r1', doc: { rev: 5, holes: Array.from({ length: 18 }, () => ({})) }, updated_at: stamp() });

const { createStore } = await import('../src/store.js');
const a = createStore(() => {}), b = createStore(() => {});
a.pin = '123456'; b.pin = '123456';
await a.connect(); await b.connect(); await wait(400);

console.log('\ntwo phones, one bingo row');
await a.markBbb('r1', 3, 'g0', { bingo: 'g1' }); await wait(200);
ok('the first phone\'s mark is in the book', rows.get('bbb/r1').doc.holes[3].g, { g0: { bingo: 'g1' } });
await b.markBbb('r1', 3, 'g1', { bango: 'g5' }); await wait(200);
ok('the second phone\'s mark is in the book beside it', rows.get('bbb/r1').doc.holes[3].g, { g0: { bingo: 'g1' }, g1: { bango: 'g5' } });
ok('and the first phone, which had marked the hole itself, sees it', a.T.bbb.r1 && a.T.bbb.r1.holes[3].g, { g0: { bingo: 'g1' }, g1: { bango: 'g5' } });
ok('so does the second', b.T.bbb.r1 && b.T.bbb.r1.holes[3].g, { g0: { bingo: 'g1' }, g1: { bango: 'g5' } });
console.log(fails.length ? '\n' + fails.length + ' FAILED: ' + fails.join(', ') : '\nall good');
process.exit(fails.length ? 1 : 0);
