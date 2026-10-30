/* The Supabase adapter, on its own, in Node.
 *
 * The proxy here refuses supabase.co, so this drives the adapter against a
 * stand-in client that behaves the way the real one does — including failing
 * the way it fails. What is being tested is not Supabase; it is the three
 * things this book added on top of it, each of which exists because the
 * scorers will be walking around a golf course:
 *
 *   the outbox      a write with no signal is kept, and goes when it returns
 *   the poll        the book keeps updating after the live socket dies
 *   the snapshots   frozen, so nothing can mutate one by accident
 *
 * Run: node tools/supabase-test.mjs
 */
import { createSupabaseDb } from '../src/dbsupa.js';

const fails = [];
const ok = (n, g, w) => { const good = JSON.stringify(g) === JSON.stringify(w);
  console.log((good ? '  PASS  ' : '  FAIL  ') + n + '  got ' + JSON.stringify(g) + (good ? '' : '  want ' + JSON.stringify(w)));
  if (!good) fails.push(n); };
const wait = ms => new Promise(r => setTimeout(r, ms));

/* localStorage, as the outbox expects to find it */
const mem = new Map();
global.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k),
};

/* ---- a stand-in for the Supabase client ---------------------------------
   Rows live in a Map. `offline` makes every call reject the way a dead
   connection does. `handlers` is where the realtime callback lands so the
   test can push a change as the server would. */
