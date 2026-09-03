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

export function emptyState() { return { config: defaultConfig(), scores: {}, bbb: {} }; }

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
  let configWritten = false;
  let saveTimer = null;
  let status = 'connecting';    // connecting | live | local | error
  // Our revision per document. A snapshot older than what we last wrote is an
  // echo of a version we have already moved past, and applying it would undo
  // the change the user just made — so it is ignored.
  const rev = {};
  const bump = (path, doc) => { doc.rev = Math.max(doc.rev || 0, rev[path] || 0) + 1; rev[path] = doc.rev; };
  const fresher = (path, doc) => ((doc && doc.rev) || 0) >= (rev[path] || 0);

  const notify = () => onChange(T, { ready, mode, status });

  function loadLocal() {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && s.config && s.config.v === 3) { T.config = s.config; T.scores = s.scores || {}; T.bbb = s.bbb || {}; }
      }
    } catch (e) { /* first run, or storage blocked */ }
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

    if (!db) { mode = 'local'; status = 'local'; loadLocal(); ready = true; notify(); return; }
    mode = 'db';

    try {
      const snap = await db.doc('config/tournament').get();
      if (!snap.exists) { await db.doc('config/tournament').set(T.config); configWritten = true; }
    } catch (e) { /* another viewer may have created it in the same beat */ }

    unsubs.push(db.doc('config/tournament').onSnapshot(
      s => {
        if (!s.exists || !s.data) return;
        ready = true; status = 'live';
        if (!fresher('config', s.data)) { notify(); return; }
        rev.config = s.data.rev || 0;
        T.config = migrate(s.data);
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
    // A store may drop keys whose value is null. Put them back explicitly, or
    // `x === null` tests downstream read undefined and take the wrong branch.
    out.people = (out.people || []).map(p => ({
      ...p,
      location: p.location == null ? null : p.location,
      band: p.band == null ? null : p.band,
      group: p.group || '7-day',
    }));
    out.pairs = (out.pairs || []).map(p => ({
      ...p,
      name: p.name == null ? null : p.name,
      members: p.members || [],
    }));
    return out;
  }

  /* --- writes --- */

  async function writeConfig(mutate) {
    mutate(T.config);
    bump('config', T.config);
    notify();
    if (mode === 'local') { saveLocal(); return; }
    try { await db.doc('config/tournament').set(T.config); }
    catch (e) { status = 'error'; notify(); }
  }

  async function writeCard(roundId, pid, mutate) {
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
    const fresh = emptyState();
    T.config = fresh.config; T.scores = {}; T.bbb = {};
    for (const k of Object.keys(rev)) delete rev[k];
    bump('config', T.config);
    notify();
    if (mode === 'local') { saveLocal(); return; }
    try {
      await db.doc('config/tournament').set(T.config);
      const s = await db.collection('scores').get();
      for (const d of s.docs) await db.doc('scores/' + d.id).delete();
      const b = await db.collection('bbb').get();
      for (const d of b.docs) await db.doc('bbb/' + d.id).delete();
    } catch (e) { status = 'error'; notify(); }
  }

  return { T, connect, writeConfig, writeCard, writeBbb, resetAll,
           get mode() { return mode; }, get status() { return status; }, get ready() { return ready; },
           destroy() { unsubs.forEach(u => { try { u(); } catch (e) {} }); } };
}
