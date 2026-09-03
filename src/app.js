/* The Union Invitational — yardage book application.
   Vanilla render + delegated dispatch. Every screen is a pure function of
   (tournament state, ui state, clock). */

import * as D from './data.js';
import * as E from './engine.js';
import * as S from './store.js';
import { RULES, RELIEF } from './rules.js';

const IMG = window.UI_IMAGES || {};
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cls = n => n == null ? '' : n < 0 ? 'under' : n > 0 ? 'over' : 'level';

let store = null;
let T = S.emptyState();
let meta = { ready: false, mode: 'local', status: 'connecting' };
let now = E.nowLocal();

const UI = {
  screen: 'today',
  role: 'viewer',
  boardTab: 'pairs',
  boardRound: 'r1',
  bookHole: 0,
  entryRound: 'r1',
  entryHole: 0,
  entryTee: 'all',
  courseTab: 'aspendos',
  courseHole: 0,
  calDay: null,
  modal: null,       // {title, note, onOk(pin) -> string|null err}
  modalErr: '',
  revealPins: false,
  toast: '',
};

const canEdit = () => S.ROLES[UI.role].canEdit;
const canAdmin = () => S.ROLES[UI.role].canAdmin;

/* ---------------- flags ---------------- */

function flagSvg(sq) {
  if (sq === 'USA') return `<svg class="fl" viewBox="0 0 38 24" aria-hidden="true"><rect width="38" height="24" fill="#F4F2EF"/>${
    [0,2,4,6,8,10,12].map(i => `<rect y="${i*24/13}" width="38" height="${24/13}" fill="#B22234"/>`).join('')
  }<rect width="16" height="${24*7/13}" fill="#3C3B6E"/>${
    [0,1,2,3].map(r => [0,1,2,3,4].map(c => `<circle cx="${2+c*3.2}" cy="${2+r*3}" r="0.85" fill="#fff"/>`).join('')).join('')
  }</svg>`;
  if (sq === 'UK') return `<svg class="fl" viewBox="0 0 38 24" aria-hidden="true"><rect width="38" height="24" fill="#012169"/>` +
    `<path d="M0 0 38 24M38 0 0 24" stroke="#fff" stroke-width="5"/>` +
    `<path d="M0 0 38 24M38 0 0 24" stroke="#C8102E" stroke-width="3"/>` +
    `<path d="M19 0V24M0 12H38" stroke="#fff" stroke-width="8"/>` +
    `<path d="M19 0V24M0 12H38" stroke="#C8102E" stroke-width="4.5"/></svg>`;
  return `<svg class="fl" viewBox="0 0 38 24" aria-hidden="true"><rect width="38" height="24" fill="none" stroke="currentColor" stroke-opacity=".35" stroke-dasharray="3 3"/><line x1="8" y1="12" x2="30" y2="12" stroke="currentColor" stroke-opacity=".3" stroke-width="1.5"/></svg>`;
}

/* ---------------- small pieces ---------------- */

function phasePill(rid) {
  const p = E.phaseOf(T, rid, now);
  const k = p === 'live' ? 'live' : p === 'final' ? 'final' : 'open';
  return `<span class="pill ${p === 'live' ? 'live' : p === 'final' ? 'final' : ''}">${esc(E.phaseLabel(p))}</span>`;
}

function roundTabs(current, act) {
  return `<div class="chiprow" style="margin-top:14px">` + D.ROUNDS.map(r => {
    const d = E.dayOf(r.dayIdx);
    return `<button class="chip${r.id === current ? ' on' : ''}" data-act="${act}" data-a="${r.id}">${esc(r.short)} <span class="num" style="opacity:.7">${esc(d.date)}</span></button>`;
  }).join('') + `</div>`;
}

function holeStrip(rid, sel, act, pair) {
  const holes = E.courseOf(T, rid).holes;
  return `<div class="strip">` + holes.map((hole, i) => {
    let k = '';
    if (pair) {
      const s = E.pairHole(T, rid, pair, i);
      if (s != null) { const d = s - hole.par; k = d < 0 ? ' u' : d > 0 ? ' o' : ' e'; }
    } else {
      const any = E.golfers(T).some(g => { const c = E.card(T, rid, g.id); return c && c.raw[i] != null; });
      if (any) k = ' played';
    }
    return `<button class="cell${k}${i === sel ? ' here' : ''}" data-act="${act}" data-a="${i}" aria-label="Hole ${i + 1}">${i + 1}</button>`;
  }).join('') + `</div>`;
}

function holeLeaf(rid, h, opts = {}) {
  const course = E.courseOf(T, rid);
  const hole = course.holes[h];
  const cap = E.capFor(hole.par, T.config.capOver);
  const img = IMG[hole.img];
  return `
    <div class="eyebrow">${esc(course.name)}</div>
    <div class="holeno"><b class="num">${hole.n}</b><span style="font-size:18px;color:var(--turf)">hole</span>${opts.pill || ''}</div>
    <table class="facts"><tbody>
      <tr><td>Par</td><td>${hole.par}</td></tr>
      <tr><td>White tees</td><td>${hole.mW} m</td></tr>
      <tr><td>Yellow tees</td><td>${hole.mY} m</td></tr>
      <tr><td>Stroke index</td><td>${hole.si}</td></tr>
      <tr><td>Band 15 receives</td><td>${E.strokesFor(15, hole.si)}</td></tr>
      <tr><td>Band 20 receives</td><td>${E.strokesFor(20, hole.si)}</td></tr>
      <tr><td>Band 25 receives</td><td>${E.strokesFor(25, hole.si)}</td></tr>
      <tr class="cap"><td>Pick up at</td><td>${cap}</td></tr>
    </tbody></table>
    ${opts.strip || ''}
    ${img ? `<figure class="diagram"><img src="${img}" alt="Diagram of hole ${hole.n} at ${esc(course.name)}" loading="lazy"><figcaption>Hole ${hole.n} — par ${hole.par}, ${hole.mW} m from the whites.</figcaption></figure>` : ''}
  `;
}

/* ---------------- screens ---------------- */

function ukFlag(w) { return `<svg width="${w}" height="${Math.round(w * 16 / 26)}" viewBox="0 0 26 16" role="img" aria-label="United Kingdom">`
  + `<rect width="26" height="16" fill="#1D3E8F"></rect>`
  + `<path d="M0,0 26,16 M26,0 0,16" stroke="#FBFAF7" stroke-width="3.4"></path>`
  + `<path d="M0,0 26,16 M26,0 0,16" stroke="#9E3B2E" stroke-width="1.4"></path>`
  + `<path d="M13,0 V16 M0,8 H26" stroke="#FBFAF7" stroke-width="5.4"></path>`
  + `<path d="M13,0 V16 M0,8 H26" stroke="#9E3B2E" stroke-width="2.8"></path></svg>`; }

function usFlag(w) { return `<svg width="${w}" height="${Math.round(w * 16 / 26)}" viewBox="0 0 26 16" role="img" aria-label="United States">`
  + `<rect width="26" height="16" fill="#FBFAF7"></rect>`
  + `<g fill="#9E3B2E"><rect y="0" width="26" height="2.3"></rect><rect y="4.6" width="26" height="2.3"></rect>`
  + `<rect y="9.2" width="26" height="2.3"></rect><rect y="13.7" width="26" height="2.3"></rect></g>`
  + `<rect width="11" height="8" fill="#1D3E8F"></rect></svg>`; }

