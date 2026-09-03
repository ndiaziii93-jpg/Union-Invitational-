/* The Union Invitational — pure scoring engine.
   No I/O, no DOM, no randomness. Everything here is a function of state. */

import { COURSES, DAYS, ROUNDS, TZ_OFFSET_MIN, PINS_ENABLED } from './data.js';

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

export const BANDS = [15, 20, 25];

/** Strokes a band receives on a hole of the given stroke index.
 *  15 → 1 stroke on SI 1–15 (15 total)
 *  20 → 1 a hole, 2 on SI 1–2   (20 total)
 *  25 → 1 a hole, 2 on SI 1–7   (25 total) */
export function strokesFor(band, si) {
  if (band === 15) return si <= 15 ? 1 : 0;
  if (band === 20) return 1 + (si <= 2 ? 1 : 0);
  if (band === 25) return 1 + (si <= 7 ? 1 : 0);
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

export function bbbBoard(T) {
  const tally = {};
  for (const r of countingRounds(T)) {
    const b = T.bbb[r.id];
    if (!b) continue;
    for (const cell of b.holes) for (const k of ['bingo', 'bango', 'bongo']) {
      const pid = cell && cell[k];
      if (pid) tally[pid] = (tally[pid] || 0) + 1;
    }
  }
  const rows = Object.entries(tally).map(([pid, pts]) => ({ id: pid, name: (person(T, pid) || {}).display || '?', pts }));
  rows.sort((a, b) => b.pts - a.pts);
  return rows.map((r, i) => ({ ...r, pos: i + 1, ptsStr: String(r.pts) }));
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
  const loc = pid => (person(T, pid) || {}).location || null;
  const pairLoc = pair => {
    const ls = pair.members.map(loc).filter(Boolean);
    return ls.length === pair.members.length && ls.length && ls.every(l => l === ls[0]) ? ls[0] : null;
  };
  const sessions = [];
  let ukTotal = 0, usaTotal = 0;

  for (const round of countingRounds(T)) {
    const singles = round.id === 'r3';
    const matches = [];
    const started = phaseOf(T, round.id, now) !== 'upcoming' && hasScores(T, round.id);
    if (!singles) {
      const uk = T.config.pairs.filter(p => pairLoc(p) === 'UK');
      const us = T.config.pairs.filter(p => pairLoc(p) === 'USA');
      const n = Math.min(uk.length, us.length);
      for (let i = 0; i < n; i++) {
        const a = uk[i], b = us[round.id === 'r2' ? (i + 1) % n : i];
        const mp = started ? matchPlay(h => pairHole(T, round.id, a, h), h => pairHole(T, round.id, b, h))
                           : { up: 0, thru: 0, status: 'Not started', done: false, side: null };
        matches.push({ a: pairName(T, a), b: pairName(T, b), ...mp });
      }
    } else {
      const uk = gs.filter(g => g.location === 'UK'), us = gs.filter(g => g.location === 'USA');
      const n = Math.min(uk.length, us.length);
      for (let i = 0; i < n; i++) {
        const a = uk[i], b = us[i];
        const mp = started ? matchPlay(h => playerNet(T, round.id, a.id, h), h => playerNet(T, round.id, b.id, h))
                           : { up: 0, thru: 0, status: 'Not started', done: false, side: null };
        matches.push({ a: a.display, b: b.display, ...mp });
      }
    }
    let uk = 0, us = 0;
    for (const m of matches) if (m.done) { if (m.up > 0) uk++; else if (m.up < 0) us++; else { uk += 0.5; us += 0.5; } }
    ukTotal += uk; usaTotal += us;
    const d = dayOf(round.dayIdx);
    sessions.push({ id: round.id, label: d.dow + ' ' + d.date, format: singles ? 'Singles' : 'Fourballs', matches, uk, usa: us });
  }
  return {
    sessions, ukTotal, usaTotal,
    unassigned: gs.filter(g => !g.location).length,
    splitPairs: T.config.pairs.filter(p => p.members.length === 2 && pairLoc(p) == null && p.members.every(loc)).length,
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