function fakeSupabase() {
  const rows = new Map();
  const state = { offline: false, calls: 0, sweeps: 0, handler: null, onState: null, subscribed: false, deny: [], pins: { 1000: 'master', 2000: 's1' }, names: { g6: '4826' }, gated: [] };
  let clock = 1000;
  const stamp = () => new Date(clock++).toISOString();

  const guard = () => { if (state.offline) throw new Error('fetch failed'); state.calls++; };
  /* the database's own rules, turning a path down the way Postgres does */
  const denied = path => state.deny.some(pre => String(path).startsWith(pre))
    ? { code: '42501', message: 'new row violates row-level security policy for table "docs"' } : null;

  function table() {
    const q = { _filters: [], _like: null, _gt: null };
    const run = () => {
      guard();
      let out = [...rows.values()];
      for (const [col, val] of q._filters) out = out.filter(r => r[col] === val);
      if (q._like) { const pre = q._like.replace('%', ''); out = out.filter(r => r.path.startsWith(pre)); }
      if (q._gt) out = out.filter(r => r.updated_at > q._gt);
      return out.sort((a, b) => (a.updated_at < b.updated_at ? -1 : 1));
    };
    const api = {
      select() { return api; },
      eq(col, val) { q._filters.push([col, val]); return api; },
      like(col, val) { q._like = val; return api; },
      gt(col, val) { q._gt = val; if (col === 'updated_at') state.sweeps++; return api; },
      order() { return api; },
      limit() { return api; },
      upsert(row) {
        return (async () => {
          try { guard(); } catch (e) { return { error: e }; }
          if (denied(row.path)) return { error: denied(row.path) };
          const r = { ...row, updated_at: stamp() };
          rows.set(row.path, r);
          return { error: null };
        })();
      },
      delete() {
        return { eq: (col, val) => (async () => {
          try { guard(); } catch (e) { return { error: e }; }
          rows.delete(val);
          return { error: null };
        })() };
      },
      then(res, rej) { return (async () => { try { return { data: run(), error: null }; }
                                            catch (e) { return { data: null, error: e }; } })().then(res, rej); },
    };
    return api;
  }

  return {
    state, rows,
    createClient() {
      return {
        from: () => table(),
        async rpc(name, args) {
          try { guard(); } catch (e) { return { error: e }; }
          /* the server's gate: the tournament's own rows take a PIN it knows */
          let role = state.pins[args.p_pin];
          /* the master phone: the master PIN counts only from an enrolled phone, once one is */
          if (role === 'master' && state.masters && state.masters.size && !state.masters.has(args.p_who)) { state.deniedMaster = (state.deniedMaster || 0) + 1; role = null; }
          if (name === 'master_phones_list') return { data: role === 'master' ? { phones: [...(state.masters || [])].map(dev => ({ dev, label: '' })), you: args.p_who } : { denied: true }, error: null };
          if (name === 'master_phone_add') { if (role !== 'master') return { data: 'denied: PIN not accepted', error: null }; if (!state.masters || !state.masters.size) return { data: 'denied: the first master phone is enrolled from the SQL editor, not the app', error: null }; state.masters.add(args.p_dev); return { data: 'ok', error: null }; }
          if (name === 'master_phone_remove') { if (role !== 'master') return { data: 'denied: PIN not accepted', error: null }; if (args.p_dev === args.p_who) return { data: 'denied: a phone cannot take itself off; do it from another master phone', error: null }; state.masters.delete(args.p_dev); return { data: 'ok', error: null }; }
          if (name === 'verify_pin') return { data: role || null, error: null };
          /* a name and its PIN: claimed once, proved after */
          if (name === 'claim_name') {
            if (state.names[args.p_pid]) return { error: { code: '23505', message: 'That name already has a PIN' } };
            state.names[args.p_pid] = args.p_pin; rows.set('chat/id_' + args.p_pid, { path: 'chat/id_' + args.p_pid, doc: { k: 'id', pid: args.p_pid, hash: 'x' }, updated_at: stamp() });
            return { error: null };
          }
          if (name === 'check_name') return { data: state.names[args.p_pid] === args.p_pin, error: null };
          if (name === 'social_write' || name === 'social_delete') {
            state.gated.push([name, args.p_path, args.p_pid, args.p_name_pin]);
            if (denied(args.p_path)) return { error: denied(args.p_path) };
            const master = role === 'master';
            const ident = master || (args.p_pid.startsWith('x') ? true : state.names[args.p_pid] === args.p_name_pin);
            if (!ident) return { error: { code: '42501', message: 'PIN not accepted: confirm the PIN for your name' } };
            const held = rows.get(args.p_path);
            if (!master && held && held.doc.dev !== args.p_who && !(args.p_merge && Object.keys(args.p_doc).every(k => k === 'id' || k === 'rev' || k.startsWith('rx')))) return { error: { code: '42501', message: 'PIN not accepted: not yours to change' } };
            if (!master && !args.p_merge && name === 'social_write' && args.p_doc.pid && args.p_doc.pid !== args.p_pid) return { error: { code: '42501', message: 'PIN not accepted: a post is signed by its own name' } };
            if (name === 'social_delete') { rows.delete(args.p_path); return { error: null }; }
            rows.set(args.p_path, { path: args.p_path, doc: args.p_merge ? { ...((held || {}).doc || {}), ...args.p_doc } : args.p_doc, writer: args.p_who, updated_at: stamp() });
            return { error: null };
          }
          if (name === 'name_pins_list') return { data: role === 'master' ? { pins: { ...state.names } } : { denied: true }, error: null };
          if (name === 'photo_patch') {
            const held = rows.get(args.p_path);
            if (!held) return { data: 'denied: no such photo', error: null };
            const owner = role === 'master' || held.doc.dev === args.p_who;
            const bad = Object.keys(args.p_fields).find(k => !(k === 'rev' || k === 'id' || k === 'hv_' + args.p_who || (owner && ['rid', 'hole', 'day', 'caption'].includes(k))));
            if (bad) return { data: 'denied: PIN not accepted: not yours to change', error: null };
            rows.set(args.p_path, { ...held, doc: { ...held.doc, ...args.p_fields }, writer: args.p_who, updated_at: stamp() });
            return { data: 'ok', error: null };
          }
          if (name === 'photo_delete') {
            const held = rows.get(args.p_path);
            if (held && role !== 'master' && held.doc.dev !== args.p_who) return { data: 'denied: PIN not accepted: not yours to remove', error: null };
            rows.delete(args.p_path); return { data: 'ok', error: null };
          }
          if (name === 'bbb_mark') {
            state.gated.push([name, 'bbb/' + args.p_rid, args.p_pin]);
            if (!role) return { error: { code: '42501', message: 'PIN not accepted' } };
            const path = 'bbb/' + args.p_rid, held = rows.get(path);
            const d = held ? JSON.parse(JSON.stringify(held.doc)) : { holes: Array.from({ length: 18 }, () => ({ bingo: null, bango: null, bongo: null })) };
            const cell = d.holes[args.p_hole] = d.holes[args.p_hole] || {};
            cell.g = cell.g || {}; cell.g[args.p_group] = { ...(cell.g[args.p_group] || {}), ...args.p_cell };
            rows.set(path, { path, doc: d, writer: args.p_who, updated_at: stamp() });
            return { data: 'ok', error: null };
          }
          if (name === 'write_doc' || name === 'delete_doc') {
            state.gated.push([name, args.p_path, args.p_pin]);
            if (!role) return { error: { code: '42501', message: 'PIN not accepted' } };
            if (name === 'delete_doc') { rows.delete(args.p_path); return { error: null }; }
            const held = rows.get(args.p_path);
            rows.set(args.p_path, { path: args.p_path, doc: args.p_merge ? { ...((held || {}).doc || {}), ...args.p_doc } : args.p_doc,
                                    writer: args.p_who, updated_at: stamp() });
            return { error: null };
          }
          if (name !== 'merge_doc') return { error: new Error('no such function') };
          if (denied(args.p)) return { error: denied(args.p) };
          const held = rows.get(args.p);
          rows.set(args.p, { path: args.p, doc: { ...((held || {}).doc || {}), ...args.patch },
                             writer: args.who, updated_at: stamp() });
          return { error: null };
        },
        channel() {
          const ch = {
            on(_ev, _cfg, fn) { state.handler = fn; return ch; },
            subscribe(fn) { state.onState = fn; state.subscribed = true; fn('SUBSCRIBED'); return ch; },
          };
          return ch;
        },
        removeChannel() { state.subscribed = false; },
        removeAllChannels() { state.subscribed = false; },
      };
    },
  };
}