function scrToday() {
  const focus = D.ROUNDS.find(r => E.phaseOf(T, r.id, now) === 'live')
             || D.ROUNDS.find(r => E.phaseOf(T, r.id, now) === 'today')
             || D.ROUNDS.find(r => E.dayOf(r.dayIdx).iso >= now.iso)
             || D.ROUNDS[D.ROUNDS.length - 1];
  const day = E.dayOf(focus.dayIdx);
  const cfg = E.roundCfg(T, focus.id);
  const teeTime = cfg.tees[0] && cfg.tees[0].time ? E.to12(cfg.tees[0].time) : 'to be set';
  const nf = E.nextFixture(T, now);
  const isToday = day.iso === now.iso;

  const entries = [];
  for (const r of D.ROUNDS) {
    if (E.dayOf(r.dayIdx).iso !== day.iso) continue;
    const t = E.roundCfg(T, r.id).tees[0];
    if (t && t.time) entries.push({ time: t.time, golf: true, title: r.full, sub: E.courseOf(T, r.id).name });
  }
  for (const e of T.config.schedule) {
    if (E.dayOf(e.dayIdx).iso !== day.iso) continue;
    entries.push({ time: e.time, golf: false, title: e.title, sub: '' });
  }
  entries.sort((a, b) => String(a.time).localeCompare(String(b.time)));

  const pairs = E.pairsBoard(T, now);
  const mvp = E.mvpBoard(T, now);
  const R = E.ryderData(T, now);
  const priv = E.teePrivilege(T, now);
  const issues = E.setupIssues(T);

  const leaderBlock = (lbl, row, who) => `<div class="leader"><div class="lbl">${esc(lbl)}</div>
    <div class="fig ${row ? cls(row.total) : ''}">${row ? esc(row.totalStr) : '—'}</div>
    <div class="who">${row ? esc(who(row)) : 'No card in yet'}</div></div>`;

  return `
  ${IMG.hero ? `<figure class="hero"><img src="${IMG.hero}" alt="Sunset aerial over Cullinan Links and the Titanic Deluxe, Belek"></figure>` : ''}
  <div class="today-grid">
    <div>
      <div class="today-day">Day ${day.n} of 8 — ${esc(day.dow)} ${esc(day.date)}</div>
      <h1 class="today-title">${esc(focus.full)}</h1>
      <p class="today-course">${esc(E.courseOf(T, focus.id).name)} — tee time ${esc(teeTime)}</p>

      <div class="countdown">
        <div class="today-day">Next fixture in</div>
        <div class="fig">${nf ? esc(nf.countdown) : '—'}</div>
        <div class="nxt">${nf ? esc(nf.label) : 'Nothing left on the card.'}</div>
      </div>

      <div class="tonight">
        <div class="today-day">${isToday ? 'Tonight' : esc(day.dow)}</div>
        ${entries.length ? entries.map(e => `<div class="line">
          <time>${esc(E.to12(e.time))}</time>
          <span class="t${e.golf ? ' golf' : ''}">${esc(e.title)}</span>
          <span class="s">${esc(e.sub)}</span></div>`).join('')
        : `<div class="line"><span class="s">Nothing scheduled.</span></div>`}
      </div>

      ${issues.length ? `<div class="notice"><b>Before the first ball</b><ul>${issues.map(i => `<li>${esc(i.text)}</li>`).join('')}</ul></div>` : ''}
    </div>

    <div>
      <div class="leaders">
        ${leaderBlock('Team Comp Leader', pairs[0], r => r.name)}
        ${leaderBlock('MVP Leader', mvp[0], r => r.name)}
        <div class="leader">
          <div class="lbl">Ryder Cup Leader</div>
          <div class="cup">${ukFlag(26)}<span style="color:var(--green)">${R.ukTotal}</span>
            <span style="color:var(--turf)">–</span>
            <span style="color:var(--usa)">${R.usaTotal}</span>${usFlag(26)}</div>
          ${R.unassigned ? `<div style="font-size:14px;color:var(--flag)">${R.unassigned} location${R.unassigned > 1 ? 's' : ''} still unset</div>` : ''}
        </div>
      </div>

      <div class="privilege">
        <h4>Tee-time privilege</h4>
        ${priv.map(p => {
          const pickDay = p.pickDay.dow;
          if (p.done) return `<p><strong>${esc(p.leaderName || 'The leaders')}</strong> led ${esc(p.fromDay.dow)} and chose ${esc(pickDay)}’s tee: <strong>${esc(p.time12)}</strong>.</p>`;
          if (!p.unlocked) return `<p class="note">${esc(pickDay)}’s pick unlocks when ${esc(p.fromDay.dow)} closes.</p>`;
          return `<p><strong>${esc(p.leaderName)}</strong> lead ${esc(p.fromDay.dow)} and pick ${esc(pickDay)}’s tee.</p>
            ${canEdit() ? `<select class="field" style="margin-top:8px;width:100%" data-act="pickTee" data-a="${p.pick}" aria-label="Pick ${esc(pickDay)}’s tee">
              <option value="">Pick ${esc(pickDay)}’s tee</option>
              ${E.TEE_CHOICES.map(t => `<option value="${t}">${esc(E.to12(t))}</option>`).join('')}</select>`
            : `<p class="note">A scorer records the pick.</p>`}`;
        }).join('')}
        <p class="note">Two picks only.</p>
      </div>
    </div>
  </div>`;
}

function scrBoards() {
  const tabs = [['pairs', 'Team'], ['mvp', 'MVP'], ['bbb', 'Bingo Bango Bongo'], ['prizes', 'Pins & Drives']];
  let body = '';
  if (UI.boardTab === 'pairs') body = boardPairs();
  else if (UI.boardTab === 'mvp') body = boardMvp();
  else if (UI.boardTab === 'bbb') body = boardBbb();
  else body = boardPrizes();
  return `<div class="chiprow" style="margin-top:16px">${tabs.map(([id, l]) =>
      `<button class="chip${UI.boardTab === id ? ' on' : ''}" data-act="boardTab" data-a="${id}">${esc(l)}</button>`).join('')}</div>${body}`;
}

function boardPairs() {
  const rid = UI.boardRound;
  const rows = E.pairsBoard(T, now);
  const board = rows.length ? rows : [];
  const leadPair = board.length ? T.config.pairs.find(p => p.id === board[0].id) : T.config.pairs[0];
  const h = UI.bookHole;
  const hole = E.courseOf(T, rid).holes[h];
  const onHole = T.config.pairs.map(p => {
    const s = E.pairHole(T, rid, p, h);
    return { name: E.pairName(T, p), net: s, d: s == null ? null : s - hole.par };
  }).filter(r => r.net != null).sort((a, b) => a.net - b.net);

  return `
  <h2 class="head">Team Competition</h2>
  <p class="lede">Better of the two net scores on every hole, cumulative across the three counting rounds. The book opens at the hole; the standing is the consequence. <a href="#rules" data-act="goRule" data-a="pairs">Full rules</a></p>
  ${roundTabs(rid, 'boardRound')}
  <div class="spread">
    <div class="leaf-l">${holeLeaf(rid, h, { pill: phasePill(rid), strip: holeStrip(rid, h, 'bookHole', leadPair) })}
      <p style="font-size:14px;color:var(--turf);font-style:italic;margin:10px 0 0">Turn the page: tap a hole. Colour follows the leading pair.</p>
    </div>
    <div class="leaf-r">
      <div class="eyebrow">Teams on hole ${hole.n} — net better ball</div>
      ${onHole.length ? `<div class="rows" style="margin-top:8px">
        <div class="rowhead"><span style="flex:1">Team</span><span style="min-width:46px;text-align:right">Net</span><span style="min-width:74px;text-align:right">To par</span></div>
        ${onHole.map(r => `<div class="row"><span class="who">${esc(r.name)}</span>
          <span class="n num">${r.net}</span>
          <span class="big num ${cls(r.d)}">${esc(E.fmtToPar(r.d))}</span></div>`).join('')}
      </div>` : `<p class="empty">Nobody has played hole ${hole.n} yet.</p>`}

      <div class="eyebrow" style="margin-top:26px">Championship standing — rounds 1 to 3</div>
      ${board.length ? `<div class="rows" style="margin-top:8px">
        <div class="rowhead"><span style="width:24px">Pos</span><span style="flex:1">Team</span><span style="min-width:46px;text-align:right">Thru</span><span style="min-width:46px;text-align:right">Today</span><span style="min-width:74px;text-align:right">Total</span></div>
        ${board.map(r => `<div class="row">
          <span class="pos num">${r.pos}</span>
          <span class="who">${esc(r.name)}<small>${esc(r.members)}</small></span>
          <span class="n num" style="color:var(--turf)">${esc(r.thruStr)}</span>
          <span class="n num ${cls(r.today)}">${esc(r.todayStr)}</span>
          <span class="big num ${cls(r.total)}">${esc(r.totalStr)}</span></div>`).join('')}
      </div>
      <p style="font-size:14px;color:var(--turf);font-style:italic;margin-top:10px">Net is the pair’s better ball with strokes applied. Total is the tournament to par.</p>`
      : `<p class="empty">The championship board opens once a counting round is under way.</p>`}
    </div>
  </div>`;
}

