/* Shared state. Lives in the artifact db so the two scorers, the master
   reviewer and every spectator see the same tournament. Falls back to
   localStorage when the db capability is unavailable (preview, offline). */

import { GOLFERS, OFFICIALS, SPECTATORS, PAIRS, ROUNDS, SCHEDULE } from './data.js';

const LOCAL_KEY = 'union-invitational:v3';
const DEFAULT_PINS = { master: '1000', s1: '2000', s2: '3000' };

export function blankCard() { return { raw: Array(18).fill(null), mF: false, mB: false, bb: false }; }
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
  return {
    v: 3,
    capOver: 3,
    people,
    pairs: PAIRS.map(p => ({ ...p, members: [...p.members] })),
    rounds,
    schedule: SCHEDULE.map(e => ({ ...e })),
    pins: { ...DEFAULT_PINS },
    pinsChanged: false,
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
      s => { if (s.exists && s.data) { T.config = migrate(s.data); ready = true; status = 'live'; notify(); } },
      () => { status = 'error'; notify(); }
    ));
    unsubs.push(db.collection('scores').onSnapshot(
      s => { const next = {}; s.docs.forEach(d => { next[d.id] = d.data; }); T.scores = next; notify(); },
      () => { status = 'error'; notify(); }
    ));
    unsubs.push(db.collection('bbb').onSnapshot(
      s => { const next = {}; s.docs.forEach(d => { next[d.id] = d.data; }); T.bbb = next; notify(); },
      () => { status = 'error'; notify(); }
    ));
    ready = true; notify();
  }

  function migrate(cfg) {
    const base = defaultConfig();
    const out = { ...base, ...cfg };
    // a round added after the store was seeded still needs its slot
    out.rounds = { ...base.rounds, ...(cfg.rounds || {}) };
    return out;
  }

  /* --- writes --- */

  async function writeConfig(mutate) {
    mutate(T.config);
    notify();
    if (mode === 'local') { saveLocal(); return; }
    try { await db.doc('config/tournament').set(T.config); }
    catch (e) { status = 'error'; notify(); }
  }

  async function writeCard(roundId, pid, mutate) {
    const key = roundId + '__' + pid;
    const c = T.scores[key] ? { ...T.scores[key], raw: [...T.scores[key].raw] } : blankCard();
    mutate(c);
    T.scores[key] = c;
    notify();
    if (mode === 'local') { saveLocal(); return; }
    try { await db.doc('scores/' + key).set(c); }
    catch (e) { status = 'error'; notify(); }
  }

  async function writeBbb(roundId, mutate) {
    const b = T.bbb[roundId] ? { holes: T.bbb[roundId].holes.map(h => ({ ...h })) } : blankBbb();
    mutate(b);
    T.bbb[roundId] = b;
    notify();
    if (mode === 'local') { saveLocal(); return; }
    try { await db.doc('bbb/' + roundId).set(b); }
    catch (e) { status = 'error'; notify(); }
  }

  async function resetAll() {
    const fresh = emptyState();
    T.config = fresh.config; T.scores = {}; T.bbb = {};
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
