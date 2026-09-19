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
  const state = { offline: false, calls: 0, sweeps: 0, handler: null, onState: null, subscribed: false };
  let clock = 1000;
  const stamp = () => new Date(clock++).toISOString();

  const guard = () => { if (state.offline) throw new Error('fetch failed'); state.calls++; };

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
          if (name !== 'merge_doc') return { error: new Error('no such function') };
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
function open(fake) {
  return createSupabaseDb({
    url: 'https://example.supabase.co', key: 'sb_publishable_test', deviceId: 'dtest',
    createClient: fake.createClient, onStatus: s => said.push(s),
  });
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
  await wait(6600);
  ok('it went and looked instead', fake.state.sweeps > before, true);
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