function boardMvp() {
  const rows = E.mvpBoard(T, now);
  return `<h2 class="head">Tournament MVP</h2>
  <p class="lede">Your own ball, your own number, every stroke counted. Runs off the same card as the team competition. <a href="#rules" data-act="goRule" data-a="mvp">Full rules</a></p>
  ${rows.length ? `<div class="rows" style="margin-top:18px">
    <div class="rowhead"><span style="width:24px">Pos</span><span style="flex:1">Player</span><span style="min-width:46px;text-align:right">Band</span><span style="min-width:46px;text-align:right">Thru</span><span style="min-width:46px;text-align:right">Today</span><span style="min-width:46px;text-align:right">Pts</span><span style="min-width:74px;text-align:right">Total</span></div>
    ${rows.map(r => `<div class="row">
      <span class="pos num">${r.pos}</span>
      <span class="who">${esc(r.name)}</span>
      <span class="n num" style="color:var(--turf)">${esc(r.bandStr)}</span>
      <span class="n num" style="color:var(--turf)">${esc(r.thruStr)}</span>
      <span class="n num ${cls(r.today)}">${esc(r.todayStr)}</span>
      <span class="n num" style="color:var(--turf)">${esc(r.stbStr)}</span>
      <span class="big num ${cls(r.total)}">${esc(r.totalStr)}</span></div>`).join('')}
  </div><p style="font-size:14px;color:var(--turf);font-style:italic;margin-top:10px">Pts is the Stableford equivalent, shown for interest — the MVP is decided on net to par.</p>`
  : `<p class="empty">No individual scores yet. Every golfer needs a playing band before their card counts.</p>`}`;
}

function boardBbb() {
  const rows = E.bbbBoard(T);
  return `<h2 class="head">Bingo Bango Bongo</h2>
  <p class="lede">Three points a hole — first on, closest once all are on, first in. 54 a round, 162 across the week. <a href="#rules" data-act="goRule" data-a="bbb">Full rules</a></p>
  ${rows.length ? `<div class="rows" style="margin-top:18px;max-width:560px">
    <div class="rowhead"><span style="width:24px">Pos</span><span style="flex:1">Player</span><span style="min-width:74px;text-align:right">Points</span></div>
    ${rows.map(r => `<div class="row"><span class="pos num">${r.pos}</span><span class="who">${esc(r.name)}</span>
      <span class="big num">${esc(r.ptsStr)}</span></div>`).join('')}
  </div>` : `<p class="empty">No points banked yet. Scorers tap the three names per hole on the Score Entry screen.</p>`}`;
}

function boardPrizes() {
  const nm = pid => (E.person(T, pid) || {}).display || '—';
  return `<h2 class="head">Longest Drive &amp; Closest to the Pin</h2>
  <p class="lede">One nominated hole each, per counting round. Nominate before play; record the mark as it stands.</p>
  ${E.countingRounds(T).map(r => {
    const c = E.roundCfg(T, r.id); const d = E.dayOf(r.dayIdx);
    return `<h3 class="sub">${esc(r.short)} — ${esc(d.dow)} ${esc(d.date)} · ${esc(E.courseOf(T, r.id).name)}</h3>
    <div class="rows" style="margin-top:8px;max-width:620px">
      <div class="row"><span class="who">Closest to the pin<small>${c.ctpHole ? 'Hole ' + c.ctpHole : 'No hole nominated'}</small></span>
        <span class="n" style="min-width:120px;font-size:17px">${c.ctpWinner ? esc(nm(c.ctpWinner)) : '—'}</span>
        <span class="n num" style="min-width:74px;color:var(--turf)">${esc(c.ctpDist || '')}</span></div>
      <div class="row"><span class="who">Longest drive<small>${c.ldHole ? 'Hole ' + c.ldHole : 'No hole nominated'}</small></span>
        <span class="n" style="min-width:120px;font-size:17px">${c.ldWinner ? esc(nm(c.ldWinner)) : '—'}</span>
        <span class="n num" style="min-width:74px;color:var(--turf)">${esc(c.ldDist || '')}</span></div>
    </div>`;
  }).join('')}
  ${canEdit() ? `<p class="lede" style="margin-top:16px">Nominate holes and record winners on the Score Entry screen for each round.</p>` : ''}`;
}

function scrRyder() {
  const R = E.ryderData(T, now);
  const gs = E.golfers(T);
  return `<h2 class="head">Ryder Cup — UK v USA</h2>
  <p class="lede">Squad match play laid over the same scorecards. Fourballs Thursday and Friday, singles Sunday. <a href="#rules" data-act="goRule" data-a="ryder">Full rules</a></p>

  <div class="cupbar">
    <div class="side">${flagSvg('UK')}<span class="pts num" style="color:var(--uk)">${R.ukTotal}</span><span class="eyebrow">United Kingdom</span></div>
    <div class="vs">v</div>
    <div class="side r"><span class="eyebrow">United States</span><span class="pts num" style="color:var(--usa)">${R.usaTotal}</span>${flagSvg('USA')}</div>
  </div>

  <h3 class="sub">Squads</h3>
  <p class="lede">${canEdit() ? 'Tap a name to move them: unassigned → USA → UK → unassigned.' : 'Squads are set by the scorers.'}${R.unassigned ? ` <b>${R.unassigned} still unassigned.</b>` : ''}</p>
  <div class="grid-people">
    ${gs.map(g => {
      const sq = g.location;
      const k = sq === 'UK' ? 'uk' : sq === 'USA' ? 'usa' : 'none';
      return `<button class="flagbtn ${k}" data-act="cycleSquad" data-a="${g.id}"${canEdit() ? '' : ' disabled'}
        aria-label="${esc(g.display)}, ${sq ? esc(sq) : 'unassigned'}">
        ${flagSvg(sq)}<span class="who">${esc(g.display)}</span><span class="sq">${sq ? esc(sq) : 'Unassigned'}</span></button>`;
    }).join('')}
  </div>
  ${canEdit() ? `<div class="chiprow" style="margin-top:12px"><button class="chip" data-act="clearSquads">Clear all squads</button></div>` : ''}
  ${R.splitPairs ? `<div class="notice"><b>${R.splitPairs} pair${R.splitPairs > 1 ? 's are' : ' is'} split across squads</b><div style="font-size:15px;color:var(--turf)">Fourball matches only build from pairs whose two players share a squad. Singles on Sunday are unaffected.</div></div>` : ''}

  ${R.sessions.map(s => `
    <h3 class="sub">${esc(s.label)} — ${esc(s.format)}</h3>
    <div style="font-family:var(--mono);font-size:13px;color:var(--turf);margin-top:2px">UK ${s.uk} · USA ${s.usa}</div>
    ${s.matches.length ? `<div class="rows" style="margin-top:8px;border-top:1px solid var(--rule)">
      ${s.matches.map(m => `<div class="match">
        <span>${esc(m.a)}</span>
        <span class="st ${m.side === 'UK' ? 'uk' : m.side === 'USA' ? 'usa' : ''}">${esc(m.status)}${m.thru && !m.done ? ' · thru ' + m.thru : ''}</span>
        <span class="r">${esc(m.b)}</span></div>`).join('')}
    </div>` : `<p class="empty">No matches yet — assign both squads and pair players up, and the draw builds itself.</p>`}
  `).join('')}`;
}

