/* The Union Invitational — the gallery's side of the week.
 *
 * Two things live here, both worked out from what is in the shared book and
 * nothing else, so every phone draws the same answer:
 *
 *   THE BOOK'S MOMENTS — what the chat posts by itself while a round is on:
 *   a birdie, a ball in the water, a group making the turn. Nobody writes
 *   them; they are read off the cards as the refs save them.
 *
 *   THE EXCHANGE — yes/no markets, the way Kalshi runs them, in beers: the
 *   price is the chance, so Yes at 62% means the group thinks it is 62%
 *   likely, and a bet on it pays more the less likely it was. Everything is
 *   counted in quarter beers: what you put on, what you cash out, what a bet
 *   pays and what you hold. Twenty-three people are too
 *   few for two of them to want the opposite side of the same trade at the
 *   same moment, so the book always takes the other side (a market maker,
 *   the standard logarithmic one). Every trade fills at once, every buy
 *   moves the price, and the price is read from the trades themselves — it
 *   is never stored, so it can never disagree between two phones.
 */
import * as E from './engine.js';
import { DAYS, ROUNDS } from './data.js';

/* ---------------- the moments ---------------- */

const ORD = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');

function groupOf(T, rid, pid) {
  const g = E.groups(T, rid).find(x => (x.members || []).includes(pid));
  return g ? g.label : '';
}

/** What the book posts for a round, oldest first. Each has a key that never
 *  changes, so reactions and heckles stay attached to it. */
export function moments(T, rid) {
  const out = [];
  if (!E.roundDef(rid)) return out;
  const holes = E.courseOf(T, rid).holes;
  for (const g of E.golfers(T)) {
    const c = E.card(T, rid, g.id);
    if (!c || !Array.isArray(c.raw)) continue;
    const grp = groupOf(T, rid, g.id);
    for (let h = 0; h < 18; h++) {
      const raw = c.raw[h];
      if (raw == null) continue;
      const at = (c.at && c.at[h]) || 0;
      const par = holes[h].par;
      const where = `Par ${par}${grp ? ' · ' + grp : ''}`;
      const base = { at, pid: g.id, h, sub: where };
      if (raw === 1) out.push({ ...base, key: `${rid}.hio.${g.id}.${h}`, kind: 'hio', tone: 'good', big: '1', title: `HOLE IN ONE. ${g.display} on the ${ORD(h + 1)}` });
      else if (raw <= par - 3) out.push({ ...base, key: `${rid}.eagle.${g.id}.${h}`, kind: 'eagle', tone: 'good', big: String(raw), title: `ALBATROSS. ${g.display} on the ${ORD(h + 1)}` });
      else if (raw === par - 2) out.push({ ...base, key: `${rid}.eagle.${g.id}.${h}`, kind: 'eagle', tone: 'good', big: String(raw), title: `${g.display} eagles the ${ORD(h + 1)}` });
      else if (raw === par - 1) out.push({ ...base, key: `${rid}.bird.${g.id}.${h}`, kind: 'bird', tone: 'good', big: String(raw), title: `${g.display} birdies the ${ORD(h + 1)}` });
      for (const k of E.holeMarks(T, rid, g.id, h)) {
        const m = E.MARKS.find(x => x.key === k);
        out.push({ ...base, key: `${rid}.${k}.${g.id}.${h}`, kind: k, tone: m.tone, big: k === 'water' ? '≈' : k === 'ob' ? 'OB' : k === 'putt3' ? '3' : '★',
          title: `${g.display} ${m.said} on the ${ORD(h + 1)}` });
      }
    }
  }
  const cf = E.roundCfg(T, rid) || {};
  for (const g of E.finishGroups(T, rid)) {
    const names = (g.pairs || []).join(' v ');
    const t = cf.turn && cf.turn[g.id], d = cf.done && cf.done[g.id];
    if (t && t.at) out.push({ key: `${rid}.turn.${g.id}`, kind: 'turn', tone: 'mid', big: '9', at: t.at, title: `${g.label} makes the turn`, sub: names });
    if (d && d.at) out.push({ key: `${rid}.done.${g.id}`, kind: 'done', tone: 'mid', big: '18', at: d.at, title: `${g.label} is in`, sub: names });
  }
  return out.sort((a, b) => a.at - b.at);
}

/* ---------------- the exchange ---------------- */

