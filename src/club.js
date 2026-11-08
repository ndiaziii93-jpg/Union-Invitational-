/* The Union Invitational — the Clubhouse: the season between tournaments.
 *
 * Pure functions over the book. Nothing here touches the DOM or the wire.
 * The season lives in the `club/` rows of the shared book:
 *
 *   club/season            the season itself: phase, stops, packages, rooms,
 *                          deadlines, the week's window — the master's row
 *   club/signup__<pid>     In / Maybe / Out, the package, the shirt — the
 *                          person's own row
 *   club/money__<pid>      what has been paid against the package — the
 *                          master's row, read by everyone
 *   club/travel__<pid>     flights out and back — the person's own row
 *   club/course__<pid>     the home course, entered once, approved by the
 *                          master
 *   club/card__<stop>__<pid>  a virtual round: eighteen gross scores, the
 *                          handicap it was played off, the photo of the
 *                          signed card
 *
 * The 2026 book (Belek) stays exactly where it is, under its own paths, and
 * is read from there: the season adds rows beside it and never moves one. */
import { strokesFor, stablefordPts } from './engine.js';

/* ---------- the season, with its defaults ---------- */

/* The sheet's own names, carried over. Windows are the commissioner's to
   move; these are the month each one has always been played in. */
export const STOPS_SEED = [
  { id: 'mulligan',   name: 'The Merry Mulligan Open',   from: '2026-12-01', to: '2026-12-31', format: 'stableford', note: 'The reveal. Eighteen holes at home, net Stableford, a mulligan a nine.' },
  { id: 'frostbite',  name: 'The Frostbite Open',        from: '2027-01-09', to: '2027-01-31', format: 'stableford', note: 'Eighteen holes in whatever January gives you. Net Stableford.' },
  { id: 'sweetheart', name: 'The Sweetheart Scramble',   from: '2027-02-01', to: '2027-02-28', format: 'stableford', note: 'Eighteen holes with a partner of your choosing beside you. Your own card counts.' },
];

export const PACKAGES_SEED = [
  { id: '7g', name: '7 nights · golfer',          nights: 7, golf: true,  price: 0, inc: ['7 nights at the hotel', 'Two practice days and three rounds', 'Merch and the trophies'] },
  { id: '7n', name: '7 nights · not golfing',     nights: 7, golf: false, price: 0, inc: ['7 nights at the hotel', 'The partners’ 9 and the dinners', 'Merch'] },
  { id: '5g', name: '5 nights · golfer',          nights: 5, golf: true,  price: 0, inc: ['5 nights at the hotel', 'Three rounds', 'Merch and the trophies'] },
  { id: '5n', name: '5 nights · not golfing',     nights: 5, golf: false, price: 0, inc: ['5 nights at the hotel', 'The partners’ 9 and the dinners', 'Merch'] },
  { id: '7w', name: '7 nights · women’s division', nights: 7, golf: true,  price: 0, inc: ['7 nights at the hotel', 'The women’s 18 and the practice days', 'Merch and the trophies'] },
];

/* Points a stop pays into the Order of Merit, first place down. */
export const MERIT = [100, 60, 40, 30, 25, 20, 15, 12, 10, 8, 6, 5, 4, 3, 2, 1];

export const VENDORS_SEED = [
  { k: 'hotel',   name: 'Hotel',        status: 'Quotes to ask', due: '' },
  { k: 'courses', name: 'Courses',      status: 'Tee times to ask', due: '' },
  { k: 'rentals', name: 'Club rentals', status: 'To ask', due: '' },
  { k: 'merch',   name: 'Merch and trophies', status: 'To design', due: '' },
];

export function seasonDefaults() {
  return {
    id: '2027',
    name: 'Las Vegas 2027',
    tag: 'A Desert Showdown',
    place: 'Las Vegas, Nevada',
    window: { from: '2027-11-13', to: '2027-11-21', locked: false },
    phase: 'week',          // 'club' between tournaments · 'week' when the book is the tournament
    frozen: false,          // the 2026 book is closed to every write
    opened: null,
    deadlines: { deposit: '2027-03-31', balance: '2027-08-03' },
    currency: '£',
    packages: PACKAGES_SEED.map(p => ({ ...p, inc: [...p.inc] })),
    stops: STOPS_SEED.map(s => ({ ...s })),
    rooms: [],
    vendors: VENDORS_SEED.map(v => ({ ...v })),
    archive: { '2026': { name: 'Belek 2026', venue: 'Titanic Deluxe Golf Belek', place: 'Antalya, Türkiye', from: '2026-10-26', to: '2026-11-02' } },
  };
}

