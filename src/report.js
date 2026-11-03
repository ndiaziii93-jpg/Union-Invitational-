/* THE PLAYERS REPORT. Every card in the book, read for what it says about
   each golfer: scoring by par and by stroke index, the nines, the trouble,
   the putting where a ref counted it, the team game, the bingo, the cup.
   The numbers and the grades are worked out here, the same on every phone
   and on the public page; the words — an executive summary and a coach's
   letter to each golfer — are written once by the book's writer and kept
   in recaps/report. */
import * as D from './data.js';
import * as E from './engine.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const f1 = n => (Math.round(n * 10) / 10).toFixed(1);
const sign = n => n === 0 ? 'E' : n > 0 ? '+' + n : '−' + Math.abs(n);
const signF = n => (n > 0 ? '+' : n < 0 ? '−' : '') + f1(Math.abs(n));
const avg = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const idxBand = si => (si <= 6 ? 'lo' : si <= 12 ? 'mid' : 'hi');
export const roundShort = rid => { const r = D.ROUNDS.find(x => x.id === rid); return r ? (r.short === 'Practice' ? 'Practice' : r.short) : rid; };
export const roundName = rid => { const r = D.ROUNDS.find(x => x.id === rid); return r ? (r.short === 'Practice' ? 'Practice' : 'Round ' + r.short.slice(1)) : rid; };

/** One golfer's one round, hole by hole and added up. Null with no score on it. */
export function roundStats(T, rid, pid) {
  const c = E.card(T, rid, pid);
  if (!c || !Array.isArray(c.raw) || !c.raw.some(v => v != null)) return null;
  const holes = E.courseOf(T, rid).holes;
  const pair = (T.config.pairs || []).find(x => (x.members || []).includes(pid)) || null;
  const partner = pair ? (pair.members || []).find(x => x !== pid) : null;
  const s = { rid, course: E.courseOf(T, rid).name, gross: 0, par: 0, played: 0, front: 0, back: 0, frontPar: 0, backPar: 0, pts: 0, ptsF: 0, ptsB: 0, netToPar: 0, netHoles: 0,
    putts: 0, puttHoles: 0, p3: 0, p1: 0, dist: { eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0, worse: 0 },
    byPar: { 3: [0, 0], 4: [0, 0], 5: [0, 0] }, byIdx: { lo: [0, 0], mid: [0, 0], hi: [0, 0] },
    marks: { putt3: 0, ob: 0, water: 0, shot: 0 }, pu: 0, counted: 0, carried: 0, teamHoles: 0, holes: [] };
  for (let h = 0; h < 18; h++) {
    const raw = c.raw[h], hole = holes[h];
    if (raw == null) { s.holes.push(null); continue; }
    const over = raw - hole.par;
    s.played++; s.gross += raw; s.par += hole.par;
    if (h < 9) { s.front += raw; s.frontPar += hole.par; } else { s.back += raw; s.backPar += hole.par; }
    const d = s.dist;
    if (over <= -2) d.eagle++; else if (over === -1) d.birdie++; else if (over === 0) d.par++; else if (over === 1) d.bogey++; else if (over === 2) d.double++; else d.worse++;
    const bp = s.byPar[hole.par] || (s.byPar[hole.par] = [0, 0]); bp[0] += over; bp[1]++;
    const bi = s.byIdx[idxBand(hole.si)]; bi[0] += over; bi[1]++;
    const pts = E.playerPts(T, rid, pid, h);
    if (pts != null) { s.pts += pts; if (h < 9) s.ptsF += pts; else s.ptsB += pts; }
    const net = E.playerNet(T, rid, pid, h);
    if (net != null) { s.netToPar += net - hole.par; s.netHoles++; }
    const pu = c.putts ? c.putts[h] : null;
    if (pu != null && Number.isFinite(+pu)) { s.putts += +pu; s.puttHoles++; if (+pu >= 3) s.p3++; if (+pu === 1) s.p1++; }
    const marks = c.marks && Array.isArray(c.marks[h]) ? c.marks[h] : [];
    for (const k of marks) if (k in s.marks) s.marks[k]++;
    const picked = !!(c.pu && c.pu[h]); if (picked) s.pu++;
    let team = null;
    if (pair && pts != null) {
      const pp = partner ? E.playerPts(T, rid, partner, h) : null;
      s.teamHoles++;
      if ((pp == null || pts >= pp) && pts > 0) s.counted++;
      if (pp != null && pts > pp) s.carried++;
      team = pp == null ? 'solo' : pts > pp ? 'carried' : pts === pp ? 'level' : 'partner';
    }
    s.holes.push({ h, par: hole.par, si: hole.si, raw, over, pts, putts: pu != null && Number.isFinite(+pu) ? +pu : null, pu: picked, marks, team });
  }
  s.toPar = s.gross - s.par;
  s.full = s.played === 18;
  return s;
}