/** How deep the book's side is. Ten means buying five contracts at even
 *  money moves the price from 50¢ to about 62¢: enough that a bet is felt,
 *  not so much that one person can own a market. */
export const LIQ = 10;
/** Beers to bet with, given each day of the trip. */
export const DAILY = 20;
/** The smallest amount anything moves in: a quarter of a beer. */
export const STEP = 0.25;
/** Down to the quarter beer: what a bet costs and what a balance holds. */
export const floor4 = x => Math.floor(x * 4 + 1e-9) / 4;
/** To the nearest quarter beer: what a bet pays, and what it is worth.
 *  Down, it took most of a quarter off a small bet: a ¼ on an even Yes,
 *  worth just under a half, paid a quarter. */
export const round4 = x => Math.round(x * 4 + 1e-9) / 4;

/* A long shot gets a deeper book: at the depth of an even-money market a
   quarter beer on a 1% golfer would push him to 3½% and pay half what the
   odds say. Three times the depth keeps a small stake on a long shot close
   to the price it was offered. */
export const LONG_LIQ = 30;
const liqOf = m => m.liq || ((m.p0 || 50) <= 15 ? LONG_LIQ : LIQ);
const lse = (a, b) => { const m = Math.max(a, b); return m + Math.log(Math.exp(a - m) + Math.exp(b - m)); };
const C = (y, n, b) => b * lse(y / b, n / b);
const r3 = x => Math.round(x * 1000) / 1000;

/** The book's position in one market, from its opening price and every trade. */
export function book(m, trades) {
  const p = Math.min(0.99, Math.max(0.01, (m.p0 || 50) / 100)), b = liqOf(m);
  let y = b * Math.log(p), n = b * Math.log(1 - p);
  for (const t of trades) if (t.m === m.id) { if (t.side === 'yes') y += t.n; else n += t.n; }
  return { y, n, b };
}
/** The chance of Yes, 0–1. */
export const chance = q => 1 / (1 + Math.exp((q.n - q.y) / (q.b || LIQ)));
/** What k contracts of one side cost now, in beers. Negative k is a sale,
 *  and comes back negative: money in. */
export function quote(q, side, k) {
  const b = q.b || LIQ;
  return side === 'yes' ? C(q.y + k, q.n, b) - C(q.y, q.n, b) : C(q.y, q.n + k, b) - C(q.y, q.n, b);
}
/** What a stake buys: the share of the pot it pays if it is right. */
export function sharesFor(q, side, beers) {
  let lo = 0, hi = 1;
  while (quote(q, side, hi) < beers && hi < 1e6) hi *= 2;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (quote(q, side, mid) < beers) lo = mid; else hi = mid; }
  return lo;
}
/** What selling k shares of a side would bring back now. */
export const saleOf = (q, side, k) => -quote(q, side, -k);
/** How many shares to sell to get a given amount back. */
export function sharesToRaise(q, side, beers, held) {
  if (saleOf(q, side, held) <= beers) return held;
  let lo = 0, hi = held;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (saleOf(q, side, mid) < beers) lo = mid; else hi = mid; }
  return hi;
}
/** Cents, the way the exchange shows a price: 1–99. */
export const cents = p => Math.min(99, Math.max(1, Math.round(p * 100)));

/* ---- what is in the book ---- */

const rows = T => Object.values(T.market || {}).filter(Boolean);
/* Worked out once a screen draw, not once a question: with a bet on every
   golfer for every round there are some two hundred markets, and the page
   asks after them dozens of times while it is drawn. The book calls
   invalidate() at the top of every draw and after every write. */
let memoTrades = null, memoMarkets = null, memoHolders = null;
export function invalidate() { memoTrades = null; memoMarkets = null; memoHolders = null; }
export const trades = T => memoTrades || (memoTrades = rows(T).filter(r => r.k === 't').sort((a, b) => (a.at || 0) - (b.at || 0)));
export const orders = T => rows(T).filter(r => r.k === 'o').sort((a, b) => (a.at || 0) - (b.at || 0));

const final = (T, rid, now) => E.phaseOf(T, rid, now) === 'final';
const roundName = r => r.short === 'Practice' ? 'Practice day' : 'Round ' + r.short.slice(1);

/** Every golfer's week, read once: per round, what their card and the
 *  refs' marks say — the facts every who-bet settles from. */