/** The season as the book holds it, defaults filled in. */
export function season(T) {
  const base = seasonDefaults();
  const held = (T && T.club && T.club.season) || null;
  if (!held) return base;
  const out = { ...base, ...held };
  out.window = { ...base.window, ...(held.window || {}) };
  out.deadlines = { ...base.deadlines, ...(held.deadlines || {}) };
  out.packages = Array.isArray(held.packages) ? held.packages : base.packages;
  out.stops = Array.isArray(held.stops) ? held.stops : base.stops;
  out.rooms = Array.isArray(held.rooms) ? held.rooms : [];
  out.vendors = Array.isArray(held.vendors) ? held.vendors : base.vendors;
  out.archive = { ...base.archive, ...(held.archive || {}) };
  return out;
}
export const phaseOf = T => (T && T.club && T.club.season && T.club.season.phase) === 'club' ? 'club' : 'week';
export const frozen = T => !!(T && T.club && T.club.season && T.club.season.frozen);

/* ---------- dates ---------- */

export const isoToday = ms => new Date(ms == null ? Date.now() : ms).toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
export function fmtDay(iso, opt) {
  if (!iso) return '—';
  const d = new Date(iso + 'T12:00:00Z');
  if (isNaN(d)) return iso;
  const day = d.getUTCDate(), mon = d.toLocaleString('en-GB', { month: opt && opt.long ? 'long' : 'short', timeZone: 'UTC' });
  return day + ' ' + mon + (opt && opt.year ? ' ' + d.getUTCFullYear() : '');
}
export const dowOf = iso => { const d = new Date(iso + 'T12:00:00Z'); return isNaN(d) ? '' : d.toLocaleString('en-GB', { weekday: 'long', timeZone: 'UTC' }); };

/* ---------- stops ---------- */

export function stopState(stop, today) {
  if (!stop || !stop.from || !stop.to) return 'upcoming';
  if (today < stop.from) return 'upcoming';
  if (today > stop.to) return 'closed';
  return 'open';
}
export const stops = T => season(T).stops.slice().sort((a, b) => String(a.from).localeCompare(String(b.from)));
export const stopById = (T, id) => season(T).stops.find(s => s.id === id) || null;
export const openStops = (T, today) => stops(T).filter(s => stopState(s, today) === 'open');
export const nextStop = (T, today) => stops(T).find(s => stopState(s, today) === 'upcoming') || null;
export const closedStops = (T, today) => stops(T).filter(s => stopState(s, today) === 'closed');
/** The stop the season is "at": the open one, else the next, else the last. */
export function currentStop(T, today) {
  const all = stops(T);
  return openStops(T, today)[0] || nextStop(T, today) || all[all.length - 1] || null;
}

/* ---------- people ---------- */

export const golfers = T => (T.config.people || []).filter(p => p.role === 'golfer');
export const everyone = T => (T.config.people || []).filter(p => p.role !== 'official' || true);
export const person = (T, pid) => (T.config.people || []).find(p => p.id === pid) || null;

/* ---------- the home course ---------- */

export function blankCourse(pid) {
  return { pid, name: '', tee: '', holes: Array.from({ length: 18 }, (_, i) => ({ par: 4, si: i + 1, y: null })), approved: false, at: null };
}
export const courseOf = (T, pid) => (T.club && T.club['course__' + pid]) || null;
export function courseOk(c) {
  if (!c || !c.name || !Array.isArray(c.holes) || c.holes.length !== 18) return false;
  const sis = c.holes.map(h => +h.si);
  return c.holes.every(h => [3, 4, 5, 6].includes(+h.par)) && new Set(sis).size === 18 && sis.every(s => s >= 1 && s <= 18);
}
export const coursePar = c => (c && c.holes ? c.holes.reduce((a, h) => a + (+h.par || 0), 0) : 0);

/* ---------- cards and points ---------- */