function scrCalendar() {
  const teeByDay = {};
  for (const r of D.ROUNDS) {
    const d = E.dayOf(r.dayIdx);
    (teeByDay[d.iso] = teeByDay[d.iso] || []).push(r);
  }
  return `<h2 class="head">Calendar</h2>
  <p class="lede">${esc(D.EVENT.venue)}, ${esc(D.EVENT.place)} — ${esc(D.DAYS[0].dow)} ${esc(D.DAYS[0].date)} to ${esc(D.DAYS[7].dow)} ${esc(D.DAYS[7].date)} 2026. Times are Antalya local.</p>
  <div class="days">
  ${D.DAYS.map(day => {
    const evs = D.SCHEDULE.filter(e => e.dayIdx === day.n);
    const rounds = teeByDay[day.iso] || [];
    const items = [
      ...rounds.flatMap(r => E.roundCfg(T, r.id).tees.filter(t => t.time).map((t, i) => ({
        time: t.time, golf: true, rid: r.id, slot: i,
        title: `${r.short} — tee ${i + 1} · ${E.courseOf(T, r.id).name}`,
      }))),
      ...evs.map(e => ({ time: e.time, golf: false, title: e.title })),
    ].sort((a, b) => String(a.time).localeCompare(String(b.time)));
    return `<div class="day${day.iso === now.iso ? ' today' : ''}">
      <div class="dl"><b>${esc(day.dow)}</b>${esc(day.date)}${day.iso === now.iso ? ' · today' : ''}</div>
      <div>${items.length ? items.map(it => `<div class="ev${it.golf ? ' golf' : ''}">
          <time class="num">${esc(E.to12(it.time))}</time><span>${esc(it.title)}</span></div>`).join('')
        : `<div class="ev" style="color:var(--turf);font-style:italic">Nothing scheduled — golf, or not.</div>`}</div>
    </div>`;
  }).join('')}
  </div>
  ${canEdit() ? `<h3 class="sub">Tee times</h3>
    <p class="lede">Three slots per round. Leave a slot blank if it is not used.</p>
    <div class="panel">${D.ROUNDS.map(r => {
      const c = E.roundCfg(T, r.id); const d = E.dayOf(r.dayIdx);
      return `<div><div style="font-weight:600;font-size:16px">${esc(r.short)} — ${esc(d.dow)} ${esc(d.date)}</div>
      <div class="chiprow" style="margin-top:7px">${c.tees.map((t, i) =>
        `<label class="chip" style="gap:8px">Tee ${i + 1}
          <input class="field" style="width:104px;min-height:34px;padding:4px 7px;text-align:right" type="text"
            value="${esc(t.time ? E.to12(t.time) : '')}" placeholder="—" aria-label="${esc(r.short)} tee ${i + 1}"
            data-act="setTee" data-a="${r.id}" data-b="${i}"></label>`).join('')}</div></div>`;
    }).join('')}</div>` : ''}`;
}