function facts(T) {
  const F = {};
  for (const r of ROUNDS) {
    const holes = E.courseOf(T, r.id).holes;
    F[r.id] = {};
    for (const g of E.golfers(T)) {
      const c = E.card(T, r.id, g.id);
      const f = { hio: false, eagle: false, b3: false, water: false, putt3: false, shots: 0 };
      if (c && Array.isArray(c.raw)) c.raw.forEach((v, h) => {
        if (v == null) return;
        const par = holes[h].par;
        if (v === 1) f.hio = true;
        if (v <= par - 2) f.eagle = true;
        if (par === 3 && v <= 2) f.b3 = true;
      });
      for (let h = 0; h < 18; h++) for (const k of E.holeMarks(T, r.id, g.id, h)) {
        if (k === 'water') f.water = true;
        if (k === 'putt3') f.putt3 = true;
        if (k === 'shot') f.shots++;
      }
      F[r.id][g.id] = f;
    }
  }
  return F;
}

/** The golfers the bets are about: those on a team, once the teams are
 *  set. A golfer left off every team is not playing, and gets no bets. */
export function teamGolfers(T) {
  const on = new Set((T.config.pairs || []).flatMap(p => p.members || []));
  const gs = E.golfers(T);
  return on.size ? gs.filter(g => on.has(g.id)) : gs;
}

/** Everyone on the trip a bet can be about: the golfers on a team, then
 *  the gallery and the refs. */
export function tripPeople(T) {
  const others = (T.config.people || []).filter(p => p.role !== 'golfer');
  return teamGolfers(T).concat(others.filter(p => p.role === 'spectator'), others.filter(p => p.role === 'official'));
}

/** The markets the book opens with. Each "anyone" question is also asked of
 *  every golfer, one card with Anyone first; all of them settle themselves
 *  from the scores and the refs' marks, except the two about the trip, which
 *  the commissioner settles. */