/** One golfer's week: every round, added up, with the team game, the bingo and the cup beside it. */
export function playerReport(T, pid, now) {
  const p = E.person(T, pid);
  if (!p) return null;
  const rounds = E.countingRounds(T).map(r => roundStats(T, r.id, pid)).filter(Boolean);
  if (!rounds.length) return null;
  const sum = k => rounds.reduce((a, r) => a + r[k], 0);
  const w = { gross: sum('gross'), par: sum('par'), played: sum('played'), pts: sum('pts'), ptsF: sum('ptsF'), ptsB: sum('ptsB'), netToPar: sum('netToPar'), netHoles: sum('netHoles'),
    putts: sum('putts'), puttHoles: sum('puttHoles'), p3: sum('p3'), p1: sum('p1'), pu: sum('pu'), counted: sum('counted'), carried: sum('carried'), teamHoles: sum('teamHoles'), dist: {}, byPar: {}, byIdx: {}, marks: {} };
  for (const k of ['eagle', 'birdie', 'par', 'bogey', 'double', 'worse']) w.dist[k] = rounds.reduce((a, r) => a + r.dist[k], 0);
  for (const k of ['3', '4', '5']) w.byPar[k] = rounds.reduce((a, r) => [a[0] + (r.byPar[k] ? r.byPar[k][0] : 0), a[1] + (r.byPar[k] ? r.byPar[k][1] : 0)], [0, 0]);
  for (const k of ['lo', 'mid', 'hi']) w.byIdx[k] = rounds.reduce((a, r) => [a[0] + r.byIdx[k][0], a[1] + r.byIdx[k][1]], [0, 0]);
  for (const k of ['putt3', 'ob', 'water', 'shot']) w.marks[k] = rounds.reduce((a, r) => a + r.marks[k], 0);
  w.toPar = w.gross - w.par;
  const full = rounds.filter(r => r.full);
  const best = full.length ? full.reduce((a, r) => (r.gross < a.gross ? r : a)) : null;
  const worst = full.length ? full.reduce((a, r) => (r.gross > a.gross ? r : a)) : null;
  const trend = full.length >= 2 ? full[full.length - 1].gross - full[0].gross : null;
  const range = full.length >= 2 ? worst.gross - best.gross : null;
  const mvp = E.mvpBoard(T, now).find(x => x.id === pid) || null;
  const pair = (T.config.pairs || []).find(x => (x.members || []).includes(pid)) || null;
  const pairRow = pair ? (E.pairsBoard(T, now).find(x => x.id === pair.id) || null) : null;
  const partner = pair ? E.person(T, (pair.members || []).find(x => x !== pid)) : null;
  const bbb = E.bbbBoard(T).find(x => x.id === pid) || null;
  const bbbRounds = E.countingRounds(T).map(r => { const row = E.bbbRoundBoard(T, r.id).find(x => x.id === pid); return row ? { rid: r.id, pts: row.pts, bingo: row.bingo, bango: row.bango, bongo: row.bongo } : null; }).filter(Boolean);
  const cup = E.ryderData(T, now);
  const matches = [];
  for (const sess of cup.sessions) for (const m of sess.matches) {
    if (m.aId !== pid && m.bId !== pid) continue;
    const me = m.aId === pid ? 'a' : 'b', up = me === 'a' ? m.up : -m.up;
    matches.push({ rid: sess.id, label: sess.label, opp: me === 'a' ? m.b : m.a, done: !!m.done, up, thru: m.thru || 0,
      result: !m.done ? (m.thru ? 'unfinished' : 'not played') : up > 0 ? 'won' : up < 0 ? 'lost' : 'halved', status: m.status || '' });
  }
  const rec = { w: matches.filter(m => m.result === 'won').length, l: matches.filter(m => m.result === 'lost').length, h: matches.filter(m => m.result === 'halved').length };
  const avgNet = full.length ? w.netToPar / full.length : (w.netHoles ? w.netToPar * 18 / w.netHoles : null);
  const playsTo = p.band != null && avgNet != null ? Math.round(+p.band + avgNet) : null;
  return { id: pid, name: p.display, band: p.band, playing: E.playingHcp(p.band, E.teamAllowance(T)), side: p.location || null,
    pair: pair ? { id: pair.id, name: E.pairName(T, pair), partner: partner ? partner.display : null, row: pairRow } : null,
    rounds, week: w, best, worst, trend, range, mvp, bbb, bbbRounds, matches, rec, avgNet, playsTo, grades: null };
}

/* THE GRADES. A letter a department, from the numbers alone, the same for
   everyone. The par-type grades are against what the golfer's own
   handicap predicts (a 16 is allowed 16 over par; that is 0.89 a hole),
   so a 30 and a 10 are graded on the same curve. Composure is the rate of
   doubles, worse, pick-ups and balls out of bounds against the field's.
   Putting needs nine counted holes; consistency needs two full rounds. */
export const GRADE_ROWS = [['par3', 'Par-3 play'], ['par4', 'Par-4 play'], ['par5', 'Par-5 play'], ['putting', 'Putting'], ['composure', 'Composure'], ['consistency', 'Consistency'], ['team', 'Team contribution']];
export function gradeOf(pr, field) {
  const g = {}, w = pr.week;
  const exp = pr.band != null && pr.band !== '' ? Math.round(+pr.band) / 18 : null;
  const parG = k => { const [over, n] = w.byPar[k] || [0, 0]; if (n < 3 || exp == null) return null; const d = over / n - exp; return d <= -0.3 ? 'A' : d <= 0.05 ? 'B' : d <= 0.45 ? 'C' : 'D'; };
  g.par3 = parG('3'); g.par4 = parG('4'); g.par5 = parG('5');
  g.putting = w.puttHoles >= 9 ? (pph => (pph <= 1.75 ? 'A' : pph <= 1.95 ? 'B' : pph <= 2.15 ? 'C' : 'D'))(w.putts / w.puttHoles) : null;
  const tr = w.played ? (w.dist.double + w.dist.worse + w.pu + w.marks.ob) / w.played : null;
  g.composure = tr == null || !field || !field.trouble ? null : (tr / field.trouble <= 0.7 ? 'A' : tr / field.trouble <= 1 ? 'B' : tr / field.trouble <= 1.4 ? 'C' : 'D');
  g.consistency = pr.range == null ? null : pr.range <= 4 ? 'A' : pr.range <= 8 ? 'B' : pr.range <= 13 ? 'C' : 'D';
  g.team = w.teamHoles >= 9 ? (sh => (sh >= 0.6 ? 'A' : sh >= 0.5 ? 'B' : sh >= 0.4 ? 'C' : 'D'))(w.counted / w.teamHoles) : null;
  return g;
}