const said = [];
let myPin = '1000', myName = { pid: 'g6', pin: '4826' };
function open(fake) {
  return createSupabaseDb({
    url: 'https://example.supabase.co', key: 'sb_publishable_test', deviceId: 'dtest',
    createClient: fake.createClient, onStatus: s => said.push(s), pinFor: () => myPin, whoFor: () => myName,
  });
}

/* ---- the server's gate ---------------------------------------------------- */
{
  console.log('\nthe tournament\'s own rows go through the gate');
  const fake = fakeSupabase();
  const db = open(fake);
  await db.doc('scores/r1__g6').set({ raw: [4] });
  ok('a card is written through write_doc, with the PIN this phone holds', fake.state.gated.at(-1), ['write_doc', 'scores/r1__g6', '1000']);
  await db.doc('chat/m1').set({ k: 'm', pid: 'g6', dev: 'dtest', text: 'hi' });
  ok('a chat message is signed with the name this phone claimed and its PIN', fake.state.gated.at(-1), ['social_write', 'chat/m1', 'g6', '4826']);
  ok('the role a PIN proves is the server\'s to say', [await db.verifyPin('1000'), await db.verifyPin('2000'), await db.verifyPin('9999')], ['master', 's1', null]);
  await db.doc('people/g1').delete();
  ok('and a roster row is deleted through delete_doc', fake.state.gated.at(-1), ['delete_doc', 'people/g1', '1000']);

  myPin = '4321';
  said.length = 0;
  ok('a write with a PIN the server does not know is not landed', await db.doc('scores/r1__g2').set({ raw: [5] }), false);
  ok('the screen is told it was denied, and it waits in the outbox', [said.includes('denied'), db.pendingPaths()], [true, ['scores/r1__g2']]);
  await db.doc('chat/m2').set({ k: 'm', text: 'still talking' });
  ok('the chat is not held up behind it', fake.rows.has('chat/m2'), true);
  myPin = '1000'; db.pinChanged(); await wait(300);
  ok('a PIN the server accepts sends it on', [fake.rows.has('scores/r1__g2'), db.pendingPaths()], [true, []]);

  console.log('\nthe chat and the bets are signed');
  myPin = '';
  ok('a name is claimed once', [await db.claimName('g1', '1111'), await db.claimName('g1', '2222').catch(e => e.code)], [true, 'taken']);
  ok('and proved after', [await db.checkName('g1', '1111'), await db.checkName('g1', '9999')], [true, false]);
  myName = { pid: 'g1', pin: '1111' };
  ok('a post as another name is not landed', await db.doc('chat/m2').set({ k: 'm', pid: 'g6', dev: 'dtest', text: 'as Ray' }), false);
  ok('nor a post with a PIN the server does not know', (myName = { pid: 'g1', pin: '0000' }, await db.doc('chat/m3').set({ k: 'm', pid: 'g1', dev: 'dtest', text: 'hi' })), false);
  myName = { pid: 'g1', pin: '1111' };
  fake.rows.set('chat/m9', { path: 'chat/m9', doc: { k: 'm', pid: 'g6', dev: 'dOther', text: 'from another phone' }, updated_at: 'z' });
  ok('a reaction on another phone\'s post is a merge of this phone\'s own keys', await db.doc('chat/m9').update({ rx_dtest: '🔥' }), true);
  ok('but its words are not this phone\'s to change', await db.doc('chat/m9').update({ text: 'edited' }), false);
  ok('nor its existence', await db.doc('chat/m9').delete(), false);
  fake.rows.set('photos/ph1', { path: 'photos/ph1', doc: { url: 'x', dev: 'dOther' }, updated_at: 'z' });
  fake.rows.set('photos/ph2', { path: 'photos/ph2', doc: { url: 'y', dev: 'dtest' }, updated_at: 'z' });
  ok('a photo comes down by the phone that put it up', [await db.doc('photos/ph2').delete(), await db.doc('photos/ph1').delete()], [true, false]);
  myPin = '1000'; myName = { pid: 'g6', pin: '4826' };
  db.close();
}