export function suggested(T, now) {
  const L = [];
  const done = final(T, 'r3', now);
  const gs = teamGolfers(T);
  const F = facts(T);
  const any = (key, rid) => gs.some(g => (rid ? [rid] : ROUNDS.map(r => r.id)).some(id => F[id][g.id][key]));
  const his = (key, pid, rid) => (rid ? [rid] : ROUNDS.map(r => r.id)).some(id => F[id][pid][key]);
  /* One who-card: Anyone (when there is one), then every golfer, or
   *  everyone on the trip for the ones off the course. */
  const who = o => {
    const cat = o.cat || 'golf', settler = o.settler || 'book', settle = o.settle || (() => null);
    if (o.anyId) L.push({ id: o.anyId, cat, group: o.group, groupQ: o.groupQ, label: 'Anyone', any: true, round: o.round,
      q: o.anyQ, p0: o.anyP0, settler, rules: o.anyRules, result: settle(null) });
    for (const g of o.people || gs) L.push({ id: o.each + '_' + g.id, cat, group: o.group, groupQ: o.groupQ, label: g.display, who: g.id, round: o.round,
      q: o.q(g.display), p0: o.p0, settler, rules: o.rules(g.display), result: settle(g.id) });
  };

  const mvp = done ? E.mvpBoard(T, now) : null;
  for (const g of gs) {
    L.push({ id: 's_mvp_' + g.id, cat: 'golf', group: 'mvp', groupQ: 'Who wins MVP?', label: g.display, who: g.id,
      q: `Will ${g.display} win MVP?`, p0: Math.max(3, Math.round(100 / Math.max(1, gs.length))), settler: 'book',
      rules: 'Settles from the MVP board once Round 3 is locked. Yes if he is top; a tie at the top pays everyone tied.',
      result: done ? (mvp.some(r => r.id === g.id && r.gap === 0) ? 'yes' : 'no') : null });
  }
  const pb = done ? E.pairsBoard(T, now) : null;
  for (const p of (T.config.pairs || [])) {
    if (!(p.members || []).length) continue;
    const nm = E.pairName(T, p);
    L.push({ id: 's_team_' + p.id, cat: 'golf', group: 'team', groupQ: 'Who wins the Team Competition?', label: nm, tags: p.members.slice(),
      q: `Will ${nm} win the Team Competition?`, p0: Math.max(3, Math.round(100 / Math.max(1, (T.config.pairs || []).length))), settler: 'book',
      rules: 'Settles from the Team board once Round 3 is locked. Yes if they are top; a tie at the top pays every team tied.',
      result: done ? (pb.some(r => r.id === p.id && r.gap === 0) ? 'yes' : 'no') : null });
  }
  const cup = E.ryderData(T, now);
  L.push({ id: 's_cup', cat: 'golf', q: 'Will the United Kingdom win the Ryder Cup?', p0: 50, settler: 'book',
    rules: 'Settles from the Ryder Cup board once Round 3 is locked. A tied cup settles No.',
    result: done ? (cup.ukTotal > cup.usaTotal ? 'yes' : 'no') : null });

  who({ group: 'hio', groupQ: 'Who makes a hole in one this week?', anyId: 's_hio', anyQ: 'Will anyone make a hole in one this week?', anyP0: 6, each: 's_hio', p0: 1,
    anyRules: 'Settles Yes the moment a ref saves a 1 on any card, practice day included. No once Round 3 is locked.',
    q: n => `Will ${n} make a hole in one this week?`,
    rules: n => `Settles Yes the moment a ref saves a 1 on ${n}’s card, practice day included. No once Round 3 is locked.`,
    settle: pid => (pid ? his('hio', pid) : any('hio')) ? 'yes' : done ? 'no' : null });
  who({ group: 'eagle', groupQ: 'Who makes an eagle this week?', anyId: 's_eagle', anyQ: 'Will anyone make an eagle or better this week?', anyP0: 35, each: 's_eagle', p0: 4,
    anyRules: 'Settles Yes the moment a ref saves two under par or better on any hole, any round. No once Round 3 is locked.',
    q: n => `Will ${n} make an eagle this week?`,
    rules: n => `Settles Yes the moment a ref saves two under par or better on any hole for ${n}, any round. No once Round 3 is locked.`,
    settle: pid => (pid ? his('eagle', pid) : any('eagle')) ? 'yes' : done ? 'no' : null });

  for (const r of ROUNDS.filter(x => x.counts)) {
    const fin = final(T, r.id, now), R = roundName(r);
    const under = pid => { const x = E.roundToPar(T, r.id, pid); return x.thru === 18 && x.tp < 0; };
    who({ group: 'under_' + r.id, groupQ: `${R}: who finishes under par, net?`, round: r.id, anyId: `s_${r.id}_under`, anyQ: `${R}: will anyone finish under par, net?`, anyP0: 60,
      each: `s_${r.id}_under`, p0: 10,
      anyRules: `Settles once ${R} is locked: Yes if any golfer’s net score for the round is under par.`,
      q: n => `${R}: will ${n} finish under par, net?`,
      rules: n => `Settles once ${R} is locked: Yes if ${n}’s net score for the round is under par.`,
      settle: pid => fin ? ((pid ? under(pid) : gs.some(g => under(g.id))) ? 'yes' : 'no') : null });
    who({ group: 'b3_' + r.id, groupQ: `${R}: who birdies a par 3?`, round: r.id, anyId: `s_${r.id}_b3`, anyQ: `${R}: will anyone birdie a par 3?`, anyP0: 55,
      each: `s_${r.id}_b3`, p0: 8,
      anyRules: `Settles Yes the moment a ref saves a 2 or better on a par 3 in ${R}. No once it is locked.`,
      q: n => `${R}: will ${n} birdie a par 3?`,
      rules: n => `Settles Yes the moment a ref saves a 2 or better on a par 3 for ${n} in ${R}. No once it is locked.`,
      settle: pid => (pid ? his('b3', pid, r.id) : any('b3', r.id)) ? 'yes' : fin ? 'no' : null });
    who({ group: 'water_' + r.id, groupQ: `${R}: who finds the water?`, mark: 'water', round: r.id, anyId: `s_${r.id}_water`, anyQ: `${R}: will anyone find the water?`, anyP0: 70,
      each: `s_${r.id}_water`, p0: 15,
      anyRules: `Settles Yes the moment a ref marks anyone in the water in ${R}. No once it is locked. Only what the refs mark counts.`,
      q: n => `${R}: will ${n} find the water?`,
      rules: n => `Settles Yes the moment a ref marks ${n} in the water in ${R}. No once it is locked. Only what the refs mark counts.`,
      settle: pid => (pid ? his('water', pid, r.id) : any('water', r.id)) ? 'yes' : fin ? 'no' : null });
    who({ group: 'putt3_' + r.id, groupQ: `${R}: who three-putts?`, mark: 'putt3', round: r.id, anyId: `s_${r.id}_putt3`, anyQ: `${R}: will anyone three-putt?`, anyP0: 95,
      each: `s_${r.id}_putt3`, p0: 45,
      anyRules: `Settles Yes the moment a ref marks a three-putt in ${R}. No once it is locked. Only what the refs mark counts.`,
      q: n => `${R}: will ${n} three-putt?`,
      rules: n => `Settles Yes the moment a ref marks ${n} for a three-putt in ${R}. No once it is locked. Only what the refs mark counts.`,
      settle: pid => (pid ? his('putt3', pid, r.id) : any('putt3', r.id)) ? 'yes' : fin ? 'no' : null });
  }
  /* most shots of the hole, across the week: settles once it is all over */
  const shots = Object.fromEntries(gs.map(g => [g.id, ROUNDS.reduce((n, r) => n + F[r.id][g.id].shots, 0)]));
  const most = Math.max(0, ...Object.values(shots));
  who({ group: 'shots', groupQ: 'Who plays the most shots of the hole this week?', each: 's_shots', p0: Math.max(3, Math.round(100 / Math.max(1, gs.length))),
    q: n => `Will ${n} play the most shots of the hole this week?`,
    rules: n => `Settles once Round 3 is locked, from the refs’ “shot of the hole” marks: Yes if ${n} has the most. A tie pays everyone tied; if nobody was marked, it is void.`,
    settle: pid => !done ? null : most === 0 ? 'void' : shots[pid] === most ? 'yes' : 'no' });

  L.push({ id: 's_dinner', cat: 'trip', q: 'Will the closing dinner run past midnight?', p0: 60, settler: 'commish',
    rules: 'Settled by the commissioner: Yes if anyone from the group is still at the table after 12:00 am on Monday 2 November.' });
  /* off the course, everyone on the trip is fair game */
  const all = tripPeople(T);
  who({ group: 'pool', groupQ: 'Who ends up in a pool with their clothes on?', cat: 'trip', people: all, settler: 'commish',
    anyId: 's_pool', anyQ: 'Will anyone end up in a pool with their clothes on?', anyP0: 25, each: 's_pool', p0: 4,
    anyRules: 'Settled by the commissioner on the last morning. Yes needs a witness, or better, a photo.',
    q: n => `Will ${n} end up in a pool with their clothes on?`,
    rules: n => `Settled by the commissioner on the last morning: Yes if ${n} goes in clothed. Yes needs a witness, or better, a photo.` });
  who({ group: 'late', groupQ: 'Who’s the last one standing on the final night?', cat: 'trip', people: all, settler: 'commish',
    each: 's_late', p0: Math.max(3, Math.round(100 / Math.max(1, all.length))),
    q: n => `Will ${n} be the last one standing on the final night?`,
    rules: n => `Settled by the commissioner on the last morning: Yes if ${n} is the last of the group to call it a night. If two go to bed together, both pay.` });
  return L;
}