/** The whole field: every golfer's report, the averages, where the week went, and the leaders. */
export function fieldReport(T, now) {
  const players = E.golfers(T).map(g => playerReport(T, g.id, now)).filter(Boolean);
  const sumOf = (rs, f) => rs.reduce((a, r) => a + f(r), 0);
  const rounds = E.countingRounds(T).map(r => {
    const rs = players.map(p => p.rounds.find(x => x.rid === r.id)).filter(x => x && x.full);
    return { rid: r.id, cards: rs.length, avgGross: avg(rs.map(x => x.gross)), avgNet: avg(rs.map(x => x.netToPar)), avgPts: avg(rs.map(x => x.pts)),
      p3: sumOf(rs, x => x.p3), puttHoles: sumOf(rs, x => x.puttHoles), ob: sumOf(rs, x => x.marks.ob), water: sumOf(rs, x => x.marks.water), pu: sumOf(rs, x => x.pu),
      doubles: sumOf(rs, x => x.dist.double + x.dist.worse), pars: sumOf(rs, x => x.dist.par), birdies: sumOf(rs, x => x.dist.eagle + x.dist.birdie), backBetter: rs.filter(x => x.ptsB > x.ptsF).length };
  });
  const allRounds = players.flatMap(p => p.rounds.filter(r => r.full).map(r => ({ ...r, pid: p.id, name: p.name })));
  const played = sumOf(players, p => p.week.played);
  const byPar = {}; for (const k of ['3', '4', '5']) { const o = sumOf(players, p => p.week.byPar[k][0]), n = sumOf(players, p => p.week.byPar[k][1]); byPar[k] = n ? o / n : null; }
  const byIdx = {}; for (const k of ['lo', 'mid', 'hi']) { const o = sumOf(players, p => p.week.byIdx[k][0]), n = sumOf(players, p => p.week.byIdx[k][1]); byIdx[k] = n ? o / n : null; }
  const trouble = played ? sumOf(players, p => p.week.dist.double + p.week.dist.worse + p.week.pu + p.week.marks.ob) / played : 0;
  const totals = { players: players.length, cards: allRounds.length, holes: played, ob: sumOf(players, p => p.week.marks.ob), water: sumOf(players, p => p.week.marks.water), pu: sumOf(players, p => p.week.pu),
    p3: sumOf(players, p => p.week.p3), puttHoles: sumOf(players, p => p.week.puttHoles), puttCards: allRounds.filter(r => r.puttHoles >= 9).length,
    avgGross: avg(allRounds.map(r => r.gross)), avgNet: avg(allRounds.map(r => r.netToPar)), avgPts: avg(allRounds.map(r => r.pts)),
    backBetter: allRounds.filter(r => r.ptsB > r.ptsF).length, avgBackEdge: avg(allRounds.map(r => r.ptsB - r.ptsF)) };
  const pick = (f, lo) => { const xs = allRounds.slice().sort((a, b) => lo ? f(a) - f(b) : f(b) - f(a)); return xs.length ? xs[0] : null; };
  const leaders = {
    lowGross: pick(r => r.gross, true), lowNet: pick(r => r.netToPar, true), mostPts: pick(r => r.pts, false),
    improved: players.filter(p => p.trend != null).sort((a, b) => a.trend - b.trend)[0] || null,
    most3: players.filter(p => p.week.puttHoles >= 9).sort((a, b) => b.week.p3 - a.week.p3)[0] || null,
    mostOb: players.slice().sort((a, b) => b.week.marks.ob - a.week.marks.ob)[0] || null,
    mostPars: players.slice().sort((a, b) => b.week.dist.par - a.week.dist.par)[0] || null,
  };
  const field = { players, rounds, byPar, byIdx, trouble, totals, leaders };
  for (const p of players) p.grades = gradeOf(p, field);
  /* the order the report reads in: the MVP board's, then anyone without a place on it */
  const order = E.mvpBoard(T, now).map(x => x.id);
  players.sort((a, b) => { const ia = order.indexOf(a.id), ib = order.indexOf(b.id); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.name.localeCompare(b.name); });
  return field;
}