/* ---- a document goes in and comes back ---------------------------------- */
{
  console.log('\nthe plain case');
  const fake = fakeSupabase();
  const db = open(fake);
  ok('a configured project gives a store', !!db, true);
  ok('and it says which one it is', db.kind, 'supabase');

  await db.doc('config/tournament').set({ v: 3, capOver: 3 });
  ok('the write reached the table', fake.rows.has('config/tournament'), true);

  const snap = await db.doc('config/tournament').get();
  ok('it reads back', snap.data().capOver, 3);
  ok('and the snapshot says it exists', snap.exists, true);

  const missing = await db.doc('config/nothing').get();
  ok('a document that is not there says so', [missing.exists, missing.data()], [false, null]);

  await db.doc('people/g1').set({ id: 'g1', display: 'Duncan W' });
  await db.doc('people/g2').set({ id: 'g2', display: 'DP' });
  const coll = await db.collection('people').get();
  ok('a collection comes back whole', coll.docs.map(d => d.id).sort(), ['g1', 'g2']);
  /* A ref who has just saved a hole should see it without waiting for the
     server to send their own write back to them. */
  const live = [];
  db.collection('people').onSnapshot(s2 => live.push(s2.docs.length));
  await wait(40);
  await db.doc('people/g3').set({ id: 'g3', display: 'Matt D' });
  ok('and a write shows before the server echoes it', live[live.length - 1], 3);
  ok('with its bodies', coll.docs.find(d => d.id === 'g1').data().display, 'Duncan W');
  db.close();
}

