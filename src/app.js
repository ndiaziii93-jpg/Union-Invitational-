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
let meta = { ready: false, mode: 'local', status: 'connecting', settled: false };
let now = E.nowLocal();

const UI = {
  screen: 'today',
  reveal: null,          // something just added: scroll to it once it is drawn
  timePick: {},          // a time being chosen, wheel by wheel, held here not in the DOM
  role: 'viewer',
  boardTab: 'pairs',
  boardRound: 'r1',
  bookHole: 0,
  entryRound: 'r1',
  entryHole: 0,
  entryTee: '0',
  courseTab: 'aspendos',
  courseHole: 0,
  calDay: null,
  modal: null,       // {title, note, onOk(pin) -> string|null err}
  modalErr: '',
  revealPins: false,
  toast: '',
  draft: null,
  dragging: null,
  reopened: {},   // course cards this device unlocked; they re-lock on the way out
  setupSeen: false,
  entrySeen: false,
};

const ROLE_KEY = 'union-invitational:role';
function saveRole(role) { try { localStorage.setItem(ROLE_KEY, role); } catch (e) { /* storage blocked */ } }
function loadRole() { try { return localStorage.getItem(ROLE_KEY); } catch (e) { return null; } }

/* Nothing is editable until the shared book has loaded. Before that the page is
   showing factory defaults, and an edit would write those over the real
   tournament. */
const loaded = () => meta.settled !== false;
const canEdit = () => loaded() && (!D.PINS_ENABLED || S.ROLES[UI.role].canEdit);
const canAdmin = () => loaded() && (!D.PINS_ENABLED || S.ROLES[UI.role].canAdmin);

/* ---------------- flags ---------------- */

/** The canvas flag drawings, sized by the caller. `w` is the width in px. */
function ukFlag(w) { const h = Math.round(w * 16 / 26); return `<svg width="${w}" height="${h}" viewBox="0 0 26 16" role="img" aria-label="United Kingdom">`
  + `<rect width="26" height="16" fill="#1D3E8F"></rect>`
  + `<path d="M0,0 26,16 M26,0 0,16" stroke="#FBFAF7" stroke-width="3.4"></path>`
  + `<path d="M0,0 26,16 M26,0 0,16" stroke="#9E3B2E" stroke-width="1.4"></path>`
  + `<path d="M13,0 V16 M0,8 H26" stroke="#FBFAF7" stroke-width="5.4"></path>`
  + `<path d="M13,0 V16 M0,8 H26" stroke="#9E3B2E" stroke-width="2.8"></path></svg>`; }

function usFlag(w) { const h = Math.round(w * 16 / 26); return `<svg width="${w}" height="${h}" viewBox="0 0 26 16" role="img" aria-label="United States">`
  + `<rect width="26" height="16" fill="#FBFAF7"></rect>`
  + `<g fill="#9E3B2E"><rect y="0" width="26" height="2.3"></rect><rect y="4.6" width="26" height="2.3"></rect>`
  + `<rect y="9.2" width="26" height="2.3"></rect><rect y="13.7" width="26" height="2.3"></rect></g>`
  + `<rect width="11" height="8" fill="#1D3E8F"></rect></svg>`; }

function noFlag(w) { const h = Math.round(w * 16 / 26); return `<svg width="${w}" height="${h}" viewBox="0 0 26 16" aria-hidden="true">`
  + `<rect x="0.5" y="0.5" width="25" height="15" fill="none" stroke="currentColor" stroke-opacity=".35" stroke-dasharray="2.5 2.5"></rect></svg>`; }

function squadFlag(sq, w) { return sq === 'UK' ? ukFlag(w) : sq === 'USA' ? usFlag(w) : noFlag(w); }

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
      if (any) k = holeSavedBy(rid, i) ? ' played saved' : ' played';
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
  const tabs = [['pairs', 'Team Competition'], ['mvp', 'MVP'], ['bbb', 'Bingo Bango Bongo'],
                ['ryder', 'Ryder Cup'], ['prizes', 'Longest Drive & Closest to the Pin']];
  const body = { pairs: boardPairs, mvp: boardMvp, bbb: boardBbb, ryder: scrRyder, prizes: boardPrizes }[UI.boardTab]();
  return `<div class="btabs nos">${tabs.map(([id, l]) =>
      `<button class="btab${UI.boardTab === id ? ' on' : ''}" data-act="boardTab" data-a="${id}">${esc(l)}</button>`).join('')}</div>${body}`;
}

/** The round picker and its tee times, shared by the counting-round boards. */
function roundBand(rid, act) {
  const cfg = E.roundCfg(T, rid);
  const r = E.roundDef(rid);
  const ed = canEdit();
  return `<div class="roundband">
    <div class="rounds">
      ${E.countingRounds(T).map(x => {
        const d = E.dayOf(x.dayIdx);
        return `<button class="roundpick${x.id === rid ? ' on' : ''}" data-act="${act}" data-a="${x.id}">
          <b>${esc(x.full)}</b><span>${esc(d.dow)} ${esc(d.date)}</span></button>`;
      }).join('')}
    </div>
    <div class="teetimes">
      <div class="tt-head">Tee times — ${esc(r.full)}</div>
      ${cfg.tees.map((t, i) => `<label class="tt-row"><span>Tee Time ${i + 1}</span>
        ${timePick(t.time, { kind: 'tee', a: rid, b: i, ed, clearable: true,
          label: r.short + ' tee time ' + (i + 1) })}</label>`).join('')}
    </div>
  </div>`;
}

function boardPairs() {
  const rid = UI.boardRound;
  const board = E.pairsBoard(T, now);
  const leadPair = board.length ? T.config.pairs.find(p => p.id === board[0].id) : T.config.pairs[0];
  const h = UI.bookHole;
  const course = E.courseOf(T, rid);
  const hole = course.holes[h];
  const totalOf = id => { const row = board.find(x => x.id === id); return row ? row : null; };

  const onHole = T.config.pairs.map(p => {
    const s = E.pairHole(T, rid, p, h);
    const tot = totalOf(p.id);
    return { name: E.pairName(T, p), net: s, d: s == null ? null : s - hole.par, tot };
  }).filter(r => r.net != null).sort((a, b) => a.net - b.net);

  let thru = 0;
  for (const p of T.config.pairs) for (let i = 0; i < 18; i++) if (E.pairHole(T, rid, p, i) != null) thru = Math.max(thru, i + 1);

  return `
  <div class="titlerow"><h2 class="head">Team Competition</h2><a href="#rules" data-act="goRule" data-a="pairs">Full rules</a></div>
  <p class="lede">Better of the two net scores on every hole, cumulative across the three counting rounds. The book opens at the hole; the standing is the consequence.</p>
  ${roundBand(rid, 'boardRound')}

  <div class="spread">
    <div class="leaf-l">
      <div class="eyebrow">${esc(course.name)}</div>
      <div class="holeno"><b class="num">${hole.n}</b><span style="font-size:18px;color:var(--turf)">hole</span></div>
      <table class="facts"><tbody>
        <tr><td>Par</td><td>${hole.par}</td></tr>
        <tr><td>Length, White tees</td><td>${hole.mW} m</td></tr>
        <tr><td>Stroke index</td><td>${hole.si}</td></tr>
        <tr><td>Band 15 receives</td><td>${E.strokesFor(15, hole.si)}</td></tr>
        <tr><td>Band 20 receives</td><td>${E.strokesFor(20, hole.si)}</td></tr>
        <tr><td>Band 25 receives</td><td>${E.strokesFor(25, hole.si)}</td></tr>
        <tr class="cap"><td>Picks up at</td><td>${E.capFor(hole.par, T.config.capOver)}</td></tr>
      </tbody></table>
      ${holeStrip(rid, h, 'bookHole', leadPair)}
      ${IMG[hole.img] ? `<figure class="diagram"><img src="${IMG[hole.img]}" alt="Diagram of hole ${hole.n} at ${esc(course.name)}" loading="lazy"></figure>` : ''}
      <p class="turn">Turn the page: tap a hole.</p>
    </div>

    <div class="leaf-r">
      <div class="eyebrow">Teams on this hole — Net Better Ball</div>
      <div class="rows tight">
        <div class="rowhead"><span style="width:26px">Pos</span><span style="flex:1">Team</span>
          <span style="min-width:52px;text-align:right">Net</span>
          <span style="min-width:52px;text-align:right">Hole</span>
          <span style="min-width:84px;text-align:right">Total</span></div>
        ${onHole.length ? onHole.map((r, i) => `<div class="row">
          <span class="pos num">${i + 1}</span>
          <span class="who">${esc(r.name)}</span>
          <span class="n num" style="min-width:52px">${r.net}</span>
          <span class="n num ${cls(r.d)}" style="min-width:52px">${esc(E.fmtToPar(r.d))}</span>
          <span class="big num ${r.tot ? cls(r.tot.total) : ''}" style="min-width:84px">${r.tot ? esc(r.tot.totalStr) : '—'}</span></div>`).join('')
        : `<p class="empty">Nobody has played hole ${hole.n} yet.</p>`}
      </div>
      <p class="legend">Net = team’s better ball, strokes applied. Hole = that score against par. Total = tournament to par.</p>

      <div class="eyebrow" style="margin-top:26px">Standing after ${thru} hole${thru === 1 ? '' : 's'} today</div>
      <div class="rows tight">
        <div class="rowhead"><span style="width:26px">Pos</span><span style="flex:1">Team</span>
          <span style="min-width:64px;text-align:right">Thru</span>
          <span style="min-width:52px;text-align:right">Today</span>
          <span style="min-width:84px;text-align:right">Total</span></div>
        ${board.length ? board.map(r => `<div class="row">
          <span class="pos num">${r.pos}</span>
          <span class="who plain">${esc(r.members)}</span>
          <span class="n num" style="min-width:64px;color:var(--turf)">thru ${esc(r.thruStr)}</span>
          <span class="n num ${cls(r.today)}" style="min-width:52px">${esc(r.todayStr)}</span>
          <span class="big num ${cls(r.total)}" style="min-width:84px">${esc(r.totalStr)}</span></div>`).join('')
        : `<p class="empty">The championship board opens once a counting round is under way.</p>`}
      </div>
    </div>
  </div>`;
}

