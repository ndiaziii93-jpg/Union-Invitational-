/* The Union Invitational — the gallery's side of the week.
 *
 * Two things live here, both worked out from what is in the shared book and
 * nothing else, so every phone draws the same answer:
 *
 *   THE BOOK'S MOMENTS — what the chat posts by itself while a round is on:
 *   a birdie, a ball in the water, a group making the turn. Nobody writes
 *   them; they are read off the cards as the refs save them.
 *
 *   THE EXCHANGE — yes/no markets priced in cents of a beer, the way Kalshi
 *   prices them: Yes at 62¢ means the group thinks it is 62% likely, and a
 *   contract pays a whole beer if it comes true. Twenty-three people are too
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
/** Beers to trade with, given each day of the trip. */
export const DAILY = 10;

const lse = (a, b) => { const m = Math.max(a, b); return m + Math.log(Math.exp(a - m) + Math.exp(b - m)); };
const C = (y, n) => LIQ * lse(y / LIQ, n / LIQ);
const r3 = x => Math.round(x * 1000) / 1000;

/** The book's position in one market, from its opening price and every trade. */
export function book(m, trades) {
  const p = Math.min(0.99, Math.max(0.01, (m.p0 || 50) / 100));
  let y = LIQ * Math.log(p), n = LIQ * Math.log(1 - p);
  for (const t of trades) if (t.m === m.id) { if (t.side === 'yes') y += t.n; else n += t.n; }
  return { y, n };
}
/** The chance of Yes, 0–1. */
export const chance = q => 1 / (1 + Math.exp((q.n - q.y) / LIQ));
/** What k contracts of one side cost now, in beers. Negative k is a sale,
 *  and comes back negative: money in. */
export function quote(q, side, k) {
  return side === 'yes' ? C(q.y + k, q.n) - C(q.y, q.n) : C(q.y, q.n + k) - C(q.y, q.n);
}
/** The most whole contracts a stake buys. */
export function contractsFor(q, side, beers) {
  let k = 0;
  while (k < 999 && quote(q, side, k + 1) <= beers + 1e-9) k++;
  return k;
}
/** Cents, the way the exchange shows a price: 1–99. */
export const cents = p => Math.min(99, Math.max(1, Math.round(p * 100)));

/* ---- what is in the book ---- */

const rows = T => Object.values(T.market || {}).filter(Boolean);
export const trades = T => rows(T).filter(r => r.k === 't').sort((a, b) => (a.at || 0) - (b.at || 0));
export const orders = T => rows(T).filter(r => r.k === 'o').sort((a, b) => (a.at || 0) - (b.at || 0));

const final = (T, rid, now) => E.phaseOf(T, rid, now) === 'final';
const roundName = r => r.short === 'Practice' ? 'Practice day' : 'Round ' + r.short.slice(1);

/** Did anyone, in any round so far, make a score that passes `test`? */
function anyScore(T, test, rid) {
  for (const r of ROUNDS) {
    if (rid && r.id !== rid) continue;
    const holes = E.courseOf(T, r.id).holes;
    for (const g of E.golfers(T)) {
      const c = E.card(T, r.id, g.id);
      if (c && Array.isArray(c.raw) && c.raw.some((v, h) => v != null && test(v, holes[h].par))) return true;
    }
  }
  return false;
}

/** The markets the book opens with. They settle themselves from the scores,
 *  except the two about the trip, which the commissioner settles. */
export function suggested(T, now) {
  const L = [];
  const done = final(T, 'r3', now);
  const gs = E.golfers(T);

  const mvp = done ? E.mvpBoard(T, now) : null;
  for (const g of gs) {
    L.push({ id: 's_mvp_' + g.id, cat: 'golf', group: 'mvp', groupQ: 'Who wins MVP?', label: g.display,
      q: `Will ${g.display} win MVP?`, p0: Math.max(3, Math.round(100 / Math.max(1, gs.length))), settler: 'book',
      rules: 'Settles from the MVP board once Round 3 is locked. Yes if he is top; a tie at the top pays everyone tied.',
      result: done ? (mvp.some(r => r.id === g.id && r.gap === 0) ? 'yes' : 'no') : null });
  }
  const pb = done ? E.pairsBoard(T, now) : null;
  for (const p of (T.config.pairs || [])) {
    if (!(p.members || []).length) continue;
    const nm = E.pairName(T, p);
    L.push({ id: 's_team_' + p.id, cat: 'golf', group: 'team', groupQ: 'Who wins the Team Competition?', label: nm,
      q: `Will ${nm} win the Team Competition?`, p0: Math.max(3, Math.round(100 / Math.max(1, (T.config.pairs || []).length))), settler: 'book',
      rules: 'Settles from the Team board once Round 3 is locked. Yes if they are top; a tie at the top pays every team tied.',
      result: done ? (pb.some(r => r.id === p.id && r.gap === 0) ? 'yes' : 'no') : null });
  }
  const cup = E.ryderData(T, now);
  L.push({ id: 's_cup', cat: 'golf', q: 'Will the United Kingdom win the Ryder Cup?', p0: 50, settler: 'book',
    rules: 'Settles from the Ryder Cup board once Round 3 is locked. A tied cup settles No.',
    result: done ? (cup.ukTotal > cup.usaTotal ? 'yes' : 'no') : null });
  const hio = anyScore(T, v => v === 1);
  L.push({ id: 's_hio', cat: 'golf', q: 'Will anyone make a hole in one this week?', p0: 6, settler: 'book',
    rules: 'Settles Yes the moment a ref saves a 1 on any card, practice day included. No once Round 3 is locked.',
    result: hio ? 'yes' : done ? 'no' : null });
  const eagle = anyScore(T, (v, par) => v <= par - 2);
  L.push({ id: 's_eagle', cat: 'golf', q: 'Will anyone make an eagle or better this week?', p0: 35, settler: 'book',
    rules: 'Settles Yes the moment a ref saves two under par or better on any hole, any round. No once Round 3 is locked.',
    result: eagle ? 'yes' : done ? 'no' : null });
  for (const r of ROUNDS.filter(x => x.counts)) {
    const fin = final(T, r.id, now);
    const under = fin && E.golfers(T).some(g => { const x = E.roundToPar(T, r.id, g.id); return x.thru === 18 && x.tp < 0; });
    L.push({ id: `s_${r.id}_under`, cat: 'golf', round: r.id, q: `${roundName(r)}: will anyone finish under par, net?`, p0: 60, settler: 'book',
      rules: `Settles once ${roundName(r)} is locked: Yes if any golfer’s net score for the round is under par.`,
      result: fin ? (under ? 'yes' : 'no') : null });
    const b3 = anyScore(T, (v, par) => par === 3 && v <= 2, r.id);
    L.push({ id: `s_${r.id}_b3`, cat: 'golf', round: r.id, q: `${roundName(r)}: will anyone birdie a par 3?`, p0: 55, settler: 'book',
      rules: `Settles Yes the moment a ref saves a 2 or better on a par 3 in ${roundName(r)}. No once it is locked.`,
      result: b3 ? 'yes' : fin ? 'no' : null });
  }
  L.push({ id: 's_dinner', cat: 'trip', q: 'Will the closing dinner run past midnight?', p0: 60, settler: 'commish',
    rules: 'Settled by the commissioner: Yes if anyone from the group is still at the table after 12:00 am on Monday 2 November.' });
  L.push({ id: 's_pool', cat: 'trip', q: 'Will anyone end up in a pool with their clothes on?', p0: 25, settler: 'commish',
    rules: 'Settled by the commissioner on the last morning. Yes needs a witness, or better, a photo.' });
  return L;
}