function scrEntry() {
  const rid = UI.entryRound;
  const r = E.roundDef(rid);
  const cfg = E.roundCfg(T, rid);
  const phase = E.phaseOf(T, rid, now);
  const open = cfg.state === 'open';
  const locked = cfg.state === 'locked';
  const h = UI.entryHole;
  const course = E.courseOf(T, rid);
  const hole = course.holes[h];
  const day = E.dayOf(r.dayIdx);

  let gate;
  if (!canEdit()) {
    gate = `<div class="gate"><div class="msg"><b>Scoring is closed to you</b>
      <span>Enter a scorer or master PIN to record scores. Everything else in the book stays readable.</span></div>
      <button class="btn" data-act="signIn">Enter PIN</button></div>`;
  } else if (locked) {
    gate = `<div class="gate"><div class="msg"><b>${esc(r.short)} is locked</b>
      <span>Concluded${cfg.lockedBy ? ' by ' + esc(S.ROLES[cfg.lockedBy] ? S.ROLES[cfg.lockedBy].label : cfg.lockedBy) : ''}. The card is final and read-only.</span></div>
      ${canAdmin() ? `<button class="btn ghost" data-act="unlockRound" data-a="${rid}">Reopen with master PIN</button>`
        : `<span class="eyebrow">Only the master reviewer can reopen a locked round.</span>`}</div>`;
  } else if (!open) {
    gate = `<div class="gate"><div class="msg"><b>${esc(r.short)} is not open for scoring</b>
      <span>Opening confirms with your PIN and lets both scorers write to this card.</span></div>
      <button class="btn" data-act="openRound" data-a="${rid}">Open round</button></div>`;
  } else {
    gate = `<div class="gate"><div class="msg"><b>${esc(r.short)} is open — you are ${esc(S.ROLES[UI.role].label)}</b>
      <span>Entries save to every device as you tap. Lock the round when the last card is in.</span></div>
      <button class="btn danger" data-act="lockRound" data-a="${rid}">Lock &amp; conclude</button></div>`;
  }

  const editable = open && canEdit();
  const tee = UI.entryTee;
  let list = E.golfers(T);
  if (tee !== 'all') {
    const slot = cfg.tees[+tee];
    if (slot && slot.players.length) list = list.filter(g => slot.players.includes(g.id));
  }

  const pad = list.map(g => {
    const c = E.card(T, rid, g.id);
    const raw = c ? c.raw[h] : null;
    const cap = E.capFor(hole.par, T.config.capOver);
    const st = E.strokesFor(g.band, hole.si);
    const net = raw == null || st == null ? null : Math.min(raw, cap) - st;
    const noBand = g.band == null;
    return `<div class="padrow${noBand ? ' nb' : ''}">
      <div class="nm">${esc(g.display)}
        <small>${noBand ? 'No playing band — set one on Roster before this card counts'
          : `Band ${g.band} · receives ${st} on this hole${net != null ? ` · net ${net} (${E.fmtToPar(net - hole.par)})` : ''}`}</small>
        ${editable ? `<div class="toggles">
          <button class="tg${c && c.bb ? ' on' : ''}" data-act="tgl" data-a="${g.id}" data-b="bb" title="Breakfast ball used">Breakfast</button>
          <button class="tg${c && c.mF ? ' on' : ''}" data-act="tgl" data-a="${g.id}" data-b="mF"${r.noMulligans ? ' disabled' : ''} title="Front nine mulligan">Mull F9</button>
          <button class="tg${c && c.mB ? ' on' : ''}" data-act="tgl" data-a="${g.id}" data-b="mB"${r.noMulligans ? ' disabled' : ''} title="Back nine mulligan">Mull B9</button>
        </div>` : ''}
      </div>
      <div class="stepper">
        ${editable ? `<button class="step" data-act="bump" data-a="${g.id}" data-b="-1" aria-label="One less for ${esc(g.display)}">−</button>` : ''}
        <span class="gross num" style="${raw != null && raw >= cap ? 'color:var(--flag)' : ''}">${raw == null ? '·' : raw}</span>
        ${editable ? `<button class="step" data-act="bump" data-a="${g.id}" data-b="1" aria-label="One more for ${esc(g.display)}"${raw != null && raw >= cap ? ' disabled' : ''}>+</button>` : ''}
      </div>
    </div>`;
  }).join('');

  const bbb = (T.bbb[rid] || S.blankBbb()).holes[h];
  const opts = sel => `<option value="">—</option>` + E.golfers(T).map(g =>
    `<option value="${g.id}"${sel === g.id ? ' selected' : ''}>${esc(g.display)}</option>`).join('');

  const unbanded = E.golfers(T).filter(g => g.band == null).length;
  return `<h2 class="head">Score Entry</h2>
  <p class="lede">One hole at a time. Gross strokes only — bands, the triple-bogey cap and every leaderboard are worked out from this.</p>
  ${unbanded ? `<div class="notice"><b>${unbanded} golfer${unbanded > 1 ? 's have' : ' has'} no playing band</b>
    <div style="font-size:15px;color:var(--turf)">You can still record their gross strokes, but nothing counts toward a leaderboard until each of them is on a 15, 20 or 25 band.</div>
    <div class="chiprow"><button class="chip" data-act="go" data-a="roster">Set bands on Roster</button></div></div>` : ''}
  ${roundTabs(rid, 'entryRound')}
  <div style="display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;margin-top:10px">
    <span style="font-size:16px;font-weight:600">${esc(day.dow)} ${esc(day.date)} · ${esc(course.name)}</span>${phasePill(rid)}
    ${r.noMulligans ? `<span class="pill">No mulligans</span>` : ''}
  </div>
  ${gate}
  <div class="spread">
    <div class="leaf-l">${holeLeaf(rid, h, { strip: holeStrip(rid, h, 'entryHole') })}</div>
    <div class="leaf-r">
      <div class="eyebrow">Hole ${hole.n} · par ${hole.par} · gross strokes</div>
      ${cfg.tees.some(t => t.players.length) ? `<div class="chiprow" style="margin-top:10px">
        <button class="chip${tee === 'all' ? ' on' : ''}" data-act="entryTee" data-a="all">All players</button>
        ${cfg.tees.map((t, i) => t.players.length ? `<button class="chip${tee === String(i) ? ' on' : ''}" data-act="entryTee" data-a="${i}">Tee ${i + 1}${t.time ? ' · ' + E.to12(t.time) : ''}</button>` : '').join('')}
      </div>` : ''}
      <div class="pad">${pad || `<p class="empty">No golfers on the roster.</p>`}</div>

      <h3 class="sub">Bingo Bango Bongo — hole ${hole.n}</h3>
      <div class="panel" style="grid-template-columns:1fr">
        ${[['bingo', 'Bingo — first on the green'], ['bango', 'Bango — closest once all are on'], ['bongo', 'Bongo — first in the cup']].map(([k, lbl]) =>
          `<div class="kv"><span class="k">${esc(lbl)}</span>
            <select class="field" data-act="setBbb" data-a="${k}"${editable ? '' : ' disabled'} aria-label="${esc(lbl)}">${opts(bbb[k])}</select></div>`).join('')}
      </div>

      <h3 class="sub">Round prizes</h3>
      <div class="panel">
        <div class="kv"><span class="k">Closest to the pin<small>Nominated par 3</small></span>
          <select class="field" data-act="setRoundField" data-a="ctpHole"${editable ? '' : ' disabled'} aria-label="Closest to the pin hole">
            <option value="">No hole</option>${course.holes.filter(x => x.par === 3).map(x =>
              `<option value="${x.n}"${cfg.ctpHole === x.n ? ' selected' : ''}>Hole ${x.n}</option>`).join('')}</select></div>
        <div class="kv"><span class="k">Pin winner</span>
          <span class="chiprow"><select class="field" data-act="setRoundField" data-a="ctpWinner"${editable ? '' : ' disabled'} aria-label="Closest to the pin winner">${opts(cfg.ctpWinner)}</select>
          <input class="field" style="width:96px" type="text" value="${esc(cfg.ctpDist || '')}" placeholder="dist"
            data-act="setRoundField" data-a="ctpDist"${editable ? '' : ' disabled'} aria-label="Distance to the pin"></span></div>
        <div class="kv"><span class="k">Longest drive<small>Nominated hole</small></span>
          <select class="field" data-act="setRoundField" data-a="ldHole"${editable ? '' : ' disabled'} aria-label="Longest drive hole">
            <option value="">No hole</option>${course.holes.map(x =>
              `<option value="${x.n}"${cfg.ldHole === x.n ? ' selected' : ''}>Hole ${x.n} — par ${x.par}</option>`).join('')}</select></div>
        <div class="kv"><span class="k">Drive winner</span>
          <span class="chiprow"><select class="field" data-act="setRoundField" data-a="ldWinner"${editable ? '' : ' disabled'} aria-label="Longest drive winner">${opts(cfg.ldWinner)}</select>
          <input class="field" style="width:96px" type="text" value="${esc(cfg.ldDist || '')}" placeholder="dist"
            data-act="setRoundField" data-a="ldDist"${editable ? '' : ' disabled'} aria-label="Drive distance"></span></div>
      </div>
    </div>
  </div>`;
}

function scrRoster() {
  const gs = E.golfers(T);
  const others = T.config.people.filter(p => p.role !== 'golfer');
  const ed = canEdit();
  const bandBtn = (g, b) => `<button class="chip${g.band === b ? ' on' : ''}" data-act="setBand" data-a="${g.id}" data-b="${b}"${ed ? '' : ' disabled'}>${b}</button>`;

  return `<h2 class="head">Roster &amp; Pairings</h2>
  <p class="lede">Every golfer plays off a 15, 20 or 25 playing band — the band is the total strokes received across eighteen. A golfer without a band is left out of every score until one is set.</p>

  <h3 class="sub">Golfers <span class="eyebrow">${gs.length}</span></h3>
  <div class="rows" style="margin-top:8px">
    <div class="rowhead"><span style="flex:1">Player</span><span style="min-width:170px;text-align:right">Playing band</span></div>
    ${gs.map(g => `<div class="row">
      <span class="who">${esc(g.display)}<small>${esc(g.name)} · ${esc(g.group)}${g.band ? ' · receives ' + E.bandTotal(g.band) + ' strokes' : ''}</small></span>
      <span class="chiprow" style="justify-content:flex-end;min-width:170px">
        ${E.BANDS.map(b => bandBtn(g, b)).join('')}
        ${ed && g.band ? `<button class="chip" data-act="setBand" data-a="${g.id}" data-b="" title="Clear band">×</button>` : ''}
        ${canAdmin() ? `<button class="chip" data-act="removePerson" data-a="${g.id}" title="Remove from roster">Remove</button>` : ''}
      </span></div>`).join('')}
  </div>
  ${ed ? `<div class="chiprow" style="margin-top:12px"><button class="chip" data-act="addPerson" data-a="golfer">Add golfer</button></div>` : ''}

  <h3 class="sub">Pairings</h3>
  <p class="lede">Fixed for the week. A pair needs two players to score a better ball, and both in the same squad to draw a fourball match.</p>
  <div class="panel">
    ${T.config.pairs.map(p => `<div class="kv">
      <span class="k">${esc(E.pairName(T, p))}<small>${p.members.length} of 2 assigned</small></span>
      <span class="chiprow">${p.members.map(id => `<span class="chip">${esc((E.person(T, id) || {}).display || '?')}${ed ? ` <button data-act="unpair" data-a="${p.id}" data-b="${id}" aria-label="Remove from pair" style="color:inherit">×</button>` : ''}</span>`).join('')}
      ${ed && p.members.length < 2 ? `<select class="field" data-act="addToPair" data-a="${p.id}" aria-label="Add a golfer to ${esc(E.pairName(T, p))}">
        <option value="">Add golfer…</option>${gs.filter(g => !T.config.pairs.some(q => q.members.includes(g.id))).map(g =>
          `<option value="${g.id}">${esc(g.display)}</option>`).join('')}</select>` : ''}</span></div>`).join('')}
  </div>

  <h3 class="sub">Officials &amp; spectators</h3>
  <div class="rows" style="margin-top:8px">
    ${others.map(p => `<div class="row"><span class="who">${esc(p.display)}<small>${esc(p.role)} · ${esc(p.group)}</small></span>
      ${canAdmin() ? `<span><button class="chip" data-act="removePerson" data-a="${p.id}">Remove</button></span>` : ''}</div>`).join('')}
  </div>
  ${ed ? `<div class="chiprow" style="margin-top:12px">
    <button class="chip" data-act="addPerson" data-a="official">Add official</button>
    <button class="chip" data-act="addPerson" data-a="spectator">Add spectator</button></div>` : ''}`;
}