export const cardKey = (stop, pid) => 'card__' + stop + '__' + pid;
export const cardOf = (T, stop, pid) => (T.club && T.club[cardKey(stop, pid)]) || null;
export function blankClubCard(stop, pid, hcp, course) {
  return { stop, pid, raw: Array(18).fill(null), hcp, course: course ? { name: course.name, tee: course.tee, holes: course.holes.map(h => ({ par: +h.par, si: +h.si })) } : null, photo: null, at: null, done: false };
}
export const capFor = par => par + 3;

/** Points on a hole: net Stableford off the handicap the card was played off. */
export function holePts(card, h) {
  if (!card || !card.course || !card.course.holes || card.raw[h] == null) return null;
  const hole = card.course.holes[h];
  const raw = Math.min(card.raw[h], capFor(hole.par));
  const st = strokesFor(Math.round(card.hcp == null ? 0 : card.hcp), hole.si) || 0;
  return stablefordPts(raw - st, hole.par);
}
export function cardTotals(card) {
  let pts = 0, gross = 0, thru = 0, back = 0, par = 0;
  if (!card || !card.course) return { pts: 0, gross: 0, thru: 0, back: 0, toPar: null, par: 0 };
  for (let h = 0; h < 18; h++) {
    const p = holePts(card, h);
    if (p == null) continue;
    pts += p; thru++; gross += card.raw[h]; par += card.course.holes[h].par;
    if (h >= 9) back += p;
  }
  return { pts, gross, thru, back, toPar: thru ? gross - par : null, par };
}

/** Everybody's card on a stop, best first: points, then the back nine, then the handicap (lower wins). */
export function stopBoard(T, stopId) {
  const rows = [];
  for (const g of golfers(T)) {
    const c = cardOf(T, stopId, g.id);
    if (!c) continue;
    const t = cardTotals(c);
    if (!t.thru) continue;
    rows.push({ pid: g.id, name: g.display || g.name, card: c, ...t, done: !!c.done && t.thru === 18, course: c.course ? c.course.name : '' });
  }
  rows.sort((a, b) => b.pts - a.pts || b.back - a.back || (a.card.hcp || 0) - (b.card.hcp || 0) || a.name.localeCompare(b.name));
  let pos = 0, last = null;
  rows.forEach((r, i) => { if (r.pts !== last) { pos = i + 1; last = r.pts; } r.pos = pos; r.tie = rows.filter(x => x.pts === r.pts).length > 1; });
  return rows;
}
export const stopWinner = (T, stopId) => stopBoard(T, stopId)[0] || null;

/** The Order of Merit: every closed stop pays its places. */
export function merit(T, today) {
  const pts = {}, wins = {}, played = {};
  for (const s of closedStops(T, today)) {
    const board = stopBoard(T, s.id);
    board.forEach(r => {
      pts[r.pid] = (pts[r.pid] || 0) + (MERIT[r.pos - 1] || 0);
      played[r.pid] = (played[r.pid] || 0) + 1;
      if (r.pos === 1) wins[r.pid] = (wins[r.pid] || 0) + 1;
    });
  }
  const rows = golfers(T).map(g => ({ pid: g.id, name: g.display || g.name, pts: pts[g.id] || 0, wins: wins[g.id] || 0, played: played[g.id] || 0 }))
    .filter(r => r.played)
    .sort((a, b) => b.pts - a.pts || b.wins - a.wins || a.name.localeCompare(b.name));
  let pos = 0, last = null;
  rows.forEach((r, i) => { if (r.pts !== last) { pos = i + 1; last = r.pts; } r.pos = pos; });
  return rows;
}

/* ---------- the Union handicap ----------
   Seeded by the Belek band. Each finished card leaves a differential: the
   handicap it was played off plus how far the points fell short of 36 (or
   minus how far over). Once three cards are in, the handicap is the mean of
   the best three of the last six, at 96%, to a decimal; the playing
   handicap is that rounded. Until then it is the seed. */
export function diffOf(card) {
  const t = cardTotals(card);
  if (t.thru < 18) return null;
  return Math.round(((card.hcp == null ? 0 : +card.hcp) + (36 - t.pts)) * 10) / 10;
}
export function unionHcp(T, pid, today) {
  const p = person(T, pid);
  const seed = p && p.band != null ? +p.band : null;
  const cards = stops(T).map(s => cardOf(T, s.id, pid)).filter(c => c && c.done && cardTotals(c).thru === 18);
  const diffs = cards.map(diffOf).filter(d => d != null);
  const last6 = diffs.slice(-6);
  if (last6.length < 3) return { hcp: seed, from: seed == null ? 'none' : 'belek', n: diffs.length, diffs: last6, need: 3 - last6.length };
  const best = last6.slice().sort((a, b) => a - b).slice(0, 3);
  const hcp = Math.round((best.reduce((a, b) => a + b, 0) / best.length) * 0.96 * 10) / 10;
  return { hcp: Math.max(0, Math.min(45, hcp)), from: 'season', n: diffs.length, diffs: last6, need: 0, seed };
}
export const playingOf = (T, pid, today) => { const u = unionHcp(T, pid, today); return u.hcp == null ? null : Math.round(u.hcp); };