/* ---- frozen, like the platform's ---------------------------------------- */
{
  console.log('\nnothing can scribble on a snapshot');
  const fake = fakeSupabase();
  const db = open(fake);
  await db.doc('config/tournament').set({ rounds: { r1: { state: 'closed' } } });
  const snap = await db.doc('config/tournament').get();
  const body = snap.data();
  let threw = false;
  try { 'use strict'; body.rounds = {}; } catch (e) { threw = true; }
  ok('the body is frozen', Object.isFrozen(body), true);
  ok('and writing to it is refused', threw || body.rounds.r1.state === 'closed', true);
  db.close();
}

/* ---- the merge, which is why config writes do not undo each other -------- */
{
  console.log('\ntwo people editing the tournament at once');
  const fake = fakeSupabase();
  const db = open(fake);
  await db.doc('config/tournament').set({ rounds: { r1: 'closed' }, schedule: ['dinner'] });
  // one ref sets a tee time, another opens the round — neither sends the whole document
  await db.doc('config/tournament').update({ rounds: { r1: 'open' } });
  await db.doc('config/tournament').update({ pins: { master: '1000' } });
  const held = fake.rows.get('config/tournament').doc;
  ok('the later change landed', held.rounds.r1, 'open');
  ok('and the other one is still there', held.schedule, ['dinner']);
  ok('as is the field neither of them touched', held.pins.master, '1000');
  db.close();
}

/* ---- the outbox --------------------------------------------------------- */
{
  console.log('\na card entered with no signal');
  mem.clear();
  const fake = fakeSupabase();
  const db = open(fake);
  await db.doc('scores/r1__g1').set({ raw: [4] });
  ok('the first hole reached the table', fake.rows.has('scores/r1__g1'), true);

  fake.state.offline = true;                       // walking into the trees on 12
  const okSave = await db.doc('scores/r1__g1').set({ raw: [4, 5] });
  ok('the write reports it did not land', okSave, false);
  ok('but it was kept', db.pending, 1);
  ok('and the table still holds the old card', fake.rows.get('scores/r1__g1').doc.raw, [4]);

  await db.doc('scores/r1__g1').set({ raw: [4, 5, 3] });
  await db.doc('scores/r1__g2').set({ raw: [6] });
  ok('later holes supersede rather than pile up', db.pending, 2);

  fake.state.offline = false;                      // back on the 13th tee
  await wait(4600);
  ok('the queue emptied itself', db.pending, 0);
  ok('and the newest card is the one that landed', fake.rows.get('scores/r1__g1').doc.raw, [4, 5, 3]);
  ok('nothing else was lost', fake.rows.get('scores/r1__g2').doc.raw, [6]);
  ok('the book said it was holding writes', said.includes('queued'), true);
  db.close();
}

/* ---- a write the rules refuse -------------------------------------------- */
{
  console.log('\na write the database rules refuse');
  mem.clear();
  const fake = fakeSupabase();
  const db = open(fake);
  fake.state.deny = ['chat/'];                     // the rule not yet widened for chat
  const r = await db.doc('chat/m1').set({ text: 'hello' });
  ok('it reports it did not land', r, false);
  ok('and is not queued as if there were no signal', db.pending, 0);
  ok('it is logged as refused', said.includes('refused'), true);

  fake.state.offline = true;                       // no signal: both wait
  await db.doc('chat/m2').set({ text: 'from the trees' });
  await db.doc('scores/r1__g3').set({ raw: [5] });
  ok('both wait for a signal', db.pending, 2);
  fake.state.offline = false;
  await wait(4600);
  ok('the refused one does not hold up the card behind it', fake.rows.has('scores/r1__g3') && fake.rows.get('scores/r1__g3').doc.raw[0], 5);
  ok('and the outbox is empty', db.pending, 0);
  ok('a reaction merged into a refused path is dropped too', await db.doc('chat/x_1').update({ rx_d1: '🔥' }), false);
  ok('nothing left waiting', db.pending, 0);
  db.close();
}