function scrRules() {
  return `<h2 class="head">Games &amp; Rules</h2>
  <p class="lede">Six competitions, one scorecard. Everything is net off your playing band.</p>
  <div style="margin-top:16px">
  ${RULES.map(r => `<details class="rule-item" id="rule-${r.id}">
    <summary><span class="nm">${esc(r.name)}</span><span class="tg2">${esc(r.tag)}</span><span class="mk">+</span></summary>
    <div class="rule-body">
      <div class="meta"><div><b>When</b>${esc(r.when)}</div><div><b>How it is won</b>${esc(r.won)}</div></div>
      ${r.body.map(p => `<p>${esc(p)}</p>`).join('')}
      <p class="eg"><b style="font-family:var(--mono);font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:var(--turf);display:block;font-style:normal">Worked example</b>${esc(r.example)}</p>
    </div></details>`).join('')}
  </div>

  <h3 class="sub">${esc(RELIEF.title)}</h3>
  <div class="rows" style="margin-top:8px">
    ${RELIEF.items.map(i => `<div class="row" style="align-items:flex-start"><span class="who" style="flex:1 1 100%">${esc(i.name)}<small style="max-width:70ch">${esc(i.body)}</small></span></div>`).join('')}
  </div>

  <h3 class="sub">The playing bands</h3>
  <div class="rows" style="margin-top:8px;max-width:640px">
    ${RELIEF.bands.map(([n, b]) => `<div class="row"><span class="who" style="flex:0 0 92px">${esc(n)}</span><span style="flex:1;font-size:15px;color:var(--turf)">${esc(b)}</span></div>`).join('')}
  </div>

  <h3 class="sub">Stableford equivalents</h3>
  <div class="rows" style="margin-top:8px;max-width:400px">
    ${RELIEF.stableford.map(([k, v]) => `<div class="row"><span class="who" style="font-weight:400;font-size:16px">${esc(k)}</span><span class="big num">${esc(v)}</span></div>`).join('')}
  </div>`;
}

function scrCourses() {
  const c = E.courseByKey(T, UI.courseTab);
  const h = UI.courseHole;
  const hole = c.holes[h];
  const totalPar = c.holes.reduce((a, x) => a + x.par, 0);
  const open = canEdit(); // the card stays editable; Verified is a status the scorers set
  const photo = IMG['course_' + c.key];
  const alt = c.key === 'aspendos'
    ? 'Aerial view of Cullinan Links along the Mediterranean shore'
    : 'Green beside the Beşgöz River with the Taurus Mountains beyond';

  const rows = c.holes.map((x, i) => `<tr>
      <td><span class="holen">${x.n}</span></td>
      <td>${open
        ? `<select class="cardsel" aria-label="Par, hole ${x.n}" data-act="setHole" data-a="${c.key}" data-b="${i}" data-c="par">
             ${[3, 4, 5].map(p => `<option value="${p}"${x.par === p ? ' selected' : ''}>${p}</option>`).join('')}</select>`
        : `<span class="cardval">${x.par}</span>`}</td>
      ${['si', 'mW', 'mY'].map(f => `<td>${open
        ? `<input class="cardin" inputmode="numeric" value="${x[f]}" aria-label="${f === 'si' ? 'Stroke index' : f === 'mW' ? 'Metres from White' : 'Metres from Yellow'}, hole ${x.n}"
            data-act="setHole" data-a="${c.key}" data-b="${i}" data-c="${f}">`
        : `<span class="cardval">${x[f]}</span>`}</td>`).join('')}
    </tr>`).join('');

  return `<h2 class="head">Course Setup</h2>
  <p class="lede">Par, stroke index and yardages loaded from the official Cullinan Links Golf Club scorecard. Cullinan Links, Belek — 36 holes by European Golf Design, 2021; back nines floodlit. Reopen a card only if the club issues a new one.</p>

  <div class="ctabs">
    ${Object.keys(D.COURSES).map(k => {
      const x = E.courseByKey(T, k);
      return `<button class="ctab${k === UI.courseTab ? ' on' : ''}" data-act="courseTab" data-a="${k}">${esc(x.name)}
        <span>${x.verified ? 'Verified' : 'Not verified'}</span></button>`;
    }).join('')}
  </div>

  ${!c.verified ? `<div class="unverified">
    <div class="t">This card is not verified.</div>
    <p>Every net score on ${esc(c.name)} is provisional until par and stroke index are confirmed below.</p>
  </div>` : ''}

  ${photo ? `<figure class="cphoto"><img src="${photo}" alt="${esc(alt)}"></figure>` : ''}
  <p class="rating num">Par ${c.meta.par} — Course Rating ${c.meta.crW}, Slope ${c.meta.slW} (White) — Course Rating ${c.meta.crY}, Slope ${c.meta.slY} (Yellow)</p>

  <div class="cgrid">
    <div class="scroller nos">
      <table class="scard">
        <thead><tr><th>Hole</th><th>Par</th><th>Stroke index</th><th>White (m)</th><th>Yellow (m)</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="cside">
      ${IMG[hole.img] ? `<img src="${IMG[hole.img]}" alt="Diagram of hole ${hole.n} at ${esc(c.name)}">` : ''}
      <div class="cfacts num">
        <span class="hn">Hole ${hole.n}</span>
        <span>Par ${hole.par}</span>
        <span class="m">SI ${hole.si}</span>
        <span class="m">${hole.mW} m White</span>
      </div>
      <div class="cstrip">${c.holes.map((x, i) =>
        `<button class="cell${i === h ? ' e' : ''}" data-act="courseHole" data-a="${i}" aria-label="Hole ${x.n}">${x.n}</button>`).join('')}</div>
    </div>
  </div>

  <div class="cfoot">
    <span class="num">Par ${totalPar}</span>
    ${canEdit()
      ? `<button class="btn ghost" data-act="verifyCourse" data-a="${c.key}">${c.verified ? 'Verified — tap to reopen' : 'Not verified — tap to verify'}</button>`
      : `<span class="pill">${c.verified ? 'Verified' : 'Not verified'}</span>`}
  </div>`;
}