/* ---------- divisions ---------- */

export const DIVISIONS = [['men', 'Tournament · men’s'], ['women', 'Tournament · women’s'], ['none', 'Not golfing']];
/** Men's, women's, or not golfing: the sign-up's word first, the roster's second. */
export function divisionOf(T, pid) {
  const s = signupOf(T, pid), p = person(T, pid);
  if (s && ['men', 'women', 'none'].includes(s.division)) return s.division;
  if (p && (p.division === 'men' || p.division === 'women')) return p.division;
  return p && p.role === 'golfer' ? 'men' : p ? 'none' : null;
}
export const divisionLabel = d => (DIVISIONS.find(x => x[0] === d) || [])[1] || '—';

/* ---------- Vegas HQ ---------- */

export const signupOf = (T, pid) => (T.club && T.club['signup__' + pid]) || null;
export const travelOf = (T, pid) => (T.club && T.club['travel__' + pid]) || null;
export const moneyOf = (T, pid) => (T.club && T.club['money__' + pid]) || null;
export const packageOf = (T, id) => season(T).packages.find(p => p.id === id) || null;

export function field(T) {
  const out = { in: [], maybe: [], out: [], unanswered: [] };
  for (const p of (T.config.people || []).filter(x => x.role !== 'official')) {
    const s = signupOf(T, p.id);
    const st = s && ['in', 'maybe', 'out'].includes(s.status) ? s.status : null;
    (st ? out[st] : out.unanswered).push({ ...p, signup: s });
  }
  return out;
}