/* ---------------- the brief for the writer ---------------- */
const parLine = (bp, k) => (bp[k] && bp[k][1] ? `par ${k}s ${signF(bp[k][0] / bp[k][1])} a hole over ${bp[k][1]}` : null);
function roundLine(r) {
  const L = [`  ${roundName(r.rid)} (${r.course}): ${r.full ? '' : r.played + ' holes, '}gross ${r.gross} (${sign(r.toPar)}), front ${r.front} back ${r.back}, ${r.pts} points (front ${r.ptsF}, back ${r.ptsB}), net ${sign(r.netToPar)}`];
  const d = r.dist;
  L.push(`    scores: ${d.eagle ? d.eagle + ' eagle, ' : ''}${d.birdie} birdie, ${d.par} par, ${d.bogey} bogey, ${d.double} double, ${d.worse} worse; ${[parLine(r.byPar, '3'), parLine(r.byPar, '4'), parLine(r.byPar, '5')].filter(Boolean).join('; ')}`);
  L.push(`    stroke index 1-6 ${signF(r.byIdx.lo[1] ? r.byIdx.lo[0] / r.byIdx.lo[1] : 0)} a hole, 7-12 ${signF(r.byIdx.mid[1] ? r.byIdx.mid[0] / r.byIdx.mid[1] : 0)}, 13-18 ${signF(r.byIdx.hi[1] ? r.byIdx.hi[0] / r.byIdx.hi[1] : 0)}`);
  if (r.puttHoles) L.push(`    putts counted on ${r.puttHoles} holes: ${r.putts} (${f1(r.putts / r.puttHoles)} a hole), ${r.p3} three-putts, ${r.p1} one-putts`);
  const tr = [];
  if (r.marks.ob) tr.push(r.marks.ob + ' out of bounds'); if (r.marks.water) tr.push(r.marks.water + ' in the water'); if (r.pu) tr.push(r.pu + ' pick-up' + (r.pu === 1 ? '' : 's')); if (r.marks.shot) tr.push(r.marks.shot + ' shot-of-the-hole');
  if (tr.length) L.push('    marks: ' + tr.join(', '));
  if (r.teamHoles) L.push(`    team game: their ball counted on ${r.counted} of ${r.teamHoles} holes, carried the partner outright on ${r.carried}`);
  const worst = r.holes.filter(Boolean).sort((a, b) => b.over - a.over).slice(0, 3).filter(h => h.over >= 2).map(h => `hole ${h.h + 1} (par ${h.par}) ${h.raw}${h.pu ? ' picked up' : ''}${h.marks.length ? ' ' + h.marks.join('/') : ''}`);
  if (worst.length) L.push('    the damage: ' + worst.join(', '));
  const good = r.holes.filter(Boolean).filter(h => h.over <= -1).map(h => `hole ${h.h + 1} ${h.raw} (par ${h.par})`);
  if (good.length) L.push('    under par: ' + good.join(', '));
  return L.join('\n');
}
export function playerBrief(pr) {
  const w = pr.week, g = pr.grades || {};
  const L = [`GOLFER id=${pr.id} name=${pr.name}: handicap ${pr.band == null ? 'none' : pr.band} (plays off ${pr.playing == null ? '?' : pr.playing} in the team game)${pr.side ? ', ' + pr.side + ' squad' : ''}${pr.pair ? ', paired with ' + (pr.pair.partner || '?') : ''}`];
  L.push(`  the week: ${w.played} holes, gross ${sign(w.toPar)} to par, ${w.pts} points${pr.mvp ? ', MVP place ' + pr.mvp.pos + ' (net ' + pr.mvp.totalStr + ')' : ''}${pr.best ? ', best round ' + pr.best.gross + ' in ' + roundName(pr.best.rid) : ''}${pr.trend != null ? ', first full round to last ' + sign(pr.trend) : ''}${pr.playsTo != null ? ', the net scoring says they played to about ' + pr.playsTo : ''}`);
  L.push(`  grades: ${GRADE_ROWS.map(([k, l]) => l + ' ' + (g[k] || '-')).join(', ')}`);
  if (pr.pair && pr.pair.row) L.push(`  team game: ${pr.pair.name} finished ${pr.pair.row.pos}${pr.pair.row.pos === 1 ? 'st' : pr.pair.row.pos === 2 ? 'nd' : pr.pair.row.pos === 3 ? 'rd' : 'th'} with ${pr.pair.row.total} points; their ball counted on ${w.counted} of ${w.teamHoles} holes`);
  if (pr.bbb) L.push(`  bingo bango bongo: ${pr.bbb.pts} points, place ${pr.bbb.pos}${pr.bbbRounds.length ? ' (' + pr.bbbRounds.map(b => roundShort(b.rid) + ' ' + b.pts).join(', ') + ')' : ''}`);
  if (pr.matches.length) L.push(`  ryder cup singles: ${pr.matches.map(m => roundShort(m.rid) + ' v ' + m.opp + ' ' + (m.result === 'won' ? 'won ' + Math.abs(m.up) + ' up' : m.result === 'lost' ? 'lost ' + Math.abs(m.up) + ' down' : m.result)).join('; ')} (${pr.rec.w}-${pr.rec.l}-${pr.rec.h})`);
  for (const r of pr.rounds) L.push(roundLine(r));
  return L.join('\n');
}
export function reportInput(T, now) {
  const F = fieldReport(T, now), t = F.totals;
  const L = ['THE FIELD'];
  L.push(`${t.players} golfers, ${t.cards} full cards, ${t.holes} holes. Average gross ${t.avgGross == null ? '-' : f1(t.avgGross)}, average net ${t.avgNet == null ? '-' : signF(t.avgNet)} to par, average ${t.avgPts == null ? '-' : f1(t.avgPts)} points.`);
  L.push(`Rounds: ${F.rounds.map(r => roundName(r.rid) + ' ' + r.cards + ' cards, avg gross ' + (r.avgGross == null ? '-' : f1(r.avgGross)) + ', avg net ' + (r.avgNet == null ? '-' : signF(r.avgNet)) + ', ' + r.birdies + ' birdies, ' + r.pars + ' pars, ' + r.doubles + ' doubles or worse, ' + r.ob + ' OB, ' + r.pu + ' pick-ups' + (r.puttHoles ? ', ' + r.p3 + ' three-putts on ' + r.puttHoles + ' counted holes' : '')).join('; ')}.`);
  L.push(`By par: par 3s ${F.byPar['3'] == null ? '-' : signF(F.byPar['3'])} a hole, par 4s ${F.byPar['4'] == null ? '-' : signF(F.byPar['4'])}, par 5s ${F.byPar['5'] == null ? '-' : signF(F.byPar['5'])}. By stroke index: 1-6 ${signF(F.byIdx.lo || 0)}, 7-12 ${signF(F.byIdx.mid || 0)}, 13-18 ${signF(F.byIdx.hi || 0)}.`);
  L.push(`Nines: the back nine out-pointed the front on ${t.backBetter} of ${t.cards} cards, by ${t.avgBackEdge == null ? '-' : signF(t.avgBackEdge)} points a card on average.`);
  L.push(`Trouble: ${t.ob} out of bounds, ${t.water} in the water, ${t.pu} pick-ups${t.puttHoles ? ', ' + t.p3 + ' three-putts where putts were counted (' + t.puttHoles + ' holes)' : ''}.`);
  const ld = F.leaders;
  L.push(`Leaders: low gross ${ld.lowGross ? ld.lowGross.name + ' ' + ld.lowGross.gross + ' (' + roundName(ld.lowGross.rid) + ')' : '-'}; low net ${ld.lowNet ? ld.lowNet.name + ' ' + sign(ld.lowNet.netToPar) + ' (' + roundName(ld.lowNet.rid) + ')' : '-'}; most points in a round ${ld.mostPts ? ld.mostPts.name + ' ' + ld.mostPts.pts : '-'}; most improved ${ld.improved ? ld.improved.name + ' (' + sign(ld.improved.trend) + ')' : '-'}; most pars ${ld.mostPars ? ld.mostPars.name + ' ' + ld.mostPars.week.dist.par : '-'}${ld.most3 ? '; most three-putts ' + ld.most3.name + ' ' + ld.most3.week.p3 : ''}${ld.mostOb && ld.mostOb.week.marks.ob ? '; most out of bounds ' + ld.mostOb.name + ' ' + ld.mostOb.week.marks.ob : ''}.`);
  const mvp = E.mvpBoard(T, now).slice(0, 3), pairs = E.pairsBoard(T, now).slice(0, 3), bbb = E.bbbBoard(T).slice(0, 3), cup = E.ryderData(T, now);
  L.push(`MVP: ${mvp.map(x => x.pos + '. ' + x.name + ' ' + x.totalStr).join(', ') || '-'}. Team Competition: ${pairs.map(x => x.pos + '. ' + x.name + ' ' + x.total + ' pts').join(', ') || '-'}. Bingo Bango Bongo: ${bbb.map(x => x.pos + '. ' + x.name + ' ' + x.pts).join(', ') || '-'}. Ryder Cup: UK ${cup.ukTotal} USA ${cup.usaTotal}.`);
  const field = L.join('\n');
  const players = {};
  for (const p of F.players) players[p.id] = playerBrief(p);
  const fieldShort = L.slice(0, 2).join('\n') + '\n' + L[L.length - 1];
  return { field, fieldShort, players, ids: F.players.map(p => p.id) };
}