function scrSetup() {
  if (!canAdmin()) return `<h2 class="head">Setup</h2><p class="empty">The master PIN opens this screen.</p>
    <button class="btn" data-act="signIn">Enter PIN</button>`;
  const p = T.config.pins;
  return `<h2 class="head">Setup</h2>
  <p class="lede">Master reviewer controls. PINs gate who may write to a card; everyone else reads the book.</p>

  <h3 class="sub">Scoring PINs</h3>
  <div class="notice"><b>These PINs are a courtesy lock, not security.</b>
    <div style="font-size:15px;color:var(--turf)">They stop a spectator tapping a score by accident. Anyone determined enough to read the page source can find them, so treat the master PIN as a convenience — not a secret worth protecting.</div></div>
  <div class="panel">
    <div class="kv"><span class="k">Master reviewer<small>Opens, locks, reopens, and sees every PIN</small></span>
      <span class="chiprow"><input class="field num" style="width:110px;text-align:center;letter-spacing:.2em" type="text" inputmode="numeric" maxlength="8"
        value="${esc(p.master)}" data-act="setPin" data-a="master" aria-label="Master PIN"></span></div>
    <div class="kv"><span class="k">Scorer 1<small>Enters and locks rounds</small></span>
      <span class="chiprow"><input class="field num" style="width:110px;text-align:center;letter-spacing:.2em" type="${UI.revealPins ? 'text' : 'password'}" inputmode="numeric" maxlength="8"
        value="${esc(p.s1)}" data-act="setPin" data-a="s1" aria-label="Scorer 1 PIN"></span></div>
    <div class="kv"><span class="k">Scorer 2<small>Enters and locks rounds</small></span>
      <span class="chiprow"><input class="field num" style="width:110px;text-align:center;letter-spacing:.2em" type="${UI.revealPins ? 'text' : 'password'}" inputmode="numeric" maxlength="8"
        value="${esc(p.s2)}" data-act="setPin" data-a="s2" aria-label="Scorer 2 PIN"></span></div>
    <div class="chiprow"><button class="chip" data-act="revealPins">${UI.revealPins ? 'Hide scorer PINs' : 'Show scorer PINs'}</button>
      ${!T.config.pinsChanged ? `<span class="eyebrow" style="color:var(--flag)">Still the factory defaults</span>` : ''}</div>
  </div>

  <h3 class="sub">Relief</h3>
  <div class="panel">
    <div class="kv"><span class="k">Maximum over par on a hole<small>Triple bogey is 3. Cards pick up at par plus this.</small></span>
      <span class="chiprow">${[2, 3, 4].map(v => `<button class="chip${T.config.capOver === v ? ' on' : ''}" data-act="setCap" data-a="${v}">+${v}</button>`).join('')}</span></div>
  </div>

  <h3 class="sub">Rounds</h3>
  <div class="panel">${D.ROUNDS.map(r => {
    const c = E.roundCfg(T, r.id); const d = E.dayOf(r.dayIdx);
    return `<div class="kv"><span class="k">${esc(r.short)} — ${esc(d.dow)} ${esc(d.date)}<small>${esc(E.courseOf(T, r.id).name)} · ${esc(c.state)}</small></span>
      <span class="chiprow">${c.state === 'locked'
        ? `<button class="chip" data-act="unlockRound" data-a="${r.id}">Reopen</button>`
        : c.state === 'open'
          ? `<button class="chip" data-act="lockRound" data-a="${r.id}">Lock</button>`
          : `<button class="chip" data-act="openRound" data-a="${r.id}">Open</button>`}</span></div>`;
  }).join('')}</div>

  <h3 class="sub">Start over</h3>
  <div class="panel">
    <div class="kv"><span class="k">Clear every score<small>Wipes all cards, points and prizes for every round, on every device. The roster, pairings and bands go back to factory too. This cannot be undone.</small></span>
      <span><button class="btn danger" data-act="resetAll">Clear tournament</button></span></div>
  </div>`;
}

/* ---------------- chrome ---------------- */

const NAV = [
  ['today', 'Today'], ['boards', 'Leaderboards'], ['ryder', 'Ryder Cup'], ['calendar', 'Calendar'],
  ['entry', 'Score Entry'], ['roster', 'Roster & Pairings'], ['rules', 'Games & Rules'], ['courses', 'Course Setup'], ['setup', 'Setup'],
];

function render() {
  const app = document.getElementById('app');
  const body = { today: scrToday, boards: scrBoards, ryder: scrRyder, calendar: scrCalendar,
                 entry: scrEntry, roster: scrRoster, rules: scrRules, courses: scrCourses, setup: scrSetup }[UI.screen]();

  const nt = E.nextTee(T, now);
  const role = S.ROLES[UI.role];
  const dot = meta.status === 'live' ? 'live' : meta.status === 'error' ? 'err' : '';
  const statusText = meta.status === 'live' ? 'Shared — every device sees this'
    : meta.status === 'local' ? 'This device only — shared storage unavailable'
    : meta.status === 'error' ? 'Save failed — your last change may not have reached the others'
    : 'Connecting…';

  app.innerHTML = `
  ${IMG.crest ? `<div class="watermark" style="background-image:url('${IMG.crest}')"></div>` : ''}
  <div class="wrap">
    <header class="masthead">
      ${IMG.crest ? `<img src="${IMG.crest}" alt="The Union Invitational crest">` : ''}
      <div class="mast-mid">
        <h1>${esc(D.EVENT.name)}</h1>
        <div class="sub">${esc(D.EVENT.venue)}, ${esc(D.EVENT.place)} — 26 October to 2 November 2026</div>
      </div>
      <div class="mast-right">
        <div class="lbl">Next Tee Time</div>
        <div class="val num">${nt ? esc(nt.day.dow) + ' ' + esc(E.to12(nt.time)) + ' — ' + esc(nt.round.short === 'Practice' ? 'Practice' : 'Round ' + nt.round.short.slice(1)) : '—'}</div>
        <button class="chip" style="margin-top:5px" data-act="signIn">${esc(role.label)}${UI.role === 'viewer' ? ' — enter PIN' : ' — sign out'}</button>
      </div>
    </header>
    <div class="rule-heavy"></div>
    <nav class="tabs nos" aria-label="Sections">
      ${NAV.filter(([id]) => id !== 'setup' || canAdmin()).map(([id, label]) =>
        `<button class="tab" data-act="go" data-a="${id}"${UI.screen === id ? ' aria-current="page"' : ''}>${esc(label)}</button>`).join('')}
    </nav>
    ${body}
    <div class="statusbar">
      <span class="dot ${dot}"></span><span>${esc(statusText)}</span>
      <span class="sp">The Union Invitational — Belek, Türkiye — 2026</span>
    </div>
  </div>
  ${UI.modal ? modalHtml() : ''}`;

  if (UI.modal) { const i = document.getElementById('pinField'); if (i) { i.focus(); i.select(); } }
}

function modalHtml() {
  const m = UI.modal;
  return `<div class="scrim" data-act="modalScrim"><div class="modal" role="dialog" aria-modal="true" aria-label="${esc(m.title)}">
    <h3>${esc(m.title)}</h3>
    ${m.note ? `<p>${esc(m.note)}</p>` : ''}
    <input class="pinin" id="pinField" type="password" inputmode="numeric" autocomplete="off" maxlength="8" placeholder="••••" aria-label="PIN">
    <p class="err">${esc(UI.modalErr)}</p>
    <div class="acts"><button class="btn ghost" data-act="modalCancel">Cancel</button>
      <button class="btn" data-act="modalOk">${esc(m.ok || 'Confirm')}</button></div>
  </div></div>`;
}

/* ---------------- dispatch ---------------- */

function askPin(title, note, ok, onOk) { UI.modal = { title, note, ok, onOk }; UI.modalErr = ''; render(); }

function submitPin() {
  const el = document.getElementById('pinField');
  const pin = el ? el.value : '';
  const role = S.roleForPin(T.config, pin);
  if (!role) { UI.modalErr = 'That PIN is not on the list. Try again, or ask the master reviewer.'; render(); return; }
  const m = UI.modal;
  UI.modal = null; UI.modalErr = '';
  if (m && m.onOk) m.onOk(role);
  render();
}

const setRound = (rid, patch) => store.writeConfig(c => { Object.assign(c.rounds[rid], patch); });