/** Every market: the book's, then everybody's own. A settlement written to
 *  the book (by the commissioner, or by whoever made a market) wins over
 *  the automatic one, so a commissioner can always void a market gone
 *  wrong. A who-bet of somebody's own is one document with its answers in
 *  it; each answer is its own yes/no, settled together by naming who it was. */
export function markets(T, now) {
  if (memoMarkets) return memoMarkets;
  const held = T.market || {};
  const out = suggested(T, now).map(m => {
    const s = held[m.id];
    return { ...m, mine: false, result: (s && s.result) || m.result || null,
      settledBy: s && s.result ? s.settledName : (m.result ? 'the book' : null), settledAt: s && s.result ? s.settledAt : null };
  });
  const nm = pid => (E.person(T, pid) || {}).display || 'Someone';
  for (const r of rows(T).filter(r => r.k === 'q')) {
    const base = { cat: r.cat === 'trip' ? 'trip' : 'golf', custom: true, rules: r.rules || '', settler: 'creator',
      pid: r.pid, byName: r.byName, dev: r.dev, at: r.at };
    if (Array.isArray(r.opts) && r.opts.length) {
      const settled = r.void || (Array.isArray(r.winners) && r.winners.length);
      for (const w of r.opts) {
        out.push({ ...base, id: r.id + '__' + w, qid: r.id, whoCustom: true, group: r.id, groupQ: r.q, label: nm(w), who: w, tags: r.opts.slice(),
          q: `Will it be ${nm(w)}?`, p0: Math.max(3, Math.round(100 / r.opts.length)),
          result: r.void ? 'void' : settled ? (r.winners.includes(w) ? 'yes' : 'no') : null,
          settledBy: settled ? r.settledName : null, settledAt: settled ? r.settledAt || null : null });
      }
      continue;
    }
    out.push({ ...base, id: r.id, qid: r.id, q: r.q, p0: r.p0 || 50, tags: Array.isArray(r.tags) ? r.tags.slice() : [],
      result: r.result || null, settledBy: r.result ? r.settledName : null, settledAt: r.settledAt || null });
  }
  return (memoMarkets = out);
}

