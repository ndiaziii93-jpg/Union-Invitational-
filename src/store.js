/* Shared state, so the two scorers, the master reviewer and every spectator
   see the same tournament.

   It will take that state from whichever of three places can hold it, in
   this order: the book's own Supabase project, the artifact platform's db,
   or this device's localStorage. The interface is identical in all three —
   doc(path).get/set/update/delete, collection(name).get/onSnapshot — so
   everything below this line, including every hard-won rule about not
   overwriting a real tournament, is written once and does not know which it
   got. The status bar tells the reader which one is in use. */

import { GOLFERS, OFFICIALS, SPECTATORS, PAIRS, ROUNDS, SCHEDULE, COURSES, BUILD } from './data.js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { createSupabaseDb } from './dbsupa.js';

const LOCAL_KEY = 'union-invitational:v3';
const DEFAULT_PINS = { master: '1000', s1: '2000', s2: '3000' };

/** `by` and `at` are keyed by hole index and hold only saved holes, so a hole
 *  with no entry is simply absent — no null to be dropped in transit. */
/* `marks` is the ref's read of the hole — three-putt, out of bounds, water,
   shot of the hole — keyed by hole index. It rides along with the card
   because it is the same person writing it at the same moment, and it feeds
   the recap only: nothing in it reaches a leaderboard. A card written before
   marks existed simply has none. */
export function blankCard() { return { raw: Array(18).fill(null), by: {}, at: {}, marks: {}, mF: false, mB: false, bb: false }; }
export function blankNote(rid, pid) { return { rid, pid, marks: {}, text: {}, at: {} }; }
export function blankBbb() { return { holes: Array.from({ length: 18 }, () => ({ bingo: null, bango: null, bongo: null })) }; }

export function defaultConfig() {
  const people = [
    ...GOLFERS.map(([id, name, display]) => ({ id, name, display, role: 'golfer', location: null, group: id === 'g8' ? '5-day' : '7-day', band: null })),
    ...OFFICIALS.map(([id, name]) => ({ id, name, display: name, role: 'official', location: null, group: '7-day', band: null })),
    ...SPECTATORS.map(([id, name]) => ({ id, name, display: name, role: 'spectator', location: null, group: '7-day', band: null })),
  ];
  const rounds = {};
  for (const r of ROUNDS) {
    rounds[r.id] = {
      state: 'closed',
      tees: [
        { time: r.firstTee, players: [] },
        { time: null, players: [] },
        { time: null, players: [] },
      ],
      ctpHole: null, ldHole: null,
      ctpWinner: null, ctpDist: '', ldWinner: null, ldDist: '',
      lockedBy: null, lockedAt: null, openedBy: null,
    };
  }
  const courses = {};
  for (const [key, c] of Object.entries(COURSES)) {
    courses[key] = { verified: true, holes: c.holes.map(h => ({ par: h.par, si: h.si, mW: h.mW, mY: h.mY })) };
  }
  return {
    v: 3,
    capOver: 3,
    courses,
    people,
    pairs: PAIRS.map(p => ({ ...p, members: [...p.members] })),
    rounds,
    schedule: SCHEDULE.map(e => ({ ...e })),
    pins: { ...DEFAULT_PINS },
    pinsChanged: false,
    // the week stops moving once it is settled; only the master can reopen it
    calLocked: false,
    // The pair leading after a counting round picks the next round's tee time.
    // Two picks only: Thursday's leader picks Friday, Friday's leader picks Sunday.
    teePicks: { r2: { done: false, time: null, byPair: null }, r3: { done: false, time: null, byPair: null } },
  };
}

/** The in-memory starting point carries NO roster. The factory roster exists
 *  only in defaultConfig(), and is written exactly once when a store is first
 *  created — so it can never leak back in and resurrect somebody. */
export function emptyState() {
  const cfg = defaultConfig();
  return { config: { ...cfg, people: [], pairs: [] }, scores: {}, bbb: {}, recaps: {}, photos: {}, notes: {} };
}

/** Everything written to config/tournament. The roster is ALSO kept here as a
 *  mirror — never read while the per-person documents exist, but never dropped
 *  either, so no migration or bad load can lose it. */
function configOnly(cfg) { return { ...cfg }; }
const byOrder = (a, b) => (a.order || 0) - (b.order || 0);

/* A store may drop keys whose value is null, so put them back explicitly —
   `x === null` downstream would otherwise read undefined and take the wrong branch. */
export function normPerson(p) {
  return { ...p, location: p.location == null ? null : p.location,
           band: p.band == null ? null : p.band, group: p.group || '7-day' };
}
export function normPair(p) {
  return { ...p, name: p.name == null ? null : p.name, members: p.members || [] };
}

/* ---------- roles ---------- */