function boardMvp() {
  const rows = E.mvpBoard(T, now);
  return `<div class="titlerow"><h2 class="head">Tournament MVP</h2><a href="#rules" data-act="goRule" data-a="mvp">Full rules</a></div>
  <p class="lede">Your own ball, your own number, every stroke counted. Runs off the same card as the team competition.</p>
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
  return `<div class="titlerow"><h2 class="head">Bingo Bango Bongo</h2><a href="#rules" data-act="goRule" data-a="bbb">Full rules</a></div>
  <p class="lede">Three points a hole — first on, closest once all are on, first in. 54 a round, 162 across the week.</p>
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
    <div class="side">${ukFlag(44)}<span class="pts num" style="color:var(--green)">${R.ukTotal}</span><span class="eyebrow">United Kingdom</span></div>
    <div class="vs">v</div>
    <div class="side r"><span class="eyebrow">United States</span><span class="pts num" style="color:var(--usa)">${R.usaTotal}</span>${usFlag(44)}</div>
  </div>

  <h3 class="sub">Squads</h3>
  <p class="lede">${canEdit() ? 'Tap a flag to move that golfer: unassigned → United States → United Kingdom → unassigned.' : 'Tap a flag to set a squad — you will be asked for a scorer PIN first.'}${R.unassigned ? ` <b>${R.unassigned} still unassigned.</b>` : ''}</p>
  <div class="grid-people">
    ${gs.map(g => {
      const sq = g.location;
      const k = sq === 'UK' ? 'uk' : sq === 'USA' ? 'usa' : 'none';
      const next = sq === null ? 'United States' : sq === 'USA' ? 'United Kingdom' : 'unassigned';
      return `<div class="sqrow ${k}">
        <button class="sqbox" data-act="cycleSquad" data-a="${g.id}"
          aria-label="${esc(g.display)} — ${sq ? esc(sq) : 'unassigned'}. Change to ${esc(next)}."
          title="Change to ${esc(next)}">${squadFlag(sq, 52)}</button>
        <span class="sqname">${esc(g.display)}</span>
        <span class="sqlabel">${sq ? esc(sq) : 'Unassigned'}</span>
      </div>`;
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

function calDayNumber() {
  if (UI.calDay) return UI.calDay;
  const i = D.DAYS.findIndex(d => d.iso === now.iso);
  return i >= 0 ? i + 1 : 1;
}

/** Everything happening on a trip day: the round, then the social calendar.
 *  The round is fixed here — its time is set with the tee slots below. */
function dayEntries(n) {
  const out = [];
  for (const r of D.ROUNDS) {
    if (r.dayIdx !== n) continue;
    const tee = E.roundCfg(T, r.id).tees[0];
    out.push({ id: 'round:' + r.id, fixed: true, time: tee && tee.time, title: r.full,
               sub: E.courseOf(T, r.id).name, kind: 'golf' });
  }
  for (const e of T.config.schedule) {
    if (e.dayIdx !== n) continue;
    out.push({ id: e.id, fixed: false, time: e.time, title: e.title, sub: '', kind: e.kind });
  }
  return out.sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
}
function isRestDay(n) {
  const es = dayEntries(n);
  return n > 1 && n < 8 && !es.some(e => e.kind === 'golf') && !es.some(e => e.kind === 'travel');
}
function roundOnDay(n) { return D.ROUNDS.find(r => r.dayIdx === n) || null; }

function scrCalendar() {
  const view = UI.calView === 'day' ? 'day' : 'week';
  return `<div class="titlerow">
    <h2 class="head">Calendar</h2>
    <div class="seg" role="group" aria-label="Calendar view">
      <button class="segb${view === 'week' ? ' on' : ''}" data-act="calView" data-a="week">Week</button>
      <button class="segb${view === 'day' ? ' on' : ''}" data-act="calView" data-a="day">Day</button>
    </div>
  </div>
  ${view === 'week' ? calWeek() : calDay()}`;
}

function calWeek() {
  return `<div class="weekgrid">
    ${D.DAYS.map(d => {
      const es = dayEntries(d.n);
      const golf = es.find(e => e.kind === 'golf');
      const rest = isRestDay(d.n);
      const social = es.filter(e => e.kind !== 'golf');
      return `<button class="daycard${d.iso === now.iso ? ' today' : ''}" data-act="calDay" data-a="${d.n}"
        aria-label="${esc(d.dow)} ${esc(d.date)}, day ${d.n}. Open and edit.">
        <span class="dhead">
          <span class="dn num">${d.n}</span>
          <span class="dl">${esc(d.dow)} ${esc(d.date)}</span>
          ${d.iso === now.iso ? `<span class="tt">Today</span>` : ''}
        </span>
        ${golf ? `<span class="dgolf">
          <span class="t num">${esc(golf.time ? E.to12(golf.time) : 'Tee time to set')}</span>
          <span class="ti">${esc(golf.title)}</span>
          <span class="sub">${esc(golf.sub)}</span></span>` : ''}
        ${rest ? `<span class="drest">Rest day — no golf, bar open.</span>` : ''}
        ${social.length ? `<span class="dlist">${social.map(e => `<span class="de">
          <span class="t num">${esc(E.to12(e.time))}</span>
          <span class="ti ${esc(e.kind)}">${esc(e.title)}</span></span>`).join('')}</span>` : ''}
      </button>`;
    }).join('')}
  </div>
  <p class="turn">Tap a day to open and edit it.</p>`;
}

function calDay() {
  const n = calDayNumber();
  const day = E.dayOf(n);
  const es = dayEntries(n);
  const r = roundOnDay(n);
  const ed = canEdit();
  const kinds = [['social', 'Social'], ['ceremony', 'Ceremony'], ['travel', 'Travel']];

  return `<div class="daystrip nos">
    ${D.DAYS.map(d => `<button class="dayb${d.n === n ? ' on' : ''}" data-act="calDay" data-a="${d.n}"
      aria-label="Day ${d.n}, ${esc(d.dow)} ${esc(d.date)}"${d.n === n ? ' aria-current="true"' : ''}>
      <span class="num">${d.n}</span><span>${esc(d.dow.slice(0, 3))}</span></button>`).join('')}
  </div>

  <h3 class="dayhead">${esc(day.dow)} ${esc(day.date)} <span>day ${n} of 8</span></h3>
  ${isRestDay(n) ? `<p class="drest big">Rest day. No golf; Mandatory Team Beers still stands at 7:00 PM.</p>` : ''}

  <div class="fixtures">
    ${es.map(e => `<div class="fx">
      ${e.fixed
        ? `<span class="fxtime num">${esc(e.time ? E.to12(e.time) : '—')}</span>
           <span class="fxtitle golf">${esc(e.title)}</span>
           <span class="fxnote">Golf — tee slots below</span>`
        : `${timePick(e.time, { kind: 'event', a: e.id, ed, clearable: false, label: 'Time of ' + e.title })}
           <input class="fxtitle${ed ? ' live' : ''}" type="text" value="${esc(e.title)}" aria-label="Title" maxlength="60"
             data-act="setEventField" data-a="${e.id}" data-b="title"${ed ? '' : ' disabled'}>
           ${ed ? `<select class="field small" data-act="setEventField" data-a="${e.id}" data-b="kind" aria-label="Kind of fixture">
             ${kinds.map(([k, l]) => `<option value="${k}"${e.kind === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
           <button class="rm" data-act="removeEvent" data-a="${e.id}">Remove</button>`
           : `<span class="fxnote">${esc(kinds.find(k => k[0] === e.kind) ? kinds.find(k => k[0] === e.kind)[1] : e.kind)}</span>`}`}
    </div>`).join('')}
    ${ed ? `<button class="dashb" data-act="addEvent" data-a="${n}">Add fixture</button>` : ''}
  </div>

  ${r ? `<div class="teeblock">
    <h3 class="sub" style="margin-top:30px">Tee times — ${esc(E.courseOf(T, r.id).name)}</h3>
    ${E.roundCfg(T, r.id).tees.map((tee, i) => `<div class="teegroup">
      <div class="teerow">
        <span class="gl">Group ${i + 1}</span>
        ${timePick(tee.time, { kind: 'tee', a: r.id, b: i, ed, clearable: true,
          label: 'Group ' + (i + 1) + ' tee time' })}
      </div>
      <div class="chiprow" style="margin-top:8px">
        ${E.golfers(T).map(g => `<button class="pchip${tee.players.includes(g.id) ? ' on' : ''}"
          data-act="teePlayer" data-a="${r.id}" data-b="${i}" data-c="${g.id}"${ed ? '' : ' disabled'}
          aria-pressed="${tee.players.includes(g.id)}">${esc(g.display)}</button>`).join('')}
      </div>
    </div>`).join('')}
  </div>` : ''}`;
}

/* ---- score entry drafts ----
   Strokes typed on a hole are held locally until the scorer saves the hole.
   Saving confirms with a PIN and only then writes to the shared card, so a
   card only ever holds scores somebody signed off. */

/* A hole part-entered when a phone locks, a tab is dropped, or somebody
   wanders out of signal must still be there when they come back. The draft is
   kept on the device beside the book, and cleared the moment it is saved or
   discarded. It is never shared — nobody else should see a half-made hole. */
const DRAFT_KEY = 'union-invitational:draft';
let draftOnDisk = '';
function persistDraft() {
  const raw = UI.draft && draftDirty() ? JSON.stringify(UI.draft) : '';
  if (raw === draftOnDisk) return;
  draftOnDisk = raw;
  try {
    if (raw) localStorage.setItem(DRAFT_KEY, raw);
    else localStorage.removeItem(DRAFT_KEY);
  } catch (e) { /* storage blocked: the hole simply is not carried over */ }
}
function restoreDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    if (!d || typeof d.rid !== 'string' || typeof d.hole !== 'number') return;
    if (!d.strokes || !d.bbb) return;
    UI.draft = d; draftOnDisk = raw;
    UI.entryRound = d.rid; UI.entryHole = d.hole;   // come back to the hole they were on
  } catch (e) { /* nothing carried over */ }
}

function draftFor(rid, h) {
  if (!UI.draft || UI.draft.rid !== rid || UI.draft.hole !== h) UI.draft = { rid, hole: h, strokes: {}, bbb: {} };
  return UI.draft;
}
function draftDirty() {
  const d = UI.draft;
  return !!d && (Object.keys(d.strokes).length > 0 || Object.keys(d.bbb).length > 0);
}
function grossOf(rid, pid, h) {
  const d = UI.draft;
  if (d && d.rid === rid && d.hole === h && pid in d.strokes) return d.strokes[pid];
  const c = E.card(T, rid, pid);
  return c ? c.raw[h] : null;
}
function bbbOf(rid, h, slot) {
  const d = UI.draft;
  if (d && d.rid === rid && d.hole === h && slot in d.bbb) return d.bbb[slot];
  const b = T.bbb[rid];
  return b && b.holes[h] ? b.holes[h][slot] : null;
}
function holeSavedBy(rid, h) {
  for (const g of E.golfers(T)) {
    const c = E.card(T, rid, g.id);
    if (c && c.by && c.by[h]) return { role: c.by[h], at: c.at ? c.at[h] : null };
  }
  return null;
}

function commitDraft(role) {
  const d = UI.draft;
  if (!d) return;
  const h = d.hole;
  for (const [pid, v] of Object.entries(d.strokes)) {
    store.writeCard(d.rid, pid, c => {
      c.raw[h] = v;
      if (v == null) { delete c.by[h]; delete c.at[h]; }
      else { c.by[h] = role; c.at[h] = Date.now(); }
    });
  }
  if (Object.keys(d.bbb).length) store.writeBbb(d.rid, x => { Object.assign(x.holes[h], d.bbb); });
  UI.draft = null;
}

/** Run `proceed`, unless the current hole has unsaved entries — then ask.
 *  Only ever asks on the way OUT of score entry: walking towards the hole,
 *  or reopening the book on it, is not leaving anything behind. */
function guardDraft(proceed) {
  if (!draftDirty() || UI.screen !== 'entry') { proceed(); render(); return; }
  const n = UI.draft.hole + 1;
  UI.modal = {
    kind: 'confirm',
    title: 'Hole ' + n + ' is not saved',
    note: 'You have entered scores on hole ' + n + ' but have not saved them. Save the hole to record them, or discard them and move on.',
    ok: 'Save hole ' + n, alt: 'Discard and move on', cancel: 'Stay on hole ' + n,
    onOk: () => askPin('Save hole ' + n, 'Enter your PIN to record these scores.', 'Save hole',
                       role => { commitDraft(role); proceed(); render(); }),
    onAlt: () => { UI.draft = null; proceed(); render(); },
  };
  render();
}

function scrEntry() {
  const rid = UI.entryRound;
  const r = E.roundDef(rid);
  const cfg = E.roundCfg(T, rid);
  const open = cfg.state === 'open';
  const locked = cfg.state === 'locked';
  const h = UI.entryHole;
  const course = E.courseOf(T, rid);
  const hole = course.holes[h];
  const cap = E.capFor(hole.par, T.config.capOver);
  const editable = open && canEdit();
  const dirty = draftDirty() && UI.draft.rid === rid && UI.draft.hole === h;
  const saved = holeSavedBy(rid, h);
  const ed = canEdit();

  const slot = UI.entryTee === 'all' ? 0 : +UI.entryTee;
  const slotPlayers = (cfg.tees[slot] || {}).players || [];
  const usingAll = slotPlayers.length === 0;
  const list = usingAll ? E.golfers(T) : E.golfers(T).filter(g => slotPlayers.includes(g.id));

  let gate = '';
  if (!canEdit()) {
    gate = `<div class="gate"><div class="msg"><b>Scoring is closed to you</b>
      <span>Enter a scorer or master PIN to record scores. Everything else in the book stays readable.</span></div>
      <button class="btn" data-act="signIn">Enter PIN</button></div>`;
  } else if (locked) {
    gate = `<div class="gate"><div class="msg"><b>${esc(r.short)} is locked</b>
      <span>Concluded${D.PINS_ENABLED && cfg.lockedBy ? ' by ' + esc((S.ROLES[cfg.lockedBy] || {}).label || cfg.lockedBy) : ''}. The card is final and read-only.</span></div>
      ${canAdmin() ? `<button class="btn ghost" data-act="unlockRound" data-a="${rid}">${D.PINS_ENABLED ? 'Reopen with master PIN' : 'Reopen'}</button>`
        : `<span class="eyebrow">Only the master reviewer can reopen a locked round.</span>`}</div>`;
  } else if (!open) {
    gate = `<div class="gate"><div class="msg"><b>${esc(r.short)} is not open for scoring</b>
      <span>${D.PINS_ENABLED ? 'Opening confirms with your PIN and lets both scorers write to this card.' : 'Opening lets anyone with this page write to the card.'}</span></div>
      <button class="btn" data-act="openRound" data-a="${rid}">Open round</button></div>`;
  }

  const saveBar = editable ? `<div class="savebar${dirty ? ' dirty' : ''}">
    <div class="sv">${dirty
      ? `<b>Hole ${hole.n} is not saved</b><span>${Object.keys(UI.draft.strokes).length} entr${Object.keys(UI.draft.strokes).length === 1 ? 'y' : 'ies'} waiting. ${D.PINS_ENABLED ? 'Saving asks for your PIN.' : 'Nothing counts until you save.'}</span>`
      : saved
        ? `<b>Hole ${hole.n} saved</b><span>Recorded${D.PINS_ENABLED && S.ROLES[saved.role] ? ' by ' + esc(S.ROLES[saved.role].label) : ''}${saved.at ? ' at ' + esc(E.to12(new Date(saved.at + D.TZ_OFFSET_MIN * 60000).toISOString().slice(11, 16))) : ''}.</span>`
        : `<b>Hole ${hole.n}</b><span>Enter every score on this hole, then save it.</span>`}</div>
    <button class="btn${dirty ? '' : ' ghost'}" data-act="saveHole"${dirty ? '' : ' disabled'}>Save hole ${hole.n}</button>
    <button class="btn danger" data-act="lockRound" data-a="${rid}">Lock &amp; conclude</button>
  </div>` : '';

  const rows = list.map(g => {
    const raw = grossOf(rid, g.id, h);
    const st = E.strokesFor(g.band, hole.si);
    const adj = raw == null ? null : Math.min(raw, cap);
    const net = adj == null || st == null ? null : adj - st;
    const capped = raw != null && raw >= cap;
    const c = E.card(T, rid, g.id);
    const tp = E.roundToPar(T, rid, g.id);
    const pending = UI.draft && UI.draft.rid === rid && UI.draft.hole === h && (g.id in UI.draft.strokes)
      && UI.draft.strokes[g.id] !== (c ? c.raw[h] : null);
    return `<div class="prow${pending ? ' pending' : ''}">
      <div class="pmain">
        <div class="pwho">
          <div class="nm">${esc(g.display)}${pending ? '<span class="tag">unsaved</span>' : ''}</div>
          <div class="bd num">band ${g.band ? g.band : '—'} <span>${st == null ? '·' : '+' + st + ' here'}</span></div>
        </div>
        ${editable ? `<button class="step minus" data-act="bump" data-a="${g.id}" data-b="-1" aria-label="One stroke fewer for ${esc(g.display)}">−</button>` : ''}
        <div class="fig raw"><div class="v num">${raw == null ? '·' : raw}</div><div class="l">raw</div></div>
        ${editable ? `<button class="step plus" data-act="bump" data-a="${g.id}" data-b="1" aria-label="One stroke more for ${esc(g.display)}"${capped ? ' disabled' : ''}>+</button>` : ''}
        <div class="fig"><div class="v num">${adj == null ? '·' : adj}</div><div class="l">adjusted</div></div>
        <div class="fig"><div class="v num net">${net == null ? '·' : net}</div><div class="l">net</div></div>
        <div class="fig end"><div class="v num ${cls(tp.thru ? tp.tp : null)}">${tp.thru ? esc(E.fmtToPar(tp.tp)) : '—'}</div><div class="l num">thru ${tp.thru}</div></div>
      </div>
      ${ed ? `<div class="prelief">
        ${capped ? `<span class="capchip">Capped at ${cap} — pick up</span>` : ''}
        ${r.noMulligans ? '' : `
          <button class="mchip${c && c.mF ? ' on' : ''}" data-act="tgl" data-a="${g.id}" data-b="mF"${editable ? '' : ' disabled'}>Front mulligan: ${c && c.mF ? 'Used' : '1 left'}</button>
          <button class="mchip${c && c.mB ? ' on' : ''}" data-act="tgl" data-a="${g.id}" data-b="mB"${editable ? '' : ' disabled'}>Back mulligan: ${c && c.mB ? 'Used' : '1 left'}</button>`}
        ${h === 0 ? `<button class="mchip${c && c.bb ? ' on' : ''}" data-act="tgl" data-a="${g.id}" data-b="bb"${editable ? '' : ' disabled'}>Breakfast ball: ${c && c.bb ? 'Used' : 'Available'}</button>` : ''}
        ${editable ? `<button class="clearh" data-act="clearHole" data-a="${g.id}">Clear hole</button>` : ''}
      </div>` : ''}
    </div>`;
  }).join('');

  const people = sel => `<option value="">Nobody yet</option>` + E.golfers(T).map(g =>
    `<option value="${g.id}"${sel === g.id ? ' selected' : ''}>${esc(g.display)}</option>`).join('');

  return `<h2 class="head">Score Entry</h2>
  <p class="lede">Gross strokes in. Raw and adjusted sit side by side, exactly as the group’s own cards read.</p>

  <div class="entrytop">
   <div class="entryleft">
    <div class="rcards">
      ${D.ROUNDS.map(x => {
        const d = E.dayOf(x.dayIdx);
        return `<button class="rcard${x.id === rid ? ' on' : ''}${x.counts ? '' : ' practice'}" data-act="entryRound" data-a="${x.id}">
          <b>${esc(x.short === 'Practice' ? 'Practice' : 'Round ' + x.short.slice(1))}</b>
          <span>${esc(d.dow)} ${esc(d.date)}</span></button>`;
      }).join('')}
      ${!r.counts ? `<p class="note-it">Get Loose Foursomes — practice. Feeds nothing; log it for the bragging rights.</p>` : ''}
      ${r.noMulligans ? `<p class="note-red"><strong>Championship final — no mulligans today.</strong> The breakfast ball on hole 1 is retained.</p>` : ''}
    </div>
    <div class="grouprow">
      <span class="gl">Group</span>
      ${cfg.tees.map((t, i) => `<button class="gchip${slot === i ? ' on' : ''}" data-act="entryTee" data-a="${i}">Group ${i + 1}${t.time ? ' — ' + E.to12(t.time) : ''}</button>`).join('')}
      ${usingAll ? `<span class="gnote">No group assigned yet — showing all golfers.</span>` : ''}
    </div>
   </div>
    ${/* the hole they are standing on, drawn exactly as Course Setup draws it,
          minus its hole strip — here the card decides which hole this is */ ''}
    <div class="cside">
      ${IMG[hole.img] ? `<img src="${IMG[hole.img]}" alt="Diagram of hole ${hole.n} at ${esc(course.name)}">` : ''}
      <div class="cfacts num">
        <span class="hn">Hole ${hole.n}</span>
        <span>Par ${hole.par}</span>
        <span class="m">SI ${hole.si}</span>
        <span class="m">${hole.mW} m White</span>
      </div>
    </div>
  </div>

  ${gate}${saveBar}

  <div class="scroller nos"><div class="hstrip">
    ${course.holes.map((x, i) => `<button class="hcell${i === h ? ' on' : ''}${holeSavedBy(rid, i) ? ' saved' : ''}"
      data-act="entryHole" data-a="${i}" aria-label="Hole ${x.n}, par ${x.par}">
      <span class="n num">${x.n}</span><span class="p num">par ${x.par}</span></button>`).join('')}
  </div></div>

  <div class="holehead">
    <h3 class="num">Hole ${hole.n}</h3>
    <span class="num">Par ${hole.par}</span>
    <span class="m num">Stroke index ${hole.si}</span>
    <span class="r num">Picks up at ${cap}</span>
  </div>

  <div class="entrygrid">
    <div>${rows || `<p class="empty">No golfers in this group.</p>`}</div>
    <div>
      <div class="side-b">
        <h3>Bingo Bango Bongo — hole ${hole.n}</h3>
        <p class="sublede">First on, closest once all on, first in.</p>
        <div class="fieldset">
          ${[['bingo', 'Bingo — first on the green'], ['bango', 'Bango — closest once all on'], ['bongo', 'Bongo — first to hole out']].map(([k, lbl]) =>
            `<label>${esc(lbl)}
              <select class="field" data-act="setBbb" data-a="${k}"${editable ? '' : ' disabled'}>${people(bbbOf(rid, h, k))}</select></label>`).join('')}
        </div>
      </div>

      <div class="side-g">
        <h3>Pin &amp; drive — ${esc(r.short)}</h3>
        <div class="fieldset">
          <label>Closest to the Pin hole
            <select class="field${cfg.ctpHole ? '' : ' unset'}" data-act="setRoundField" data-a="ctpHole"${ed ? '' : ' disabled'}>
              <option value="">Not chosen yet</option>
              ${course.holes.filter(x => x.par === 3).map(x => `<option value="${x.n}"${cfg.ctpHole === x.n ? ' selected' : ''}>Hole ${x.n}</option>`).join('')}
            </select></label>
          <label>Closest — current mark
            <select class="field" data-act="setRoundField" data-a="ctpWinner"${ed ? '' : ' disabled'}>${people(cfg.ctpWinner)}</select></label>
          <label>Distance
            <input class="field" type="text" value="${esc(cfg.ctpDist || '')}" placeholder="e.g. 2.4 m"
              data-act="setRoundField" data-a="ctpDist"${ed ? '' : ' disabled'}></label>
          <label>Longest Drive hole
            <select class="field${cfg.ldHole ? '' : ' unset'}" data-act="setRoundField" data-a="ldHole"${ed ? '' : ' disabled'}>
              <option value="">Not chosen yet</option>
              ${course.holes.map(x => `<option value="${x.n}"${cfg.ldHole === x.n ? ' selected' : ''}>Hole ${x.n} — par ${x.par}</option>`).join('')}
            </select></label>
          <label>Longest — current marker
            <select class="field" data-act="setRoundField" data-a="ldWinner"${ed ? '' : ' disabled'}>${people(cfg.ldWinner)}</select></label>
          <label>Distance
            <input class="field" type="text" value="${esc(cfg.ldDist || '')}" placeholder="e.g. 260 m"
              data-act="setRoundField" data-a="ldDist"${ed ? '' : ' disabled'}></label>
        </div>
      </div>
    </div>
  </div>`;
}

/* Typing "7:40 AM" on a phone keyboard is a chore and every mistyping was a
   silently refused write. Three wheels instead: hour, minute, AM or PM. The
   stored value stays 24-hour — only the picking is 12-hour. */
function timeKey(o) { return o.kind + ':' + o.a + ':' + (o.b == null ? '' : o.b); }
function timePick(time, o) {
  if (!o.ed) return `<span class="tt-in num read">${esc(time ? E.to12(time) : '—')}</span>`;
  const m = /^(\d{1,2}):(\d{2})$/.exec(time || '');
  const h24 = m ? +m[1] : null;
  /* What is on the wheels comes from state, never from the last render's DOM.
     Reading it back out of three <select> elements meant that any redraw
     between the pick and the save handed back the stored time again — a write
     of no change, which is exactly a time that undoes itself. */
  const held = UI.timePick[timeKey(o)];
  const hh = held ? held.h : h24 == null ? '' : String(h24 % 12 || 12);
  const mm = held ? held.m : m ? m[2] : '';
  const ap = held ? held.ap : h24 == null ? '' : (h24 >= 12 ? 'PM' : 'AM');
  const opt = (v, l, cur) => `<option value="${v}"${String(cur) === String(v) ? ' selected' : ''}>${l}</option>`;
  const blank = o.clearable ? opt('', '––', '') : '';
  const hours = Array.from({ length: 12 }, (_, i) => i + 1).map(x => opt(x, x, hh)).join('');
  const mins = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map(x => opt(x, x, mm)).join('');
  return `<span class="timepick" data-tkind="${o.kind}" data-a="${esc(o.a)}" data-b="${esc(o.b == null ? '' : o.b)}" data-key="${esc(timeKey(o))}">
    <select class="field small tsel" data-act="setTime" data-part="h" aria-label="${esc(o.label)} — hour">${blank}${hours}</select>
    <span class="tcolon" aria-hidden="true">:</span>
    <select class="field small tsel" data-act="setTime" data-part="m" aria-label="${esc(o.label)} — minute">${blank}${mins}</select>
    <select class="field small tsel ampm" data-act="setTime" data-part="ap" aria-label="${esc(o.label)} — AM or PM">${blank}${opt('AM', 'AM', ap)}${opt('PM', 'PM', ap)}</select>
  </span>`;
}

function scrRoster() {
  const gs = E.golfers(T);
  const ed = canEdit();
  const assigned = new Set(T.config.pairs.flatMap(p => p.members));
  const unassigned = gs.filter(g => !assigned.has(g.id));
  const bandsSet = gs.filter(g => g.band != null).length;
  const others = T.config.people.length - gs.length;   // on the roster, but not pairable

  const pairOptions = cur => [`<option value="unassigned"${cur === 'unassigned' ? ' selected' : ''}>Unassigned</option>`]
    .concat(T.config.pairs.map(p => `<option value="${p.id}"${cur === p.id ? ' selected' : ''}>${esc(E.pairName(T, p))}</option>`)).join('');

  const member = (m, pairId) => {
    const p = E.person(T, m) || {};
    return `<div class="pmem"${ed ? ' draggable="true"' : ''} data-act="dragGolfer" data-a="${m}">
      <span class="grip" aria-hidden="true">≡</span>
      <span class="mn">${esc(p.display || '?')}</span>
      <span class="ml">${esc(p.location || '—')}</span>
      <span class="mb num">${p.band == null ? '—' : p.band}</span>
      ${ed ? `<select class="field small" data-act="moveGolfer" data-a="${m}" aria-label="Move ${esc(p.display)} to">${pairOptions(pairId)}</select>` : ''}
    </div>`;
  };

  return `<div class="titlerow">
    <h2 class="head">Pairings</h2>
    ${ed ? `<button class="btn ghost" data-act="addPair">Add pair</button>` : ''}
  </div>
  <p class="lede">Fixed for the week. Drag between pairs or use the Move to menu — both work one-handed. Shared with everyone.</p>

  <div class="pairgrid">
    ${T.config.pairs.map(pr => `<div class="paircol" data-act="dropPair" data-a="${pr.id}" data-reveal="pair:${pr.id}">
      <div class="phead">
        ${ed ? `<input class="pname" type="text" value="${esc(pr.name || '')}" placeholder="${esc(E.pairName(T, pr))}"
            aria-label="Name of ${esc(E.pairName(T, pr))}" maxlength="40" data-act="renamePair" data-a="${pr.id}">`
          : `<span class="pname read">${esc(E.pairName(T, pr))}</span>`}
        ${ed ? `<button class="ibtn" data-act="movePair" data-a="${pr.id}" data-b="-1" aria-label="Move pair up">↑</button>
          <button class="ibtn" data-act="movePair" data-a="${pr.id}" data-b="1" aria-label="Move pair down">↓</button>
          <button class="rm" data-act="deletePair" data-a="${pr.id}">Delete</button>` : ''}
      </div>
      ${pr.members.length ? pr.members.map(m => member(m, pr.id)).join('')
        : `<div class="pdrop">Drop a golfer here</div>`}
    </div>`).join('')}

    <div class="paircol un" data-act="dropPair" data-a="unassigned">
      <div class="phead"><span class="pname read">Unassigned (${unassigned.length})</span></div>
      ${others ? `<p class="pnote">Only golfers can be paired. ${others} ${others > 1 ? 'people are' : 'person is'} on the roster as an
        official or a spectator — set their role to Golfer below to pair them.</p>` : ''}
      ${unassigned.length ? unassigned.map(g => member(g.id, 'unassigned')).join('')
        : `<div class="pdrop">Everyone is paired. Eleven golfers means one is always over — that is fine.</div>`}
    </div>
  </div>

  <div class="titlerow" style="margin-top:44px">
    <h3 class="sub" style="font-size:28px;font-weight:700;margin:0">Roster</h3>
    <span class="rnote">${bandsSet} of ${gs.length} bands set. Every golfer plays off a 15, 20 or 25 band — the band is the strokes they receive.</span>
    ${ed ? `<button class="btn ghost" data-act="addPerson" data-a="golfer">Add person</button>` : ''}
  </div>
  ${ed ? saveRow() : ''}

  <div class="scroller nos rosterwrap">
    <table class="rtable">
      <thead><tr><th>Name</th><th>Display</th><th>Role</th><th>Location</th><th>Group</th><th>Band</th><th></th></tr></thead>
      <tbody>
        ${T.config.people.map(p => `<tr>
          <td data-l="Name">${ed ? `<input class="cellin" type="text" value="${esc(p.name)}" aria-label="Full name" maxlength="40"
                data-act="setPerson" data-a="${p.id}" data-b="name">` : esc(p.name)}</td>
          <td data-l="Display">${ed ? `<input class="cellin sm" type="text" value="${esc(p.display)}" aria-label="Display name" maxlength="24"
                data-act="setPerson" data-a="${p.id}" data-b="display">` : esc(p.display)}</td>
          <td data-l="Role">${ed ? `<select class="field small" data-act="setPerson" data-a="${p.id}" data-b="role" aria-label="Role">
                ${[['golfer', 'Golfer'], ['official', 'Official'], ['spectator', 'Spectator']].map(([v, l]) =>
                  `<option value="${v}"${p.role === v ? ' selected' : ''}>${l}</option>`).join('')}</select>` : esc(p.role)}</td>
          <td data-l="Squad"><div class="tog">
            ${['UK', 'USA'].map(sq => `<button class="tbtn${p.location === sq ? ' on' : ''}" data-act="setLoc"
              data-a="${p.id}" data-b="${sq}"${ed ? '' : ' disabled'} aria-pressed="${p.location === sq}">${sq}</button>`).join('')}
          </div></td>
          <td data-l="Group">${ed ? `<select class="field small" data-act="setPerson" data-a="${p.id}" data-b="group" aria-label="Group">
                ${['7-day', '5-day'].map(v => `<option value="${v}"${p.group === v ? ' selected' : ''}>${v}</option>`).join('')}</select>` : esc(p.group)}</td>
          <td data-l="Band">${p.role === 'golfer' ? `<div class="tog">
            ${E.BANDS.map(bnd => `<button class="tbtn${p.band === bnd ? ' on' : ''}" data-act="setBand"
              data-a="${p.id}" data-b="${bnd}"${ed ? '' : ' disabled'} aria-pressed="${p.band === bnd}">${bnd}</button>`).join('')}
          </div>` : ''}</td>
          <td data-l="">${canAdmin() ? `<button class="rm" data-act="removePerson" data-a="${p.id}">Remove</button>` : ''}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
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
  const open = canEdit() && !c.verified; // a verified card is locked until it is reopened
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
      ? `<button class="btn${c.verified ? ' ghost' : ''}" data-act="verifyCourse" data-a="${c.key}">${
          c.verified ? 'Verified — tap to reopen' : UI.reopened[c.key] ? 'Done — lock card' : 'Not verified — tap to verify'}</button>`
      : `<span class="pill">${c.verified ? 'Verified' : 'Not verified'}</span>`}
    <span class="cfoot-note">${c.verified
      ? `Par, stroke index and yardages are locked.${D.PINS_ENABLED ? ' Reopening asks for a scorer or master PIN.' : ''}`
      : UI.reopened[c.key]
        ? `Open for correction. It locks itself when you leave this screen — no second PIN.`
        : `The card is open for correction.${D.PINS_ENABLED ? ' Verifying asks for a scorer or master PIN.' : ''} Nets on ${esc(c.name)} are provisional until it is verified.`}</span>
  </div>`;
}

function scrSetup() {
  if (!canAdmin()) return `<h2 class="head">Setup</h2><p class="empty">The master PIN opens this screen.</p>
    <button class="btn" data-act="signIn">Enter PIN</button>`;
  const p = T.config.pins;
  return `<h2 class="head">Setup</h2>
  <p class="lede">Master reviewer controls. PINs gate who may write to a card; everyone else reads the book.</p>

  <h3 class="sub">Scoring PINs</h3>
  ${!D.PINS_ENABLED ? `<div class="notice"><b>PINs are switched off</b>
    <div style="font-size:15px;color:var(--turf)">Anyone who can open this page can enter scores, open a round and lock it. The three PINs below are saved and ready — ask for them to be switched on once the book is finished.</div></div>` : ''}
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
  ['today', 'Today', 'Today'], ['boards', 'Leaderboards', 'Boards'], ['ryder', 'Ryder Cup', 'Ryder'],
  ['calendar', 'Calendar', 'Calendar'], ['entry', 'Score Entry', 'Scores'], ['roster', 'Roster & Pairings', 'Roster'],
  ['rules', 'Games & Rules', 'Rules'], ['courses', 'Course Setup', 'Courses'], ['setup', 'Setup', 'Setup'],
];

/** A re-render replaces the whole tree, which would blow away half-typed text
 *  and the caret. Remember the focused control by its action, and put it back. */
function fieldKey(el) {
  if (!el || !el.dataset || !el.dataset.act) return null;
  return [el.dataset.act, el.dataset.a || '', el.dataset.b || '', el.dataset.c || ''].join('|');
}
function captureFocus() {
  const el = document.activeElement;
  const key = fieldKey(el);
  if (!key || !('value' in el)) return null;
  return { key, value: el.value, start: el.selectionStart, end: el.selectionEnd };
}
function restoreFocus(f) {
  if (!f) return;
  const el = Array.from(document.querySelectorAll('[data-act]')).find(x => fieldKey(x) === f.key);
  if (!el || !('value' in el)) return;
  el.value = f.value;
  el.focus();
  try { el.setSelectionRange(f.start, f.end); } catch (e) { /* not a text input */ }
}

/* Rebuilding the page under somebody's thumb.
   Every render replaces the whole DOM. On a phone a <select> is a native
   wheel, and destroying the element while that wheel is open cancels it and
   snaps the value back — which is why a tee time appeared to undo itself
   after every pick. A write echoes back through the subscription a moment
   later and triggers exactly that. The same storm can swallow a tap, by
   replacing the button between the finger going down and coming up.
   So while a control is genuinely in use, the redraw waits. */
let renderPending = false;
function inUse() {
  const el = document.activeElement;
  if (!el || !document.getElementById('app')) return false;
  if (!document.getElementById('app').contains(el)) return false;
  return el.tagName === 'SELECT';
}
function flushRender() {
  if (!renderPending) return;
  renderPending = false;
  render();
}
document.addEventListener('blur', () => setTimeout(flushRender, 0), true);
document.addEventListener('change', () => setTimeout(flushRender, 0), true);

function render() {
  if (inUse()) { renderPending = true; return; }
  renderPending = false;
  const app = document.getElementById('app');
  const focused = captureFocus();
  const body = { today: scrToday, boards: scrBoards, ryder: scrRyder, calendar: scrCalendar,
                 entry: scrEntry, roster: scrRoster, rules: scrRules, courses: scrCourses, setup: scrSetup }[UI.screen]();

  const nt = E.nextTee(T, now);
  const role = S.ROLES[UI.role];
  /* A write that was turned away has to say so. Silence is what made a
     refused tee time look like a control that "resets itself", and a refused
     Open round look like a button that does nothing. */
  const bad = meta.status === 'error' || meta.saveState === 'error';
  const dot = bad ? 'err' : meta.status === 'live' ? 'live' : '';
  const statusText = bad
    ? (loaded() ? 'Save failed — your last change may not have reached the others'
                : 'Not saved — the book is still loading. Try again in a moment.')
    : meta.status === 'live' ? 'Shared — every device sees this'
    : meta.status === 'local' ? 'This device only — shared storage unavailable'
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
        <div class="mast-actions">
          ${setupChip()}
          ${D.PINS_ENABLED
            ? `<button class="chip" data-act="signIn">${esc(role.label)}${UI.role === 'viewer' ? ' — enter PIN' : ' — sign out'}</button>`
            : `<span class="chip">Unlocked — no PIN</span>`}
        </div>
      </div>
    </header>
    <div class="rule-heavy"></div>
    ${loaded() ? '' : `<div class="loadbar${meta.status === 'error' ? ' bad' : ''}">
      ${meta.status === 'error'
        ? 'Cannot read the shared book. Nothing can be edited until it loads, so nothing gets overwritten. Check your connection and reload.'
        : 'Opening the book… everything is read-only until the saved tournament arrives.'}</div>`}
    <nav class="tabs nos" aria-label="Sections">
      ${NAV.filter(([id]) => id !== 'setup' || canAdmin()).map(([id, label, short]) =>
        `<button class="tab" data-act="go" data-a="${id}"${UI.screen === id ? ' aria-current="page"' : ''}
          aria-label="${esc(label)}"><span class="lg">${esc(label)}</span><span class="sm">${esc(short)}</span></button>`).join('')}
    </nav>
    ${body}
    <div class="statusbar">
      <span class="dot ${dot}"></span><span>${esc(statusText)}</span>
      <span>${D.PINS_ENABLED ? esc(role.label) : 'Unlocked — anyone can score'}</span>
      <span class="sp">The Union Invitational — Belek, Türkiye — 2026</span>
      <span class="build" title="Which copy of the book this device is running">build ${esc(D.BUILD)}</span>
    </div>
  </div>
  ${UI.modal ? modalHtml() : ''}`;

  if (UI.modal && UI.modal.kind === 'pin') { const i = document.getElementById('pinField'); if (i) { i.focus(); i.select(); } }
  else if (UI.modal && UI.modal.kind === 'add') { const i = document.getElementById('addName'); if (i) i.focus(); }
  else restoreFocus(focused);

  persistDraft();

  if (UI.reveal) {
    const want = UI.reveal; UI.reveal = null;
    const el = document.querySelector(`[data-reveal="${want}"]`);
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const field = el.querySelector('input');
      if (field) field.focus();
    }
  }
}

const SETUP_SCOPES = {
  all:   { only: null, title: 'Setup incomplete',
           note: n => `${n} thing${n > 1 ? 's' : ''} still to settle before the first card counts. Update takes you to where each one is fixed.`,
           clear: 'Every band is set, the pairs are filled, both cards are verified. The book is ready.' },
  entry: { only: ['bands', 'courses'], title: 'Before you enter scores',
           note: n => `${n} thing${n > 1 ? 's' : ''} here will keep these cards off the leaderboards. You can still record strokes — they just will not count until this is settled.`,
           clear: 'Every golfer has a band and both cards are verified. Scores entered here count straight away.' },
};

function setupModalHtml() {
  const scope = SETUP_SCOPES[(UI.modal && UI.modal.scope) || 'all'] || SETUP_SCOPES.all;
  const issues = E.setupIssues(T).filter(i => !scope.only || scope.only.includes(i.id));
  if (!issues.length) {
    return `<div class="scrim" data-act="modalScrim"><div class="modal" role="dialog" aria-modal="true" aria-label="Setup complete">
      <h3>Nothing outstanding</h3><p>${esc(scope.clear)}</p>
      <div class="acts"><button class="btn" data-act="modalCancel">Close</button></div></div></div>`;
  }
  return `<div class="scrim" data-act="modalScrim"><div class="modal wide" role="alertdialog" aria-modal="true" aria-label="Setup incomplete">
    <h3>${esc(scope.title)}</h3>
    <p>${esc(scope.note(issues.length))}</p>
    <div class="setup-list">
      ${issues.map(i => `<div class="setup-item">
        <span class="tx">${esc(i.text)}</span>
        <button class="btn ghost sm" data-act="setupGo" data-a="${i.screen}">${esc(i.cta)}</button>
      </div>`).join('')}
    </div>
    <div class="acts"><button class="btn ghost" data-act="modalCancel">Dismiss</button></div>
  </div></div>`;
}

function pinModalHtml() {
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

function addModalHtml() {
  const m = UI.modal;
  const what = { golfer: 'golfer', official: 'official', spectator: 'guest' }[m.role] || 'person';
  return `<div class="scrim" data-act="modalScrim"><div class="modal" role="dialog" aria-modal="true" aria-label="Add a ${esc(what)}">
    <h3>Add a ${esc(what)}</h3>
    <p>${m.role === 'golfer' ? 'Give them a playing band on the roster once they are in.' : 'They appear on the roster and can take Bingo Bango Bongo points if they play.'}</p>
    <input class="field" id="addName" type="text" placeholder="Full name" maxlength="40" aria-label="Name" style="width:100%;font-size:18px">
    <p class="err">${esc(UI.modalErr)}</p>
    <div class="acts"><button class="btn ghost" data-act="modalCancel">Cancel</button>
      <button class="btn" data-act="addSave">Save</button></div>
  </div></div>`;
}

function confirmModalHtml() {
  const m = UI.modal;
  return `<div class="scrim" data-act="modalScrim"><div class="modal" role="alertdialog" aria-modal="true" aria-label="${esc(m.title)}">
    <h3>${esc(m.title)}</h3>
    <p>${esc(m.note)}</p>
    <div class="acts">
      ${m.alt ? `<button class="btn ghost" data-act="confirmAlt">${esc(m.alt)}</button>` : ''}
      <button class="btn ghost" data-act="modalCancel">${esc(m.cancel || 'Cancel')}</button>
      <button class="btn" data-act="confirmOk">${esc(m.ok)}</button></div>
  </div></div>`;
}

/** Setup state, in the same corner on every screen. Red while anything is
 *  outstanding; quiet once the book is ready. Opens the full setup dialog. */
function setupChip() {
  const n = E.setupIssues(T).length;
  return n
    ? `<button class="setup-chip open" data-act="setupOpen" data-a="all"
        aria-label="Setup incomplete, ${n} thing${n > 1 ? 's' : ''} to settle. Review them.">
        <span class="mk">!</span>Setup incomplete<span class="ct">${n}</span></button>`
    : `<button class="setup-chip done" data-act="setupOpen" data-a="all" aria-label="Setup complete. Review.">
        <span class="mk">✓</span>Setup complete</button>`;
}

function modalHtml() {
  return UI.modal.kind === 'setup' ? setupModalHtml()
       : UI.modal.kind === 'add' ? addModalHtml()
       : UI.modal.kind === 'confirm' ? confirmModalHtml()
       : pinModalHtml();
}

/* ---------------- dispatch ---------------- */

function askPin(title, note, ok, onOk) {
  if (!D.PINS_ENABLED) { onOk('master'); render(); return; }
  UI.modal = { kind: 'pin', title, note, ok, onOk }; UI.modalErr = ''; render();
}

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

/** The roster and pairings save on every edit. This states that plainly, and
 *  gives a way to write them again — which is also the retry if one failed. */
function saveRow() {
  const st = meta.saveState || 'idle';
  const at = meta.lastSavedAt
    ? E.to12(new Date(meta.lastSavedAt + D.TZ_OFFSET_MIN * 60000).toISOString().slice(11, 16))
    : null;
  const word = { saving: 'Saving…', error: 'That change did not save. Tap Save roster to try again.',
                 saved: at ? 'All changes saved at ' + at + '.' : 'All changes saved.',
                 idle: 'Every edit here saves as you make it.' }[st];
  return `<div class="saverow${st === 'error' ? ' bad' : ''}">
    <button class="btn${st === 'error' ? ' danger' : ' ghost'}" data-act="saveRoster"${st === 'saving' ? ' disabled' : ''}>Save roster</button>
    <span class="sm">${st === 'saved' ? '<span class="tick">✓</span> ' : ''}${esc(word)}</span>
  </div>`;
}

/** Re-lock any card this device reopened. Called on the way out of Course
 *  Setup and when switching cards, so a correction costs one PIN, not two. */
function relockCards() {
  const keys = Object.keys(UI.reopened);
  if (!keys.length) return;
  store.writeConfig(cf => { keys.forEach(k => { if (cf.courses[k]) cf.courses[k].verified = true; }); });
  UI.reopened = {};
}

/** Put a golfer in one pair, or nowhere. Used by the Move to menu and by a drop. */
function movePlayer(pid, target) { store.movePlayer(pid, target); }

const setRound = (rid, patch) => store.writeConfig(c => { Object.assign(c.rounds[rid], patch); });

function onClick(e) {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const { act, a, b } = el.dataset;
  if (el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
  if (store && store.note) store.note('tap', act + ' a=' + (a || '') + ' b=' + (b || ''));
  const rid = UI.entryRound;

  switch (act) {
    case 'go':
      if (a === 'entry') {     // going to the hole, not away from it
        if (UI.screen === 'courses') relockCards();
        UI.screen = a; UI.modal = null; window.scrollTo(0, 0);
        if (!UI.entrySeen) {
          UI.entrySeen = true;
          if (E.setupIssues(T).some(i => SETUP_SCOPES.entry.only.includes(i.id))) UI.modal = { kind: 'setup', scope: 'entry' };
        }
        render();
        return;
      }
      guardDraft(() => {
        if (UI.screen === 'courses' && a !== 'courses') relockCards();
        UI.screen = a; UI.modal = null; window.scrollTo(0, 0);
        if (a === 'entry' && !UI.entrySeen) {
          UI.entrySeen = true;
          if (E.setupIssues(T).some(i => SETUP_SCOPES.entry.only.includes(i.id))) UI.modal = { kind: 'setup', scope: 'entry' };
        }
      });
      return;
    case 'goRule': UI.screen = 'rules'; render();
      { const d = document.getElementById('rule-' + a); if (d) { d.open = true; d.scrollIntoView({ block: 'center' }); } }
      return;
    case 'boardTab': UI.boardTab = a; break;
    case 'boardRound': UI.boardRound = a; UI.bookHole = 0; break;
    case 'bookHole': UI.bookHole = +a; break;
    case 'entryRound': guardDraft(() => { UI.entryRound = a; UI.entryHole = 0; UI.entryTee = '0'; }); return;
    case 'entryHole': guardDraft(() => { UI.entryHole = +a; }); return;
    case 'entryTee': UI.entryTee = a; break;
    case 'calView': UI.calView = a; break;
    case 'calDay': UI.calDay = +a; UI.calView = 'day'; window.scrollTo(0, 0); break;
    case 'addEvent':
      if (!canEdit()) return;
      store.writeConfig(c => { c.schedule.push({ id: 'e' + Date.now().toString(36), dayIdx: +a, time: '18:00', title: 'New fixture', kind: 'social' }); });
      return;
    case 'removeEvent':
      if (!canEdit()) return;
      store.writeConfig(c => { c.schedule = c.schedule.filter(e => e.id !== a); });
      return;
    case 'teePlayer':
      if (!canEdit()) return;
      store.writeConfig(c => {
        const tee = c.rounds[a].tees[+b];
        const i = tee.players.indexOf(el.dataset.c);
        if (i >= 0) tee.players.splice(i, 1); else tee.players.push(el.dataset.c);
      });
      return;
    case 'addPair': {
      if (!canEdit()) return;
      // A new pair lands at the end of a long page — off the bottom on a
      // phone — so the tap looked like it did nothing. Show it instead.
      const id = 'p' + Date.now().toString(36);
      UI.reveal = 'pair:' + id;
      store.addPair({ id, name: null, members: [] });
      return;
    }
    case 'deletePair':
      if (!canEdit()) return;
      store.removePair(a);
      return;
    case 'movePair':
      if (!canEdit()) return;
      store.movePairBy(a, +b);
      return;
    case 'saveRoster':
      if (!canEdit()) return;
      store.resave();
      return;
    case 'setLoc':
      if (!canEdit()) return;
      store.writePerson(a, p => { p.location = p.location === b ? null : b; });
      return;
    case 'courseTab':
      if (a !== UI.courseTab) relockCards();
      UI.courseTab = a; UI.courseHole = 0;
      break;
    case 'courseHole': UI.courseHole = +a; break;
    case 'verifyCourse': {
      if (!canEdit()) return;
      const cur = E.courseByKey(T, a);
      const setVerified = v => { store.writeConfig(cf => { cf.courses[a].verified = v; }); };
      if (cur.verified) {
        askPin('Reopen the ' + cur.name + ' card',
          'Reopening unlocks par, stroke index and the yardages so the card can be corrected. It locks itself again when you leave.',
          'Reopen card',
          () => { UI.reopened[a] = true; setVerified(false); render(); });
      } else if (UI.reopened[a]) {
        setVerified(true); delete UI.reopened[a];   // this device opened it — no second PIN
      } else {
        askPin('Verify the ' + cur.name + ' card',
          'Verifying locks the card so nothing can be changed by accident.',
          'Verify card', () => { setVerified(true); render(); });
      }
      return;
    }
    case 'revealPins': UI.revealPins = !UI.revealPins; break;
    case 'setupOpen': UI.modal = { kind: 'setup', scope: a || 'all' }; break;
    case 'setupGo': UI.modal = null; UI.screen = a; window.scrollTo(0, 0); break;

    case 'signIn':
      if (UI.role !== 'viewer') { UI.role = 'viewer'; saveRole('viewer'); if (UI.screen === 'setup') UI.screen = 'today'; break; }
      askPin('Enter your PIN', 'Scorers may record and lock rounds. The master reviewer can also reopen a locked round and change every PIN.', 'Sign in',
        role => { UI.role = role; saveRole(role); });
      return;

    case 'openRound':
      askPin('Open ' + E.roundDef(a).short + ' for scoring', 'Confirm with your PIN. Both scorers can then write to this card.', 'Open round',
        role => {
          if (store.note) store.note('openRound', a + ' was ' + (T.config.rounds[a] || {}).state);
          setRound(a, { state: 'open', openedBy: role });
          UI.entryRound = a; UI.screen = 'entry';
        });
      return;
    case 'lockRound':
      if (draftDirty()) { guardDraft(() => {}); return; }
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
      const d = draftFor(rid, h);
      const cur = grossOf(rid, a, h);
      let v = cur == null ? (+b > 0 ? hole.par : null) : cur + (+b);
      if (v != null && v < 1) v = null;
      if (v != null && v > cap) v = cap;
      d.strokes[a] = v;
      break;
    }
    case 'clearHole': {
      if (!canEdit() || E.roundCfg(T, rid).state !== 'open') return;
      draftFor(rid, UI.entryHole).strokes[a] = null;
      break;
    }
    case 'saveHole': {
      if (!draftDirty()) return;
      const n = UI.draft.hole + 1;
      askPin('Save hole ' + n, 'Enter your PIN to record these scores. Only saved holes reach the leaderboards.',
        'Save hole', role => { commitDraft(role); render(); });
      return;
    }
    case 'tgl':
      if (!canEdit() || E.roundCfg(T, rid).state !== 'open') return;
      store.writeCard(rid, a, c => { c[b] = !c[b]; });
      return;

    case 'cycleSquad': {
      const cycle = () => store.writePerson(a, p => {
        const cur = p.location || null; // absent, null or '' all read as unassigned
        p.location = cur === null ? 'USA' : cur === 'USA' ? 'UK' : null;
      });
      if (!canEdit()) {
        askPin('Enter your PIN', 'Squads are set by a scorer or the master reviewer. Sign in and this change goes straight through.',
          'Sign in', role => { UI.role = role; saveRole(role); cycle(); });
        return;
      }
      cycle();
      return;
    }
    case 'clearSquads':
      if (!canEdit()) return;
      store.writeAllPeople(p => { p.location = null; });
      return;

    case 'setBand':
      if (!canEdit()) return;
      store.writePerson(a, p => { p.band = b === '' ? null : +b; });
      return;
    case 'addPerson':
      if (!canEdit()) return;
      UI.modal = { kind: 'add', role: a }; UI.modalErr = '';
      break;
    case 'addSave': {
      const field = document.getElementById('addName');
      const name = (field ? field.value : '').trim().replace(/\s+/g, ' ');
      if (!name) { UI.modalErr = 'Give them a name first.'; render(); return; }
      const role = UI.modal.role;
      const id = 'x' + Date.now().toString(36);
      UI.modal = null; UI.modalErr = '';
      store.addPerson({ id, name, display: name, role, location: null, group: '7-day', band: null });
      return;
    }
    case 'confirmOk': { const f = UI.modal.onOk; UI.modal = null; if (f) f(); return; }
    case 'confirmAlt': { const f = UI.modal.onAlt; UI.modal = null; if (f) f(); return; }
    case 'removePerson':
      if (!canAdmin()) return;
      store.removePerson(a);
      return;
    case 'unpair':
      if (!canEdit()) return;
      store.writePair(a, p => { p.members = p.members.filter(m => m !== b); });
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
  if (store && store.note) store.note('change', act + ' a=' + (a || '') + ' b=' + (b || '') + ' v=' + el.value);
  const editable = canEdit() && E.roundCfg(T, rid).state === 'open';

  if (act === 'setBbb') {
    if (!editable) return;
    draftFor(rid, UI.entryHole).bbb[a] = el.value || null;
    render();
  } else if (act === 'setRoundField') {
    if (!editable) return;
    const num = a === 'ctpHole' || a === 'ldHole';
    store.writeConfig(c => { c.rounds[rid][a] = num ? (el.value ? +el.value : null) : (el.value || (a.endsWith('Dist') ? '' : null)); });
  } else if (act === 'setEventField') {
    if (!canEdit()) return;
    const v = el.value.trim();
    store.writeConfig(c => {
      const e = c.schedule.find(x => x.id === a);
      if (!e) return;
      if (b === 'title') { if (v) e.title = v.slice(0, 60); }
      else e.kind = v;
    });
    render();
  } else if (act === 'setTime') {
    if (!canEdit()) return;
    const box = el.closest('.timepick');
    if (!box) return;
    const key = box.dataset.key;
    const sel = box.querySelectorAll('select');
    const held = UI.timePick[key] || { h: sel[0].value, m: sel[1].value, ap: sel[2].value };
    held[el.dataset.part] = el.value;               // only the wheel that moved
    UI.timePick[key] = held;
    const h = held.h, mn = held.m, ap = held.ap;
    const whole = h && mn && ap;
    if (store && store.note) store.note('setTime',
      box.dataset.tkind + ' a=' + box.dataset.a + ' b=' + box.dataset.b + ' -> ' + h + ':' + mn + ' ' + ap);
    // Half a time is not a time. Leave a part-made choice on screen rather
    // than re-rendering it away before the other wheels are turned.
    if (!whole && (h || mn || ap)) return;
    const t = whole ? E.to24(h + ':' + mn + ' ' + ap) : null;
    delete UI.timePick[key];                        // stored now: read it from the book again
    const { tkind, a: ta, b: tb } = box.dataset;
    if (tkind === 'tee') store.writeConfig(c => {
      const round = c.rounds[ta];
      store.note('tee set', ta + '[' + tb + '] ' + (round ? 'was ' + round.tees[+tb].time : 'NO SUCH ROUND') + ' -> ' + t);
      if (round && round.tees[+tb]) round.tees[+tb].time = t;
    });
    else if (tkind === 'event' && t) store.writeConfig(c => {
      const ev = c.schedule.find(x => x.id === ta);
      if (ev) ev.time = t;
    });
  } else if (act === 'setPin') {
    if (!canAdmin()) return;
    const v = el.value.replace(/\D/g, '').slice(0, 8);
    if (v.length < 3) return;
    store.writeConfig(c => { c.pins[a] = v; c.pinsChanged = true; });
  } else if (act === 'setHole') {
    if (!canEdit()) return;
    if (E.courseByKey(T, a).verified) { render(); return; } // locked: refuse the write, not just the control
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
  } else if (act === 'renamePair') {
    if (!canEdit()) return;
    const v = el.value.trim().replace(/\s+/g, ' ');
    store.writePair(a, p => { p.name = v || null; });
  } else if (act === 'moveGolfer') {
    if (!canEdit()) return;
    movePlayer(a, el.value);
  } else if (act === 'setPerson') {
    if (!canEdit()) return;
    const v = el.value.trim().replace(/\s+/g, ' ');
    store.writePerson(a, p => {
      if (b === 'name') { if (v) { p.name = v; if (!p.display) p.display = v; } }
      else if (b === 'display') { if (v) p.display = v; }
      else p[b] = v;
    });
    render();
  } else if (act === 'renamePerson') {
    if (!canEdit()) return;
    const name = el.value.trim().replace(/\s+/g, ' ');
    if (!name) { render(); return; }              // an empty name is a slip, not an edit
    store.writePerson(a, p => { p.name = name; p.display = name; });
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
  if (e.key === 'Enter' && UI.modal && e.target.id === 'addName') { e.preventDefault(); onClick({ target: document.querySelector('[data-act="addSave"]') }); }
  if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('nameedit')) { e.preventDefault(); e.target.blur(); }
  if (e.key === 'Escape' && UI.modal) { UI.modal = null; UI.modalErr = ''; render(); }
}

/* ---------------- boot ---------------- */

export function boot() {
  // open the book at the round nearest to today
  const upcoming = D.ROUNDS.find(r => E.dayOf(r.dayIdx).iso >= now.iso) || D.ROUNDS[D.ROUNDS.length - 1];
  UI.entryRound = upcoming.id;
  UI.boardRound = (upcoming.counts ? upcoming : D.ROUNDS.find(r => r.counts)).id;
  restoreDraft();          // a hole left part-entered last time comes back with them

  store = S.createStore((state, m) => {
    T = state; meta = m;
    if (m.ready && !UI.setupSeen) {
      UI.setupSeen = true;
      const saved = loadRole();
      if (saved && S.ROLES[saved] && saved !== 'viewer') UI.role = saved;
      if (E.setupIssues(T).length) UI.modal = { kind: 'setup' };
    }
    render();
  });
  const app = document.getElementById('app');
  app.addEventListener('click', onClick);
  app.addEventListener('dragstart', e => {
    const el = e.target.closest('[data-act="dragGolfer"]');
    if (!el || !canEdit()) return;
    UI.dragging = el.dataset.a;
    try { e.dataTransfer.setData('text/plain', el.dataset.a); e.dataTransfer.effectAllowed = 'move'; } catch (err) { /* older browsers */ }
  });
  app.addEventListener('dragover', e => { if (e.target.closest('[data-act="dropPair"]') && UI.dragging) e.preventDefault(); });
  app.addEventListener('drop', e => {
    const col = e.target.closest('[data-act="dropPair"]');
    if (!col || !canEdit()) return;
    e.preventDefault();
    const pid = UI.dragging || (e.dataTransfer && e.dataTransfer.getData('text/plain'));
    UI.dragging = null;
    if (pid) movePlayer(pid, col.dataset.a);
  });
  app.addEventListener('change', onChange);
  app.addEventListener('keydown', onKey);
  setInterval(() => { now = E.nowLocal(); render(); }, 30000);
  render();
  store.connect();
}
