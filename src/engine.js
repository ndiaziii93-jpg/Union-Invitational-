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
/* THE GAP BETWEEN GROUPS. The course sends groups out eight to ten minutes
   apart; the book uses eight, so the second group's time is never something
   anybody has to work out or type. Set the first tee and the second follows. */
export const TEE_GAP_MIN = 8;
export function plusMins(t, n) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim());
  if (!m) return null;
  const at = (((+m[1] * 60 + +m[2] + n) % 1440) + 1440) % 1440;
  return String(Math.floor(at / 60)).padStart(2, '0') + ':' + String(at % 60).padStart(2, '0');
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

/* A golfer's handicap is the strokes they receive, any whole number; the
   four bands are the quick picks it started with, still one tap on Roster. */
export const BANDS = [15, 20, 25, 30];
export const HCP_MAX = 45;

/** Strokes a handicap receives on a hole of the given stroke index, the way
 *  every club allocates them: one on each hole up to the handicap, going
 *  round again for anything over eighteen.
 *  15 → 1 stroke on SI 1–15 (15 total)
 *  20 → 1 a hole, 2 on SI 1–2   (20 total)
 *  25 → 1 a hole, 2 on SI 1–7   (25 total)
 *  22 → 1 a hole, 2 on SI 1–4   (22 total) */