/* ---- the poll behind the socket ----------------------------------------- */
{
  console.log('\nthe live socket dies quietly');
  mem.clear();
  const fake = fakeSupabase();
  const db = open(fake);
  const seen = [];
  db.collection('scores').onSnapshot(s => seen.push(s.docs.length));
  db.start();
  await wait(60);
  ok('the socket came up', db.live, true);
  /* while the socket is live the poll is only a net, and keeps to a minute:
     a phone on a golf course all day has a battery */
  const quiet = fake.state.sweeps;
  await wait(7000);
  ok('a live socket is not polled every few seconds', fake.state.sweeps, quiet);

  // the other ref's phone writes a card; the socket delivers it
  fake.rows.set('scores/r2__g5', { path: 'scores/r2__g5', doc: { raw: [5] }, updated_at: new Date(5000).toISOString() });
  fake.state.handler({ eventType: 'INSERT', new: fake.rows.get('scores/r2__g5') });
  await wait(40);
  ok('a card from the other group arrived', seen[seen.length - 1], 1);

  /* Now the socket stops saying anything — which on a mobile network it does
     without ever reporting an error. The poll is the only thing that notices. */
  fake.state.onState('CHANNEL_ERROR');
  ok('the book knows it is no longer live', db.live, false);
  fake.rows.set('scores/r2__g6', { path: 'scores/r2__g6', doc: { raw: [7] }, updated_at: new Date(9000).toISOString() });
  const before = fake.state.sweeps;
  await wait(1400);
  ok('it went and looked at once', fake.state.sweeps > before, true);
  ok('and found the card the socket never sent', seen[seen.length - 1], 2);
  db.close();
}

/* ---- a deletion is a deletion ------------------------------------------- */
{
  console.log('\nremoving things');
  mem.clear();
  const fake = fakeSupabase();
  const db = open(fake);
  db.start();
  const seen = [];
  await db.doc('pairs/p9').set({ id: 'p9', members: [] });
  db.collection('pairs').onSnapshot(s => seen.push(s.docs.map(d => d.id)));
  await wait(40);
  ok('the pair is there', seen[seen.length - 1], ['p9']);
  /* The screen must not wait for the server to agree. A removed pair goes
     now; the echo that follows finds nothing left to do. */
  await db.doc('pairs/p9').delete();
  ok('and gone the moment it is deleted', seen[seen.length - 1], []);
  fake.state.handler({ eventType: 'DELETE', old: { path: 'pairs/p9' } });
  await wait(40);
  ok('the echo changes nothing', seen[seen.length - 1], []);
  ok('really gone from the table', fake.rows.has('pairs/p9'), false);
  db.close();
}

/* ---- a bingo mark lands on its hole alone --------------------------------- */
{
  console.log('\ntwo refs, two groups, one bingo row');
  mem.clear();
  const fake = fakeSupabase();
  const db = open(fake);
  db.start();
  myPin = '2000';
  ok('a mark goes as a mark, not as the row', [await db.bbbMark({ rid: 'r1', h: 3, gid: 't0', cell: { bingo: 'g1' } }), fake.state.gated.filter(g => g[0] === 'bbb_mark').length], [true, 1]);
  /* the other ref's phone, which has never heard of group 1's mark, marks group 2 on the same hole */
  await db.bbbMark({ rid: 'r1', h: 3, gid: 't1', cell: { bango: 'g5' } });
  await db.bbbMark({ rid: 'r1', h: 3, gid: 't0', cell: { bongo: 'g2' } });
  ok('both groups\' marks are on the hole, nothing overwritten', fake.rows.get('bbb/r1').doc.holes[3].g, { t0: { bingo: 'g1', bongo: 'g2' }, t1: { bango: 'g5' } });
  fake.state.offline = true;
  ok('with no signal a mark waits', [await db.bbbMark({ rid: 'r1', h: 4, gid: 't0', cell: { bingo: 'g1' } }), db.pendingPaths()], [false, ['bbb/r1#4#t0']]);
  await db.bbbMark({ rid: 'r1', h: 4, gid: 't0', cell: { bango: 'g2' } });
  ok('a second mark on the same hole folds into it', db.pendingPaths(), ['bbb/r1#4#t0']);
  fake.state.offline = false;
  await wait(4500);
  ok('and both land together when the signal is back', [db.pendingPaths(), fake.rows.get('bbb/r1').doc.holes[4].g], [[], { t0: { bingo: 'g1', bango: 'g2' } }]);
  db.close();
}