/** What a person owes and has paid: the package price (or the master's own figure), the payments, the meter. */
export function ledger(T, pid) {
  const s = signupOf(T, pid), m = moneyOf(T, pid);
  const pkg = s && s.pkg ? packageOf(T, s.pkg) : null;
  const price = m && m.price != null && m.price !== '' ? +m.price : pkg ? +pkg.price || 0 : 0;
  const pays = (m && Array.isArray(m.pays) ? m.pays : []).filter(x => Number.isFinite(+x.amt));
  const paid = Math.round(pays.reduce((a, x) => a + +x.amt, 0) * 100) / 100;
  const left = Math.max(0, Math.round((price - paid) * 100) / 100);
  return { pid, pkg, price, paid, left, pays, pct: price > 0 ? Math.min(1, paid / price) : 0, settled: price > 0 && paid >= price };
}
export function fmtMoney(n, cur) {
  const v = Math.round((+n || 0) * 100) / 100;
  const s = v.toLocaleString('en-GB', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return (cur || '£') + s;
}

/** The checklist a person's line is made of, for the Ready dial. */
export function lineOf(T, pid) {
  const s = signupOf(T, pid), t = travelOf(T, pid), L = ledger(T, pid), p = person(T, pid);
  const room = season(T).rooms.find(r => (r.members || []).includes(pid)) || null;
  const items = [
    { k: 'in',      label: 'In for Vegas',    ok: !!s && s.status === 'in', val: !s ? 'Not answered' : s.status === 'in' ? 'Yes' : s.status === 'maybe' ? 'Maybe' : 'Out' },
    { k: 'division', label: 'Playing',        ok: !!(s && s.division) || (p && p.division), val: divisionLabel(divisionOf(T, pid)) + (!(s && s.division) && !(p && p.division) ? ' · confirm' : '') },
    { k: 'pkg',     label: 'Package',         ok: !!(L.pkg), val: L.pkg ? L.pkg.name : 'Pick one' },
    { k: 'deposit', label: 'Deposit',         ok: L.paid > 0, val: L.paid > 0 ? 'Paid ' + fmtMoney(L.paid) : L.price ? 'Due ' + fmtDay(season(T).deadlines.deposit) : 'After the package' },
    { k: 'balance', label: 'Balance',         ok: L.settled, val: L.settled ? 'Settled' : L.price ? fmtMoney(L.left) + ' to go' : '—' },
    { k: 'shirt',   label: 'Shirt and name',  ok: !!(s && s.shirt), val: s && s.shirt ? s.shirt + (s.nameOn ? ' · ' + s.nameOn : '') : 'Add your size' },
    { k: 'room',    label: 'Room',            ok: !!room, val: room ? 'With ' + (room.members || []).filter(x => x !== pid).map(x => (person(T, x) || {}).display || x).join(' and ') : 'Not set yet' },
    { k: 'flights', label: 'Flights',         ok: !!(t && t.out && t.out.flight), val: t && t.out && t.out.flight ? t.out.flight + ' · lands ' + (t.out.lands || '?') : 'Add when booked' },
  ];
  const done = items.filter(i => i.ok).length;
  return { items, done, of: items.length, pct: done / items.length, next: items.find(i => !i.ok) || null };
}

/* ---------- the dials ---------- */

export function dials(T, pid, today) {
  const u = unionHcp(T, pid, today);
  const stopsSoFar = stops(T).filter(s => stopState(s, today) !== 'upcoming');
  const played = stopsSoFar.filter(s => { const c = cardOf(T, s.id, pid); return c && cardTotals(c).thru > 0; }).length;
  const line = lineOf(T, pid);
  const p = person(T, pid);
  const seed = p && p.band != null ? +p.band : null;
  const move = u.from === 'season' && seed != null ? Math.round((u.hcp - seed) * 10) / 10 : null;
  return {
    form: { big: u.hcp == null ? '—' : String(u.hcp), label: 'Form', small: u.from === 'season' ? (move == null ? 'Union handicap' : (move < 0 ? 'down ' : 'up ') + Math.abs(move) + ' since Belek') : u.from === 'belek' ? 'Belek band · ' + u.need + ' more card' + (u.need === 1 ? '' : 's') : 'no handicap yet', pct: u.hcp == null ? 0 : Math.max(0.08, 1 - u.hcp / 45) },
    played: { big: played + ' of ' + stopsSoFar.length, label: 'Played', small: 'this season', pct: stopsSoFar.length ? played / stopsSoFar.length : 0 },
    ready: { big: Math.round(line.pct * 100) + '%', label: 'Ready', small: 'for Vegas', pct: line.pct },
  };
}

/* ---------- exports ---------- */

const cell = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
export const csv = rows => rows.map(r => r.map(cell).join(',')).join('\n') + '\n';

export function csvHeadcount(T) {
  const f = field(T);
  const rows = [['Name', 'Role', 'Playing', 'Status', 'Package', 'Nights', 'Golfing', 'Shirt', 'Name on shirt', 'Price', 'Paid', 'Outstanding']];
  for (const st of ['in', 'maybe']) for (const p of f[st]) {
    const L = ledger(T, p.id);
    rows.push([p.name, p.role, divisionLabel(divisionOf(T, p.id)), st, L.pkg ? L.pkg.name : '', L.pkg ? L.pkg.nights : '', L.pkg ? (L.pkg.golf ? 'yes' : 'no') : '', p.signup && p.signup.shirt || '', p.signup && p.signup.nameOn || '', L.price, L.paid, L.left]);
  }
  return csv(rows);
}
export function csvRooms(T) {
  const rows = [['Room', 'Type', 'Guest', 'Nights', 'Package']];
  season(T).rooms.forEach((r, i) => (r.members || []).forEach(pid => {
    const p = person(T, pid), L = ledger(T, pid);
    rows.push([r.id || i + 1, r.type || '', p ? p.name : pid, L.pkg ? L.pkg.nights : '', L.pkg ? L.pkg.name : '']);
  }));
  return csv(rows);
}
export function csvTravel(T) {
  const rows = [['Name', 'Out date', 'Out flight', 'Lands', 'Back date', 'Back flight', 'Lands', 'Note']];
  const f = field(T);
  for (const p of f.in.concat(f.maybe)) {
    const t = travelOf(T, p.id) || {}; const o = t.out || {}, b = t.back || {};
    rows.push([p.name, o.date || '', o.flight || '', o.lands || '', b.date || '', b.flight || '', b.lands || '', t.note || '']);
  }
  return csv(rows);
}