/** Is this market about this person: on it, tagged on it, or made by them? */
export const about = (m, pid) => m.who === pid || m.pid === pid || (m.tags || []).includes(pid);

/* ---- people ---- */

/** Beers given out so far: ten for every day of the trip that has begun. */
export function granted(now) {
  const days = DAYS.filter(d => d.iso <= now.iso).length;
  return DAILY * Math.max(1, days);
}

/** One person's holdings in every market they have touched. */
export function positions(T, pid) {
  const P = {};
  for (const t of trades(T)) {
    if (t.pid !== pid) continue;
    const p = P[t.m] || (P[t.m] = { m: t.m, yes: 0, no: 0, spent: 0 });
    p[t.side] += t.n;
    p.spent += t.cost;
  }
  return P;
}

/** Who holds what on every market, first in first: { market: [{ pid, yes, no }] }.
 *  Anyone who has cashed all of it out is left off. */
export function holders(T) {
  if (memoHolders) return memoHolders;
  const H = {}, at = {};
  for (const t of trades(T)) {
    const by = H[t.m] || (H[t.m] = {});
    const h = by[t.pid] || (by[t.pid] = { pid: t.pid, yes: 0, no: 0 });
    h[t.side] += t.n;
  }
  for (const [m, by] of Object.entries(H)) at[m] = Object.values(by).filter(h => h.yes > 1e-4 || h.no > 1e-4);
  return (memoHolders = at);
}

/** What a settled market paid one holder, to the quarter beer. */
function payout(p, result) {
  if (result === 'yes') return round4(p.yes);
  if (result === 'no') return round4(p.no);
  if (result === 'void') return Math.max(0, p.spent);
  return 0;
}

/** THE BETS THAT HAVE SETTLED, AND WHAT THEY PAID. One entry a bet (a
 *  who-card counts once, when every name on it has settled), with everyone
 *  who had a beer on it: what they put on, what came back, and the
 *  difference. Newest settled first. */
export function cashed(T, now) {
  const all = markets(T, now), tr = trades(T);
  const groups = {};
  for (const m of all) {
    if (!m.result) continue;
    const key = m.group || m.id;
    const g = groups[key] || (groups[key] = { key, id: m.qid || m.id, q: m.groupQ || m.q, group: !!m.group, custom: !!m.custom, markets: [],
      settledBy: m.settledBy || null, settledAt: m.settledAt || 0, result: null, winners: [] });
    g.markets.push(m);
    if (m.settledAt && m.settledAt > g.settledAt) g.settledAt = m.settledAt;
    if (m.group) { if (m.result === 'yes' && m.who) g.winners.push(m.who); if (m.result === 'void') g.result = 'void'; }
    else g.result = m.result;
  }
  const out = [];
  for (const g of Object.values(groups)) {
    if (g.group) {
      if (all.some(x => x.group === g.key && !x.result)) continue;      // still names to settle on the card
      if (!g.result) g.result = g.winners.length ? 'who' : 'none';
    }
    const lines = {};
    for (const m of g.markets) {
      const P = {};
      for (const t of tr) { if (t.m !== m.id) continue; const p = P[t.pid] || (P[t.pid] = { yes: 0, no: 0, spent: 0 }); p[t.side] += t.n; p.spent += t.cost; }
      for (const [pid, p] of Object.entries(P)) { const l = lines[pid] || (lines[pid] = { pid, paid: 0, spent: 0 }); l.paid += payout(p, m.result); l.spent += p.spent; }
    }
    const people = Object.values(lines).map(l => ({ pid: l.pid, paid: round4(l.paid), spent: round4(l.spent), net: round4(l.paid - l.spent) }))
      .filter(l => Math.abs(l.spent) > 1e-4 || l.paid > 1e-4).sort((a, b) => b.net - a.net);
    if (!people.length) continue;                                       // nobody had a beer on it
    out.push({ ...g, people, won: people.filter(l => l.net > 1e-4), lost: people.filter(l => l.net < -1e-4) });
  }
  return out.sort((a, b) => (b.settledAt || 0) - (a.settledAt || 0));
}