export function strokesFor(band, si) {
  if (band == null || !Number.isFinite(+band)) return null; // no handicap — this player cannot be scored
  const h = Math.max(0, Math.min(HCP_MAX, Math.round(+band)));
  return Math.floor(h / 18) + (si <= h % 18 ? 1 : 0);
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

/* ---------- the Team Competition: Four-Ball Stableford ----------
   Points, not strokes. Each partner plays their own ball and scores the
   hole against par with their strokes taken off (Rule 21.1b): net bogey 1,
   par 2, birdie 3, eagle 4, albatross 5; worse than net bogey, or a pick-up,
   nought. The better of the two partners' points is the team's for the hole
   (Rule 23, the four-ball form of Stableford), and the holes add up — so a
   blow-up costs a hole, never the round, and a pick-up at net double bogey
   keeps the group moving.
   The handicap for it is the USGA's for the format: 85% of each golfer's
   handicap (Rules of Handicapping, Appendix C, Four-Ball Stableford), rounded
   to the nearest whole stroke, falling on the stroke indexes the same way.
   The pair's team handicap is the two of those together; what it buys is
   where each partner's strokes land. The triple-bogey cap is a pace rule for
   the card and the MVP; Stableford needs none, nought is nought. */
export const TEAM_ALLOWANCE = 85;
export function teamAllowance(T) { const a = T && T.config && T.config.teamAllowance; return Number.isFinite(+a) && +a > 0 ? +a : TEAM_ALLOWANCE; }
/** A golfer's playing handicap in the team game: the allowance applied, rounded (.5 up). */
export function playingHcp(band, allowance = TEAM_ALLOWANCE) {
  if (band == null || band === '') return null;
  return Math.max(0, Math.min(HCP_MAX, Math.round(Math.round(+band) * allowance / 100)));
}
export function teamStrokesFor(T, band, si) { return strokesFor(playingHcp(band, teamAllowance(T)), si); }
/** Stableford points for a net score against par. */
export function stablefordPts(net, par) { return net == null ? null : Math.max(0, 2 + par - net); }
/** One golfer's points on a hole in the team game, or null with no score or no handicap. */
export function playerPts(T, roundId, pid, h) {
  const c = card(T, roundId, pid);
  if (!c || c.raw[h] == null) return null;
  const hole = courseOf(T, roundId).holes[h];
  const s = teamStrokesFor(T, (person(T, pid) || {}).band, hole.si);
  if (s == null) return null;
  return stablefordPts(c.raw[h] - s, hole.par);
}
/** The team's points on a hole: the better of the partners'. */
export function pairPts(T, roundId, pair, h) {
  let best = null;
  for (const pid of pair.members) {
    const p = playerPts(T, roundId, pid, h);
    if (p != null && (best == null || p > best)) best = p;
  }
  return best;
}
/** A team's points through the first `upto` holes. */
export function pairPtsThru(T, roundId, pair, upto = 18) {
  let pts = 0, thru = 0;
  for (let h = 0; h < upto && h < 18; h++) {
    const p = pairPts(T, roundId, pair, h);
    if (p != null) { pts += p; thru = h + 1; }
  }
  return { pts, thru };
}
/** A golfer's own points through the first `upto` holes, for the card. */
export function playerPtsThru(T, roundId, pid, upto = 18) {
  let pts = 0, thru = 0;
  for (let h = 0; h < upto && h < 18; h++) {
    const p = playerPts(T, roundId, pid, h);
    if (p != null) { pts += p; thru = h + 1; }
  }
  return { pts, thru };
}

/* RAW, BESIDE NET. The boards are decided net, but the strokes as written
   are what a golfer remembers walking off: every board carries both. Raw is
   the number on the card, before any band and before the cap; a team's raw
   is the better of its two raw scores on each hole. */
export function playerGross(T, roundId, pid, h) {
  const c = card(T, roundId, pid);
  return c && c.raw[h] != null ? c.raw[h] : null;
}
function pairHoleGross(T, roundId, pair, h) {
  let best = null;
  for (const pid of pair.members) { const g = playerGross(T, roundId, pid, h); if (g != null && (best == null || g < best)) best = g; }
  return best;
}
/** Raw to par through the first `upto` holes, for a golfer or a team. */
export function grossThru(T, roundId, who, upto = 18) {
  const holes = courseOf(T, roundId).holes;
  let tp = 0, thru = 0, strokes = 0;
  for (let h = 0; h < upto && h < 18; h++) {
    const g = typeof who === 'string' ? playerGross(T, roundId, who, h) : pairHoleGross(T, roundId, who, h);
    if (g != null) { tp += g - holes[h].par; strokes += g; thru = h + 1; }
  }
  return { tp, thru, strokes };
}

function toParPair(T, roundId, pair) {
  const holes = courseOf(T, roundId).holes;
  let tp = 0, thru = 0;
  for (let h = 0; h < 18; h++) { const s = pairHole(T, roundId, pair, h); if (s != null) { tp += s - holes[h].par; thru = h + 1; } }
  return { tp, thru };
}
/** Points. 'tp' is kept as the name the boards read, so a team's figure is
 *  read the same way everywhere: the bigger, the better, now. */
function ptsPair(T, roundId, pair) { const r = pairPtsThru(T, roundId, pair, 18); return { tp: r.pts, thru: r.thru }; }
/* A group is two pairs — a fourball — taken in the pairings' own order, so
   Group 1 is the first two pairs off and Group 2 the next two. The count
   follows the pairings rather than the three tee slots the book shipped with.
   A slot carries only the time. With no pairings yet, the stored slots stand
   in so the screen still has something to show. */
export const PAIRS_PER_GROUP = 2;

/** When a group actually goes out.
 *
 *  A book written before the gap was settled carries a first tee time and
 *  nothing after it, so rather than showing the group behind as having no
 *  time at all, the later ones are read off the first: eight minutes a
 *  group, which is what the course sends them out on. A time that HAS been
 *  set is always its own — this only fills a blank. */
export function teeTime(cfg, i) {
  const tees = (cfg && cfg.tees) || [];
  const own = (tees[i] || {}).time;
  if (own) return own;
  const first = (tees[0] || {}).time;
  return i > 0 && first ? plusMins(first, TEE_GAP_MIN * i) : null;
}
/** Every group's time for a round, in order. Built from the GROUPS that are
 *  going out rather than from the tee slots, because the book ships with a
 *  spare slot and filling that one in would invent a third group. */
export function teeTimes(T, rid) {
  return groups(T, rid).map(g => g.time).filter(Boolean);
}

export function groups(T, rid) {
  const cfg = roundCfg(T, rid);
  const tees = cfg.tees || [];
  const pairs = (T.config.pairs || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  /* A round can be sent out in groups of its own, set on Tee times, without
     touching the teams: who plays with whom on the day is not who they are
     paired with for the week. Scores are kept by golfer, not by group, so
     moving someone never moves or loses a shot. */
  const own = Array.isArray(cfg.groupOverride) ? cfg.groupOverride.map(g => (Array.isArray(g) ? g : []).filter(id => person(T, id))) : null;
  if (own && own.some(g => g.length)) {
    return own.filter(g => g.length).map((members, n) => ({
      id: 'g' + n, label: 'Group ' + (n + 1),
      pairs: [], pairIds: pairs.filter(p => (p.members || []).length && p.members.every(m => members.includes(m))).map(p => p.id),
      members, time: teeTime(cfg, n), own: true,
    }));
  }
  if (!pairs.length) {
    return tees.map((t, i) => ({ id: 't' + i, label: 'Group ' + (i + 1),
      pairs: [], members: t.players || [], time: teeTime(cfg, i) }));
  }
  const out = [];
  for (let i = 0; i < pairs.length; i += PAIRS_PER_GROUP) {
    const inGroup = pairs.slice(i, i + PAIRS_PER_GROUP);
    const n = out.length;
    out.push({
      id: 'g' + n,
      label: 'Group ' + (n + 1),
      pairs: inGroup.map(p => pairName(T, p)),
      pairIds: inGroup.map(p => p.id),
      members: inGroup.flatMap(p => (p.members || []).filter(id => person(T, id))),
      time: teeTime(cfg, n),
    });
  }
  return out;
}

/* ---------- finishing, group by group ----------
 *
 * A round used to end once, for everybody, when somebody pressed Lock and
 * conclude. That is not how a round ends. Group 1 walks off 18 an hour and
 * a half before Group 3 does, and for that hour and a half their card sat
 * open with nothing left to put in it — one stray tap from a score nobody
 * could explain.
 *
 * So each group finishes its own round. Their card closes, the last group
 * to finish closes the round behind it, and nothing on the boards moves:
 * the boards have been reading these cards live all afternoon. Finishing
 * is about the card, not the scoring.
 *
 * It is reversible on purpose. The button is pressed on the 18th green by
 * somebody holding a phone in one hand and a putter in the other. */

/** The groups that finish a round. Pairings give real fourballs; with none
 *  set yet the whole field is on one card, so it finishes as one — three
 *  empty tee slots are not three groups. */
export function finishGroups(T, rid) {
  const real = groups(T, rid).filter(g => (g.members || []).length);
  if (real.length) return real;
  return [{ id: 'all', label: 'The field', pairs: [], pairIds: [],
    members: golfers(T).map(p => p.id), time: null }];
}

/** How much of a group is in through 18 — `{ in, of }`. A card is in when
 *  the 18th was SAVED for that golfer; a number typed and not saved is not
 *  a round anyone has finished. */
export function groupThru18(T, rid, g) {
  const ids = (g && g.members || []).filter(id => person(T, id));
  let n = 0;
  for (const id of ids) { const c = card(T, rid, id); if (c && c.by && c.by[17]) n++; }
  return { in: n, of: ids.length };
}

/** When this group finished, and who closed it — or null while it is open. */
export function groupDone(T, rid, gid) {
  const cf = roundCfg(T, rid);
  const d = cf && cf.done;
  return d && typeof d === 'object' && d[gid] ? d[gid] : null;
}

/** The groups still out on the course. Empty means the round is over. */
export function groupsOut(T, rid) {
  return finishGroups(T, rid).filter(g => !groupDone(T, rid, g.id));
}

/* ---------- the turn ----------
 *
 * Nine holes in is the only moment in a round when everybody is still out
 * there and something is already decided. A group walks off the 9th, looks
 * at a phone, and finds out that they are three better than the group in
 * front at the same point — and the back nine is a different afternoon.
 *
 * It is written to the shared book rather than raised on the ref's phone, so
 * it reaches every device on the course at once. A ref can read it out; a
 * wife by the pool gets the same window.
 */

export const TURN_HOLES = 9;

/** One golfer's net to par through the first `upto` holes. */
export function toParThru(T, rid, pid, upto) {
  const holes = courseOf(T, rid).holes;
  let tp = 0, thru = 0;
  for (let h = 0; h < upto && h < 18; h++) {
    const n = playerNet(T, rid, pid, h);
    if (n != null) { tp += n - holes[h].par; thru = h + 1; }
  }
  return { tp, thru };
}

/** A pair's points through the first `upto` holes. */
function pairThru(T, rid, pair, upto) { const r = pairPtsThru(T, rid, pair, upto); return { tp: r.pts, thru: r.thru }; }

/** Whether every golfer in a group has the ninth SAVED. */
export function groupAtTurn(T, rid, g) {
  const ids = (g && g.members || []).filter(id => person(T, id));
  if (!ids.length) return false;
  return ids.every(id => { const c = card(T, rid, id); return c && c.by && c.by[TURN_HOLES - 1]; });
}

/** When a group made the turn, as the shared book has it — or null. */
export function turnAt(T, rid, gid) {
  const cf = roundCfg(T, rid);
  const t = cf && cf.turn;
  return t && typeof t === 'object' && t[gid] ? t[gid] : null;
}

/** Every group's better-ball standing at the turn, and who has got there. */
export function turnGroups(T, rid) {
  return finishGroups(T, rid).map(g => {
    const prs = (g.pairIds || []).map(id => (T.config.pairs || []).find(x => x.id === id)).filter(Boolean);
    let tp = 0, thru = 0, any = false, gtp = 0;
    for (const pr of prs) {
      const r = pairThru(T, rid, pr, TURN_HOLES), gr = grossThru(T, rid, pr, TURN_HOLES);
      if (r.thru > 0) { tp += r.tp; thru = Math.max(thru, r.thru); any = true; }
      if (gr.thru > 0) gtp += gr.tp;
    }
    if (!prs.length) {                       // no pairings: the field as one
      for (const id of g.members) {
        const r = toParThru(T, rid, id, TURN_HOLES), gr = grossThru(T, rid, id, TURN_HOLES);
        if (r.thru > 0) { tp += r.tp; thru = Math.max(thru, r.thru); any = true; }
        if (gr.thru > 0) { gtp += gr.tp; thru = Math.max(thru, gr.thru); any = true; }
      }
    }
    return { id: g.id, label: g.label, tp, gtp, thru, started: any, pts: prs.length > 0,
      turned: !!turnAt(T, rid, g.id) || groupAtTurn(T, rid, g) };
  });
}

/** The cup AS IT STANDS, which at the turn is the only reading worth having:
 *  settled matches, plus whoever is up in the ones still on the course. A
 *  board showing 0–0 all afternoon because nothing has finished is not a
 *  score, it is a technicality. */
function cupNow(cup) {
  let uk = cup.ukTotal, usa = cup.usaTotal, out = 0;
  for (const s of cup.sessions) for (const m of s.matches) {
    if (m.done || !m.thru) continue;
    out++;
    if (m.up > 0) uk += 1; else if (m.up < 0) usa += 1; else { uk += 0.5; usa += 0.5; }
  }
  if (!uk && !usa && !out) return null;
  return { uk, usa, out };
}

/** The whole snapshot the window puts up, for one group's turn.
 *  Everything in it is already on a board somewhere — this is the board
 *  brought to the 9th green rather than a second set of figures. */
export function turnSnapshot(T, rid, gid, now) {
  const gs = turnGroups(T, rid);
  const mine = gs.find(g => g.id === gid) || null;
  const r = roundDef(rid);
  const cup = ryderData(T, now);
  const pairs = pairsBoard(T, now);
  const mvp = mvpBoard(T, now);
  const bbb = bbbBoard(T);

  /* Where the group sits against the others that have already turned. The
     comparison is only honest between groups at the same point, which is
     the whole reason this fires at the ninth and not at the tenth. */
  const others = gs.filter(g => g.id !== gid && g.turned && g.started);
  const inPts = !!(mine && mine.pts);                 // pairs: points, the more the better
  const best = others.length ? (inPts ? Math.max : Math.min)(...others.map(g => g.tp)) : null;
  const pace = (mine && mine.started && best != null)
    ? { delta: Math.abs(mine.tp - best), ahead: inPts ? mine.tp >= best : mine.tp <= best, level: mine.tp === best, pts: inPts,
        against: others.find(g => g.tp === best).label }
    : null;

  /* The field at the turn, so everybody can find their own name. */
  const where = {};
  for (const g of finishGroups(T, rid)) for (const id of g.members) where[id] = g.label;
  const field = golfers(T).map(p => {
    const t = toParThru(T, rid, p.id, TURN_HOLES), g = grossThru(T, rid, p.id, TURN_HOLES);
    return { id: p.id, name: p.display, group: where[p.id] || '—',
      tp: t.thru > 0 ? t.tp : null, gtp: g.tp, thru: Math.max(t.thru, g.thru), mine: (mine && where[p.id] === mine.label) || false };
  }).filter(x => x.thru > 0);
  field.sort((a, b) => (a.tp == null) - (b.tp == null) || (a.tp - b.tp) || (a.gtp - b.gtp) || b.thru - a.thru);

  return {
    rid, gid,
    label: (mine && mine.label) || 'A group',
    round: r.short === 'Practice' ? 'the practice round' : 'Round ' + r.short.slice(1),
    course: courseOf(T, rid).name,
    cup: cupNow(cup),
    pair: pairs.length ? { name: pairs[0].name, tp: pairs[0].totalStr, gross: pairs[0].gTotalStr } : null,
    inPts,
    leader: mvp.length ? { name: mvp[0].name, tp: mvp[0].totalStr, gross: mvp[0].gTotalStr, thru: mvp[0].thruStr } : null,
    bbb: bbb.length ? { name: bbb[0].name, pts: bbb[0].pts } : null,
    groups: gs.filter(g => g.started),
    field: field.map((x, i) => ({ ...x, pos: i + 1 })),
    pace,
  };
}

/* The practice day is its own thing: it feeds nothing, and every board that
   counts walks countingRounds(), which leaves it out. This is the one place
   it is added up, so Tuesday can have a winner of its own. */
export function practiceBoard(T) {
  const rid = 'practice';
  const holes = courseOf(T, rid).holes;
  /* Tuesday is the day the bands get sorted out, so it is scored gross: a
     golfer with no band yet still has a card. The band read under the board
     is what the day is for. */
  const rows = golfers(T).map(p => {
    const c = card(T, rid, p.id);
    let gross = 0, tp = 0, thru = 0;
    for (let h = 0; h < 18; h++) {
      const raw = c ? c.raw[h] : null;
      if (raw == null) continue;
      thru = h + 1;
      gross += raw;
      tp += raw - holes[h].par;
    }
    /* and net beside it, for anyone with a band: capped, strokes applied */
    let ntp = null;
    if (strokesFor(p.band, holes[0].si) != null) {
      ntp = 0;
      for (let h = 0; h < 18; h++) { const n = playerNet(T, rid, p.id, h); if (n != null) ntp += n - holes[h].par; }
    }
    return { id: p.id, name: p.display, band: p.band, gross, tp, ntp, thru };
  }).filter(r => r.thru > 0);
  rows.sort((a, b) => (a.tp - b.tp) || (b.thru - a.thru));
  return rows.map((r, i) => ({ ...r, pos: i + 1 }));
}

/* ---------- what Tuesday says about a band ----------
 *
 * A band IS the strokes you receive, so the arithmetic is not subtle: net is
 * gross minus band, and a band is right when net lands near level par. Which
 * makes the read a single number — how many over par a golfer actually went
 * round in — held against the band they chose for themselves.
 *
 * Two corrections, both of which matter.
 *
 * The score is CAPPED first, at triple bogey, exactly as every counting
 * round will cap it. Tuesday's raw total can carry a nine on it; Thursday's
 * cannot. Reading the raw number would send a man up two bands for one bad
 * hole that the tournament was never going to charge him for.
 *
 * And a card short of eighteen is projected, not totalled, because nine
 * holes at six over is not a band of six.
 *
 * It is a READ, not a ruling. One round is thin evidence, the cap hides how
 * bad a hole truly was, and a scorer sets the band in the end. */

/** The handicap a number of strokes over par asks for: that number, whole,
 *  within what the book allows. */
export function nearestBand(over) {
  return Math.max(0, Math.min(HCP_MAX, Math.round(over)));
}

/** Every golfer's round, read as a band. `verdict` is one of:
 *  'none'  — nothing to read yet
 *  'thin'  — too few holes to say anything
 *  'right' — the band they chose is the one the card suggests
 *  'light' — they need more strokes than they took
 *  'heavy' — they took more strokes than they needed
 *  'unset' — played, but no band chosen to compare against */
export function bandRead(T, rid = 'practice') {
  const holes = courseOf(T, rid).holes;
  const cap = T.config.capOver;
  return golfers(T).map(p => {
    const c = card(T, rid, p.id);
    let over = 0, played = 0, hitCap = 0;
    for (let h = 0; h < 18; h++) {
      const raw = c ? c.raw[h] : null;
      if (raw == null) continue;
      played++;
      const v = capped(raw, holes[h].par, cap);
      if (v !== raw) hitCap++;
      over += v - holes[h].par;
    }
    const row = { id: p.id, name: p.display, band: p.band, played, over, hitCap,
      projected: null, suggested: null, gap: null, verdict: 'none' };
    if (!played) return row;
    /* Nine holes at six over is not a band of six. */
    row.projected = Math.round((over / played) * 18);
    row.suggested = nearestBand(row.projected);
    if (played < 9) { row.verdict = 'thin'; return row; }
    if (p.band == null) { row.verdict = 'unset'; return row; }
    row.gap = row.projected - p.band;
    /* Two shots either way is a round's noise, not a wrong handicap. */
    row.verdict = Math.abs(row.gap) <= 2 ? 'right' : row.gap > 0 ? 'light' : 'heavy';
    return row;
  }).filter(r => r.verdict !== 'none')
    .sort((a, b) => (b.projected || 0) - (a.projected || 0));
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
  let tp = 0, thru = 0;
  for (let h = 0; h < 18; h++) {
    const n = playerNet(T, roundId, pid, h);
    if (n != null) { tp += n - holes[h].par; thru = h + 1; }
  }
  return { tp, thru };
}

/* ---------- leaderboards ---------- */

export function pairsBoard(T, now) {
  const rows = T.config.pairs.map(pair => {
    let total = 0, today = null, thru = null, played = false, gTotal = 0, gToday = null;
    for (const r of countingRounds(T)) {
      const { tp, thru: th } = ptsPair(T, r.id, pair), g = grossThru(T, r.id, pair);
      if (th > 0) played = true;
      if (phaseOf(T, r.id, now) === 'live') { today = th > 0 ? tp : null; gToday = g.thru > 0 ? g.tp : null; thru = th; }
      if (th > 0) total += tp;
      if (g.thru > 0) gTotal += g.tp;
    }
    return {
      id: pair.id, name: pairName(T, pair),
      members: pair.members.map(id => (person(T, id) || {}).display || '?').join(' + ') || '—',
      today, thru, total, played, gTotal, gToday,
    };
  }).filter(r => r.played);
  /* points: most first; level on points, the fewer holes used the better */
  rows.sort((a, b) => (b.total - a.total) || ((a.thru || 0) - (b.thru || 0)));
  const lead = rows.length ? rows[0].total : 0;
  return rows.map((r, i) => ({ ...r, pos: i + 1,
    todayStr: r.today == null ? '—' : String(r.today),
    thruStr: r.thru ? String(r.thru) : '—',
    gap: lead - r.total, gapStr: lead - r.total > 0 ? String(lead - r.total) : '—',
    totalStr: String(r.total), pts: true,
    gTodayStr: r.gToday == null ? '—' : fmtToPar(r.gToday), gTotalStr: fmtToPar(r.gTotal) }));
}

/* ---------- the gap to the leader ----------
   The number a golfer actually talks in. "I am four under" is a fact about
   you; "I am two back" is a fact about the tournament, and it is the one
   that decides whether you are still in it. The leader has no gap — a nought
   there reads as a score, so it is a dash. */
export function gapOf(n) { return n <= 0 ? '—' : '+' + n; }

export function mvpBoard(T, now) {
  const rows = golfers(T).map(p => {
    let total = 0, today = null, thru = null, played = false, gTotal = 0, gToday = null;
    for (const r of countingRounds(T)) {
      const { tp, thru: th } = toParPlayer(T, r.id, p.id), g = grossThru(T, r.id, p.id);
      if (th > 0) played = true;
      if (phaseOf(T, r.id, now) === 'live') { today = th > 0 ? tp : null; gToday = g.thru > 0 ? g.tp : null; thru = th; }
      if (th > 0) total += tp;
      if (g.thru > 0) gTotal += g.tp;
    }
    return { id: p.id, name: p.display, band: p.band, today, thru, total, played, gTotal, gToday };
  }).filter(r => r.played);
  rows.sort((a, b) => a.total - b.total);
  const lead = rows.length ? rows[0].total : 0;
  return rows.map((r, i) => ({ ...r, pos: i + 1,
    bandStr: r.band ? String(r.band) : '—',
    todayStr: r.today == null ? '—' : fmtToPar(r.today),
    thruStr: r.thru ? String(r.thru) : '—',
    gap: r.total - lead, gapStr: gapOf(r.total - lead),
    totalStr: fmtToPar(r.total),
    gTodayStr: r.gToday == null ? '—' : fmtToPar(r.gToday), gTotalStr: fmtToPar(r.gTotal) }));
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

/* The same test at the scale of a whole day. Each had to be true of a ROUND
   rather than of a hole — the hole-shaped ones are OWN_MARKS, and a question
   asked in both places is a question asked twice. */
export const OWNS = [
  { key: 'slow', label: 'Never got going' },
  { key: 'late', label: 'Found it too late' },
  { key: 'putter', label: 'The putter let me down' },
  { key: 'better', label: 'Should have scored better' },
];
const moodOf = k => MOODS.find(m => m.key === k) || null;
const ownOf = k => OWNS.find(m => m.key === k) || null;
export function moodLabel(k) { const m = moodOf(k); return m ? m.label : ''; }
export function ownLabels(keys) {
  return (Array.isArray(keys) ? keys : []).map(ownOf).filter(Boolean).map(o => o.label);
}
const markDef = k => MARKS.find(m => m.key === k) || null;

/* ---------- the same hole, from the inside ----------
 *
 * What the GOLFER marks on a hole, and deliberately not one of the four
 * above. A ref can settle where the ball went; asking a golfer the same
 * question only produces a second answer to arbitrate, and the ref's is the
 * one with a witness. So these four are the things a ref cannot possibly
 * know, however closely they were watching:
 *
 *   two about luck, in both directions — a shot can deserve better than it
 *   got and it can deserve a great deal worse, and only the man who hit it
 *   knows which;
 *
 *   two about fault — whether the trouble came before the swing or during
 *   it. A ref sees a ball in a bunker. Nobody but the player knows it was
 *   the wrong club rather than a bad swing.
 *
 * Every one is a judgement about a shot the card has already recorded, so
 * none of them can contradict anything on it. */
/* Asked in two steps: did it go right or wrong, then which of three. The
   good three were added so a golfer with nothing to complain about has
   something to say; the keys of the first four never change, so a note
   kept before still reads. */
export const OWN_MARKS = [
  { key: 'away', label: 'Got away with it', short: 'Got away', tone: 'good',
    hint: 'deserved a good deal worse' },
  { key: 'pured', label: 'Pured it', short: 'Pured', tone: 'good',
    hint: 'struck exactly as meant' },
  { key: 'clutch', label: 'Clutch', short: 'Clutch', tone: 'good',
    hint: 'made the one that mattered' },
  { key: 'robbed', label: 'Robbed', short: 'Robbed', tone: 'bad',
    hint: 'deserved better than it got' },
  { key: 'club', label: 'Wrong club', short: 'Wrong club', tone: 'bad',
    hint: 'beaten before the swing' },
  { key: 'bottled', label: 'Bottled it', short: 'Bottled', tone: 'bad',
    hint: 'had it, and did not' },
];
export const OWN_KEYS = OWN_MARKS.map(m => m.key);

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
  /* Filtered against the golfer's OWN list, so a note kept before these
     questions changed drops the marks no longer asked for rather than
     showing a word nobody can explain. */
  return Array.isArray(got) ? got.filter(k => OWN_KEYS.includes(k)) : [];
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
  for (const m of (self ? OWN_MARKS : MARKS)) {
    const holes = t[m.key];
    if (!holes || !holes.length) continue;
    bits.push(m.short + ' \u00d7' + holes.length + ' (hole' + (holes.length > 1 ? 's ' : ' ')
      + holes.join(', ') + ')');
  }
  return bits.join('; ');
}

/* ---------- how a hole felt ----------
 *
 * The four marks above are only worth anything if golfers put them on, and
 * nobody opens My Round on a fairway unless something pulls them there. So
 * the book asks — once, on the holes worth asking about, the moment the
 * score lands. A par with nothing to it needs no question; a double or
 * worse, a birdie or better, a hole the ref marked, and the two nominated
 * holes do. Fewer questions is the point: they keep answering the ones
 * they get. */

/** What a score is called, against par. */
export function scoreName(raw, par) {
  const d = raw - par;
  if (raw === 1) return 'an ace';
  if (d <= -3) return 'an albatross';
  if (d === -2) return 'an eagle';
  if (d === -1) return 'a birdie';
  if (d === 0) return 'a par';
  if (d === 1) return 'a bogey';
  if (d === 2) return 'a double';
  if (d === 3) return 'a triple';
  return 'a ' + raw;
}

/** Why a hole is worth asking about, or null when it is not. */
export function feelWhy(T, rid, pid, h) {
  const c = card(T, rid, pid);
  const raw = c ? c.raw[h] : null;
  if (raw == null) return null;
  const hole = courseOf(T, rid).holes[h];
  const cfg = roundCfg(T, rid) || {};
  const d = raw - hole.par;
  if (d >= 2) return 'trouble';
  if (d < 0) return 'good';
  if (holeMarks(T, rid, pid, h).length) return 'marked';
  if (cfg.ctpHole === hole.n || cfg.ldHole === hole.n) return 'nominated';
  return null;
}

/** The holes a golfer should be asked about and has not yet answered on:
 *  scored, worth asking, and carrying none of their own marks or words.
 *  Latest hole first, because that is the one they just walked off. */
export function feelAsks(T, rid, pid) {
  const out = [];
  const n = selfLog(T, rid, pid);
  const holes = courseOf(T, rid).holes;
  const c = card(T, rid, pid);
  if (!c) return out;
  for (let h = 17; h >= 0; h--) {
    const why = feelWhy(T, rid, pid, h);
    if (!why) continue;
    if (selfMarks(T, rid, pid, h).length) continue;
    if (n && n.text && String(n.text[h] || '').trim()) continue;
    out.push({ h, raw: c.raw[h], par: holes[h].par, why });
  }
  return out;
}

/** A golfer's own round so far: how many holes they have marked of those
 *  played, each mark with its holes, and the last thing they wrote. */
export function feelTally(T, rid, pid) {
  const c = card(T, rid, pid);
  const n = selfLog(T, rid, pid);
  let played = 0, marked = 0, last = null;
  for (let h = 0; h < 18; h++) {
    if (c && c.raw[h] != null) played++;
    const ks = selfMarks(T, rid, pid, h);
    const tx = n && n.text ? String(n.text[h] || '').trim() : '';
    if (ks.length || tx) marked++;
    if (tx) last = { h, text: tx };
  }
  const t = markTally(T, rid, pid, true);
  const counts = OWN_MARKS.map(m => ({ ...m, holes: t[m.key] || [] })).filter(m => m.holes.length);
  return { played, marked, counts, last };
}

/** What the golfers said about the holes, for the writer. Two sources,
 *  kept apart on purpose: the ref's marks are what somebody standing there
 *  wrote down, and the self log is what a golfer said about their own
 *  hole. They are different kinds of claim and the recap must not treat
 *  them as one. The coverage line is the important one: marks are made on
 *  the holes somebody remembered to mark, which is never all of them, so
 *  every count is a floor and never a total. */
export function feelBlock(T, rid) {
  const L = [];
  const holes = courseOf(T, rid).holes;
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

  /* each golfer, hole by hole: the score beside the feeling, so the writer
     can say WHAT the seven felt like rather than only that there was one */
  const said = [];
  const byHole = {};          // mark -> hole -> who
  for (const p of golfers(T)) {
    const n = selfLog(T, rid, p.id);
    if (!n) continue;
    const c = card(T, rid, p.id);
    const hs = [];
    for (let h = 0; h < 18; h++) {
      const ks = selfMarks(T, rid, p.id, h);
      const tx = n.text ? String(n.text[h] || '').trim() : '';
      if (!ks.length && !tx) continue;
      const raw = c ? c.raw[h] : null;
      const score = raw == null ? 'not scored' : scoreName(raw, holes[h].par) + ' (' + raw + ' on a par ' + holes[h].par + ')';
      const words = ks.map(k => (OWN_MARKS.find(m => m.key === k) || {}).label || k);
      hs.push('hole ' + (h + 1) + ', ' + score + ': ' + [words.join(', '), tx ? '"' + tx + '"' : ''].filter(Boolean).join(' — '));
      ks.forEach(k => { (byHole[k] = byHole[k] || {})[h] = (byHole[k][h] || []).concat(p.display); });
    }
    const bits = [];
    if (n.mood) bits.push('felt like: ' + moodLabel(n.mood));
    const owns = ownLabels(n.owns);
    if (owns.length) bits.push('owns up to: ' + owns.join(', '));
    const say = String(n.say || '').trim();
    if (say) bits.push('on the round: "' + say + '"');
    if (!hs.length && !bits.length) continue;
    said.push('- ' + p.display + ':' + (hs.length ? '\n    ' + hs.join('\n    ') : '') + (bits.length ? '\n    ' + bits.join('; ') : ''));
  }
  if (said.length) {
    L.push('\nWHAT THE GOLFERS SAID ABOUT THEIR OWN ROUNDS');
    L.push('Self-reported, and deliberately about things the ref CANNOT see —');
    L.push('whether a hole deserved better or a good deal worse, whether the');
    L.push('trouble came before the swing or during it, how the round felt.');
    L.push('None of it can contradict the card, because none of it is a claim');
    L.push('about a fact. Where a golfer\'s account and the marks pull apart,');
    L.push('that gap is the best material on this page — a man who three-putted');
    L.push('twice and called it robbery has told you something. Attribute it to');
    L.push('them; never restate it as established fact.');
    L.push(...said);
    /* the course as the golfers felt it: which hole robbed the most of
       them, which the most got away with — the one thing no single card
       can say */
    const agg = [];
    for (const m of OWN_MARKS) {
      const at = byHole[m.key]; if (!at) continue;
      const rows = Object.keys(at).map(Number).sort((a, b) => at[b].length - at[a].length || a - b);
      const top = rows[0];
      if (at[top].length >= 2) agg.push('- "' + m.label + '" most on hole ' + (top + 1) + ': ' + at[top].join(', '));
    }
    if (agg.length) {
      L.push('\nHOW THE HOLES FELT, ACROSS THE FIELD (by their own account)');
      L.push(...agg);
    }
  }
  return L;
}

/** One round's Bingo Bango Bongo, by golfer, with the three counted apart. */
export function bbbRoundBoard(T, rid) {
  const tally = {};
  const b = T.bbb[rid];
  if (b) for (const cell of b.holes) {
    if (!cell) continue;
    /* a group's set each, or the one set the old shape kept for the hole */
    const sets = cell.g && typeof cell.g === 'object' ? Object.values(cell.g) : [cell];
    for (const c of sets) for (const k of BBB_SLOTS) {
      if (!c || !c[k]) continue;
      const t = tally[c[k]] || (tally[c[k]] = { pts: 0, bingo: 0, bango: 0, bongo: 0 });
      t.pts++; t[k]++;
    }
  }
  const rows = Object.entries(tally).map(([pid, t]) => ({ id: pid, name: (person(T, pid) || {}).display || '?', ...t }));
  rows.sort((a, b) => b.pts - a.pts || a.name.localeCompare(b.name));
  return rows.map((r, i) => ({ ...r, pos: i + 1 }));
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
  L.push('A handicap is the strokes a golfer receives over the round: one a hole up to the handicap, and a second on the lowest stroke indexes for anything over eighteen.');

  L.push('\nROSTER');
  for (const p of golfers(T)) {
    L.push('- ' + p.display + ' (golfer, handicap ' + (p.band == null ? 'not set' : p.band)
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
    L.push('\nTEAM COMPETITION (four-ball Stableford points, counting rounds; ' + teamAllowance(T) + '% handicap allowance)');
    pb.slice(0, 8).forEach(x => L.push('- ' + x.pos + '. ' + x.name + ' ' + x.totalStr + ' pts'));
  }
  const mb = mvpBoard(T, now).filter(x => x.played);
  if (mb.length) {
    L.push('\nMVP');
    mb.slice(0, 8).forEach(x => L.push('- ' + x.pos + '. ' + x.name + ' ' + x.totalStr));
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
    const times = teeTimes(T, r.id).map(to12);
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
      L.push('- ' + r.short + ': closest ' + (nm(c.ctpWinner) || 'nobody')
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
    const { tp, thru } = toParPlayer(T, rid, p.id);
    const gross = c.raw.reduce((a, v) => a + (v || 0), 0);
    L.push('- ' + p.display + ' (band ' + (p.band == null ? 'none' : p.band) + '): '
      + 'holes ' + c.raw.map(v => (v == null ? '-' : v)).join(',')
      + ' | gross ' + gross + ', net to par ' + fmtToPar(tp) + ', thru ' + thru);
  }

  L.push(...feelBlock(T, rid));

  const b = T.bbb[rid];
  if (b) {
    const tally = {};
    b.holes.forEach(cell => bbbMarks(cell).forEach(pid => { tally[pid] = (tally[pid] || 0) + 1; }));
    const line = Object.entries(tally).map(([pid, n]) => ((person(T, pid) || {}).display || '?') + ' ' + n);
    if (line.length) L.push('Bingo Bango Bongo: ' + line.join(', '));
  }
  const c = roundCfg(T, rid);
  const nm = id => (person(T, id) || {}).display || null;
  /* No distance: the flag in the green is the mark, so there is nothing to
     write down but the name. */
  if (c.ctpWinner) L.push('Closest to the pin: ' + nm(c.ctpWinner));
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

/** The leading pair's round, hole by hole: the points, and against par
 *  the way the colours read (two is level, three is under, one is over). */
export function ribbon(T, rid) {
  const board = pairRoundBoard(T, rid);
  const lead = board[0];
  const holes = courseOf(T, rid).holes;
  const pair = lead && (T.config.pairs || []).find(p => p.id === lead.id);
  return holes.map((h, i) => {
    const n = pair ? pairHole(T, rid, pair, i) : null, pts = pair ? pairPts(T, rid, pair, i) : null;
    return { n: h.n, par: h.par, net: n, pts, d: pts == null ? null : 2 - pts };
  });
}

/** One round's pairs, by points for that round alone. */
export function pairRoundBoard(T, rid) {
  const rows = (T.config.pairs || []).map(pair => {
    const { tp, thru } = ptsPair(T, rid, pair);
    return { id: pair.id, name: pairName(T, pair), today: tp, thru, pts: true };
  }).filter(r => r.thru > 0);
  rows.sort((a, b) => (b.today - a.today) || (a.thru - b.thru));
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
    const g = grossThru(T, rid, pair);
    return {
      id: pair.id,
      name: pairName(T, pair),
      today: t ? t.today : null,
      total: w && w.played ? w.total : null,
      thru: t ? t.thru : 0,
      /* raw beside net: the better of the two raw scores, hole by hole */
      todayRaw: g.thru > 0 ? g.tp : null,
      totalRaw: w && w.played ? w.gTotal : null,
    };
  }).filter(r => r.thru > 0 || r.total != null);
  rows.sort((a, b) => ((b.total == null ? -1 : b.total) - (a.total == null ? -1 : a.total))
    || ((b.today == null ? -1 : b.today) - (a.today == null ? -1 : a.today)));
  return rows.map((r, i) => ({ ...r, pos: i + 1, pts: true }));
}

/** Every card from one round: the strokes, raw to par, and net to par with
 *  the band's strokes and the cap. A counting round is read net first; the
 *  practice day, which is scored gross, raw first. */
export function recapField(T, rid) {
  const r = roundDef(rid) || {};
  const rows = golfers(T).map(p => {
    const g = grossThru(T, rid, p.id), n = toParThru(T, rid, p.id, 18);
    return { id: p.id, name: p.display, band: p.band, strokes: g.strokes, raw: g.tp, net: n.thru > 0 ? n.tp : null, thru: g.thru };
  }).filter(x => x.thru > 0);
  rows.sort((a, b) => r.counts
    ? ((a.net == null) - (b.net == null)) || (a.net - b.net) || (a.raw - b.raw)
    : (a.raw - b.raw) || ((a.net == null ? 99 : a.net) - (b.net == null ? 99 : b.net)));
  return rows.map((x, i) => ({ ...x, pos: i + 1 }));
}

/** The biggest gap, in points, the leaders opened on the third-placed pair in one stretch. */
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
    const a = pairPts(T, rid, lead, h), b = pairPts(T, rid, third, h);
    if (a == null || b == null) { run = 0; start = null; continue; }
    const d = a - b;
    if (d > 0) { if (start == null) start = h; run += d; if (run > best.gap) best = { gap: run, from: start, to: h }; }
    else { run = 0; start = null; }
  }
  if (!best.gap) return null;
  return { shots: best.gap, pts: true, fromHole: holes[best.from].n, toHole: holes[best.to].n };
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
    ctp: cfg.ctpWinner ? { who: nm(cfg.ctpWinner), note: '', hole: cfg.ctpHole } : null,
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
  L.push('Format: ' + (r.counts ? 'Four-Ball Stableford for the teams (each partner scores points against par off ' + teamAllowance(T)
    + '% of their handicap: net bogey 1, par 2, birdie 3, eagle 4; the better partner\'s points count on each hole), net stroke play for the MVP' : 'practice, counts for nothing') + '.');
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

  L.push('\nPAIRS THIS ROUND (Stableford points, more is better)');
  pairRoundBoard(T, rid).forEach(x => L.push('- ' + x.id + ' ' + x.name + ': ' + x.today + ' pts thru ' + x.thru));

  L.push('\nTHE WEEK AFTER THIS ROUND (points)');
  recapTable(T, rid, now).forEach(x => L.push('- ' + x.id + ' ' + x.name + ': today '
    + (x.today == null ? '-' : x.today + ' pts') + ', total ' + (x.total == null ? '-' : x.total + ' pts')));

  const sg = sideGames(T, rid);
  L.push('\nSIDE GAMES');
  if (sg.ctp) L.push('- Closest to the pin, hole ' + sg.ctp.hole + ': ' + sg.ctp.who + ' ' + sg.ctp.note);
  if (sg.ld) L.push('- Longest drive, hole ' + sg.ld.hole + ': ' + sg.ld.who + ' ' + sg.ld.note);
  if (sg.bbb) L.push('- Bingo Bango Bongo: ' + sg.bbb.who + ' ' + sg.bbb.note);
  L.push('- Triple-bogey cap hit ' + sg.caps + ' times today.');

  const sw = swingOfTheDay(T, rid);
  if (sw) L.push('\nSWING: the leaders took ' + sw.shots + ' points out of third place between holes '
    + sw.fromHole + ' and ' + sw.toHole + '.');

  /* what the golfers said: the marks the ref made and the feelings the
     golfers kept, hole by hole, beside the scores they go with */
  L.push(...feelBlock(T, rid));

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

/** A cup match, hole by hole — what each side actually did, and who took it.
 *
 *  matchPlay() answers "who is up"; this answers "why", which is the only
 *  question anybody asks about a match they were not in. Same arithmetic,
 *  the working shown: gross, the cap, the strokes the band gives on that
 *  hole's index, the net, and the running state after it. */
export function matchDetail(T, rid, aId, bId) {
  const holes = courseOf(T, rid).holes;
  const A = person(T, aId), B = person(T, bId);
  const ca = card(T, rid, aId), cb = card(T, rid, bId);
  const cap = T.config.capOver;
  const rows = [];
  let up = 0, thru = 0, result = null, closedAt = null;
  let wonA = 0, wonB = 0, halved = 0;
  for (let h = 0; h < 18; h++) {
    const na = playerNet(T, rid, aId, h), nb = playerNet(T, rid, bId, h);
    if (na == null || nb == null) break;
    thru = h + 1;
    const took = na < nb ? 'a' : nb < na ? 'b' : null;
    if (took === 'a') { up++; wonA++; } else if (took === 'b') { up--; wonB++; } else halved++;
    const gA = ca ? ca.raw[h] : null, gB = cb ? cb.raw[h] : null;
    rows.push({
      n: holes[h].n, par: holes[h].par, si: holes[h].si,
      aGross: gA, bGross: gB,
      aCapped: capped(gA, holes[h].par, cap) !== gA,
      bCapped: capped(gB, holes[h].par, cap) !== gB,
      aStrokes: strokesFor(A && A.band, holes[h].si),
      bStrokes: strokesFor(B && B.band, holes[h].si),
      aNet: na, bNet: nb, took, up,
    });
    const left = 18 - thru;
    if (Math.abs(up) > left) { result = Math.abs(up) + '&' + left; closedAt = holes[h].n; break; }
  }
  const done = result != null || thru === 18;
  return {
    a: { id: aId, name: (A || {}).display || '?', band: (A || {}).band || null, squad: 'UK' },
    b: { id: bId, name: (B || {}).display || '?', band: (B || {}).band || null, squad: 'USA' },
    rows, up, thru, result, closedAt, wonA, wonB, halved, done,
    side: up > 0 ? 'UK' : up < 0 ? 'USA' : null,
    /* What the match is worth, as it stands. A match still out is worth
       nothing yet — that is the point of saying how many are still out. */
    points: !done ? null : up === 0 ? { uk: 0.5, usa: 0.5 } : up > 0 ? { uk: 1, usa: 0 } : { uk: 0, usa: 1 },
  };
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

/* ---------------- the clubhouse ----------------
 *
 * Six games run at once, and the book used to make you tap six tabs to find
 * out where any of them stood — with the answer to each one buried under the
 * reference material for that game. This is every game in one reading: who
 * leads, by how much, and how far through.
 *
 * It is a SUMMARY and nothing else. Every figure in it comes from the same
 * board function that draws the full table, so the front page and the board
 * behind it can never disagree.
 */
export function clubhouse(T, now) {
  const live = countingRounds(T).find(r => phaseOf(T, r.id, now) === 'live');
  const thru = (rows) => { const r = rows.find(x => x.thru); return r ? r.thru : null; };
  /* "by 2" needs a second row to be ahead OF; a field of one is not a lead. */
  const margin = (rows, key) => rows.length > 1 ? Math.abs(rows[1][key] - rows[0][key]) : null;

  const out = [];

  /* THE CUP FIRST. It is the only one of the six with a clock on it — points
     that can still change hands this session — so it is the headline. */
  const R = ryderData(T, now);
  const played = R.sessions.reduce((n, s) => n + s.matches.filter(m => m.done).length, 0);
  const total = R.sessions.reduce((n, s) => n + s.matches.length, 0);
  const toWin = total ? Math.floor(total / 2) + (total % 2 ? 0.5 : 1) : null;
  out.push({ id: 'ryder', kind: 'cup', label: 'Ryder Cup',
    state: total && played === total ? 'closed' : played ? 'live' : 'open',
    uk: R.ukTotal, usa: R.usaTotal, outstanding: total - played, toWin,
    note: !total ? 'Put golfers in both squads'
        : played === total ? 'All matches in'
        : (total - played) + ' match' + (total - played === 1 ? '' : 'es') + ' still out' });

  const pairs = pairsBoard(T, now);
  out.push({ id: 'pairs', label: 'Team Competition', state: pairs.length ? (live ? 'live' : 'open') : 'empty',
    who: pairs.length ? pairs[0].name : null, fig: pairs.length ? pairs[0].totalStr + ' pts' : null,
    tone: pairs.length ? 'pts' : '',
    thru: thru(pairs), by: margin(pairs, 'total'),
    runner: pairs.length > 1 ? pairs[1].name : null,
    note: pairs.length ? null : 'Opens once a counting round is under way' });

  const mvp = mvpBoard(T, now);
  out.push({ id: 'mvp', label: 'MVP', state: mvp.length ? (live ? 'live' : 'open') : 'empty',
    who: mvp.length ? mvp[0].name : null, fig: mvp.length ? mvp[0].totalStr : null,
    tone: mvp.length ? toneOf(mvp[0].total) : '',
    thru: thru(mvp), by: margin(mvp, 'total'),
    runner: mvp.length > 1 ? mvp[1].name : null,
    note: mvp.length ? null : 'Every golfer needs a handicap before their card counts' });

  const bbb = bbbBoard(T);
  const banked = bbb.reduce((n, r) => n + r.pts, 0);
  out.push({ id: 'bbb', label: 'Bingo Bango Bongo', state: banked ? 'live' : 'empty',
    who: bbb.length ? bbb[0].name : null, fig: bbb.length ? bbb[0].ptsStr : null,
    by: margin(bbb, 'pts'), runner: bbb.length > 1 ? bbb[1].name : null,
    sub: banked ? banked + ' of ' + (countingRounds(T).length * 54) + ' banked' : null,
    note: banked ? null : 'Scorers tap three names a hole on Score Entry' });

  /* Two marks a round, and the only one of the six that is a list of facts
     rather than a race. What it reports is how much of it is settled. */
  const marks = [];
  for (const r of countingRounds(T)) {
    const c = roundCfg(T, r.id) || {};
    marks.push({ kind: 'ctp', round: r, hole: c.ctpHole, who: c.ctpWinner });
    marks.push({ kind: 'ld', round: r, hole: c.ldHole, who: c.ldWinner, dist: c.ldDist });
  }
  const got = marks.filter(m => m.who);
  const lastLd = [...marks].reverse().find(m => m.kind === 'ld' && m.who);
  out.push({ id: 'prizes', label: 'Drives & Pins',
    state: !got.length ? 'empty' : got.length === marks.length ? 'closed' : 'open',
    who: lastLd ? (person(T, lastLd.who) || {}).display : (got.length ? (person(T, got[got.length - 1].who) || {}).display : null),
    fig: lastLd && lastLd.dist ? lastLd.dist : null,
    sub: got.length + ' of ' + marks.length + ' marks in',
    note: got.length ? null : 'Nominate the holes on Score Entry' });

  const prac = practiceBoard(T);
  const read = bandRead(T, 'practice');
  const moves = read.filter(x => x.verdict === 'light' || x.verdict === 'heavy').length;
  out.push({ id: 'practice', label: 'Practice Day',
    state: prac.length ? (phaseOf(T, 'practice', now) === 'live' ? 'live' : 'closed') : 'empty',
    who: prac.length ? prac[0].name : null,
    fig: prac.length ? fmtToPar(prac[0].tp) : null,
    tone: prac.length ? toneOf(prac[0].tp) : '',
    sub: 'Counts for nothing' + (moves ? ' · ' + moves + ' band' + (moves === 1 ? '' : 's') + ' to move' : ''),
    note: prac.length ? null : 'No cards in from Tuesday yet' });

  return out;
}

/** Under par, over it, or level — the one word the colour is keyed off. */
export function toneOf(n) { return n < 0 ? 'under' : n > 0 ? 'over' : 'level'; }

/* ---------- scorecard strip ---------- */

export function holeCells(T, roundId, pair) {
  const holes = courseOf(T, roundId).holes;
  return holes.map((hole, h) => {
    const s = pairHole(T, roundId, pair, h), pts = pairPts(T, roundId, pair, h);
    const d = pts == null ? null : 2 - pts;
    return { n: h + 1, par: hole.par, si: hole.si, d, pts, played: s != null, net: s, label: pts == null ? '' : pts + ' pt' + (pts === 1 ? '' : 's') };
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
    for (const g of groups(T, r.id)) {
      const at = g.time;
      if (!at) continue;
      const mins = hhmmToMin(at);
      if (d.iso > now.iso || (d.iso === now.iso && mins >= now.minutes)) {
        const key = d.iso + ' ' + at;
        if (!best || key < best.key) best = { key, round: r, day: d, time: at };
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
      title: r.full + ' — ' + COURSES[r.course].name, short: r.short, rid: r.id, dayIdx: r.dayIdx });
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