function onClick(e) {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const { act, a, b } = el.dataset;
  if (el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
  const rid = UI.entryRound;

  switch (act) {
    case 'go': UI.screen = a; UI.modal = null; window.scrollTo(0, 0); break;
    case 'goRule': UI.screen = 'rules'; render();
      { const d = document.getElementById('rule-' + a); if (d) { d.open = true; d.scrollIntoView({ block: 'center' }); } }
      return;
    case 'boardTab': UI.boardTab = a; break;
    case 'boardRound': UI.boardRound = a; UI.bookHole = 0; break;
    case 'bookHole': UI.bookHole = +a; break;
    case 'entryRound': UI.entryRound = a; UI.entryHole = 0; UI.entryTee = 'all'; break;
    case 'entryHole': UI.entryHole = +a; break;
    case 'entryTee': UI.entryTee = a; break;
    case 'courseTab': UI.courseTab = a; UI.courseHole = 0; break;
    case 'courseHole': UI.courseHole = +a; break;
    case 'verifyCourse':
      if (!canEdit()) return;
      store.writeConfig(cf => { cf.courses[a].verified = !cf.courses[a].verified; });
      return;
    case 'revealPins': UI.revealPins = !UI.revealPins; break;

    case 'signIn':
      if (UI.role !== 'viewer') { UI.role = 'viewer'; if (UI.screen === 'setup') UI.screen = 'today'; break; }
      askPin('Enter your PIN', 'Scorers may record and lock rounds. The master reviewer can also reopen a locked round and change every PIN.', 'Sign in',
        role => { UI.role = role; });
      return;

    case 'openRound':
      askPin('Open ' + E.roundDef(a).short + ' for scoring', 'Confirm with your PIN. Both scorers can then write to this card.', 'Open round',
        role => { setRound(a, { state: 'open', openedBy: role }); UI.entryRound = a; UI.screen = 'entry'; });
      return;
    case 'lockRound':
      askPin('Lock and conclude ' + E.roundDef(a).short, 'Re-enter your PIN to close the card. Nothing more can be entered unless the master reviewer reopens it.', 'Lock round',
        role => { setRound(a, { state: 'locked', lockedBy: role, lockedAt: Date.now() }); });
      return;
    case 'unlockRound':
      askPin('Reopen ' + E.roundDef(a).short, 'The master PIN is required to reopen a concluded round.', 'Reopen',
        role => { if (role !== 'master') { UI.toast = 'Only the master PIN reopens a round.'; return; } setRound(a, { state: 'open', lockedBy: null, lockedAt: null }); });
      return;

    case 'bump': {
      if (!canEdit() || E.roundCfg(T, rid).state !== 'open') return;
      const h = UI.entryHole;
      const hole = E.courseOf(T, rid).holes[h];
      const cap = E.capFor(hole.par, T.config.capOver);
      store.writeCard(rid, a, c => {
        let v = c.raw[h] == null ? (+b > 0 ? hole.par : null) : c.raw[h] + (+b);
        if (v != null && v < 1) v = null;
        if (v != null && v > cap) v = cap;
        c.raw[h] = v;
      });
      return;
    }
    case 'tgl':
      if (!canEdit() || E.roundCfg(T, rid).state !== 'open') return;
      store.writeCard(rid, a, c => { c[b] = !c[b]; });
      return;

    case 'cycleSquad': {
      if (!canEdit()) return;
      store.writeConfig(c => {
        const p = c.people.find(x => x.id === a);
        if (p) p.location = p.location === null ? 'USA' : p.location === 'USA' ? 'UK' : null;
      });
      return;
    }
    case 'clearSquads':
      if (!canEdit()) return;
      store.writeConfig(c => { c.people.forEach(p => { p.location = null; }); });
      return;

    case 'setBand':
      if (!canEdit()) return;
      store.writeConfig(c => { const p = c.people.find(x => x.id === a); if (p) p.band = b === '' ? null : +b; });
      return;
    case 'addPerson': {
      if (!canEdit()) return;
      const id = 'x' + Date.now().toString(36);
      const label = a === 'golfer' ? 'New golfer' : a === 'official' ? 'New official' : 'New guest';
      store.writeConfig(c => { c.people.push({ id, name: label, display: label, role: a, location: null, group: '7-day', band: null }); });
      return;
    }
    case 'removePerson':
      if (!canAdmin()) return;
      store.writeConfig(c => {
        c.people = c.people.filter(p => p.id !== a);
        c.pairs.forEach(p => { p.members = p.members.filter(m => m !== a); });
        Object.values(c.rounds).forEach(r => { r.tees.forEach(t => { t.players = t.players.filter(m => m !== a); }); });
      });
      return;
    case 'unpair':
      if (!canEdit()) return;
      store.writeConfig(c => { const p = c.pairs.find(x => x.id === a); if (p) p.members = p.members.filter(m => m !== b); });
      return;
    case 'setCap':
      if (!canAdmin()) return;
      store.writeConfig(c => { c.capOver = +a; });
      return;
    case 'resetAll':
      askPin('Clear the whole tournament', 'Every card, every point, every prize — on every device. Enter the master PIN.', 'Clear everything',
        role => { if (role !== 'master') return; store.resetAll(); UI.screen = 'today'; });
      return;

    case 'modalOk': submitPin(); return;
    case 'modalCancel': UI.modal = null; UI.modalErr = ''; break;
    case 'modalScrim': if (e.target.classList.contains('scrim')) { UI.modal = null; UI.modalErr = ''; break; } return;
    default: return;
  }
  render();
}

function onChange(e) {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const { act, a, b } = el.dataset;
  const rid = UI.entryRound;
  const editable = canEdit() && E.roundCfg(T, rid).state === 'open';

  if (act === 'setBbb') {
    if (!editable) return;
    store.writeBbb(rid, x => { x.holes[UI.entryHole][a] = el.value || null; });
  } else if (act === 'setRoundField') {
    if (!editable) return;
    const num = a === 'ctpHole' || a === 'ldHole';
    store.writeConfig(c => { c.rounds[rid][a] = num ? (el.value ? +el.value : null) : (el.value || (a.endsWith('Dist') ? '' : null)); });
  } else if (act === 'setTee') {
    if (!canEdit()) return;
    const v = el.value.trim();
    const t = v === '' ? null : E.to24(v);
    if (v !== '' && !t) { el.value = ''; UI.toast = ''; }
    store.writeConfig(c => { c.rounds[a].tees[+b].time = t; });
  } else if (act === 'setPin') {
    if (!canAdmin()) return;
    const v = el.value.replace(/\D/g, '').slice(0, 8);
    if (v.length < 3) return;
    store.writeConfig(c => { c.pins[a] = v; c.pinsChanged = true; });
  } else if (act === 'setHole') {
    if (!canEdit()) return;
    const { c: field } = el.dataset;
    const v = parseInt(el.value, 10);
    const lim = { par: [3, 5], si: [1, 18], mW: [40, 700], mY: [40, 700] }[field];
    if (!Number.isFinite(v) || v < lim[0] || v > lim[1]) { render(); return; }
    store.writeConfig(cf => { cf.courses[a].holes[+b][field] = v; });
  } else if (act === 'pickTee') {
    if (!canEdit() || !el.value) return;
    const board = E.pairsBoard(T, now);
    const by = board.length ? board[0].name : null;
    store.writeConfig(c => {
      c.teePicks[a] = { done: true, time: el.value, byPair: by };
      c.rounds[a].tees[0].time = el.value;
    });
  } else if (act === 'addToPair') {
    if (!canEdit() || !el.value) return;
    const pid = el.value;
    store.writeConfig(c => {
      c.pairs.forEach(p => { p.members = p.members.filter(m => m !== pid); });
      const p = c.pairs.find(x => x.id === a);
      if (p && p.members.length < 2) p.members.push(pid);
    });
  }
}

function onKey(e) {
  if (e.key === 'Enter' && UI.modal && e.target.id === 'pinField') { e.preventDefault(); submitPin(); }
  if (e.key === 'Escape' && UI.modal) { UI.modal = null; UI.modalErr = ''; render(); }
}

/* ---------------- boot ---------------- */

export function boot() {
  // open the book at the round nearest to today
  const upcoming = D.ROUNDS.find(r => E.dayOf(r.dayIdx).iso >= now.iso) || D.ROUNDS[D.ROUNDS.length - 1];
  UI.entryRound = upcoming.id;
  UI.boardRound = (upcoming.counts ? upcoming : D.ROUNDS.find(r => r.counts)).id;

  store = S.createStore((state, m) => { T = state; meta = m; render(); });
  const app = document.getElementById('app');
  app.addEventListener('click', onClick);
  app.addEventListener('change', onChange);
  app.addEventListener('keydown', onKey);
  setInterval(() => { now = E.nowLocal(); render(); }, 30000);
  render();
  store.connect();
}