/** Every market: the book's, then everybody's own. A settlement written to
 *  the book (by the commissioner, or by whoever made a market) wins over
 *  the automatic one, so a commissioner can always void a market gone
 *  wrong. */
export function markets(T, now) {
  const held = T.market || {};
  const out = suggested(T, now).map(m => {
    const s = held[m.id];
    return { ...m, mine: false, result: (s && s.result) || m.result || null,
      settledBy: s && s.result ? s.settledName : (m.result ? 'the book' : null), settledAt: s && s.result ? s.settledAt : null };
  });
  for (const r of rows(T).filter(r => r.k === 'q')) {
    out.push({ id: r.id, cat: r.cat === 'trip' ? 'trip' : 'golf', custom: true, q: r.q, rules: r.rules || '', p0: r.p0 || 50,
      settler: 'creator', pid: r.pid, byName: r.byName, dev: r.dev, at: r.at,
      result: r.result || null, settledBy: r.result ? r.settledName : null, settledAt: r.settledAt || null });
  }
  return out;
}

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

/** What a settled market paid one holder. */
function payout(p, result) {
  if (result === 'yes') return p.yes;
  if (result === 'no') return p.no;
  if (result === 'void') return p.spent;
  return 0;
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
    const value = p.yes * pr + p.no * (1 - pr);
    open += value;
    if (p.yes > 0.0001 || p.no > 0.0001) rowsOut.push({ ...p, m, settled: false, value, price: pr });
  }
  return { cash: r3(cash), open: r3(open), worth: r3(cash + open), profit: r3(cash + open - granted(now)), rows: rowsOut };
}

/** Everyone who has traded, best first. */
export function standings(T, now) {
  const all = markets(T, now);
  const ids = [...new Set(trades(T).map(t => t.pid))];
  return ids.map(pid => ({ pid, ...account(T, pid, now, all) })).sort((a, b) => b.profit - a.profit);
}

/** A trade, priced against the book as this phone sees it. Returns the
 *  document to write, or the reason it cannot be made. */
export function makeTrade(T, now, { m, pid, side, act, k }) {
  if (!m || m.result) return { err: 'This market has settled.' };
  if (!pid) return { err: 'Choose your name first.' };
  k = Math.floor(k);
  if (!(k > 0)) return { err: 'Choose how many.' };
  const q = book(m, trades(T));
  const acc = account(T, pid, now);
  if (act === 'sell') {
    const held = (positions(T, pid)[m.id] || {})[side] || 0;
    if (k > held + 1e-9) return { err: `You hold ${Math.floor(held)} ${side === 'yes' ? 'Yes' : 'No'}.` };
    const back = -quote(q, side, -k);
    return { doc: { k: 't', m: m.id, pid, side, n: -k, cost: r3(-back), px: cents(back / k) } };
  }
  const cost = quote(q, side, k);
  if (cost > acc.cash + 1e-9) return { err: `That costs ${cost.toFixed(2)} 🍺; you have ${acc.cash.toFixed(2)}.` };
  return { doc: { k: 't', m: m.id, pid, side, n: k, cost: r3(cost), px: cents(cost / k) } };
}

/** The price one more contract of a side would cost, in cents. */
export function sidePrice(q, side) { const p = chance(q); return cents(side === 'yes' ? p : 1 - p); }

/** Resting limit orders in a market, as an order book: the best bid first,
 *  quantities at each price added together. */
export function depth(T, mid) {
  const open = orders(T).filter(o => o.m === mid && o.state === 'open');
  const side = s => {
    const lv = {};
    for (const o of open.filter(o => o.side === s)) lv[o.lim] = (lv[o.lim] || 0) + o.n;
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