/** Cash in hand, positions at today's prices, and what that adds up to. */
export function account(T, pid, now, all) {
  const ms = all || markets(T, now), byId = Object.fromEntries(ms.map(m => [m.id, m]));
  const tr = trades(T);
  const P = positions(T, pid);
  let cash = granted(now), open = 0;
  const rowsOut = [];
  for (const p of Object.values(P)) {
    const m = byId[p.m];
    cash -= p.spent;
    if (!m) continue;
    if (m.result) { cash += payout(p, m.result); rowsOut.push({ ...p, m: m, settled: true, paid: payout(p, m.result) }); continue; }
    const pr = chance(book(m, tr));
    const value = round4(saleOf(book(m, tr), 'yes', p.yes) + saleOf(book(m, tr), 'no', p.no));
    open += value;
    if (p.yes > 0.0001 || p.no > 0.0001) rowsOut.push({ ...p, m, settled: false, value, price: pr });
  }
  cash = floor4(cash + 1e-6);
  return { cash, open: r3(open), worth: r3(cash + open), profit: r3(cash + open - granted(now)), rows: rowsOut };
}

/** Everyone who has traded, best first. */
export function standings(T, now) {
  const all = markets(T, now);
  const ids = [...new Set(trades(T).map(t => t.pid))];
  return ids.map(pid => ({ pid, ...account(T, pid, now, all) })).sort((a, b) => b.profit - a.profit);
}

/** A bet or a cash-out, priced against the book as this phone sees it.
 *  `beers` is what goes on (a buy) or what comes back (a sale), in quarter
 *  beers; `all` sells everything held on that side. Returns the document to
 *  write, or the reason it cannot be made. */
export function makeTrade(T, now, { m, pid, side, act, beers, all }) {
  if (!m || m.result) return { err: 'This bet has settled.' };
  if (!pid) return { err: 'Choose your name first.' };
  const q = book(m, trades(T));
  const word = side === 'yes' ? 'Yes' : 'No';
  if (act === 'sell') {
    const held = (positions(T, pid)[m.id] || {})[side] || 0;
    if (held < 1e-6) return { err: `You have nothing on ${word} here.` };
    const most = round4(saleOf(q, side, held));
    let back = all ? most : round4(beers || 0);
    if (!(back > 0)) return { err: most > 0 ? 'Choose how much to cash out.' : `Your ${word} is worth less than a quarter beer right now.` };
    if (back > most + 1e-9) return { err: `Your ${word} is worth ${most} 🍺 right now.` };
    const k = all ? held : sharesToRaise(q, side, back, held);
    return { doc: { k: 't', m: m.id, pid, side, n: -k, cost: -back, px: cents(back / k) } };
  }
  const stake = floor4(beers || 0);
  if (!(stake >= STEP)) return { err: 'The smallest bet is a quarter beer.' };
  const acc = account(T, pid, now);
  if (stake > acc.cash + 1e-9) return { err: `You have ${acc.cash} 🍺 to bet with.` };
  const k = sharesFor(q, side, stake);
  return { doc: { k: 't', m: m.id, pid, side, n: k, cost: stake, px: cents(stake / k) } };
}

/** The chance a side stands at now, 1–99. */
export function sidePrice(q, side) { const p = chance(q); return cents(side === 'yes' ? p : 1 - p); }

/** Resting limit orders in a market, as an order book: the best bid first,
 *  quantities at each price added together. */
export function depth(T, mid) {
  const open = orders(T).filter(o => o.m === mid && o.state === 'open');
  const side = s => {
    const lv = {};
    for (const o of open.filter(o => o.side === s)) lv[o.lim] = (lv[o.lim] || 0) + (o.stake || 0);
    return Object.entries(lv).map(([p, n]) => ({ p: +p, n })).sort((a, b) => b.p - a.p);
  };
  return { yes: side('yes'), no: side('no') };
}

/** The price history of a market, as chances after each trade. */
export function history(m, tr) {
  const pts = [{ at: m.at || 0, p: (m.p0 || 50) / 100 }];
  const mine = tr.filter(t => t.m === m.id);
  for (let i = 0; i < mine.length; i++) pts.push({ at: mine[i].at || 0, p: chance(book(m, mine.slice(0, i + 1))) });
  return pts;
}