/* ---- low power: no socket, the slow poll --------------------------------- */
{
  console.log('\nlow power');
  mem.clear();
  const fake = fakeSupabase();
  const db = open(fake);
  db.start();
  ok('the socket is open as the book starts', [fake.state.subscribed, db.lowPower], [true, false]);
  db.setLowPower(true);
  ok('low power closes it', [fake.state.subscribed, db.lowPower, db.live], [false, true, false]);
  await db.doc('photos/pz').set({ id: 'pz', rid: 'r1', url: 'https://example.supabase.co/storage/v1/object/public/photos/pz.jpg' });
  ok('writes still go at once', fake.rows.has('photos/pz'), true);
  db.setLowPower(false);
  await wait(900);
  ok('turning it off opens the socket again', [fake.state.subscribed, db.lowPower], [true, false]);
  db.close();
}

/* ---- the master phone ---------------------------------------------------- */
{
  console.log('\nthe master phone');
  mem.clear();
  const fake = fakeSupabase();
  const db = open(fake);
  db.start();
  myPin = '1000';                                                   // the master PIN, on this phone (dtest)
  ok('with nobody enrolled, the master PIN works from any phone', await db.verifyPin('1000'), 'master');
  fake.state.masters = new Set(['dother']);                        // the commissioner enrolled their own phone
  ok('once a phone is enrolled, the same PIN from another phone is refused like a wrong one', await db.verifyPin('1000'), null);
  await db.doc('config/tournament').update({ rev: 9, capOver: 4 });
  ok('and nothing of the master’s goes through from it', [fake.rows.has('config/tournament'), fake.state.deniedMaster > 0], [false, true]);
  let said = '';
  try { await db.masterPhoneAdd('1000', 'dtest', 'mine'); } catch (e) { said = e.message; }
  ok('nor can it enrol itself', said, 'PIN not accepted');
  fake.state.masters = new Set(['dtest']);                         // this phone is the one enrolled
  ok('from the enrolled phone the PIN is the master PIN again', await db.verifyPin('1000'), 'master');
  ok('and it can add another phone', [await db.masterPhoneAdd('1000', 'dbackup', 'the backup'), (await db.masterPhones('1000')).map(p => p.dev)], [true, ['dtest', 'dbackup']]);
  said = '';
  try { await db.masterPhoneRemove('1000', 'dtest'); } catch (e) { said = e.message; }
  ok('but not take itself off', said, 'a phone cannot take itself off; do it from another master phone');
  db.close();
}

/* ---- refusing to pretend ------------------------------------------------ */
{
  console.log('\nwhen there is no project at all');
  ok('an empty url gives nothing', createSupabaseDb({ url: '', key: 'k', createClient: () => ({}) }), null);
  ok('a missing key gives nothing', createSupabaseDb({ url: 'https://x', key: '', createClient: () => ({}) }), null);
  ok('and so does no client', createSupabaseDb({ url: 'https://x', key: 'k' }), null);
}

console.log(fails.length ? '\nFAILED: ' + fails.join(', ')
                         : '\nThe card survives the walk between the trees and the tee.');
process.exit(fails.length ? 1 : 0);
