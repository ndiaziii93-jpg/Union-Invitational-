/* Shared state. Lives in the artifact db so the two scorers, the master
   reviewer and every spectator see the same tournament. Falls back to
   localStorage when the db capability is unavailable (preview, offline). */

import { GOLFERS, OFFICIALS, SPECTATORS, PAIRS, ROUNDS, SCHEDULE, COURSES } from './data.js';

const LOCAL_KEY = 'union-invitational:v3';
const DEFAULT_PINS = { master: '1000', s1: '2000', s2: '3000' };

/** `by` and `at` are keyed by hole index and hold only saved holes, so a hole
 *  with no entry is simply absent — no null to be dropped in transit. */
export function blankCard() { return { raw: Array(18).fill(null), by: {}, at: {}, mF: false, mB: false, bb: false }; }
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
  return { config: { ...cfg, people: [], pairs: [] }, scores: {}, bbb: {} };
}

/** The fields that live in config/tournament. People and pairs are kept as one
 *  document each, so removing somebody deletes a document rather than rewriting
 *  a list — a view holding a stale list can no longer bring them back. */
function configOnly(cfg) {
  const out = { ...cfg };
  delete out.people; delete out.pairs;
  return out;
}
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
  let peopleLoaded = false, pairsLoaded = false, splitDone = false;
  let legacy = null;            // a roster still stored as lists inside the config
  let settled = false;          // the first load has resolved; until then, no writes
  let sawData = false;          // we have seen a real stored config this page load
  let seeding = false;
  let saveTimer = null;
  let status = 'connecting';    // connecting | live | local | error
  let saveState = 'idle';       // idle | saving | saved | error — the last write's fate
  let lastSavedAt = null;
  // Our revision per document. A snapshot older than what we last wrote is an
  // echo of a version we have already moved past, and applying it would undo
  // the change the user just made — so it is ignored.
  const rev = {};
  const bump = (path, doc) => { doc.rev = Math.max(doc.rev || 0, rev[path] || 0) + 1; rev[path] = doc.rev; };
  const fresher = (path, doc) => ((doc && doc.rev) || 0) >= (rev[path] || 0);

  const notify = () => onChange(T, { ready, mode, status, saveState, lastSavedAt, settled });

  function loadLocal() {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && s.config && s.config.v === 3) { T.config = s.config; T.scores = s.scores || {}; T.bbb = s.bbb || {}; return; }
      }
    } catch (e) { /* first run, or storage blocked */ }
    T.config = defaultConfig();   // no database and nothing stored: start from the factory book
  }
  function saveLocal() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(LOCAL_KEY, JSON.stringify(T)); } catch (e) { /* quota or blocked */ }
    }, 250);
  }

  async function connect() {
    try { db = window.claude && window.claude.use ? await window.claude.use('db') : null; }
    catch (e) { db = null; }

    if (!db) { mode = 'local'; status = 'local'; loadLocal(); ready = true; settled = true; notify(); return; }
    mode = 'db';

    /* The store is NEVER seeded from a single read. A read that wrongly reports
       the document absent would otherwise write the factory roster over a real
       tournament — which is exactly what was happening. Seeding needs a
       subscription AND a confirming read to agree the store is empty, and once
       any data has been seen this page load it can never seed at all. */
    const takeConfig = data => {
      sawData = true; settled = true;
      if (!fresher('config', data)) return;
      rev.config = data.rev || 0;
      if (Array.isArray(data.people) && data.people.length) {
        legacy = { people: data.people, pairs: Array.isArray(data.pairs) ? data.pairs : [] };
      }
      const people = T.config.people, pairs = T.config.pairs;   // owned by their own documents
      T.config = migrate(data);
      T.config.people = people; T.config.pairs = pairs;
      splitOutRoster();
    };

    async function seedIfTrulyEmpty() {
      if (sawData || settled || seeding) return;
      seeding = true;
      try {
        const check = await db.doc('config/tournament').get();   // a second opinion
        if (check.exists && check.data) { takeConfig(check.data); notify(); return; }
        const factory = defaultConfig();
        await db.doc('config/tournament').set({ ...configOnly(factory), rev: 0 });
        await writeRoster(factory.people, factory.pairs);
        settled = true; notify();
      } catch (e) {
        // Could not confirm. Stay read-only rather than risk writing over data.
        status = 'error'; notify();
      } finally { seeding = false; }
    }

    unsubs.push(db.doc('config/tournament').onSnapshot(
      s => {
        ready = true; status = 'live';
        if (s.exists && s.data) { takeConfig(s.data); notify(); return; }
        notify();
        seedIfTrulyEmpty();
      },
      () => { status = 'error'; notify(); }
    ));
    unsubs.push(db.collection('people').onSnapshot(
      s => {
        const rows = s.docs.map(d => d.data).filter(Boolean);
        if (rows.length) { peopleLoaded = true; T.config.people = rows.map(normPerson).sort(byOrder); }
        notify();
        splitOutRoster();
      },
      () => { status = 'error'; notify(); }
    ));
    unsubs.push(db.collection('pairs').onSnapshot(
      s => {
        const rows = s.docs.map(d => d.data).filter(Boolean);
        if (rows.length) { pairsLoaded = true; T.config.pairs = rows.map(normPair).sort(byOrder); }
        notify();
      },
      () => { status = 'error'; notify(); }
    ));
    unsubs.push(db.collection('scores').onSnapshot(
      s => { T.scores = mergeDocs('scores', T.scores, s.docs); notify(); },
      () => { status = 'error'; notify(); }
    ));
    unsubs.push(db.collection('bbb').onSnapshot(
      s => { T.bbb = mergeDocs('bbb', T.bbb, s.docs); notify(); },
      () => { status = 'error'; notify(); }
    ));
    ready = true; notify();
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

  /** One-time move of a roster still stored as lists inside the config. Runs
   *  only when the people collection is genuinely empty, so it cannot undo
   *  anybody's work. */
  async function splitOutRoster() {
    if (splitDone || !settled || mode !== 'db' || !legacy) return;
    splitDone = true;
    try {
      const have = await db.collection('people').get();
      if (have.docs.length) { legacy = null; return; }   // somebody already did it
      await writeRoster(legacy.people, legacy.pairs);
      legacy = null;
      await writeConfig(() => {});          // rewrites config without the lists
    } catch (e) { splitDone = false; status = 'error'; notify(); }
  }

  /** Take the server's copy of each document unless ours is newer, and keep a
   *  document we have just written that the snapshot has not caught up on. */
  function mergeDocs(coll, local, docs) {
    const next = {};
    const seen = new Set();
    for (const d of docs) {
      seen.add(d.id);
      const path = coll + '/' + d.id;
      if (fresher(path, d.data)) { rev[path] = (d.data && d.data.rev) || 0; next[d.id] = d.data; }
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
    // The roster lives in its own documents. Never let a config without one
    // fall back to the factory roster — that is what resurrected deleted people.
    delete out.people; delete out.pairs;
    return out;
  }

  /* --- writes --- */

  async function writeConfig(mutate) {
    if (!settled) { saveState = 'error'; notify(); return false; }  // still loading: refuse
    mutate(T.config);
    bump('config', T.config);
    saveState = 'saving';
    notify();
    if (mode === 'local') { saveLocal(); saveState = 'saved'; lastSavedAt = Date.now(); notify(); return true; }
    try {
      await db.doc('config/tournament').set(configOnly(T.config));
      saveState = 'saved'; lastSavedAt = Date.now(); notify();
      return true;
    } catch (e) {
      status = 'error'; saveState = 'error'; notify();
      return false;
    }
  }

  /* ---- roster writers ----
     Each of these touches one document. A view holding a stale roster can no
     longer resurrect somebody by rewriting the whole list. */

  function localOnly() { saveLocal(); saveState = 'saved'; lastSavedAt = Date.now(); notify(); return true; }

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
    if (!settled) return false;
    const i = T.config.people.findIndex(p => p.id === id);
    if (i < 0) return false;
    const p = { ...T.config.people[i] };
    mutate(p);
    T.config.people[i] = p;
    return writeDoc('people', id, p);
  }

  /** Change every person — used to clear the squads. */
  async function writeAllPeople(mutate) {
    if (!settled) return false;
    const list = T.config.people.map(x => { const p = { ...x }; mutate(p); return p; });
    T.config.people = list;
    notify();
    for (const p of list) await writeDoc('people', p.id, p);
    return true;
  }

  async function addPerson(person) {
    if (!settled) return false;
    const p = { ...person, order: T.config.people.length };
    T.config.people = T.config.people.concat([p]);
    return writeDoc('people', p.id, p);
  }

  /** Remove a person: their document goes, and they leave every pair and tee. */
  async function removePerson(id) {
    if (!settled) return false;
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
    return true;
  }

  async function writePair(id, mutate) {
    if (!settled) return false;
    const i = T.config.pairs.findIndex(p => p.id === id);
    if (i < 0) return false;
    const p = { ...T.config.pairs[i], members: [...T.config.pairs[i].members] };
    mutate(p);
    T.config.pairs[i] = p;
    return writeDoc('pairs', id, p);
  }

  async function addPair(pair) {
    if (!settled) return false;
    const p = { ...pair, order: T.config.pairs.length };
    T.config.pairs = T.config.pairs.concat([p]);
    return writeDoc('pairs', p.id, p);
  }

  async function removePair(id) {
    if (!settled) return false;
    T.config.pairs = T.config.pairs.filter(p => p.id !== id);
    notify();
    return dropDoc('pairs', id);
  }

  /** Move a golfer into one pair, or out of all of them. Writes only the pairs
   *  that actually changed. */
  async function movePlayer(pid, target) {
    if (!settled) return false;
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
    return true;
  }

  /** Reorder the pairs by rewriting the order on the two that swapped. */
  async function movePairBy(id, delta) {
    if (!settled) return false;
    const list = T.config.pairs.slice();
    const i = list.findIndex(p => p.id === id), j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return false;
    const [moved] = list.splice(i, 1);
    list.splice(j, 0, moved);
    T.config.pairs = list.map((p, k) => ({ ...p, order: k }));
    notify();
    for (const p of T.config.pairs) await writeDoc('pairs', p.id, p);
    return true;
  }

  /** Write everything again as it stands — the config and every person and pair.
   *  Confirms a save, and is the retry when one has failed. */
  async function resave() {
    if (!settled) return false;
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
    if (!settled) return false;
    const key = roundId + '__' + pid;
    const prev = T.scores[key];
    const c = prev
      ? { ...blankCard(), ...prev, raw: [...prev.raw], by: { ...(prev.by || {}) }, at: { ...(prev.at || {}) } }
      : blankCard();
    mutate(c);
    bump('scores/' + key, c);
    T.scores[key] = c;
    notify();
    if (mode === 'local') { saveLocal(); return; }
    try { await db.doc('scores/' + key).set(c); }
    catch (e) { status = 'error'; notify(); }
  }

  async function writeBbb(roundId, mutate) {
    if (!settled) return false;
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
    if (!settled) return;
    const fresh = emptyState();
    T.config = fresh.config; T.scores = {}; T.bbb = {};
    for (const k of Object.keys(rev)) delete rev[k];
    bump('config', T.config);
    notify();
    if (mode === 'local') { saveLocal(); return; }
    try {
      await db.doc('config/tournament').set(T.config);
      for (const coll of ['scores', 'bbb', 'people', 'pairs']) {
        const got = await db.collection(coll).get();
        for (const d of got.docs) await db.doc(coll + '/' + d.id).delete();
      }
      splitDone = false;
      await splitOutRoster();
    } catch (e) { status = 'error'; notify(); }
  }

  return { T, connect, writeConfig, writeCard, writeBbb, resetAll, resave,
           writePerson, writeAllPeople, addPerson, removePerson,
           writePair, addPair, removePair, movePlayer, movePairBy,
           get mode() { return mode; }, get status() { return status; }, get ready() { return ready; },
           get settled() { return settled; },
           destroy() { unsubs.forEach(u => { try { u(); } catch (e) {} }); } };
}
