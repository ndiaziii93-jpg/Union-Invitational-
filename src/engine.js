/* The Union Invitational — pure scoring engine.
   No I/O, no DOM, no randomness. Everything here is a function of state. */

import { COURSES, DAYS, ROUNDS, TZ_OFFSET_MIN, PINS_ENABLED } from './data.js';
import { RULES, RELIEF } from './rules.js';

/* ---------- clock (Antalya, UTC+3, no DST) ---------- */

export function nowLocal(clock) {
  const ms = (clock == null ? Date.now() : clock) + TZ_OFFSET_MIN * 60000;
  const d = new Date(ms);
  return {
    ms,
    iso: d.toISOString().slice(0, 10),
    hh: d.getUTCHours(),
    mm: d.getUTCMinutes(),
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
  };
}

export function dayOf(dayIdx) { return DAYS[dayIdx - 1]; }
export function hhmmToMin(t) { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '')); return m ? +m[1] * 60 + +m[2] : null; }

export function to12(t) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || '').trim());
  if (!m) return t || '';
  let h = +m[1]; const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return h + ':' + m[2] + ' ' + ap;
}
export function to24(str) {
  const m = /^(\d{1,2}):(\d{2})\s*([AaPp][Mm])?$/.exec(String(str || '').trim());
  if (!m) return null;
  let h = +m[1]; const min = m[2];
  if (m[3]) { const pm = m[3].toLowerCase() === 'pm'; if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
  if (h > 23 || +min > 59) return null;
  return String(h).padStart(2, '0') + ':' + min;
}

/* ---------- handicap bands ---------- */

export const BANDS = [15, 20, 25, 30];

/** Strokes a band receives on a hole of the given stroke index.
 *  15 → 1 stroke on SI 1–15 (15 total)
 *  20 → 1 a hole, 2 on SI 1–2   (20 total)
 *  25 → 1 a hole, 2 on SI 1–7   (25 total) */
export function strokesFor(band, si) {
  if (band === 15) return si <= 15 ? 1 : 0;
  if (band === 20) return 1 + (si <= 2 ? 1 : 0);
  if (band === 25) return 1 + (si <= 7 ? 1 : 0);
  if (band === 30) return 1 + (si <= 12 ? 1 : 0);
  return null; // no band assigned — this player cannot be scored
}
export function bandTotal(band) {
  const c = COURSES.aspendos.holes;
  return band == null ? null : c.reduce((a, h) => a + strokesFor(band, h.si), 0);
}

export function fmtToPar(n) { return n === 0 ? 'E' : n > 0 ? '+' + n : '−' + Math.abs(n); }
export function capFor(par, capOver) { return par + capOver; }
export function capped(raw, par, capOver) { return raw == null ? null : Math.min(raw, par + capOver); }

/* ---------- state accessors ---------- */

export function person(T, id) { return T.config.people.find(p => p.id === id) || null; }
export function golfers(T) { return T.config.people.filter(p => p.role === 'golfer'); }
export function roundDef(id) { return ROUNDS.find(r => r.id === id); }
export function roundCfg(T, id) { return T.config.rounds[id]; }
export function courseByKey(T, key) {
  const base = COURSES[key];
  const cfg = (T.config.courses || {})[key];
  const holes = (cfg && cfg.holes) ? cfg.holes : base.holes;
  return {
    key, name: base.name, meta: base.meta,
    verified: cfg ? cfg.verified !== false : true,
    holes: holes.map((h, i) => ({ n: i + 1, par: h.par, si: h.si, mW: h.mW, mY: h.mY, img: 'hole_' + key + '_' + (i + 1) })),
  };
}
export function courseOf(T, id) { return courseByKey(T, roundDef(id).course); }
export function scoreKey(roundId, pid) { return roundId + '__' + pid; }
export function card(T, roundId, pid) { return T.scores[scoreKey(roundId, pid)] || null; }

export function pairName(T, pair) {
  if (pair.name) return pair.name;
  const ms = pair.members.map(id => (person(T, id) || {}).display || '?');
  return ms.join(' & ') || 'Empty pair';
}

/* ---------- round phase ---------- */

/** 'final' locked · 'live' open for entry · 'closed' day gone by, never locked
 *  · 'today' plays today, not yet opened · 'upcoming' still ahead */
export function phaseOf(T, roundId, now) {
  const st = (roundCfg(T, roundId) || {}).state || 'closed';
  if (st === 'locked') return 'final';
  if (st === 'open') return 'live';
  const iso = dayOf(roundDef(roundId).dayIdx).iso;
  if (now.iso > iso) return 'closed';
  if (now.iso === iso) return 'today';
  return 'upcoming';
}
export function phaseLabel(p) {
  return { final: 'Final', live: 'Live', closed: 'Not locked', today: 'Today', upcoming: 'Upcoming' }[p] || p;
}
/** A round contributes to the championship once it holds any score. */
export function hasScores(T, roundId) {
  return golfers(T).some(g => { const c = card(T, roundId, g.id); return c && c.raw.some(v => v != null); });
}
export function countingRounds(T) { return ROUNDS.filter(r => r.counts); }

/* ---------- per-hole scoring ---------- */

export function playerNet(T, roundId, pid, h) {
  const c = card(T, roundId, pid);
  if (!c || c.raw[h] == null) return null;
  const hole = courseOf(T, roundId).holes[h];
  const p = person(T, pid);
  const s = strokesFor(p && p.band, hole.si);
  if (s == null) return null; // unbanded players are excluded, never guessed
  return capped(c.raw[h], hole.par, T.config.capOver) - s;
}

export function pairHole(T, roundId, pair, h) {
  let best = null;
  for (const pid of pair.members) {
    const n = playerNet(T, roundId, pid, h);
    if (n != null && (best == null || n < best)) best = n;
  }
  return best;
}

function toParPair(T, roundId, pair) {
  const holes = courseOf(T, roundId).holes;
  let tp = 0, thru = 0;
  for (let h = 0; h < 18; h++) { const s = pairHole(T, roundId, pair, h); if (s != null) { tp += s - holes[h].par; thru = h + 1; } }
  return { tp, thru };
}
/* A group is two pairs — a fourball — taken in the pairings' own order, so
   Group 1 is the first two pairs off and Group 2 the next two. The count
   follows the pairings rather than the three tee slots the book shipped with.
   A slot carries only the time. With no pairings yet, the stored slots stand
   in so the screen still has something to show. */
export const PAIRS_PER_GROUP = 2;

export function groups(T, rid) {
  const cfg = roundCfg(T, rid);
  const tees = cfg.tees || [];
  const pairs = (T.config.pairs || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  if (!pairs.length) {
    return tees.map((t, i) => ({ id: 't' + i, label: 'Group ' + (i + 1),
      pairs: [], members: t.players || [], time: t.time || null }));
  }
  const out = [];
  for (let i = 0; i < pairs.length; i += PAIRS_PER_GROUP) {
    const inGroup = pairs.slice(i, i + PAIRS_PER_GROUP);
    const n = out.length;
    out.push({
      id: 'g' + n,
      label: 'Group ' + (n + 1),
      pairs: inGroup.map(p => pairName(T, p)),
      members: inGroup.flatMap(p => (p.members || []).filter(id => person(T, id))),
      time: (tees[n] || {}).time || null,
    });
  }
  return out;
}

/* The practice day is its own thing: it feeds nothing, and every board that
   counts walks countingRounds(), which leaves it out. This is the one place
   it is added up, so Tuesday can have a winner of its own. */
export function practiceBoard(T) {
  const rid = 'practice';
  const holes = courseOf(T, rid).holes;
  /* Tuesday is the day the bands get sorted out, so it is scored gross: a
     golfer with no band yet still has a card. Points appear once a band does,
     which is the point of playing the day at all. */
  const rows = golfers(T).map(p => {
    const c = card(T, rid, p.id);
    let gross = 0, tp = 0, thru = 0, stb = 0, netted = false;
    for (let h = 0; h < 18; h++) {
      const raw = c ? c.raw[h] : null;
      if (raw == null) continue;
      thru = h + 1;
      gross += raw;
      tp += raw - holes[h].par;
      const n = playerNet(T, rid, p.id, h);
      if (n != null) { netted = true; stb += Math.max(0, Math.min(5, 2 - (n - holes[h].par))); }
    }
    return { id: p.id, name: p.display, band: p.band, gross, tp, thru, stb: netted ? stb : null };
  }).filter(r => r.thru > 0);
  rows.sort((a, b) => (a.tp - b.tp) || (b.thru - a.thru));
  return rows.map((r, i) => ({ ...r, pos: i + 1 }));
}

export function practiceBbb(T) {
  const tally = {};
  const b = T.bbb.practice;
  if (b) for (const cell of b.holes) for (const pid of bbbMarks(cell)) tally[pid] = (tally[pid] || 0) + 1;
  const rows = Object.entries(tally).map(([pid, pts]) => ({ id: pid, name: (person(T, pid) || {}).display || '?', pts }));
  rows.sort((a, b2) => b2.pts - a.pts);
  return rows.map((r, i) => ({ ...r, pos: i + 1 }));
}

/** Bands are open all through the practice day — that is what it is for —
 *  and settle when it is concluded. After that only a scorer moves one. */
export function bandsLocked(T) { return roundCfg(T, 'practice').state === 'locked'; }

function toParPlayer(T, roundId, pid) {
  const holes = courseOf(T, roundId).holes;
  let tp = 0, thru = 0, stb = 0;
  for (let h = 0; h < 18; h++) {
    const n = playerNet(T, roundId, pid, h);
    if (n != null) { const d = n - holes[h].par; tp += d; thru = h + 1; stb += Math.max(0, Math.min(5, 2 - d)); }
  }
  return { tp, thru, stb };
}

/* ---------- leaderboards ---------- */

export function pairsBoard(T, now) {
  const rows = T.config.pairs.map(pair => {
    let total = 0, today = null, thru = null, played = false;
    for (const r of countingRounds(T)) {
      const { tp, thru: th } = toParPair(T, r.id, pair);
      if (th > 0) played = true;
      if (phaseOf(T, r.id, now) === 'live') { today = th > 0 ? tp : null; thru = th; }
      if (th > 0) total += tp;
    }
    return {
      id: pair.id, name: pairName(T, pair),
      members: pair.members.map(id => (person(T, id) || {}).display || '?').join(' + ') || '—',
      today, thru, total, played,
    };
  }).filter(r => r.played);
  rows.sort((a, b) => a.total - b.total);
  return rows.map((r, i) => ({ ...r, pos: i + 1,
    todayStr: r.today == null ? '—' : fmtToPar(r.today),
    thruStr: r.thru ? String(r.thru) : '—',
    totalStr: fmtToPar(r.total) }));
}

export function mvpBoard(T, now) {
  const rows = golfers(T).map(p => {
    let total = 0, today = null, thru = null, stb = 0, played = false;
    for (const r of countingRounds(T)) {
      const { tp, thru: th, stb: s } = toParPlayer(T, r.id, p.id);
      if (th > 0) played = true;
      stb += s;
      if (phaseOf(T, r.id, now) === 'live') { today = th > 0 ? tp : null; thru = th; }
      if (th > 0) total += tp;
    }
    return { id: p.id, name: p.display, band: p.band, today, thru, total, stb, played };
  }).filter(r => r.played);
  rows.sort((a, b) => a.total - b.total);
  return rows.map((r, i) => ({ ...r, pos: i + 1,
    bandStr: r.band ? String(r.band) : '—',
    todayStr: r.today == null ? '—' : fmtToPar(r.today),
    thruStr: r.thru ? String(r.thru) : '—',
    totalStr: fmtToPar(r.total), stbStr: String(r.stb) }));
}

/* A hole's Bingo Bango Bongo marks, whatever shape they were written in.
   The book used to keep one set per hole for the whole round, so two refs
   scoring two groups on the same hole overwrote each other. Each group keeps
   its own set now; a hole written in the old shape still counts. */
export const BBB_SLOTS = ['bingo', 'bango', 'bongo'];

export function bbbMarks(cell) {
  if (!cell) return [];
  const out = [];
  const take = c => { for (const k of BBB_SLOTS) if (c && c[k]) out.push(c[k]); };
  const by = cell.g && typeof cell.g === 'object' ? Object.values(cell.g) : [];
  if (by.length) by.forEach(take); else take(cell);
  return out;
}

/* ---------- the marks ----------
 *
 * What a scorecard cannot say. A seven on a par four is a seven whether it
 * came off the tee, out of a lake or off the putter, and the recap has no
 * way to tell which — so it writes around it, and the round reads flatter
 * than it played.
 *
 * Four marks, and the choice of four is the whole design. Every one of them
 * is something a ref can judge in a second without knowing a rule: three
 * putts, out of bounds, in the water, and the shot of the hole. No sandies,
 * no up-and-downs, no greenies — closest to the pin already carries the par
 * three honour, and a word somebody has to have explained to them is a word
 * that does not get tapped.
 *
 * Three of them are things going wrong and one is a thing going right, on
 * purpose: a log that only records disasters turns the recap into a hit
 * list.
 *
 * NONE OF IT COUNTS. Not the team competition, not the MVP, not the cup.
 * That is what keeps the pressure off — a mark nobody remembered to make
 * has never cost anyone a shot, so the marking stays honest rather than
 * defensive. */
export const MARKS = [
  { key: 'putt3', label: 'Three-putt', short: '3-putt', tone: 'bad',
    said: 'three-putted' },
  { key: 'ob', label: 'Out of bounds', short: 'OB', tone: 'bad',
    said: 'went out of bounds' },
  { key: 'water', label: 'In the water', short: 'Water', tone: 'bad',
    said: 'found the water' },
  { key: 'shot', label: 'Shot of the hole', short: 'Shot', tone: 'good',
    said: 'played the shot of the hole' },
];
export const MARK_KEYS = MARKS.map(m => m.key);

/* ---------- the end of the round, in the golfer's own words ----------
 *
 * The marks above are the REF'S, and they are facts: where the ball went,
 * how many putts, who hit the best shot. Somebody standing there can settle
 * every one of them.
 *
 * This is the other kind of thing entirely, and the reason it is a separate
 * set of questions rather than the same ones asked twice. Ask a golfer what
 * a ref can already see and you get two answers to arbitrate; ask them what
 * only they know and you get the half a scorecard has never held. Nobody
 * else can say whether a round felt like a grind, whether the four came off
 * the wrong club, or whether a good score was deserved.
 *
 * So none of it can contradict the card — a feeling is not a rival claim
 * about a fact. Where the two diverge, that divergence IS the story: a man
 * who three-putted twice and called it striping it has told you more about
 * his week than either line on its own. */
export const MOODS = [
  { key: 'striped', label: 'Striped it', tone: 'good' },
  { key: 'grinding', label: 'Grinding', tone: 'mid' },
  { key: 'scrappy', label: 'Scrappy', tone: 'mid' },
  { key: 'dontask', label: "Don't ask", tone: 'bad' },
];

/* Things a ref cannot possibly know, which is the test each of these had to
   pass to be here. */
export const OWNS = [
  { key: 'club', label: 'Wrong club, all day' },
  { key: 'layup', label: "Should've laid up" },
  { key: 'putter', label: 'The putter let me down' },
  { key: 'nerves', label: 'Got the nerves' },
  { key: 'lucky', label: 'Got away with one' },
];
const moodOf = k => MOODS.find(m => m.key === k) || null;
const ownOf = k => OWNS.find(m => m.key === k) || null;
export function moodLabel(k) { const m = moodOf(k); return m ? m.label : ''; }
export function ownLabels(keys) {
  return (Array.isArray(keys) ? keys : []).map(ownOf).filter(Boolean).map(o => o.label);
}
const markDef = k => MARKS.find(m => m.key === k) || null;

/** The marks a REF put on one golfer's hole. Always an array. */
export function holeMarks(T, rid, pid, h) {
  const c = card(T, rid, pid);
  const got = c && c.marks ? c.marks[h] : null;
  return Array.isArray(got) ? got.filter(k => MARK_KEYS.includes(k)) : [];
}

/** One golfer's self-kept notes for a round: their own marks and their own
 *  words. A separate document from the card, written by them, never merged
 *  into it — see the note on the My Round lane in app.js. */
export function selfLog(T, rid, pid) {
  return (T.notes || {})[rid + '__' + pid] || null;
}

export function selfMarks(T, rid, pid, h) {
  const n = selfLog(T, rid, pid);
  const got = n && n.marks ? n.marks[h] : null;
  return Array.isArray(got) ? got.filter(k => MARK_KEYS.includes(k)) : [];
}

/** How many of a golfer's played holes carry a ref's mark.
 *
 * This is the number that keeps the recap honest. Three marked holes out of
 * eighteen is not "he three-putted once all day"; it is "of the three holes
 * anybody marked". Without the denominator the book states a fact it has no
 * right to, and a recap that is confidently wrong once is never trusted
 * again. */
export function markCoverage(T, rid, pid) {
  const c = card(T, rid, pid);
  if (!c) return { played: 0, marked: 0 };
  let played = 0, marked = 0;
  for (let h = 0; h < 18; h++) {
    if (c.raw[h] == null) continue;
    played++;
    if (c.marks && Array.isArray(c.marks[h]) && c.marks[h].length) marked++;
  }
  return { played, marked };
}

/** A round's marks for one golfer, counted, with the holes they fell on. */
export function markTally(T, rid, pid, self) {
  const out = {};
  for (let h = 0; h < 18; h++) {
    const ks = self ? selfMarks(T, rid, pid, h) : holeMarks(T, rid, pid, h);
    for (const k of ks) (out[k] = out[k] || []).push(h + 1);
  }
  return out;
}

/** The same, written the way a person would say it. */
export function markLine(T, rid, pid, self) {
  const t = markTally(T, rid, pid, self);
  const bits = [];
  for (const m of MARKS) {
    const holes = t[m.key];
    if (!holes || !holes.length) continue;
    bits.push(m.short + ' \u00d7' + holes.length + ' (hole' + (holes.length > 1 ? 's ' : ' ')
      + holes.join(', ') + ')');
  }
  return bits.join('; ');
}

export function bbbBoard(T) {
  const tally = {};
  for (const r of countingRounds(T)) {
    const b = T.bbb[r.id];
    if (!b) continue;
    for (const cell of b.holes) for (const pid of bbbMarks(cell)) tally[pid] = (tally[pid] || 0) + 1;
  }
  const rows = Object.entries(tally).map(([pid, pts]) => ({ id: pid, name: (person(T, pid) || {}).display || '?', pts }));
  rows.sort((a, b) => b.pts - a.pts);
  return rows.map((r, i) => ({ ...r, pos: i + 1, ptsStr: String(r.pts) }));
}

/** Every golfer out on a round has all eighteen holes saved. */
export function roundComplete(T, rid) {
  const ids = groups(T, rid).flatMap(g => g.members);
  const out = (ids.length ? golfers(T).filter(g => ids.includes(g.id)) : golfers(T));
  if (!out.length) return false;
  return out.every(p => {
    const c = card(T, rid, p.id);
    return c && c.raw.every(v => v != null);
  });
}

/** The whole tournament in a few hundred words, for asking Claude about.
 *  Only what is actually recorded — no invention, no placeholders. */
export function brief(T, now) {
  const L = [];
  const day = dayOf(ROUNDS[0].dayIdx);
  L.push('THE UNION INVITATIONAL — Titanic Deluxe Golf Belek, Antalya, Turkiye, 26 Oct to 2 Nov 2026.');
  L.push('Today is ' + now.dow + ' ' + now.date + '.');
  L.push('Handicap bands are the strokes a golfer receives: 15, 20, 25 or 30.');

  L.push('\nROSTER');
  for (const p of golfers(T)) {
    L.push('- ' + p.display + ' (golfer, band ' + (p.band == null ? 'not set' : p.band)
      + ', squad ' + (p.location || 'unassigned') + ')');
  }

  L.push('\nPAIRINGS');
  T.config.pairs.forEach((pr, i) => L.push('- Pair ' + (i + 1) + ': ' + pairName(T, pr)));

  L.push('\nROUNDS');
  for (const r of ROUNDS) {
    const c = roundCfg(T, r.id);
    L.push('- ' + r.full + ' on ' + dayOf(r.dayIdx).dow + ', ' + courseOf(T, r.id).name
      + ' — ' + c.state + (r.counts ? '' : ' (practice, counts for nothing)'));
  }

  const pb = pairsBoard(T, now).filter(x => x.played);
  if (pb.length) {
    L.push('\nTEAM COMPETITION (net, counting rounds)');
    pb.slice(0, 8).forEach(x => L.push('- ' + x.pos + '. ' + x.name + ' ' + x.totalStr));
  }
  const mb = mvpBoard(T, now).filter(x => x.played);
  if (mb.length) {
    L.push('\nMVP');
    mb.slice(0, 8).forEach(x => L.push('- ' + x.pos + '. ' + x.name + ' ' + x.totalStr
      + (x.stb ? ', ' + x.stb + ' pts' : '')));
  }
  const bb = bbbBoard(T);
  if (bb.length) {
    L.push('\nBINGO BANGO BONGO');
    bb.slice(0, 6).forEach(x => L.push('- ' + x.pos + '. ' + x.name + ' ' + x.pts));
  }
  const R = ryderData(T, now);
  L.push('\nRYDER CUP — UK ' + R.uk + ', USA ' + R.usa
    + (R.unassigned ? ' (' + R.unassigned + ' golfers unassigned)' : ''));

  L.push('\nTEE TIMES');
  for (const r of ROUNDS) {
    const c = roundCfg(T, r.id);
    const times = (c.tees || []).map(t => t.time).filter(Boolean).map(to12);
    L.push('- ' + r.short + ' (' + dayOf(r.dayIdx).dow + ' ' + dayOf(r.dayIdx).date + '): '
      + (times.length ? times.join(', ') : 'no tee time set yet'));
  }

  /* The whole calendar, which the question box could not see at all — it was
     asked when check-out is and had to say it did not know, with the answer
     sitting in the book two tabs away. */
  L.push('\nTHE WEEK, DAY BY DAY');
  DAYS.forEach((d, i) => {
    const n = i + 1;
    const bits = [];
    for (const r of ROUNDS) {
      if (r.dayIdx !== n) continue;
      const t = ((roundCfg(T, r.id).tees || [])[0] || {}).time;
      bits.push((t ? to12(t) + ' ' : '') + r.full + ' at ' + courseOf(T, r.id).name);
    }
    for (const e of (T.config.schedule || []).filter(x => x.dayIdx === n)) {
      bits.push(to12(e.time) + ' ' + e.title);
    }
    L.push('- ' + d.dow + ' ' + d.date + (bits.length ? ': ' + bits.join('; ') : ': nothing scheduled'));
  });

  L.push('\nRULES AND FORMATS');
  for (const r of RULES) {
    L.push('- ' + r.name + '. ' + r.tag + ' When: ' + r.when + ' Won by: ' + r.won);
  }
  L.push('\nRELIEF, APPLYING TO EVERY COMPETITION');
  for (const it of RELIEF.items) L.push('- ' + it.name + ': ' + it.body);
  for (const [n, b] of RELIEF.bands) L.push('- ' + n + ': ' + b);

  L.push('\nLONGEST DRIVE & CLOSEST TO THE PIN');
  for (const r of ROUNDS) {
    const c = roundCfg(T, r.id);
    const nm = id => (person(T, id) || {}).display || null;
    if (c.ctpWinner || c.ldWinner) {
      L.push('- ' + r.short + ': closest ' + (nm(c.ctpWinner) || 'nobody') + ' ' + (c.ctpDist || '')
        + '; longest ' + (nm(c.ldWinner) || 'nobody') + ' ' + (c.ldDist || ''));
    }
  }
  return L.join('\n');
}

/** One round's cards, hole by hole, for a recap of that day. */
export function roundBrief(T, rid) {
  const r = roundDef(rid);
  const course = courseOf(T, rid);
  const L = ['ROUND: ' + r.full + ' at ' + course.name + ' on ' + dayOf(r.dayIdx).dow + '.'];
  L.push('Par ' + course.holes.reduce((a, h) => a + h.par, 0) + '. Scored net off each golfer\'s band.');
  for (const p of golfers(T)) {
    const c = card(T, rid, p.id);
    if (!c || c.raw.every(v => v == null)) continue;
    const { tp, thru, stb } = toParPlayer(T, rid, p.id);
    const gross = c.raw.reduce((a, v) => a + (v || 0), 0);
    L.push('- ' + p.display + ' (band ' + (p.band == null ? 'none' : p.band) + '): '
      + 'holes ' + c.raw.map(v => (v == null ? '-' : v)).join(',')
      + ' | gross ' + gross + ', net to par ' + fmtToPar(tp) + ', ' + stb + ' pts, thru ' + thru);
  }

  /* What the numbers cannot say. Two sources, kept apart on purpose: the
     ref's marks are what somebody standing there wrote down, and the self
     log is what a golfer said about their own round afterwards. They are
     different kinds of claim and the recap should not treat them as one.

     The coverage line is the important one. Marks are made on the holes
     somebody remembered to mark, which is never all of them, so the count
     is a floor and never a total. */
  const marked = [];
  for (const p of golfers(T)) {
    const c = card(T, rid, p.id);
    if (!c || c.raw.every(v => v == null)) continue;
    const line = markLine(T, rid, p.id);
    const cov = markCoverage(T, rid, p.id);
    if (line) marked.push('- ' + p.display + ': ' + line
      + '  [marked on ' + cov.marked + ' of the ' + cov.played + ' holes they played]');
  }
  if (marked.length) {
    L.push('\nMARKS, PUT IN BY THE REF WALKING WITH THE GROUP');
    L.push('Only some holes get marked. These counts are a FLOOR, never a total:');
    L.push('say "at least" or "of the holes marked", and never that somebody did');
    L.push('something no more than n times, or never did it at all.');
    L.push(...marked);
  }

  const said = [];
  for (const p of golfers(T)) {
    const n = selfLog(T, rid, p.id);
    if (!n) continue;
    const line = markLine(T, rid, p.id, true);
    const words = Object.keys(n.text || {})
      .map(Number).sort((a, b) => a - b)
      .filter(h => String(n.text[h] || '').trim())
      .map(h => 'hole ' + (h + 1) + ': "' + String(n.text[h]).trim() + '"');
    /* The end-of-round questionnaire: how it felt, what they will own up to,
       and a line about the day. None of it is checkable and none of it is
       meant to be. */
    const bits = [];
    if (n.mood) bits.push('felt like: ' + moodLabel(n.mood));
    const owns = ownLabels(n.owns);
    if (owns.length) bits.push('owns up to: ' + owns.join(', '));
    const say = String(n.say || '').trim();
    if (say) bits.push('on the round: "' + say + '"');
    if (!line && !words.length && !bits.length) continue;
    const parts = [];
    if (line) parts.push(line);
    if (words.length) parts.push('in their own words, ' + words.join('; '));
    if (bits.length) parts.push(bits.join('; '));
    said.push('- ' + p.display + ': ' + parts.join(' | '));
  }
  if (said.length) {
    L.push('\nWHAT THE GOLFERS SAID ABOUT THEIR OWN ROUNDS');
    L.push('Self-reported, and deliberately about things the ref CANNOT see —');
    L.push('how a round felt, what they blame, whether they got away with it.');
    L.push('None of it can contradict the card, because none of it is a claim');
    L.push('about a fact. Where a golfer\'s account and the marks pull apart,');
    L.push('that gap is the best material on this page — a man who three-putted');
    L.push('twice and called it striping it has told you something. Attribute');
    L.push('it to them; never restate it as established fact.');
    L.push(...said);
  }

  const b = T.bbb[rid];
  if (b) {
    const tally = {};
    b.holes.forEach(cell => bbbMarks(cell).forEach(pid => { tally[pid] = (tally[pid] || 0) + 1; }));
    const line = Object.entries(tally).map(([pid, n]) => ((person(T, pid) || {}).display || '?') + ' ' + n);
    if (line.length) L.push('Bingo Bango Bongo: ' + line.join(', '));
  }
  const c = roundCfg(T, rid);
  const nm = id => (person(T, id) || {}).display || null;
  if (c.ctpWinner) L.push('Closest to the pin: ' + nm(c.ctpWinner) + ' ' + (c.ctpDist || ''));
  if (c.ldWinner) L.push('Longest drive: ' + nm(c.ldWinner) + ' ' + (c.ldDist || ''));
  return L.join('\n');
}

/* ---------- the recap's numbers ----------
   Everything the report shows except the words: the ribbon, the table, the
   swing, the side games. Each figure comes off a scorecard, so a claim in the
   narrative can always be checked against the page it sits on. */

/** Which round a recap is for: the last one whose cards are all in, else the
 *  one being played, else the first. */
export function recapRound(T, now) {
  /* A finished card is the signal, not the calendar — a round cannot be
     complete unless it was played, and the book is used before the trip. */
  const done = ROUNDS.filter(r => roundComplete(T, r.id));
  if (done.length) return done[done.length - 1].id;
  const started = ROUNDS.filter(r => roundStanding(T, r.id).started);
  if (started.length) return started[started.length - 1].id;
  const due = ROUNDS.filter(r => dayOf(r.dayIdx).iso <= now.iso);
  return (due[due.length - 1] || ROUNDS[0]).id;
}

/** How a round stands, for the panel on Today. */
export function roundStanding(T, rid) {
  const cfg = roundCfg(T, rid);
  const out = groups(T, rid).flatMap(g => g.members);
  const field = (out.length ? golfers(T).filter(g => out.includes(g.id)) : golfers(T));
  const inCards = field.filter(p => {
    const c = card(T, rid, p.id);
    return c && c.raw.some(v => v != null);
  }).length;
  const complete = roundComplete(T, rid);
  const started = cfg.state !== 'closed' || inCards > 0;
  return { started, complete, inCards, field: field.length, pairs: (T.config.pairs || []).length };
}

/** The leading pair's round, hole by hole, against par. */
export function ribbon(T, rid) {
  const board = pairRoundBoard(T, rid);
  const lead = board[0];
  const holes = courseOf(T, rid).holes;
  const pair = lead && (T.config.pairs || []).find(p => p.id === lead.id);
  return holes.map((h, i) => {
    const n = pair ? pairHole(T, rid, pair, i) : null;
    return { n: h.n, par: h.par, net: n, d: n == null ? null : n - h.par };
  });
}

/** One round's pairs, by net against par for that round alone. */
export function pairRoundBoard(T, rid) {
  const rows = (T.config.pairs || []).map(pair => {
    const { tp, thru } = toParPair(T, rid, pair);
    return { id: pair.id, name: pairName(T, pair), today: tp, thru };
  }).filter(r => r.thru > 0);
  rows.sort((a, b) => (a.today - b.today) || (b.thru - a.thru));
  return rows.map((r, i) => ({ ...r, pos: i + 1 }));
}

/** The championship table as the recap shows it: this round and the week. */
export function recapTable(T, rid, now) {
  const week = pairsBoard(T, now);
  const today = pairRoundBoard(T, rid);
  const byId = {};
  today.forEach(r => { byId[r.id] = r; });
  const rows = (T.config.pairs || []).map(pair => {
    const w = week.find(x => x.id === pair.id);
    const t = byId[pair.id];
    return {
      id: pair.id,
      name: pairName(T, pair),
      today: t ? t.today : null,
      total: w && w.played ? w.total : null,
      thru: t ? t.thru : 0,
    };
  }).filter(r => r.thru > 0 || r.total != null);
  rows.sort((a, b) => ((a.total == null ? 99 : a.total) - (b.total == null ? 99 : b.total))
    || ((a.today == null ? 99 : a.today) - (b.today == null ? 99 : b.today)));
  return rows.map((r, i) => ({ ...r, pos: i + 1 }));
}

/** The biggest gap the leaders opened on the third-placed pair in one stretch. */
export function swingOfTheDay(T, rid) {
  const table = recapTable(T, rid, nowLocal());
  if (table.length < 3) return null;
  const pairs = T.config.pairs || [];
  const lead = pairs.find(p => p.id === table[0].id);
  const third = pairs.find(p => p.id === table[2].id);
  if (!lead || !third) return null;
  const holes = courseOf(T, rid).holes;
  let best = { gap: 0, from: null, to: null };
  let run = 0, start = null;
  for (let h = 0; h < 18; h++) {
    const a = pairHole(T, rid, lead, h), b = pairHole(T, rid, third, h);
    if (a == null || b == null) { run = 0; start = null; continue; }
    const d = (b - holes[h].par) - (a - holes[h].par);
    if (d > 0) { if (start == null) start = h; run += d; if (run > best.gap) best = { gap: run, from: start, to: h }; }
    else { run = 0; start = null; }
  }
  if (!best.gap) return null;
  return { shots: best.gap, fromHole: holes[best.from].n, toHole: holes[best.to].n };
}

/** Side games for one round, all of it read off the cards and the card's own
 *  nominated holes — nothing here is typed twice. */
export function sideGames(T, rid) {
  const cfg = roundCfg(T, rid);
  const nm = id => (person(T, id) || {}).display || null;
  const bbb = {};
  const b = T.bbb[rid];
  if (b) b.holes.forEach(cell => bbbMarks(cell).forEach(pid => { bbb[pid] = (bbb[pid] || 0) + 1; }));
  const top = Object.entries(bbb).sort((a, c) => c[1] - a[1])[0];
  const mvp = mvpBoard(T, nowLocal()).filter(x => x.played)[0];
  // how often the triple-bogey cap actually bit today
  let capped2 = 0;
  const holes = courseOf(T, rid).holes;
  for (const p of golfers(T)) {
    const c = card(T, rid, p.id);
    if (!c) continue;
    c.raw.forEach((v, i) => { if (v != null && v > holes[i].par + T.config.capOver) capped2++; });
  }
  return {
    ctp: cfg.ctpWinner ? { who: nm(cfg.ctpWinner), note: cfg.ctpDist || '', hole: cfg.ctpHole } : null,
    ld: cfg.ldWinner ? { who: nm(cfg.ldWinner), note: cfg.ldDist || '', hole: cfg.ldHole } : null,
    bbb: top ? { who: nm(top[0]), note: top[1] + ' points' } : null,
    mvp: mvp ? { who: mvp.name, note: mvp.totalStr + ' net' } : null,
    caps: capped2,
  };
}

/** Everything the generator is given. Only numbers that are on a card. */
export function recapInput(T, rid, now) {
  const r = roundDef(rid);
  const course = courseOf(T, rid);
  const L = [];
  L.push('ROUND: ' + r.full + ', ' + course.name + ', ' + dayOf(r.dayIdx).dow + ' ' + dayOf(r.dayIdx).date + '.');
  L.push('Format: ' + (r.counts ? 'Better Ball, net' : 'practice, counts for nothing') + '.');
  L.push('It is round ' + (ROUNDS.filter(x => x.counts).findIndex(x => x.id === rid) + 1) + ' of 3 that count.');
  L.push('Par ' + course.holes.reduce((a, h) => a + h.par, 0)
    + '. Stroke index by hole: ' + course.holes.map(h => h.n + ':' + h.si).join(' ') + '.');
  L.push('Triple-bogey cap: a gross score is capped at ' + T.config.capOver + ' over par before strokes come off.');

  L.push('\nCARDS (gross then net, hole by hole)');
  for (const p of golfers(T)) {
    const c = card(T, rid, p.id);
    if (!c || c.raw.every(v => v == null)) continue;
    const nets = course.holes.map((h, i) => playerNet(T, rid, p.id, i));
    const capsHit = c.raw.map((v, i) => (v != null && v > course.holes[i].par + T.config.capOver ? course.holes[i].n : null)).filter(Boolean);
    L.push('- ' + p.display + ' (band ' + (p.band == null ? 'none' : p.band) + ')'
      + '\n    gross: ' + c.raw.map(v => (v == null ? '-' : v)).join(',')
      + '\n    net:   ' + nets.map(v => (v == null ? '-' : v)).join(',')
      + (capsHit.length ? '\n    cap hit on holes: ' + capsHit.join(',') : ''));
  }

  L.push('\nPAIRS THIS ROUND (better ball, net to par)');
  pairRoundBoard(T, rid).forEach(x => L.push('- ' + x.id + ' ' + x.name + ': ' + fmtToPar(x.today) + ' thru ' + x.thru));

  L.push('\nTHE WEEK AFTER THIS ROUND');
  recapTable(T, rid, now).forEach(x => L.push('- ' + x.id + ' ' + x.name + ': today '
    + (x.today == null ? '-' : fmtToPar(x.today)) + ', total ' + (x.total == null ? '-' : fmtToPar(x.total))));

  const sg = sideGames(T, rid);
  L.push('\nSIDE GAMES');
  if (sg.ctp) L.push('- Closest to the pin, hole ' + sg.ctp.hole + ': ' + sg.ctp.who + ' ' + sg.ctp.note);
  if (sg.ld) L.push('- Longest drive, hole ' + sg.ld.hole + ': ' + sg.ld.who + ' ' + sg.ld.note);
  if (sg.bbb) L.push('- Bingo Bango Bongo: ' + sg.bbb.who + ' ' + sg.bbb.note);
  L.push('- Triple-bogey cap hit ' + sg.caps + ' times today.');

  const sw = swingOfTheDay(T, rid);
  if (sw) L.push('\nSWING: the leaders took ' + sw.shots + ' shots out of third place between holes '
    + sw.fromHole + ' and ' + sw.toHole + '.');

  L.push('\nPLAYER IDS (use these exactly in pairNotes and honours)');
  golfers(T).forEach(p => L.push('- ' + p.id + ' = ' + p.display));
  (T.config.pairs || []).forEach(p => L.push('- ' + p.id + ' = ' + pairName(T, p)));
  return L.join('\n');
}

/* ---------- match play / Ryder Cup ---------- */

export function matchPlay(sideA, sideB) {
  let up = 0, thru = 0, result = null;
  for (let h = 0; h < 18; h++) {
    const a = sideA(h), b = sideB(h);
    if (a == null || b == null) break;
    thru = h + 1;
    if (a < b) up++; else if (b < a) up--;
    const remaining = 18 - thru;
    if (Math.abs(up) > remaining) { result = Math.abs(up) + '&' + remaining; break; }
  }
  let status;
  if (result) status = result;
  else if (thru === 0) status = 'Not started';
  else if (up === 0) status = thru === 18 ? 'Halved' : 'All square';
  else status = Math.abs(up) + ' up';
  return { up, thru, status, done: result != null || thru === 18, side: up > 0 ? 'UK' : up < 0 ? 'USA' : null };
}

export function ryderData(T, now) {
  const gs = golfers(T);
  const sessions = [];
  let ukTotal = 0, usaTotal = 0;

  /* Every session is singles. Fourballs tied a golfer's cup to whichever
     squad their better-ball partner was in, which left anyone in a split
     pairing out of two sessions of three. Head-to-head, everyone plays. */
  const rot = (list, by) => (!list.length ? list
    : list.slice(by % list.length).concat(list.slice(0, by % list.length)));

  const rounds = countingRounds(T);
  rounds.forEach((round, k) => {
    const matches = [];
    const started = phaseOf(T, round.id, now) !== 'upcoming' && hasScores(T, round.id);
    const ukAll = gs.filter(g => g.location === 'UK');
    const usAll = gs.filter(g => g.location === 'USA');
    /* Squads are rarely the same size. Turn the longer one by a whole session
       each time so a different golfer sits out every session, and turn the
       shorter one by one so nobody meets the same opponent twice. */
    const ukBig = ukAll.length >= usAll.length;
    const big = ukBig ? ukAll : usAll;
    const small = ukBig ? usAll : ukAll;
    const n = small.length;
    const bigR = rot(big, n * k);
    const smallR = rot(small, k);
    for (let i = 0; i < n; i++) {
      const uk = ukBig ? bigR[i] : smallR[i];
      const us = ukBig ? smallR[i] : bigR[i];
      const mp = started ? matchPlay(h => playerNet(T, round.id, uk.id, h), h => playerNet(T, round.id, us.id, h))
                         : { up: 0, thru: 0, status: 'Not started', done: false, side: null };
      matches.push({ a: uk.display, b: us.display, aId: uk.id, bId: us.id, ...mp });
    }
    const out = bigR.slice(n).map(g => g.display);
    let uk = 0, us = 0;
    for (const m of matches) if (m.done) { if (m.up > 0) uk++; else if (m.up < 0) us++; else { uk += 0.5; us += 0.5; } }
    ukTotal += uk; usaTotal += us;
    const d = dayOf(round.dayIdx);
    sessions.push({ id: round.id, label: d.dow + ' ' + d.date, format: 'Singles', matches, uk, usa: us, sitting: out });
  });
  return {
    sessions, ukTotal, usaTotal,
    unassigned: gs.filter(g => !g.location).length,
    lopsided: Math.abs(gs.filter(g => g.location === 'UK').length - gs.filter(g => g.location === 'USA').length),
  };
}

/* ---------- scorecard strip ---------- */

export function holeCells(T, roundId, pair) {
  const holes = courseOf(T, roundId).holes;
  return holes.map((hole, h) => {
    const s = pairHole(T, roundId, pair, h);
    const d = s == null ? null : s - hole.par;
    return { n: h + 1, par: hole.par, si: hole.si, d, played: s != null, net: s, label: d == null ? '' : fmtToPar(d) };
  });
}

/* ---------- setup readiness ---------- */

export function setupIssues(T) {
  const out = [];
  const noBand = golfers(T).filter(g => g.band == null);
  if (noBand.length) out.push({
    id: 'bands', screen: 'roster', cta: 'Set bands',
    text: noBand.length + ' golfer' + (noBand.length > 1 ? 's have' : ' has') + ' no playing band: '
        + noBand.map(g => g.display).join(', ') + '. They are left out of every score until a band is set.',
  });
  const empty = T.config.pairs.filter(p => p.members.length < 2);
  if (empty.length) out.push({
    id: 'pairs', screen: 'roster', cta: 'Fix pairings',
    text: empty.length + ' pair' + (empty.length > 1 ? 's are' : ' is') + ' short of two players.',
  });
  const un = golfers(T).filter(g => !T.config.pairs.some(p => p.members.includes(g.id)));
  if (un.length) out.push({
    id: 'unpaired', screen: 'roster', cta: 'Assign pairs',
    text: un.length + ' golfer' + (un.length > 1 ? 's are' : ' is') + ' unpaired: ' + un.map(g => g.display).join(', ')
        + '. They still play for MVP and Bingo Bango Bongo.',
  });
  const unver = Object.keys(COURSES).filter(k => !courseByKey(T, k).verified).map(k => COURSES[k].name);
  if (unver.length) out.push({
    id: 'courses', screen: 'courses', cta: 'Verify card',
    text: (unver.length === 2 ? 'Both course cards are' : unver[0] + '\u2019s card is') + ' not verified. Every net score on '
        + (unver.length === 2 ? 'them' : 'it') + ' is provisional until par and stroke index are confirmed.',
  });
  if (PINS_ENABLED && !T.config.pinsChanged) out.push({
    id: 'pins', screen: 'setup', cta: 'Change PINs',
    text: 'The scoring PINs are still the factory defaults. Change them before the first round.',
  });
  return out;
}

/* ---------- next tee ---------- */

export function nextTee(T, now) {
  let best = null;
  for (const r of ROUNDS) {
    const d = dayOf(r.dayIdx);
    const cfg = roundCfg(T, r.id);
    for (const tee of cfg.tees) {
      if (!tee.time) continue;
      const mins = hhmmToMin(tee.time);
      if (d.iso > now.iso || (d.iso === now.iso && mins >= now.minutes)) {
        const key = d.iso + ' ' + tee.time;
        if (!best || key < best.key) best = { key, round: r, day: d, time: tee.time };
      }
    }
  }
  return best;
}

/* ---------- next fixture (rounds and social calendar together) ---------- */

function fixtureMs(iso, hhmm) {
  const t = hhmmToMin(hhmm);
  return t == null ? null : Date.parse(iso + 'T00:00:00Z') + t * 60000;
}

export function fixtures(T) {
  const out = [];
  for (const r of ROUNDS) {
    const d = dayOf(r.dayIdx);
    const tee = roundCfg(T, r.id).tees[0];
    if (tee && tee.time) out.push({ ms: fixtureMs(d.iso, tee.time), time: tee.time, golf: true,
      title: r.full + ' — ' + COURSES[r.course].name, short: r.short });
  }
  for (const e of T.config.schedule) {
    const d = dayOf(e.dayIdx);
    out.push({ ms: fixtureMs(d.iso, e.time), time: e.time, golf: false, title: e.title, dayIdx: e.dayIdx });
  }
  return out.filter(f => f.ms != null).sort((a, b) => a.ms - b.ms);
}

export function nextFixture(T, now) {
  const f = fixtures(T).find(x => x.ms > now.ms);
  if (!f) return null;
  const d = f.ms - now.ms;
  const hrs = Math.floor(d / 3600000), mins = Math.floor(d % 3600000 / 60000);
  const days = Math.floor(hrs / 24);
  const countdown = days >= 1 ? days + 'd ' + (hrs % 24) + 'h'
                  : hrs > 0 ? hrs + 'h ' + mins + 'm'
                  : mins + 'm';
  return { ...f, countdown, label: f.title + ' — ' + to12(f.time) };
}

/* ---------- tee-time privilege ---------- */

export const TEE_CHOICES = ['08:30', '09:40', '10:50', '12:15'];

/** Round 1's leader picks Round 2's tee; Round 2's leader picks Round 3's.
 *  A pick unlocks only once the qualifying round is locked. Two picks, no more. */
export const TEE_PRIV = [{ pick: 'r2', from: 'r1' }, { pick: 'r3', from: 'r2' }];

export function teePrivilege(T, now) {
  return TEE_PRIV.map(({ pick, from }) => {
    const rec = (T.config.teePicks || {})[pick] || { done: false, time: null, byPair: null };
    const qualified = roundCfg(T, from).state === 'locked';
    const board = qualified ? pairsBoard(T, now) : [];
    const leader = board.length ? board[0] : null;
    return {
      pick, from,
      pickDay: dayOf(roundDef(pick).dayIdx),
      fromDay: dayOf(roundDef(from).dayIdx),
      unlocked: qualified && !!leader,
      done: !!rec.done,
      time: rec.time,
      time12: rec.time ? to12(rec.time) : null,
      leaderName: rec.byPair ? rec.byPair : (leader ? leader.name : null),
    };
  });
}

/** A player's to-par and holes played in one round — used beside the stepper. */
export function roundToPar(T, roundId, pid) {
  const holes = courseOf(T, roundId).holes;
  let tp = 0, thru = 0;
  for (let i = 0; i < 18; i++) {
    const n = playerNet(T, roundId, pid, i);
    if (n != null) { tp += n - holes[i].par; thru = i + 1; }
  }
  return { tp, thru };
}