/* ---------------- the report, drawn ---------------- */
const tile = (label, value, note) => `<div class="rp-tile"><small>${esc(label)}</small><b class="num">${esc(value)}</b>${note ? `<em>${esc(note)}</em>` : ''}</div>`;
const bar = (label, v, max, text, bad) => `<div class="rp-bar"><span>${esc(label)}</span><div class="rp-track"><i class="${bad ? 'r' : ''}" style="width:${Math.max(4, Math.min(100, Math.round(Math.abs(v) / max * 100)))}%"></i></div><span class="num">${esc(text)}</span></div>`;
const gradeCls = g => (g ? ' rp-g' + g : ' rp-gN');
const cell = h => { if (!h) return '<i class="rp-h rp-none"></i>'; const k = h.over <= -1 ? 'e' : h.over === 0 ? 'pr' : h.over === 1 ? 'bg' : h.over === 2 ? 'db' : 'tr'; return `<i class="rp-h ${k}${h.pu ? ' pu' : ''}" title="hole ${h.h + 1}, par ${h.par}${h.pu ? ', picked up' : ''}">${h.raw}</i>`; };
const paras = (list, cls) => (list || []).filter(x => x && String(x).trim()).map((x, i) => `<p class="${cls}${i === 0 ? ' lead' : ''}">${esc(x)}</p>`).join('');
const ordinal = n => n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');


/* THE PIECES A ROUND SUMMARY IS MADE OF, in the manner of the scoring apps:
   a big number with the net beside it, a bar chart of how the holes went,
   a grid of stat cards, and the card itself with every score in colour. */
const DIST_COLS = [['under', 'Birdie+', d => d.eagle + d.birdie], ['par', 'Par', d => d.par], ['bogey', 'Bogey', d => d.bogey], ['double', 'Double', d => d.double], ['worse', 'Worse', d => d.worse]];
export function distChart(dist, holes) {
  const n = Math.max(1, holes);
  const cols = DIST_COLS.map(([k, l, f]) => ({ k, l, n: f(dist), pct: Math.round(f(dist) / n * 100) }));
  const top = Math.max(1, ...cols.map(c => c.pct));
  return `<div class="rp-dist">${cols.map(c => `<div class="rp-dc"><b class="num">${c.pct}%</b><div class="rp-dbw"><div class="rp-db ${c.k}" style="height:${Math.max(6, Math.round(c.pct / top * 100))}%"></div></div><small>${c.l}</small><span class="num">${c.n}</span></div>`).join('')}</div>`;
}
const stat = (label, value, note) => `<div class="rp-st"><small>${esc(label)}</small><b class="num">${esc(value)}</b>${note ? `<em>${esc(note)}</em>` : ''}</div>`;
function statGrid(w) {
  const pph = w.puttHoles ? f1(w.putts / w.puttHoles) : '\u2013';
  return `<div class="rp-sg">
    ${stat('Putts per hole', pph, w.puttHoles ? 'on ' + w.puttHoles + ' counted holes' : 'not counted')}
    ${stat('Putts', w.puttHoles ? String(w.putts) : '\u2013', w.puttHoles ? w.p3 + ' three-putt' + (w.p3 === 1 ? '' : 's') + ' \u00B7 ' + w.p1 + ' one-putt' + (w.p1 === 1 ? '' : 's') : 'not counted')}
    ${stat('Out of bounds', String(w.marks.ob), w.marks.water ? w.marks.water + ' in the water' : 'balls')}
    ${stat('Pick-ups', String(w.pu), 'holes at the cap')}
  </div>`;
}
export const scoreCls = h => (!h ? 'none' : h.over <= -1 ? 'under' : h.over === 0 ? 'par' : h.over === 1 ? 'bogey' : h.over === 2 ? 'double' : 'worse');
function scorecard(T, r, pr) {
  const holes = E.courseOf(T, r.rid).holes;
  const band = pr.band;
  const nine = (from, label) => {
    const idx = Array.from({ length: 9 }, (_, i) => from + i);
    const hs = idx.map(i => r.holes[i]);
    const sum = f => hs.reduce((a, h) => (h ? a + f(h) : a), 0), any = f => hs.some(h => h && f(h) != null);
    const strokes = band != null ? idx.map(i => E.strokesFor(band, holes[i].si)) : null;
    const rows = [
      ['Hole', idx.map(i => `<th>${i + 1}</th>`).join(''), `<th>${label}</th>`, 'rp-sc-h'],
      ['Index', idx.map(i => `<td class="dim">${holes[i].si}</td>`).join(''), '<td></td>', ''],
      ['Par', idx.map(i => `<td>${holes[i].par}</td>`).join(''), `<td><b>${idx.reduce((a, i) => a + holes[i].par, 0)}</b></td>`, ''],
      ['Score', hs.map(h => `<td><i class="rp-cell ${scoreCls(h)}${h && h.pu ? ' pu' : ''}">${h ? h.raw : ''}</i></td>`).join(''), `<td><b>${hs.some(Boolean) ? sum(h => h.raw) : ''}</b></td>`, 'rp-sc-s'],
    ];
    if (strokes) rows.push(['Net', hs.map((h, k) => `<td class="dim">${h ? h.raw - strokes[k] : ''}</td>`).join(''), `<td class="dim">${hs.some(Boolean) ? hs.reduce((a, h, k) => (h ? a + h.raw - strokes[k] : a), 0) : ''}</td>`, '']);
    if (any(h => h.pts)) rows.push(['Pts', hs.map(h => `<td class="${h && h.pts >= 3 ? 'good' : h && h.pts === 0 ? 'bad' : ''}">${h && h.pts != null ? h.pts : ''}</td>`).join(''), `<td><b>${sum(h => h.pts || 0)}</b></td>`, '']);
    if (any(h => h.putts)) rows.push(['Putts', hs.map(h => `<td class="${h && h.putts >= 3 ? 'bad' : h && h.putts === 1 ? 'good' : ''}">${h && h.putts != null ? h.putts : ''}</td>`).join(''), `<td>${sum(h => h.putts || 0)}</td>`, '']);
    return `<table class="rp-sc">${rows.map(([l, cells, tot, cls]) => `<tr class="${cls}"><th class="l">${l}</th>${cells}${tot}</tr>`).join('')}</table>`;
  };
  return `<div class="rp-card-sc">${nine(0, 'Out')}${r.holes.slice(9).some(Boolean) ? nine(9, 'In') : ''}</div>`;
}
function roundSummary(T, r, pr, now) {
  const net = r.netToPar;
  return `<div class="rp-rs" id="rp-${esc(pr.id)}-${esc(r.rid)}">
    <div class="rp-rsh"><b>${esc(roundName(r.rid))}</b><span>${esc(r.course.replace('Cullinan ', ''))}${r.full ? '' : ' \u00B7 ' + r.played + ' holes'}</span></div>
    <div class="rp-hero">
      <div class="rp-big"><small>Score</small><b class="num">${r.gross}</b><em>${r.front} / ${r.back} \u00B7 ${sign(r.toPar)}</em></div>
      <div class="rp-side">
        <div><small>Net</small><b class="num">${r.netHoles ? r.par + net : '\u2013'}</b>${r.netHoles ? `<i class="rp-badge ${net < 0 ? 'under' : net > 0 ? 'over' : 'level'}">${sign(net)}</i>` : ''}</div>
        <div><small>Points</small><b class="num">${r.pts}</b><em>${r.ptsF} / ${r.ptsB}</em></div>
      </div>
    </div>
    ${scorecard(T, r, pr)}
    ${distChart(r.dist, r.played)}
  </div>`;
}