export const ROLES = {
  master: { id: 'master', label: 'Master reviewer', canEdit: true, canAdmin: true },
  s1:     { id: 's1',     label: 'Scorer 1',        canEdit: true, canAdmin: false },
  s2:     { id: 's2',     label: 'Scorer 2',        canEdit: true, canAdmin: false },
  viewer: { id: 'viewer', label: 'Viewer',          canEdit: false, canAdmin: false },
};

export function roleForPin(config, pin) {
  const p = String(pin || '').trim();
  if (!p) return null;
  const pins = config.pins || DEFAULT_PINS;
  if (p === String(pins.master)) return 'master';
  if (p === String(pins.s1)) return 's1';
  if (p === String(pins.s2)) return 's2';
  return null;
}

/* ---------- store ---------- */

export function createStore(onChange) {
  const T = emptyState();
  let db = null;
  let unsubs = [];
  let ready = false;
  let mode = 'local';           // 'db' | 'local'
  let backend = 'none';         // 'supabase' | 'artifact' | 'none'
  let peopleLoaded = false, pairsLoaded = false, splitDone = false;
  let rosterInDocs = false;     // the roster lives in its own documents
  let peopleSeen = false;       // the people collection has reported at least once
  const emptySeq = { people: 0, pairs: 0, scores: 0, bbb: 0, recaps: 0, photos: 0, notes: 0 };  // guards a confirmation against a newer snapshot
  let sawConfig = false;
  let legacy = null;            // a roster still stored as lists inside the config
  let settled = false;          // the first load has resolved; until then, no writes
  let sawData = false;          // we have seen a real stored config this page load
  let seeding = false;
  let saveTimer = null;
  let status = 'connecting';    // connecting | live | local | error
  let saveState = 'idle';       // idle | saving | saved | queued | error — the last write's fate
  let lastSavedAt = null;
  // Our revision per document. A snapshot older than what we last wrote is an
  // echo of a version we have already moved past, and applying it would undo
  // the change the user just made — so it is ignored.
  const rev = {};
  const bump = (path, doc) => { doc.rev = Math.max(doc.rev || 0, rev[path] || 0) + 1; rev[path] = doc.rev; };
  const fresher = (path, doc) => ((doc && doc.rev) || 0) >= (rev[path] || 0);

  const notify = () => {
    keepLocal();                 // the device keeps its own copy of whatever it knows
    onChange(T, { ready, mode, status, saveState, lastSavedAt, settled, backend,
                  pending: (db && typeof db.pending === 'number') ? db.pending : 0,
                  live: !!(db && db.live) });
  };

  /* ---- what actually happened on this device ----
     Three attempts to fix writes that never landed have failed because the
     failure only happens on somebody else's phone. So the phone keeps its own
     short log and leaves it in the book, where it can be read back. It holds
     no scores and no names: only what was attempted and what came back. */
  const DEV_KEY = 'union-invitational:device';
  let deviceId = 'd0';
  try {
    deviceId = localStorage.getItem(DEV_KEY) || ('d' + Math.random().toString(36).slice(2, 8));
    localStorage.setItem(DEV_KEY, deviceId);
  } catch (e) { /* storage blocked: the log is still kept for this visit */ }
  const trace = [];
  let traceTimer = null;
  function note(ev, detail) {
    trace.push({ t: new Date().toISOString().slice(11, 19), ev, d: detail == null ? '' : String(detail).slice(0, 120) });
    while (trace.length > 30) trace.shift();
    if (mode !== 'db' || !db) return;
    clearTimeout(traceTimer);
    traceTimer = setTimeout(() => {
      db.doc('diag/' + deviceId).set({
        build: BUILD,
        at: new Date().toISOString(),
        ua: String(navigator.userAgent || '').slice(0, 180),
        settled, mode, status, saveState,
        trace: trace.slice(),
      }).catch(() => { /* the log is a courtesy, never a blocker */ });
    }, 2500);
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && s.config && s.config.v === 3) { T.config = s.config; T.scores = s.scores || {}; T.bbb = s.bbb || {};
          T.recaps = s.recaps || {}; T.photos = s.photos || {}; T.notes = s.notes || {}; return; }
      }
    } catch (e) { /* first run, or storage blocked */ }
    T.config = defaultConfig();   // no database and nothing stored: start from the factory book
  }
  /* With the book's own database, whatever has been read is also kept on the
     device — so a phone that opens on the first tee with no signal shows the
     tournament rather than an empty book. */
  function keepLocal() { if (backend === 'supabase') saveLocal(); }

  function saveLocal() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(LOCAL_KEY, JSON.stringify(T)); } catch (e) { /* quota or blocked */ }
    }, 250);
  }

  async function connect() {
    /* The book's own database first. It is the one that works on a phone
       with no signal, so it is preferred wherever it is configured. */
    try {
      const factory = (typeof window !== 'undefined' && window.__supabase)
        ? window.__supabase.createClient : null;
      db = factory ? createSupabaseDb({
        url: SUPABASE_URL, key: SUPABASE_KEY, deviceId, createClient: factory,
        onStatus: s2 => {
          if (s2 === 'offline' || s2 === 'queued') { saveState = 'queued'; }
          else if (s2 === 'saved' || s2 === 'flushed') { saveState = 'saved'; lastSavedAt = Date.now(); }
          if (s2 === 'live' || s2 === 'polling') status = 'live';
          notify();
        },
      }) : null;
    } catch (e) { db = null; }

    if (!db) {
      try { db = window.claude && window.claude.use ? await window.claude.use('db') : null; }
      catch (e) { db = null; }
    }

    if (!db) { mode = 'local'; status = 'local'; loadLocal(); ready = true; settled = true; notify(); return; }
    mode = 'db';
    backend = db.kind || 'artifact';

    /* A book opened on the first tee with no signal must still show the
       tournament. Whatever was read last time is on the device; it is put up
       straight away and every subscription below corrects it. */
    if (backend === 'supabase') loadLocal();
    // eslint-disable-next-line no-var
    var settle;

    /* The store is NEVER seeded from a single read. A read that wrongly reports
       the document absent would otherwise write the factory roster over a real
       tournament — which is exactly what was happening. Seeding needs a
       subscription AND a confirming read to agree the store is empty, and once
       any data has been seen this page load it can never seed at all. */
    settle = () => {
      const was = settled;
      settled = sawConfig && peopleSeen;
      if (settled && !was) note('ready', 'writes allowed');
    };

    const takeConfig = data => {
      sawData = true; sawConfig = true;
      if (!fresher('config', data)) { settle(); return; }
      rev.config = data.rev || 0;
      note('config in', 'rev=' + (data.rev || 0)
        + ' r1tee=' + (((data.rounds || {}).r1 || {}).tees || [{}])[0].time
        + ' states=' + Object.keys(data.rounds || {}).map(k => data.rounds[k].state).join('/'));
      rosterInDocs = rosterInDocs || data.rosterInDocs === true;
      const fromDocs = { people: T.config.people, pairs: T.config.pairs };
      T.config = migrate(data);                       // carries the config's mirror
      if (peopleLoaded) {                             // real documents always win
        T.config.people = fromDocs.people; T.config.pairs = fromDocs.pairs;
      } else if (Array.isArray(data.people) && data.people.length) {
        legacy = { people: T.config.people, pairs: T.config.pairs };
      }
      settle();
      splitOutRoster();
    };

    async function seedIfTrulyEmpty() {
      if (sawData || settled || seeding) return;
      seeding = true;
      try {
        const check = await db.doc('config/tournament').get();   // a second opinion
        const held = body(check);
        if (check.exists && held) { takeConfig(held); notify(); return; }
        const factory = defaultConfig();
        await writeRoster(factory.people, factory.pairs);
        await db.doc('config/tournament').set({ ...configOnly(factory), rosterInDocs: true, rev: 0 });
        rosterInDocs = true; peopleLoaded = pairsLoaded = true; peopleSeen = true;
        T.config = factory;
        sawConfig = true; settled = true; notify();
      } catch (e) {
        // Could not confirm. Stay read-only rather than risk writing over data.
        status = 'error'; notify();
      } finally { seeding = false; }
    }

    unsubs.push(db.doc('config/tournament').onSnapshot(
      s => {
        ready = true; status = 'live';
        const held = body(s);
        if (s.exists && held) { takeConfig(held); notify(); return; }
        notify();
        seedIfTrulyEmpty();
      },
      () => { status = 'error'; notify(); }
    ));
    unsubs.push(db.collection('people').onSnapshot(
      s => {
        peopleSeen = true;
        const rows = takeRows('people', s.docs, T.config.people);
        if (rows.length) {
          emptySeq.people++;                          // any pending confirmation is stale
          peopleLoaded = true; rosterInDocs = true;
          T.config.people = rows.map(normPerson).sort(byOrder);
        } else confirmEmpty('people');
        /* An empty snapshot used to be ignored outright unless the config had
           already told us the roster lives in documents — and on a reload the
           collection can report before the config has arrived, so the flag is
           not known yet. The snapshot was dropped, the config's stale mirror
           landed a moment later, and nothing ever came back to correct it: a
           golfer removed yesterday was on the roster again today.
           It is always confirmed now. The confirmation is what is careful —
           it only replaces the roster when it FINDS one. */
        settle();
        notify();
        splitOutRoster();
      },
      () => { status = 'error'; notify(); }
    ));
    unsubs.push(db.collection('pairs').onSnapshot(
      s => {
        const rows = takeRows('pairs', s.docs, T.config.pairs);
        if (rows.length) {
          emptySeq.pairs++;
          pairsLoaded = true;
          T.config.pairs = rows.map(normPair).sort(byOrder);
        } else if (rosterInDocs) confirmEmpty('pairs');
        notify();
      },
      () => { status = 'error'; notify(); }
    ));
    unsubs.push(db.collection('scores').onSnapshot(
      s => {
        if (!s.docs.length) { confirmEmpty('scores'); notify(); return; }
        emptySeq.scores++;
        T.scores = mergeDocs('scores', T.scores, s.docs);
        notify();
      },
      () => { status = 'error'; notify(); }
    ));
    unsubs.push(db.collection('recaps').onSnapshot(
      s => {
        if (!s.docs.length) { confirmEmpty('recaps'); notify(); return; }
        emptySeq.recaps++;
        T.recaps = mergeDocs('recaps', T.recaps, s.docs);
        notify();
      },
      () => { status = 'error'; notify(); }
    ));
    unsubs.push(db.collection('photos').onSnapshot(
      s => {
        if (!s.docs.length) { confirmEmpty('photos'); notify(); return; }
        emptySeq.photos++;
        T.photos = mergeDocs('photos', T.photos, s.docs);
        notify();
      },
      () => { status = 'error'; notify(); }
    ));
    unsubs.push(db.collection('bbb').onSnapshot(
      s => {
        if (!s.docs.length) { confirmEmpty('bbb'); notify(); return; }
        emptySeq.bbb++;
        T.bbb = mergeDocs('bbb', T.bbb, s.docs);
        notify();
      },
      () => { status = 'error'; notify(); }
    ));
    /* What the golfers wrote about their own rounds. Its own collection, so
       a note can never be mistaken for a score and a bad write here can
       never touch a card. */
    unsubs.push(db.collection('notes').onSnapshot(
      s => {
        if (!s.docs.length) { confirmEmpty('notes'); notify(); return; }
        emptySeq.notes++;
        T.notes = mergeDocs('notes', T.notes, s.docs);
        notify();
      },
      () => { status = 'error'; notify(); }
    ));
    ready = true; notify();
    if (db.start) db.start();          // the live socket, the poll behind it, the outbox
    confirmRoster();

    /* An empty snapshot is not proof anything is gone — one of those is what
       emptied the book, and on a fresh load it takes the scores off a phone
       whose cards were all put in by somebody else. It is confirmed with a
       direct read first, and cleared only if the collection really is empty.
       A newer snapshot arriving meanwhile wins, so a stale confirmation can
       never undo it. */
    async function confirmEmpty(coll) {
      const seq = ++emptySeq[coll];
      try {
        const have = await db.collection(coll).get();
        if (seq !== emptySeq[coll]) return;
        if (coll === 'scores') { T.scores = mergeDocs('scores', T.scores, have.docs); notify(); return; }
        if (coll === 'recaps') { T.recaps = mergeDocs('recaps', T.recaps, have.docs); notify(); return; }
        if (coll === 'photos') { T.photos = mergeDocs('photos', T.photos, have.docs); notify(); return; }
        if (coll === 'bbb') { T.bbb = mergeDocs('bbb', T.bbb, have.docs); notify(); return; }
        if (coll === 'notes') { T.notes = mergeDocs('notes', T.notes, have.docs); notify(); return; }
        /* A read that finds documents is the answer. A read that finds none
           is only the answer once the config has said documents are where
           the roster lives — otherwise it is a collection that has not
           loaded yet, and taking it at its word empties the book. */
        if (coll === 'people') {
          if (have.docs.length) { peopleLoaded = true; rosterInDocs = true; }
          if (have.docs.length || rosterInDocs) {
            T.config.people = takeRows('people', have.docs, T.config.people).map(normPerson).sort(byOrder);
          }
        } else {
          if (have.docs.length) pairsLoaded = true;
          if (have.docs.length || rosterInDocs) {
            T.config.pairs = takeRows('pairs', have.docs, T.config.pairs).map(normPair).sort(byOrder);
          }
        }
        notify();
      } catch (e) { /* keep the roster we have: an empty book is the worse guess */ }
    }

    /* A snapshot that reports a roster collection empty is not proof: the
       roster once vanished behind one. A direct read confirms it, and any
       document it finds settles the matter, because documents always win. */
    async function confirmRoster() {
      try {
        const [pp, qq] = await Promise.all([
          db.collection('people').get(), db.collection('pairs').get(),
        ]);
        if (pp.docs.length) {
          peopleLoaded = true; rosterInDocs = true;
          T.config.people = takeRows('people', pp.docs, T.config.people).map(normPerson).sort(byOrder);
        }
        if (qq.docs.length) {
          pairsLoaded = true;
          T.config.pairs = takeRows('pairs', qq.docs, T.config.pairs).map(normPair).sort(byOrder);
        }
      } catch (e) {
        /* The subscriptions are still the primary path. What must NOT happen
           is the book staying unwritable because this read failed. */
      } finally {
        peopleSeen = true;      // asked and answered, even if the answer was an error
        settle(); notify();
      }
    }

    /* Nothing may leave the book permanently read-only. If the roster has not
       reported by the time the config has, settle anyway: a scorer standing on
       a tee with a book that silently refuses every write is far worse than a
       roster that arrives a moment later. */
    setTimeout(() => {
      if (settled || !sawConfig) return;
      peopleSeen = true;
      settle();
      notify();
    }, 5000);
  }

  async function writeRoster(people, pairs) {
    for (let i = 0; i < people.length; i++) {
      const d = { ...people[i], order: i, rev: 1 };
      rev['people/' + d.id] = 1;
      await db.doc('people/' + d.id).set(d);
    }
    for (let i = 0; i < (pairs || []).length; i++) {
      const d = { ...pairs[i], order: i, rev: 1 };
      rev['pairs/' + d.id] = 1;
      await db.doc('pairs/' + d.id).set(d);
    }
  }

  /** One-time move of a roster still stored as lists inside the config.
   *
   * This is the most dangerous function in the book, because what it does
   * when it is wrong is WRITE THE CONFIG'S MIRROR BACK AS DOCUMENTS — and
   * that mirror is a snapshot of the roster as it was before anybody was
   * ever removed. Getting it wrong resurrects the dead.
   *
   * It used to decide on a single read. If that read came back empty — a
   * page that has only just loaded, a request that landed during a
   * reconnect, an error shaped like no rows — it wrote fifteen people over a
   * roster of fourteen and the golfer who had been taken off was back. That
   * is exactly the fault `seedIfTrulyEmpty` was given its second opinion
   * for; this is the same discipline, arrived at the same way.
   *
   * Four things now have to agree that the roster has never been split out:
   *
   *   the config's own flag does not already say the documents win;
   *   no people document has been seen at any point this page load;
   *   a read finds the collection empty;
   *   and a SECOND read, a beat later, still finds it empty.
   *
   * Any of them dissenting and the mirror is dropped rather than written.
   * The cost of being wrong in that direction is a roster that stays in the
   * config for another page load. The cost of being wrong in the other
   * direction is somebody's deletion undone, silently, on a phone. */
  async function splitOutRoster() {
    if (splitDone || !settled || mode !== 'db' || !legacy) return;
    if (rosterInDocs || peopleLoaded) { legacy = null; return; }
    splitDone = true;
    try {
      const have = await db.collection('people').get();
      if (have.docs.length) { legacy = null; return; }   // somebody already did it
      /* A second opinion, after a beat, and the flags re-read — a snapshot
         may well have arrived while the first read was in flight. */
      await new Promise(r => setTimeout(r, 1200));
      if (rosterInDocs || peopleLoaded || !legacy) { legacy = null; return; }
      const again = await db.collection('people').get();
      if (again.docs.length) { legacy = null; return; }
      await writeRoster(legacy.people, legacy.pairs);
      legacy = null;
      peopleLoaded = pairsLoaded = true;
      rosterInDocs = true;
      await writeConfig(c => { c.rosterInDocs = true; });   // the mirror stays; the flag says docs win
    } catch (e) { splitDone = false; status = 'error'; notify(); }
  }

  /** Rows from a roster collection, keeping ours wherever ours is newer — the
   *  same guard the score documents use, so a stale echo cannot undo a tap. */
  /** A document's body. The store hands it back from a METHOD, not a
   *  field — reading `snap.data` without calling it yields the function
   *  itself, whose only usable property is its name, "data". That is what
   *  put blank names on the roster and the word "data" on every pairing.
   *  Older snapshot shapes carried a plain field, so accept both. */
  function body(d) {
    if (!d) return null;
    const v = typeof d.data === 'function' ? d.data() : d.data;
    if (!v || typeof v !== 'object') return null;
    /* The store hands back FROZEN objects, and the same object again for a
       document that has not changed. Put one of those into the tournament and
       every later edit to it throws — which is exactly what stopped a round
       opening, a round locking, and a tee time being set. Take a copy. */
    try { return JSON.parse(JSON.stringify(v)); }
    catch (e) { return { ...v }; }
  }

  function takeRows(coll, docs, local) {
    const out = [];
    for (const d of docs) {
      const path = coll + '/' + d.id;
      const doc = body(d);
      const mine = local.find(x => x.id === d.id);
      if (mine && !fresher(path, doc)) { out.push(mine); continue; }
      rev[path] = (doc && doc.rev) || 0;
      if (doc) out.push(doc);
    }
    return out;
  }

  /** Take the server's copy of each document unless ours is newer, and keep a
   *  document we have just written that the snapshot has not caught up on. */
  function mergeDocs(coll, local, docs) {
    const next = {};
    const seen = new Set();
    for (const d of docs) {
      seen.add(d.id);
      const path = coll + '/' + d.id;
      const doc = body(d);
      if (fresher(path, doc)) { rev[path] = (doc && doc.rev) || 0; next[d.id] = doc; }
      else next[d.id] = local[d.id];
    }
    for (const id of Object.keys(local)) {
      if (!seen.has(id) && rev[coll + '/' + id]) next[id] = local[id]; // ours, not echoed yet
    }
    return next;
  }

  function migrate(cfg) {
    const base = defaultConfig();
    const out = { ...base, ...cfg };
    // a round added after the store was seeded still needs its slot
    out.rounds = { ...base.rounds, ...(cfg.rounds || {}) };
    out.courses = { ...base.courses, ...(cfg.courses || {}) };
    // Keep whatever roster this config carries — but never fall back to the
    // factory roster, which is what used to resurrect deleted people.
    out.people = Array.isArray(cfg.people) ? cfg.people.map(normPerson) : [];
    out.pairs = Array.isArray(cfg.pairs) ? cfg.pairs.map(normPair) : [];
    return out;
  }

  /* --- writes --- */

  /* A write asked for before the book has loaded is refused — but never
     quietly. Silence made a refused change look like a control that undoes
     itself, which is a far worse thing to hand a scorer on a tee. */
  function tooEarly() {
    if (settled) return false;
    note('refused', 'not settled yet');
    saveState = 'error';
    notify();
    return true;
  }

  /* Send only the parts of the book that this change actually touched.
     The book is one document, so writing all of it hands back whatever this
     view last read — which is how a tee time set on a phone was undone by a
     laptop that still had the old one, and why every round kept springing
     back to closed. A merge cannot undo a part it does not mention. */
  async function pushConfig(keys, silent) {
    bump('config', T.config);
    if (!silent) { saveState = 'saving'; notify(); }
    if (mode === 'local') {
      saveLocal();
      if (!silent) { saveState = 'saved'; lastSavedAt = Date.now(); }
      notify();
      return true;
    }
    const patch = { rev: T.config.rev };
    for (const k of keys) patch[k] = T.config[k];
    note('config write', keys.join(',') + ' rev=' + T.config.rev);
    const done = () => {
      if (!silent) { saveState = 'saved'; lastSavedAt = Date.now(); }
      notify();
      return true;
    };
    try {
      await db.doc('config/tournament').update(patch);   // merge, never replace
      note('config ok', keys.join(','));
      return done();
    } catch (e) {
      note('update failed', (e && e.code) + ' ' + (e && e.message));
      // update refuses a document that is not there yet; that one write is a
      // create, and nobody else can have anything in it to lose.
      try {
        await db.doc('config/tournament').set(configOnly(T.config));
        note('config ok via set', keys.join(','));
        return done();
      } catch (e2) {
        note('config FAILED', (e2 && e2.code) + ' ' + (e2 && e2.message));
        status = 'error';
        if (!silent) saveState = 'error';
        notify();
        return false;
      }
    }
  }

  async function writeConfig(mutate, silent) {
    if (!settled) { if (!silent) { saveState = 'error'; notify(); } return false; }
    const before = {};
    for (const k of Object.keys(T.config)) before[k] = JSON.stringify(T.config[k]);
    mutate(T.config);
    const keys = Object.keys(T.config)
      .filter(k => k !== 'rev' && JSON.stringify(T.config[k]) !== before[k]);
    return pushConfig(keys, silent);
  }

  /* ---- roster writers ----
     Each of these touches one document. A view holding a stale roster can no
     longer resurrect somebody by rewriting the whole list. */

  function localOnly() { saveLocal(); saveState = 'saved'; lastSavedAt = Date.now(); notify(); return true; }

  /* Keep the config's mirror of the roster current. It is never read while the
     per-person documents exist — it is there so the roster cannot be lost. */
  let mirrorTimer = null;
  function refreshMirror() {
    if (mode !== 'db') return;
    clearTimeout(mirrorTimer);
    // the roster writers have already changed T.config, so name the keys
    mirrorTimer = setTimeout(() => { if (settled) pushConfig(['people', 'pairs'], true); }, 1200);
  }

  async function writeDoc(coll, id, obj) {
    const path = coll + '/' + id;
    bump(path, obj);
    saveState = 'saving'; notify();
    if (mode === 'local') return localOnly();
    try { await db.doc(path).set(obj); saveState = 'saved'; lastSavedAt = Date.now(); notify(); return true; }
    catch (e) { status = 'error'; saveState = 'error'; notify(); return false; }
  }

  async function dropDoc(coll, id) {
    const path = coll + '/' + id;
    delete rev[path];
    saveState = 'saving'; notify();
    if (mode === 'local') return localOnly();
    try { await db.doc(path).delete(); saveState = 'saved'; lastSavedAt = Date.now(); notify(); return true; }
    catch (e) { status = 'error'; saveState = 'error'; notify(); return false; }
  }

  /** Change one person in place. */
  async function writePerson(id, mutate) {
    if (tooEarly()) return false;
    const i = T.config.people.findIndex(p => p.id === id);
    if (i < 0) return false;
    const p = { ...T.config.people[i] };
    mutate(p);
    T.config.people[i] = p;
    const okd = await writeDoc('people', id, p);
    refreshMirror();
    return okd;
  }

  /** Change every person — used to clear the squads. */
  async function writeAllPeople(mutate) {
    if (tooEarly()) return false;
    const list = T.config.people.map(x => { const p = { ...x }; mutate(p); return p; });
    T.config.people = list;
    notify();
    for (const p of list) await writeDoc('people', p.id, p);
    refreshMirror();
    return true;
  }

  async function addPerson(person) {
    if (tooEarly()) return false;
    const p = { ...person, order: T.config.people.length };
    T.config.people = T.config.people.concat([p]);
    const okd = await writeDoc('people', p.id, p);
    refreshMirror();
    return okd;
  }

  /** Remove a person: their document goes, and they leave every pair and tee. */
  async function removePerson(id) {
    if (tooEarly()) return false;
    T.config.people = T.config.people.filter(p => p.id !== id);
    const touched = T.config.pairs.filter(p => p.members.includes(id));
    T.config.pairs = T.config.pairs.map(p => p.members.includes(id)
      ? { ...p, members: p.members.filter(m => m !== id) } : p);
    notify();
    await dropDoc('people', id);
    for (const p of T.config.pairs.filter(x => touched.some(t => t.id === x.id))) await writeDoc('pairs', p.id, p);
    if (Object.values(T.config.rounds).some(r => r.tees.some(t => t.players.includes(id)))) {
      await writeConfig(c => { Object.values(c.rounds).forEach(r => r.tees.forEach(t => {
        t.players = t.players.filter(m => m !== id); })); });
    }
    refreshMirror();          // the mirror must forget them too
    return true;
  }

  async function writePair(id, mutate) {
    if (tooEarly()) return false;
    const i = T.config.pairs.findIndex(p => p.id === id);
    if (i < 0) return false;
    const p = { ...T.config.pairs[i], members: [...T.config.pairs[i].members] };
    mutate(p);
    T.config.pairs[i] = p;
    const okd = await writeDoc('pairs', id, p);
    refreshMirror();
    return okd;
  }

  async function addPair(pair) {
    if (tooEarly()) return false;
    const p = { ...pair, order: T.config.pairs.length };
    T.config.pairs = T.config.pairs.concat([p]);
    const okd = await writeDoc('pairs', p.id, p);
    refreshMirror();
    return okd;
  }

  async function removePair(id) {
    if (tooEarly()) return false;
    T.config.pairs = T.config.pairs.filter(p => p.id !== id);
    notify();
    const okd = await dropDoc('pairs', id);
    refreshMirror();
    return okd;
  }

  /** Move a golfer into one pair, or out of all of them. Writes only the pairs
   *  that actually changed. */
  async function movePlayer(pid, target) {
    if (tooEarly()) return false;
    const before = T.config.pairs.map(p => p.members.join(','));
    T.config.pairs = T.config.pairs.map(p => ({ ...p, members: p.members.filter(m => m !== pid) }));
    if (target && target !== 'unassigned') {
      T.config.pairs = T.config.pairs.map(p => p.id === target && p.members.length < 2
        ? { ...p, members: p.members.concat([pid]) } : p);
    }
    notify();
    for (let i = 0; i < T.config.pairs.length; i++) {
      if (T.config.pairs[i].members.join(',') !== before[i]) await writeDoc('pairs', T.config.pairs[i].id, T.config.pairs[i]);
    }
    refreshMirror();
    return true;
  }

  /** Reorder the pairs by rewriting the order on the two that swapped. */
  async function movePairBy(id, delta) {
    if (tooEarly()) return false;
    const list = T.config.pairs.slice();
    const i = list.findIndex(p => p.id === id), j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return false;
    const [moved] = list.splice(i, 1);
    list.splice(j, 0, moved);
    T.config.pairs = list.map((p, k) => ({ ...p, order: k }));
    notify();
    for (const p of T.config.pairs) await writeDoc('pairs', p.id, p);
    refreshMirror();
    return true;
  }

  /** Write everything again as it stands — the config and every person and pair.
   *  Confirms a save, and is the retry when one has failed. */
  async function resave() {
    if (tooEarly()) return false;
    // distinct documents, so they go out together rather than one round trip each
    const jobs = [writeConfig(() => {})]
      .concat(T.config.people.map(p => writeDoc('people', p.id, p)))
      .concat(T.config.pairs.map(p => writeDoc('pairs', p.id, p)));
    const allOk = (await Promise.all(jobs)).every(Boolean);
    saveState = allOk ? 'saved' : 'error';
    if (allOk) lastSavedAt = Date.now();
    notify();
    return allOk;
  }

  async function writeCard(roundId, pid, mutate) {
    if (tooEarly()) return false;
    const key = roundId + '__' + pid;
    const prev = T.scores[key];
    const c = prev
      ? { ...blankCard(), ...prev, raw: [...prev.raw], by: { ...(prev.by || {}) }, at: { ...(prev.at || {}) }, marks: { ...(prev.marks || {}) } }
      : blankCard();
    mutate(c);
    bump('scores/' + key, c);
    T.scores[key] = c;
    notify();
    if (mode === 'local') { saveLocal(); return; }
    try { await db.doc('scores/' + key).set(c); note('card ok', key); }
    catch (e) { note('card FAILED', key + ' ' + (e && e.code)); status = 'error'; notify(); }
  }

  /** A recap is written once and kept: one document per round. */
  async function writeRecap(rid, mutate) {
    if (tooEarly()) return false;
    const prev = T.recaps[rid];
    const r = prev ? JSON.parse(JSON.stringify(prev)) : { rid, status: 'draft', body: null, at: null, by: null };
    mutate(r);
    bump('recaps/' + rid, r);
    T.recaps[rid] = r;
    notify();
    if (mode === 'local') { saveLocal(); return true; }
    try { await db.doc('recaps/' + rid).set(r); saveState = 'saved'; lastSavedAt = Date.now(); notify(); return true; }
    catch (e) { status = 'error'; saveState = 'error'; notify(); return false; }
  }

  /** One document per photo, so one failure never takes the others with it. */
  async function writePhoto(id, row) {
    if (tooEarly()) return false;
    const r = { ...row, id };
    bump('photos/' + id, r);
    T.photos[id] = r;
    notify();
    if (mode === 'local') { saveLocal(); return true; }
    try { await db.doc('photos/' + id).set(r); saveState = 'saved'; lastSavedAt = Date.now(); notify(); return true; }
    catch (e) { status = 'error'; saveState = 'error'; notify(); return false; }
  }

  async function dropPhoto(id) {
    if (tooEarly()) return false;
    delete T.photos[id];
    notify();
    return dropDoc('photos', id);
  }

  /** One document per golfer per round: their own marks and their own words.
   *  Never merged into the card — the card is the ref's, this is theirs. */
  async function writeNote(rid, pid, mutate) {
    if (tooEarly()) return false;
    const key = rid + '__' + pid;
    const prev = T.notes[key];
    const n = prev
      ? { ...blankNote(rid, pid), ...prev, marks: { ...(prev.marks || {}) },
          text: { ...(prev.text || {}) }, at: { ...(prev.at || {}) } }
      : blankNote(rid, pid);
    mutate(n);
    bump('notes/' + key, n);
    T.notes[key] = n;
    notify();
    if (mode === 'local') { saveLocal(); return true; }
    try { await db.doc('notes/' + key).set(n); saveState = 'saved'; lastSavedAt = Date.now(); notify(); return true; }
    catch (e) { status = 'error'; saveState = 'error'; notify(); return false; }
  }

  async function writeBbb(roundId, mutate) {
    if (tooEarly()) return false;
    const b = T.bbb[roundId] ? { holes: T.bbb[roundId].holes.map(h => ({ ...h })) } : blankBbb();
    mutate(b);
    bump('bbb/' + roundId, b);
    T.bbb[roundId] = b;
    notify();
    if (mode === 'local') { saveLocal(); return; }
    try { await db.doc('bbb/' + roundId).set(b); }
    catch (e) { status = 'error'; notify(); }
  }

  async function resetAll() {
    if (tooEarly()) return;
    const fresh = emptyState();
    T.config = fresh.config; T.scores = {}; T.bbb = {}; T.notes = {};
    for (const k of Object.keys(rev)) delete rev[k];
    bump('config', T.config);
    notify();
    if (mode === 'local') { saveLocal(); return; }
    try {
      await db.doc('config/tournament').set(T.config);
      for (const coll of ['scores', 'bbb', 'notes', 'people', 'pairs']) {
        const got = await db.collection(coll).get();
        for (const d of got.docs) await db.doc(coll + '/' + d.id).delete();
      }
      splitDone = false;
      await splitOutRoster();
    } catch (e) { status = 'error'; notify(); }
  }

  return { T, connect, writeConfig, writeCard, writeBbb, writeNote, writeRecap, writePhoto, dropPhoto, resetAll, resave, note,
           writePerson, writeAllPeople, addPerson, removePerson,
           writePair, addPair, removePair, movePlayer, movePairBy,
           get mode() { return mode; }, get status() { return status; }, get ready() { return ready; },
           get settled() { return settled; },
           get backend() { return backend; },
           /* Writes waiting for a signal. The status bar says so, because a
              ref who has just walked off the 9th needs to know the card in
              their hand has not reached anyone yet. */
           get pending() { return (db && typeof db.pending === 'number') ? db.pending : 0; },
           get live() { return !!(db && db.live); },
           destroy() { unsubs.forEach(u => { try { u(); } catch (e) {} }); } };
}