/** The whole report. `body` is what the writer wrote (recaps/report), or null for the numbers alone. */
export function renderReport(T, body, opts) {
  opts = opts || {};
  const now = opts.now || E.nowLocal();
  const F = fieldReport(T, now), t = F.totals, ld = F.leaders;
  if (!F.players.length) return `<div class="report"><p class="rp-empty">No cards in the book yet. The report reads every card once the rounds are scored.</p></div>`;
  const words = body && typeof body === 'object' ? body : null;
  const summary = words && Array.isArray(words.summary) ? words.summary : [];
  const parMax = Math.max(0.5, ...['3', '4', '5'].map(k => Math.abs(F.byPar[k] || 0)));
  const exec = `<div class="rp-card rp-exec">
    <div class="rp-band"><small>The Union Invitational · Belek 2026</small><h2>The State of the Union</h2><p>${t.players} golfers · ${E.countingRounds(T).length} counting rounds · ${t.cards} full cards</p></div>
    <div class="rp-body">
      <div class="rp-tiles">
        ${tile('Field average', t.avgGross == null ? '—' : f1(t.avgGross), 'gross, a round')}
        ${tile('Best round', ld.lowGross ? String(ld.lowGross.gross) : '—', ld.lowGross ? ld.lowGross.name + ', ' + roundName(ld.lowGross.rid) : '')}
        ${tile('Most improved', ld.improved ? sign(ld.improved.trend) : '—', ld.improved ? ld.improved.name + ', first to last' : '')}
        ${t.puttHoles ? tile('Three-putts', f1(t.p3 / Math.max(1, t.puttCards)), 'a card, where counted') : tile('Doubles or worse', String(F.rounds.reduce((a, r) => a + r.doubles, 0)), 'the week')}
        ${tile('Out of bounds', String(t.ob), 'balls, the week')}
        ${tile('Pick-ups', String(t.pu), 'holes, the week')}
      </div>
      <h3>How the holes went</h3>
      ${distChart(F.players.reduce((d, p) => { for (const k of Object.keys(d)) d[k] += p.week.dist[k]; return d; }, { eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0, worse: 0 }), t.holes)}
      <h3>Where the points came from</h3>
      ${bar('Par 3s, over par a hole', F.byPar['3'] || 0, parMax, F.byPar['3'] == null ? '—' : signF(F.byPar['3']), (F.byPar['3'] || 0) >= parMax - 0.001)}
      ${bar('Par 4s', F.byPar['4'] || 0, parMax, F.byPar['4'] == null ? '—' : signF(F.byPar['4']), (F.byPar['4'] || 0) >= parMax - 0.001)}
      ${bar('Par 5s', F.byPar['5'] || 0, parMax, F.byPar['5'] == null ? '—' : signF(F.byPar['5']), (F.byPar['5'] || 0) >= parMax - 0.001)}
      ${bar('Back nine over front', t.avgBackEdge || 0, 6, (t.avgBackEdge == null ? '—' : signF(t.avgBackEdge) + ' pts a card') + ' · ' + t.backBetter + ' of ' + t.cards, false)}
      <h3>The coach’s read on the field</h3>
      ${summary.length ? paras(summary, 'rp-p') : `<p class="rp-wait">${words ? 'The summary is being written.' : 'The coach’s notes have not been written yet. The numbers below are live.'}</p>`}
      <h3>Leaders</h3>
      <table class="rp-table"><tbody>
        <tr><th>Low gross</th><td>${ld.lowGross ? esc(ld.lowGross.name) + ' ' + ld.lowGross.gross + ' (' + esc(roundName(ld.lowGross.rid)) + ')' : '—'}</td></tr>
        <tr><th>Low net</th><td>${ld.lowNet ? esc(ld.lowNet.name) + ' ' + sign(ld.lowNet.netToPar) + ' (' + esc(roundName(ld.lowNet.rid)) + ')' : '—'}</td></tr>
        <tr><th>Most points, a round</th><td>${ld.mostPts ? esc(ld.mostPts.name) + ' ' + ld.mostPts.pts + ' (' + esc(roundName(ld.mostPts.rid)) + ')' : '—'}</td></tr>
        <tr><th>Most pars</th><td>${ld.mostPars ? esc(ld.mostPars.name) + ' ' + ld.mostPars.week.dist.par : '—'}</td></tr>
        ${ld.most3 ? `<tr><th>Most three-putts</th><td>${esc(ld.most3.name)} ${ld.most3.week.p3}</td></tr>` : ''}
        ${ld.mostOb && ld.mostOb.week.marks.ob ? `<tr><th>Most out of bounds</th><td>${esc(ld.mostOb.name)} ${ld.mostOb.week.marks.ob}</td></tr>` : ''}
      </tbody></table>
    </div></div>`;
  const player = (pr, i) => playerCard(T, pr, i, F, words, now);
  /* THE REPORT IS NOT ONE LONG SCROLL. The summary, then a row a golfer;
     a tap opens that golfer on their own (a window in the book, a pop-up
     on the page). `opts.all` draws every page in one, for printing. */
  const row = pr => { const g = pr.grades || {}; const attr = opts.rowAttr ? opts.rowAttr(pr.id) : `data-act="reportPlayer" data-a="${esc(pr.id)}"`;
    return `<button class="rp-row" ${attr} aria-label="Open ${esc(pr.name)}\u2019s report">
      <span class="rp-rw"><b>${esc(pr.name)}</b><small>${pr.band == null ? 'no handicap' : 'hcp ' + esc(pr.band)}${pr.best ? ' \u00B7 best ' + pr.best.gross : ''} \u00B7 ${pr.week.pts} pts${pr.mvp ? ' \u00B7 MVP ' + ordinal(pr.mvp.pos) : ''}</small></span>
      <span class="rp-rg">${GRADE_ROWS.slice(0, 4).map(([k]) => `<i class="rp-gl${gradeCls(g[k])}">${g[k] || '\u2013'}</i>`).join('')}</span>
      <span class="rp-go" aria-hidden="true">\u203A</span></button>`; };
  const list = `<div class="rp-list"><h3 class="rp-lh">The golfers</h3>${F.players.map(row).join('')}</div>`;
  return `<div class="report">${exec}${opts.all ? F.players.map(player).join('') : list}</div>`;
}
/** One golfer's page, on its own. */
export function renderPlayer(T, body, pid, opts) {
  opts = opts || {};
  const now = opts.now || E.nowLocal();
  const F = fieldReport(T, now), i = F.players.findIndex(p => p.id === pid);
  if (i < 0) return '<div class="report"><p class="rp-empty">No cards for this golfer yet.</p></div>';
  const words = body && typeof body === 'object' ? body : null;
  return `<div class="report">${playerCard(T, F.players[i], i, F, words, now)}</div>`;
}
function playerCard(T, pr, i, F, words, now) {
    const w = pr.week, g = pr.grades || {}, pw = words && words.players ? words.players[pr.id] : null;
    const letter = pw && Array.isArray(pw.letter) ? pw.letter : [], three = pw && Array.isArray(pw.three) ? pw.three : [], read = pw && pw.read ? String(pw.read) : '';
    const full = pr.rounds.filter(r => r.full);
    const trendMax = Math.max(...full.map(r => r.gross), 1), trendMin = Math.min(...full.map(r => r.gross), trendMax - 1);
    const mvpNote = pr.mvp ? ordinal(pr.mvp.pos) + ' on the MVP board' : '';
    return `<div class="rp-card rp-player" id="rp-${esc(pr.id)}">
      <div class="rp-band"><small>Player report · ${i + 1} of ${F.players.length}</small><h2>${esc(pr.name)}</h2>
        <p>${pr.band == null ? 'No handicap' : 'Handicap ' + esc(pr.band)}${pr.playing != null ? ' · plays off ' + pr.playing + ' in the team game' : ''}${pr.pair && pr.pair.partner ? ' · paired with ' + esc(pr.pair.partner) : ''}${pr.side ? ' · ' + esc(pr.side) : ''}</p></div>
      <div class="rp-body">
        <div class="rp-tiles">
          ${tile('Best round', pr.best ? String(pr.best.gross) : '\u2014', pr.best ? roundName(pr.best.rid) + ' \u00B7 ' + sign(pr.best.toPar) : '')}
          ${tile('Points', String(w.pts), 'the week \u00B7 ' + (pr.mvp ? 'net ' + pr.mvp.totalStr : sign(w.netToPar) + ' net'))}
          ${tile('MVP', pr.mvp ? ordinal(pr.mvp.pos) : '\u2014', mvpNote ? 'of ' + E.mvpBoard(T, now).length : '')}
        </div>
        <h3>The coach\u2019s read</h3>
        ${read ? `<p class="rp-read">${esc(read)}</p>` : `<p class="rp-wait">${words ? 'Being written.' : 'Not written yet.'}</p>`}
        <h3>The week, hole by hole</h3>
        ${distChart(w.dist, w.played)}
        ${statGrid(w)}
        ${full.length > 1 ? `<h3>Trend</h3><div class="rp-trend">${full.map(r => `<div style="height:${Math.round(30 + 65 * (trendMax - r.gross + 2) / (trendMax - trendMin + 2))}%"><span class="num">${r.gross}</span><small>${esc(roundShort(r.rid))}</small></div>`).join('')}</div>` : ''}
        <h3>Grades</h3>
        ${GRADE_ROWS.map(([k, l]) => { const note = k === 'par3' || k === 'par4' || k === 'par5' ? (w.byPar[k.slice(3)] && w.byPar[k.slice(3)][1] ? signF(w.byPar[k.slice(3)][0] / w.byPar[k.slice(3)][1]) + ' a hole over ' + w.byPar[k.slice(3)][1] : 'none played')
          : k === 'putting' ? (w.puttHoles >= 9 ? w.putts + ' putts on ' + w.puttHoles + ' counted holes, ' + w.p3 + ' three-putt' + (w.p3 === 1 ? '' : 's') : 'putts not counted')
          : k === 'composure' ? (w.dist.double + w.dist.worse) + ' doubles or worse, ' + w.pu + ' pick-up' + (w.pu === 1 ? '' : 's') + ', ' + w.marks.ob + ' OB'
          : k === 'consistency' ? (pr.range != null ? 'rounds within ' + pr.range + (pr.range === 1 ? ' shot' : ' shots') : 'one full round')
          : (w.teamHoles ? 'ball counted on ' + w.counted + ' of ' + w.teamHoles + ' holes' : 'no pair');
          return `<div class="rp-grade"><span>${esc(l)}<em>${esc(note)}</em></span><b class="rp-gl${gradeCls(g[k])}">${g[k] || '\u2013'}</b></div>`; }).join('')}
        <h3>The coach\u2019s letter</h3>
        ${letter.length ? paras(letter, 'rp-p') : `<p class="rp-wait">${words ? 'Being written.' : 'Not written yet.'}</p>`}
        ${three.length ? `<div class="rp-three"><b>Three things</b><ol>${three.map(x => `<li>${esc(x)}</li>`).join('')}</ol></div>` : ''}
        <h3>Every round</h3>
        <div class="rp-key"><span><i class="rp-cell under"></i>birdie</span><span><i class="rp-cell par"></i>par</span><span><i class="rp-cell bogey"></i>bogey</span><span><i class="rp-cell double"></i>double</span><span><i class="rp-cell worse"></i>worse</span><span><i class="rp-cell par pu"></i>pick-up</span></div>
        ${pr.rounds.map(r => roundSummary(T, r, pr, now)).join('')}
        <h3>The numbers</h3>
        <div class="rp-tbl"><table class="rp-table rp-num"><thead><tr><th></th>${pr.rounds.map(r => `<th class="r">${esc(roundShort(r.rid))}</th>`).join('')}<th class="r">Week</th></tr></thead><tbody>
          <tr><td>Gross · to par</td>${pr.rounds.map(r => `<td class="r">${r.gross} · ${sign(r.toPar)}</td>`).join('')}<td class="r">${w.gross} · ${sign(w.toPar)}</td></tr>
          <tr><td>Points (front / back)</td>${pr.rounds.map(r => `<td class="r">${r.pts} (${r.ptsF}/${r.ptsB})</td>`).join('')}<td class="r">${w.pts} (${w.ptsF}/${w.ptsB})</td></tr>
          <tr><td>Net to par</td>${pr.rounds.map(r => `<td class="r">${sign(r.netToPar)}</td>`).join('')}<td class="r">${sign(w.netToPar)}</td></tr>
          <tr><td>Birdie · par · bogey · dbl · worse</td>${pr.rounds.concat([{ dist: w.dist }]).map(r => `<td class="r">${r.dist.eagle + r.dist.birdie}·${r.dist.par}·${r.dist.bogey}·${r.dist.double}·${r.dist.worse}</td>`).join('')}</tr>
          <tr><td>Par 3 / 4 / 5, over</td>${pr.rounds.concat([{ byPar: w.byPar }]).map(r => `<td class="r">${['3', '4', '5'].map(k => (r.byPar[k] && r.byPar[k][1] ? sign(r.byPar[k][0]) : '–')).join(' / ')}</td>`).join('')}</tr>
          <tr><td>Index 1–6 / 7–12 / 13–18, over</td>${pr.rounds.concat([{ byIdx: w.byIdx }]).map(r => `<td class="r">${['lo', 'mid', 'hi'].map(k => (r.byIdx[k][1] ? sign(r.byIdx[k][0]) : '–')).join(' / ')}</td>`).join('')}</tr>
          <tr><td>Putts · 3-putts · 1-putts</td>${pr.rounds.concat([w]).map(r => `<td class="r">${r.puttHoles ? r.putts + '·' + r.p3 + '·' + r.p1 : '—'}</td>`).join('')}</tr>
          <tr><td>OB · water · pick-ups</td>${pr.rounds.concat([w]).map(r => `<td class="r">${r.marks.ob}·${r.marks.water}·${r.pu}</td>`).join('')}</tr>
          <tr><td>Ball counted for the team</td>${pr.rounds.concat([w]).map(r => `<td class="r">${r.teamHoles ? r.counted + ' of ' + r.teamHoles : '—'}</td>`).join('')}</tr>
          ${pr.bbbRounds.length ? `<tr><td>Bingo Bango Bongo</td>${pr.rounds.map(r => { const b = pr.bbbRounds.find(x => x.rid === r.rid); return `<td class="r">${b ? b.pts : '–'}</td>`; }).join('')}<td class="r">${pr.bbb ? pr.bbb.pts + ' (' + ordinal(pr.bbb.pos) + ')' : '–'}</td></tr>` : ''}
          ${pr.matches.length ? `<tr><td>Ryder Cup singles</td>${pr.rounds.map(r => { const m = pr.matches.find(x => x.rid === r.rid); return `<td class="r">${m ? (m.result === 'won' ? 'W' : m.result === 'lost' ? 'L' : m.result === 'halved' ? 'H' : '–') + (m.done && m.up ? ' ' + Math.abs(m.up) : '') : '–'}</td>`; }).join('')}<td class="r">${pr.rec.w}–${pr.rec.l}–${pr.rec.h}</td></tr>` : ''}
          ${pr.pair && pr.pair.row ? `<tr><td>Team: ${esc(pr.pair.name)}</td><td class="r" colspan="${pr.rounds.length + 1}">${ordinal(pr.pair.row.pos)} · ${pr.pair.row.total} pts</td></tr>` : ''}
          ${pr.playsTo != null ? `<tr><td>Handicap read</td><td class="r" colspan="${pr.rounds.length + 1}">net ${signF(pr.avgNet)} a round · played to about ${pr.playsTo}</td></tr>` : ''}
        </tbody></table></div>
      </div></div>`;
}
