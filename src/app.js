/* The Union Invitational — yardage book application.
   Vanilla render + delegated dispatch. Every screen is a pure function of
   (tournament state, ui state, clock). */

import * as D from './data.js';
import * as E from './engine.js';
import * as S from './store.js';
import * as CFG from './config.js';
import { createSupabaseFiles } from './dbsupa.js';
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
  askOpen: false,        // the crest's question box
  askText: '',
  asks: [],              // newest first: {id, q, a, busy, err}
  recapOpen: false,
  recapOpen: false,
  recap: { rid: null, busy: false, err: '', stream: '', edit: false, view: 'report' },
  upload: { queue: [], err: '' },
  role: 'viewer',
  boardTab: 'pairs',
  boardRound: 'r1',
  bookHole: 0,
  entryRound: 'r1',
  entryHole: 0,
  entryTee: '0',
  courseTab: 'aspendos',
  courseHole: 0,
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

      ${recapButton()}

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
                ['ryder', 'Ryder Cup'], ['prizes', 'Longest Drive & Closest to the Pin'],
                ['practice', 'Practice Day']];
  const body = { pairs: boardPairs, mvp: boardMvp, bbb: boardBbb, ryder: scrRyder,
                 prizes: boardPrizes, practice: boardPractice }[UI.boardTab]();
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
      ${E.groups(T, rid).map((g, i) => `<label class="tt-row"><span>${esc(g.label)}</span>
        ${timePick(g.time, { kind: 'tee', a: rid, b: i, ed, clearable: true,
          label: r.short + ' — ' + g.label + ' tee time' })}</label>`).join('')}
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
      ${IMG[hole.img] ? `<figure class="diagram"><img decoding="sync" src="${IMG[hole.img]}" alt="Diagram of hole ${hole.n} at ${esc(course.name)}" loading="lazy"></figure>` : ''}
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

/* Tuesday, on its own. It counts for nothing and that is the point: a whole
   day of the week's games with none of the consequences, and a winner by
   the end of it. Nothing here touches the competition boards. */
function boardPractice() {
  const rid = 'practice';
  const cfg = E.roundCfg(T, rid);
  const r = E.roundDef(rid);
  const d = E.dayOf(r.dayIdx);
  const rows = E.practiceBoard(T);
  const bbb = E.practiceBbb(T);
  const nm = pid => (E.person(T, pid) || {}).display || '—';
  const played = rows.length;

  return `<h2 class="head">Practice Day</h2>
  <p class="lede">${esc(d.dow)} ${esc(d.date)} — ${esc(E.courseOf(T, rid).name)}. Get Loose Foursomes, and a taste of
  everything to come: the points, the Bingo Bango Bongo, the longest drive and the closest to the pin.
  <b>None of it counts.</b> Nothing on this page feeds the Team Competition, the MVP or the Ryder Cup.</p>

  ${!played ? `<p class="empty">No cards in from the practice round yet. Scores appear here hole by hole.</p>` : `
  <h3 class="sub">The day's card</h3>
  <p class="lede" style="margin-bottom:0">Scored gross, so a golfer with no band yet still has a card. Points appear
  once a band is set — which is what the day is for.</p>
  <div class="rows" style="margin-top:8px">
    <div class="rowhead"><span style="width:24px">#</span><span style="flex:1">Golfer</span>
      <span style="min-width:46px;text-align:right">Band</span>
      <span style="min-width:46px;text-align:right">Thru</span>
      <span style="min-width:52px;text-align:right">Gross</span>
      <span style="min-width:56px;text-align:right">To par</span>
      <span style="min-width:74px;text-align:right">Points</span></div>
    ${rows.map(x => `<div class="row"><span class="pos" style="width:24px">${x.pos}</span>
      <span class="who" style="flex:1">${esc(x.name)}</span>
      <span class="num" style="min-width:46px;text-align:right;color:var(--turf)">${x.band == null ? '—' : x.band}</span>
      <span class="num" style="min-width:46px;text-align:right">${x.thru}</span>
      <span class="num" style="min-width:52px;text-align:right">${x.gross}</span>
      <span class="num ${x.tp < 0 ? 'under' : x.tp > 0 ? 'over' : 'level'}" style="min-width:56px;text-align:right">${esc(E.fmtToPar(x.tp))}</span>
      <span class="num" style="min-width:74px;text-align:right;font-size:23px;font-weight:700">${x.stb == null ? '—' : x.stb}</span></div>`).join('')}
  </div>`}

  <h3 class="sub">Bingo Bango Bongo — practice</h3>
  ${bbb.length ? `<div class="rows" style="margin-top:8px;max-width:520px">
    ${bbb.map(x => `<div class="row"><span class="pos">${x.pos}</span>
      <span class="who">${esc(x.name)}</span><span class="big num">${x.pts}</span></div>`).join('')}
  </div>` : `<p class="empty">No points yet. First on, closest once all on, first in.</p>`}

  <h3 class="sub">Longest Drive &amp; Closest to the Pin — practice</h3>
  <div class="rows" style="margin-top:8px;max-width:620px">
    <div class="row"><span class="who">Closest to the pin<small>${cfg.ctpHole ? 'Hole ' + cfg.ctpHole : 'No hole nominated'}</small></span>
      <span class="n" style="min-width:120px;font-size:17px">${cfg.ctpWinner ? esc(nm(cfg.ctpWinner)) : '—'}</span>
      <span class="n num" style="min-width:74px;color:var(--turf)">${esc(cfg.ctpDist || '')}</span></div>
    <div class="row"><span class="who">Longest drive<small>${cfg.ldHole ? 'Hole ' + cfg.ldHole : 'No hole nominated'}</small></span>
      <span class="n" style="min-width:120px;font-size:17px">${cfg.ldWinner ? esc(nm(cfg.ldWinner)) : '—'}</span>
      <span class="n num" style="min-width:74px;color:var(--turf)">${esc(cfg.ldDist || '')}</span></div>
  </div>

  <p class="lede" style="margin-top:18px">${E.bandsLocked(T)
    ? 'The practice round is concluded and the bands are settled. Only a scorer or the master reviewer can move one now.'
    : 'Bands are open while the practice round runs — this is the day to find out who is in the wrong one. They settle when the round is concluded.'}</p>`;
}

/* ---------------- asking the book ----------------
   The page can put a question to Claude on the viewer's own account. It is
   granted per view and per call, so everything here is written to work when
   the answer is simply "no": the crest does nothing it cannot do, and the
   recap says why rather than spinning. */
let askClaude = null;          // resolved once at boot; null means unavailable

/* Off the artifact platform there is no `sample` capability to ask, and an
   API key cannot live in a page twenty-three people install on their phones.
   So the book asks a small function on its own project, which holds the key
   where nobody can read it. The shape it returns is the one the rest of the
   file is already written against — {text} — so the crest and the recap do
   not know the difference.
   No streaming: the answer arrives whole. A recap takes a few seconds and
   says it is writing; a question takes one and is not worth the machinery. */
function askViaFunction(url, key) {
  if (!url || !key) return null;
  const endpoint = url.replace(/\/+$/, '') + '/functions/v1/recap';
  const fn = async (input, opts) => {
    const prompt = typeof input === 'string'
      ? input
      : (input || []).map(m => m.content).join('\n\n');
    let res;
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        /* The key goes in `apikey`, and nowhere else. Sending a publishable
           key as a bearer token is the documented way to earn a 401 about a
           token you never had: the 2026 keys are not JWTs and nothing can
           verify them as one. */
        headers: { 'content-type': 'application/json', apikey: key },
        body: JSON.stringify({ prompt }),
        signal: opts && opts.signal,
      });
    } catch (e) {
      if (e && e.name === 'AbortError') throw { code: 'cancelled', message: 'stopped' };
      throw { code: 'upstream_error', message: 'No connection to the book\u2019s writer.' };
    }
    let body = {};
    try { body = await res.json(); } catch (e) { /* a proxy page, or nothing at all */ }
    if (!res.ok || body.error) {
      throw { code: body.error || 'upstream_error', message: body.message || 'That did not come back.' };
    }
    const text = String(body.text || '');
    if (opts && opts.onText) opts.onText({ text, delta: text });
    return { text, truncated: !!body.truncated, modelTierApplied: 'complex' };
  };
  fn.json = async (input, opts) => JSON.parse((await fn(input, opts)).text);
  fn.limits = async () => ({ maxPromptBytes: 60000, images: false });
  return fn;
}

/** Everything the book actually knows, as text. Never invented. */
function brief() {
  try { return E.brief(T, now); } catch (e) { return 'The book could not be read.'; }
}

const ASK_RULES = [
  'You are the Union Invitational yardage book — a golf trip\'s record, answering its players.',
  'Answer ONLY from the tournament notes below. If the notes do not say, reply that the book does not have it yet.',
  'Never invent a score, a name, a time or a result.',
  'Be brief and dry: two or three sentences unless asked for more. A little wit is welcome; do not overdo it.',
].join(' ');

/* The panel follows the round it is about, and says which of four things is
   true: not started, being played, finished and unwritten, or ready to read. */
function recapState(rid) {
  const st = E.roundStanding(T, rid);
  const rec = T.recaps[rid];
  const written = rec && rec.body && (rec.status === 'published' || canEdit());
  if (!st.started) return { key: 'idle', line: 'Today\'s round hasn\'t started.' };
  if (!st.complete) {
    return { key: 'live', line: 'Round in progress — ' + st.inCards + ' of ' + st.field + ' cards in.' };
  }
  if (!written) return { key: 'togen', line: 'Round complete — tap to read the day.' };
  return { key: 'ready', line: E.roundDef(rid).short + ' is complete — read the report.' };
}

function recapButton() {
  const rid = E.recapRound(T, now);
  if (!rid) return '';
  const st = recapState(rid);
  const lit = st.key === 'ready' || st.key === 'togen';
  return `<div class="recapwrap">
    <button class="recapbtn${lit ? ' ready' : ''}" data-act="recapOpen" data-a="${rid}"${st.key === 'idle' ? ' disabled' : ''}>
      <span class="rb-t">The Day's Recap</span>
      <span class="rb-s">${esc(st.line)}</span>
    </button>
  </div>`;
}

function askPanel() {
  if (!UI.askOpen) return '';
  return `<div class="scrim" data-act="askClose"><div class="askbox" role="dialog" aria-modal="true" aria-label="Ask the book">
    <div class="askhead">
      <b>Ask the book</b>
      <button class="rm" data-act="askClose">Close</button>
    </div>
    <p class="asknote">Anything about this tournament — scores, bands, pairings, who is up. It answers from the
    book only, so if it has not been recorded, it will say so.</p>
    <div class="askrow">
      <textarea id="askField" class="field askin" data-act="askText" rows="2"
        placeholder="Who is leading the Ryder Cup?"
        aria-label="Your question">${esc(UI.askText)}</textarea>
      <button class="btn" data-act="askSend">Ask</button>
    </div>
    <div class="asklist">
      ${UI.asks.length ? UI.asks.map((a, i) => `<div class="askitem${i === 0 ? ' current' : ''}">
        <div class="askq">${esc(a.q)}</div>
        <div class="aska">${a.busy && !a.a ? '<span class="thinking">Thinking…</span>'
          : a.err ? `<span class="askerr">${esc(a.err)}</span>`
          : esc(a.a || '')}${a.busy && a.a ? '<span class="cursor">▍</span>' : ''}</div>
      </div>`).join('')
      : '<p class="empty">Nothing asked yet.</p>'}
    </div>
  </div></div>`;
}

/* ---------------- the recap screen ----------------
   Everything but the words is computed from the cards, so a claim in the
   narrative can be checked against the table under it. */

/* The window scrolls its own contents; the page behind it stays where it was. */
function recapTop() {
  const bx = document.getElementById('recapBox');
  if (bx) bx.scrollTop = 0;
}

function recapPanel() {
  if (!UI.recapOpen) return '';
  const rid = UI.recap.rid || E.recapRound(T, now);
  const r = E.roundDef(rid) || {};
  const day = E.dayOf(r.dayIdx || 0);
  const course = E.courseOf(T, rid);
  const st = E.roundStanding(T, rid);
  const rec = T.recaps[rid] || null;
  const body = rec && rec.body;
  const published = rec && rec.status === 'published';
  const ed = canEdit();
  const editing = ed && !!body && UI.recap.edit;
  const gallery = UI.recap.view === 'gallery';
  const table = E.recapTable(T, rid, now);
  const rib = E.ribbon(T, rid);
  const sw = E.swingOfTheDay(T, rid);
  const sg = E.sideGames(T, rid);
  const nm = id => (E.person(T, id) || {}).display || '—';
  const pairNote = pid => (body && body.pairNotes && body.pairNotes[pid]) || '';
  const hero = IMG['course_' + course.key];
  const shots = st.field;

  const archive = D.ROUNDS.filter(x => E.roundStanding(T, x.id).started);

  return `<div class="scrim recapscrim" data-act="recapClose">
    <div class="recapbox" role="dialog" aria-modal="true" aria-label="The Day's Recap" id="recapBox">
    <div class="recaptop">
      <b>The Day's Recap</b>
      <span class="rt-s">${esc(r.short === 'Practice' ? 'Practice day' : (r.full || ''))}</span>
      <button class="rm" data-act="recapClose" aria-label="Close the recap">Close</button>
    </div>
    <div class="recapbar">
    <div>${gallery ? 'The whole week\'s photos, by round.' : esc(!st.started ? 'This round has not started.'
      : !st.complete ? 'Round in progress — ' + st.inCards + ' of ' + st.field + ' cards in. Standings only until every card is in.'
      : !body ? 'Round is complete. The report has not been written yet.'
      : published ? 'Round is closed and the recap is ready. Everyone in the party can read it and add photos.'
      : 'Draft — only scorers can see this until it is published.')}${editing && !gallery
      ? ' <b>Editing: change any line, then tap away to keep it.</b>' : ''}</div>
    <div class="recapacts">
      ${ed && st.complete && !gallery ? `<button class="btn" data-act="recapGen" data-a="${rid}"${UI.recap.busy ? ' disabled' : ''}>${
        UI.recap.busy ? 'Writing…' : body ? 'Regenerate' : 'Generate the report'}</button>` : ''}
      ${ed && body && !gallery ? `<button class="btn ghost${editing ? ' on' : ''}" data-act="recapEditToggle" aria-pressed="${editing}">${
        editing ? 'Done editing' : 'Edit the words'}</button>` : ''}
      ${ed && body && !published && !gallery ? `<button class="btn" data-act="recapPublish" data-a="${rid}">Share to the group</button>` : ''}
      ${UI.recap.busy ? '<button class="btn ghost" data-act="recapStop">Stop</button>' : ''}
    </div>
  </div>

  <div class="chiprow recaparch">
    <span class="gl">Recaps</span>
    ${archive.map(x => `<button class="chip${x.id === rid && !gallery ? ' on' : ''}" data-act="recapPick" data-a="${x.id}">${esc(x.short)}</button>`).join('')}
    ${archive.length ? '' : '<span class="rnote">No round has started yet.</span>'}
    <button class="chip${gallery ? ' on' : ''}" data-act="recapGallery">Gallery${
      Object.keys(T.photos || {}).length ? ' · ' + Object.keys(T.photos).length : ''}</button>
  </div>

  ${gallery ? gallery1() : `

  <div class="metarail">
    <span>${esc(r.short === 'Practice' ? 'Practice day' : 'Round ' + r.short.slice(1) + ' of 3')}</span>
    <span>${esc(course.name)}</span>
    <span>${esc(day.dow)} ${esc(day.date)}</span>
    <span>${esc(r.counts ? 'Better Ball, net' : 'Practice, counts for nothing')}</span>
    <span>${shots} player${shots === 1 ? '' : 's'}, ${st.pairs} pairing${st.pairs === 1 ? '' : 's'}</span>
  </div>

  ${UI.recap.err ? `<p class="askerr" style="margin-top:14px">${esc(UI.recap.err)}</p>` : ''}
  ${UI.upload.err ? `<p class="askerr" style="margin-top:14px">${esc(UI.upload.err)}
    <button class="rm" data-act="uploadClear">Dismiss</button></p>` : ''}

  <div class="recapgrid">
    <div class="recapmain">
      ${editing ? `<textarea class="field recedit head" rows="2" data-act="recapEdit" data-a="headline"
        aria-label="Headline">${esc(body.headline || '')}</textarea>`
        : `<h2 class="rechead">${body ? esc(body.headline || '') : UI.recap.busy ? 'Writing the report…'
        : st.complete ? 'No report yet' : esc(r.full)}</h2>`}
      ${editing ? (body.narrative || []).concat(['']).map((x, i) => `<textarea class="field recedit" rows="4"
          data-act="recapEdit" data-a="para" data-b="${i}"
          aria-label="Paragraph ${i + 1}" placeholder="${i >= (body.narrative || []).length ? 'Add a paragraph…' : ''}">${esc(x)}</textarea>`).join('')
        : body && body.narrative ? body.narrative.filter(x => x && x.trim()).map(x => `<p class="recpara">${esc(x)}</p>`).join('')
        : UI.recap.busy ? `<p class="recpara thinking">${esc(UI.recap.stream || 'Reading the cards…')}</p>`
        : st.complete ? `<p class="recpara">${ed ? 'Generate the report and it will be written from today\'s cards.'
            : 'The scorers have not written it up yet.'}</p>`
        : `<p class="recpara">The standings below are live. The report is written once every card is in.</p>`}
    </div>
    <aside class="recapside">
      ${hero ? `<figure class="rechero"><img src="${hero}" alt="${esc(course.name)}">
        <figcaption>${esc(course.name)}.</figcaption></figure>` : ''}
      ${sw ? `<div class="swing">
        <div class="sw-l">Swing of the day</div>
        <div class="sw-v num">${sw.shots} shot${sw.shots === 1 ? '' : 's'}</div>
        <div class="sw-c">${editing ? `<input class="field recedit one" data-act="recapEdit" data-a="swing"
          aria-label="Swing of the day caption" value="${esc((body.swing && body.swing.caption) || '')}">`
          : body && body.swing && body.swing.caption ? esc(body.swing.caption)
          : 'opened between the leaders and third place across holes ' + sw.fromHole + ' to ' + sw.toHole + '.'}</div>
      </div>` : ''}
    </aside>
  </div>

  <div class="ribwrap">
    <div class="ribhead"><span>Leaders' hole by hole</span>
      <span class="riblegend"><i class="rl under"></i>under <i class="rl level"></i>level <i class="rl over"></i>over</span></div>
    <div class="scroller nos"><div class="ribbon">
      ${rib.map(c => `<div class="ribcell ${c.d == null ? '' : c.d < 0 ? 'under' : c.d > 0 ? 'over' : 'level'}">
        <span class="num">${c.n}</span></div>`).join('')}
    </div></div>
  </div>

  <h3 class="sub">Pairs Championship</h3>
  <div class="rows rectable" style="margin-top:8px">
    <div class="rowhead"><span style="width:26px"></span><span style="flex:1">Pair</span>
      <span style="min-width:62px;text-align:right">Today</span>
      <span style="min-width:74px;text-align:right">Total</span></div>
    ${table.length ? table.map(x => `<div class="row${x.pos === 1 ? ' lead' : ''}">
      <span class="pos" style="width:26px">${x.pos}</span>
      <span class="who" style="flex:1">${esc(x.name)}${editing
        ? `<input class="field recedit one" data-act="recapEdit" data-a="note" data-b="${esc(x.id)}"
            aria-label="Note on ${esc(x.name)}" placeholder="A line about this pair…" value="${esc(pairNote(x.id))}">`
        : pairNote(x.id) ? `<small>${esc(pairNote(x.id))}</small>` : ''}</span>
      <span class="num ${cls(x.today)}" style="min-width:62px;text-align:right">${x.today == null ? '—' : esc(E.fmtToPar(x.today))}</span>
      <span class="num ${cls(x.total)}" style="min-width:74px;text-align:right;font-size:21px;font-weight:700">${x.total == null ? '—' : esc(E.fmtToPar(x.total))}</span>
    </div>`).join('') : '<p class="empty">No cards in yet.</p>'}
  </div>

  <div class="recapcols">
    <div>
      <h3 class="sub">Worth mentioning</h3>
      <div class="rows" style="margin-top:8px">
        ${HONOURS.map(h => {
          const won = body && (body.honours || []).find(x => x.slot === h.slot);
          return `<div class="row honour"><span class="who">${esc(h.label)}
            ${editing ? `<input class="field recedit one" data-act="recapEdit" data-a="cite" data-b="${h.slot}"
                aria-label="Citation for ${esc(h.label)}" placeholder="What they did…" value="${esc((won && won.citation) || '')}">`
              : `<small>${won && won.citation ? esc(won.citation) : 'Not awarded yet.'}</small>`}</span>
            ${editing ? `<select class="field recedit pick" data-act="recapEdit" data-a="winner" data-b="${h.slot}"
                aria-label="Winner of ${esc(h.label)}">
                <option value="">Not awarded</option>
                ${(T.config.people || []).map(pn => `<option value="${esc(pn.id)}"${won && won.winner === pn.id ? ' selected' : ''}>${esc(pn.display)}</option>`).join('')}
              </select>`
              : `<span class="n" style="min-width:110px;text-align:right;font-weight:700">${won && won.winner ? esc(nm(won.winner)) : '—'}</span>`}</div>`;
        }).join('')}
      </div>
    </div>
    <div>
      <h3 class="sub">Side games</h3>
      <div class="rows" style="margin-top:8px">
        <div class="row"><span class="who">Closest to the pin${sg.ctp && sg.ctp.hole ? ', ' + sg.ctp.hole : ''}</span>
          <span class="n" style="min-width:150px;text-align:right">${sg.ctp ? esc(sg.ctp.who + (sg.ctp.note ? ', ' + sg.ctp.note : '')) : '—'}</span></div>
        <div class="row"><span class="who">Longest drive${sg.ld && sg.ld.hole ? ', ' + sg.ld.hole : ''}</span>
          <span class="n" style="min-width:150px;text-align:right">${sg.ld ? esc(sg.ld.who + (sg.ld.note ? ', ' + sg.ld.note : '')) : '—'}</span></div>
        <div class="row"><span class="who">Bingo Bango Bongo</span>
          <span class="n" style="min-width:150px;text-align:right">${sg.bbb ? esc(sg.bbb.who + ', ' + sg.bbb.note) : '—'}</span></div>
        <div class="row"><span class="who">MVP standings</span>
          <span class="n" style="min-width:150px;text-align:right">${sg.mvp ? esc(sg.mvp.who + ', ' + sg.mvp.note) : '—'}</span></div>
        <div class="row"><span class="who">Triple bogey cap hit</span>
          <span class="n num" style="min-width:150px;text-align:right">${sg.caps} time${sg.caps === 1 ? '' : 's'} today</span></div>
      </div>
    </div>
  </div>

  ${photoStrip(rid)}
  ${upNext(rid)}`}
    </div>
  </div>`;
}

/* ---------------- the standing gallery ----------------
   Every photo of the week in one place, the rounds in the order they are
   played, so a picture taken on the practice day is still one tap away in the
   last week of November. */
function gallery1() {
  const all = Object.values(T.photos || {}).filter(Boolean);
  const byRound = D.ROUNDS.map(r => ({ r, list: all.filter(p => p.rid === r.id) }));
  const loose = all.filter(p => !D.ROUNDS.some(r => r.id === p.rid));
  return `<h2 class="head" style="margin-top:14px">The Gallery</h2>
  <p class="lede">Every photo from the week, by the round it was taken on. Anyone on the trip can add;
  you can remove your own${canAdmin() ? ', and a commissioner can remove any' : ''}.</p>
  ${all.length ? '' : '<p class="empty">No photos yet. Open a round below and add the first.</p>'}
  ${byRound.map(({ r, list }) => `<div class="galsec">
    <div class="titlerow">
      <h3 class="sub" style="margin:0">${esc(r.short === 'Practice' ? 'Practice day' : r.full)}</h3>
      <span class="rnote">${esc(E.dayOf(r.dayIdx).dow)} ${esc(E.dayOf(r.dayIdx).date)} · ${
        list.length ? list.length + ' photo' + (list.length === 1 ? '' : 's') : 'nothing yet'}</span>
    </div>
    ${photoStrip(r.id, true)}
  </div>`).join('')}
  ${loose.length ? `<div class="galsec"><h3 class="sub">Elsewhere on the trip</h3>
    <div class="phstrip">${loose.map(ph => phFig(ph)).join('')}</div></div>` : ''}`;
}

/* ---------------- photos ----------------
   Anyone on the trip can add to a round. Phone photos are twelve megapixels
   and resort wifi is resort wifi, so every one is resized and re-encoded here
   before it goes anywhere. Each upload is its own document: one failure never
   takes the rest of the queue with it. */
let store4 = null;               // the asset store, once it answers

function photosFor(rid) {
  return Object.values(T.photos || {})
    .filter(p => p && p.rid === rid)
    .sort((a, b) => (b.at || 0) - (a.at || 0));
}

function phFig(ph) {
  /* The strip is thumbnails. Tapping one opens the photograph itself, so
     scrolling a week of the trip does not pull a hundred megabytes through
     resort wifi. A photograph stored before thumbnails shows as it always
     did. */
  return `<figure class="ph">
    <a href="${esc(ph.url)}" target="_blank" rel="noopener" aria-label="Open this photo full size">
      <img src="${esc(ph.thumb || ph.url)}" alt="${esc(ph.caption || 'From the round')}" loading="lazy"
        onerror="this.closest('figure').classList.add('broken')"></a>
    <figcaption>${esc(ph.byName || 'Someone')}${canAdmin() || ph.mine ? `
      <button class="rm" data-act="photoDrop1" data-a="${esc(ph.id)}">Remove</button>` : ''}</figcaption>
  </figure>`;
}

function photoStrip(rid, bare) {
  const list = photosFor(rid);
  const q = UI.upload.queue.filter(u => u.rid === rid);
  const can = !!store4;
  return `<div class="fromround${bare ? ' bare' : ''}">
    ${bare ? (can ? `<button class="btn ghost addph" data-act="photoPick" data-a="${rid}">Add photos</button>` : '') : `
    <div class="titlerow">
      <h3 class="sub" style="margin:0">From the round</h3>
      <span class="rnote">${list.length ? list.length + ' so far. Everyone on the trip can add.'
        : 'Anyone on the trip can add photos.'}</span>
      ${can ? `<button class="btn ghost addph" data-act="photoPick" data-a="${rid}">Add photos</button>` : ''}
    </div>
    <p class="phnote">Photos are visible to everyone in the party.</p>`}
    <div class="phstrip${can ? ' drop' : ''}" data-act="photoDrop" data-a="${rid}">
      ${list.map(ph => phFig(ph)).join('')}
      ${q.map(u => `<figure class="ph pending">
        <div class="phbar"><i style="width:${u.pct}%"></i></div>
        <figcaption>${esc(u.name)} — ${u.err ? esc(u.err) : u.pct < 100 ? u.pct + '%' : 'saving…'}</figcaption>
      </figure>`).join('')}
      ${!list.length && !q.length ? `<div class="phempty">No photos from this round yet.${
        can ? ' Add the first.' : ''}</div>` : ''}
    </div>
  </div>`;
}

/** 12 megapixels down to something a resort connection can carry. */
function shrink(file, max = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      c.toBlob(b => (b ? resolve(b) : reject(new Error('could not read that image'))), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('not an image the browser can read')); };
    img.src = url;
  });
}

/* The picker lives OUTSIDE #app, and is made once.
 *
 * Every redraw replaces the whole of #app. Tapping "Add photos" opens the
 * phone's picker, which stays open for as long as it takes somebody to
 * choose a picture — and the book goes on redrawing the entire time, because
 * the store polls behind the live socket every few seconds. So by the moment
 * the photograph was approved, the <input> it belonged to had been destroyed
 * and replaced several times over. iOS delivered the file to an element no
 * longer in the document, the event had nothing to bubble to, and not one
 * line of our code ran. Which is why it failed in complete silence, and why
 * making failures louder changed nothing at all.
 *
 * It is the same fault as the tee-time <select> that appeared to undo itself:
 * a native control destroyed while somebody is still using it. The answer
 * there was to defer the redraw. Here it is simpler to keep the one element
 * that matters out of the way of the redraw entirely. */
let picker = null;
let pickerRid = null;

function makePicker() {
  if (picker || typeof document === 'undefined') return picker;
  picker = document.createElement('input');
  picker.type = 'file';
  picker.accept = 'image/*';
  picker.multiple = true;
  picker.style.display = 'none';
  picker.setAttribute('aria-hidden', 'true');
  picker.addEventListener('change', () => {
    const files = picker.files;
    const rid = pickerRid;
    // read them out before clearing, and clear before any await
    const taken = Array.from(files || []);
    picker.value = '';
    if (rid) addPhotos(rid, taken);
  });
  document.body.appendChild(picker);
  return picker;
}

let upSeq = 0;

/* A picture picked out of an iPhone's camera roll very often arrives with an
   EMPTY type — HEIC especially — and sometimes as image/heic. Filtering on
   the MIME type therefore threw the photograph away and returned without a
   word to anyone, which is precisely what "I select it and nothing happens"
   looks like from the outside.
   So anything the picker hands over is attempted. A file the browser cannot
   actually decode then fails in shrink(), loudly, with a reason. Deciding
   whether something is a picture is the decoder's job, not a guess made from
   a string the phone did not bother to fill in. */
function looksLikeAPicture(f) {
  if (!f) return false;
  if (f.type && /^image\//i.test(f.type)) return true;
  if (f.type && !/^image\//i.test(f.type)) return false;   // a PDF is a no
  return true;                                              // no type at all: try it
}

async function addPhotos(rid, files) {
  const all = Array.from(files || []);
  if (store && store.note) {
    store.note('photo picked', all.length + ' file(s): '
      + all.map(f => (f.name || '?') + ' [' + (f.type || 'no type') + ' ' + Math.round((f.size || 0) / 1024) + 'k]').join(', '));
  }
  if (!all.length) { UI.upload.err = 'The picker did not hand over a file.'; render(); return; }
  const list = all.filter(looksLikeAPicture);
  if (!list.length) {
    UI.upload.err = 'That was not a picture the book could read ('
      + all.map(f => f.type || 'no type').join(', ') + ').';
    render();
    return;
  }
  if (!store4) { UI.upload.err = 'This copy of the book cannot store photos.'; render(); return; }
  const supa = store4.kind === 'supabase';
  const who = (E.person(T, UI.role) || {}).display || 'Someone';
  UI.upload.err = '';
  if (store && store.note) store.note('photo start', list.length + ' file(s), store=' + store4.kind);
  for (const f of list) {
    const u = { id: 'u' + (++upSeq), rid, name: f.name, pct: 5, err: '' };
    UI.upload.queue.push(u);
    render();
    try {
      const small = await shrink(f, CFG.PHOTO_MAX);
      u.pct = 40; render();
      const thumb = supa ? await shrink(f, CFG.THUMB_MAX, 0.7).catch(() => null) : null;
      u.pct = 60; render();
      const up = supa ? await store4.upload(small, thumb) : await store4.upload(small);
      u.pct = 90; render();
      const id = 'ph' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      /* The file is in the bucket by now. The row that points at it is a
         separate write, and it can be refused — the store turns a write away
         while the book is still loading — so the answer is checked rather
         than assumed. A photograph uploaded and then not recorded is the
         worst of both: the allowance is spent and nobody can see it. */
      const kept = await store.writePhoto(id, {
        rid, url: up.url, thumb: up.thumbUrl || null, at: Date.now(),
        assetId: up.id || null, key: up.key || null, thumbKey: up.thumbKey || null,
        by: UI.role, byName: who, mine: true, bytes: up.sizeBytes || small.size,
      });
      if (kept === false) throw new Error('uploaded, but the book would not record it yet');
      if (store && store.note) store.note('photo ok', id + ' rid=' + rid + ' url=' + String(up.url).slice(-28));
      u.pct = 100;
      UI.upload.queue = UI.upload.queue.filter(x => x !== u);   // one at a time, so one failure stays put
    } catch (e) {
      const why = (e && (e.message || e.code)) ? String(e.message || e.code) : 'did not upload';
      u.err = why.slice(0, 60);
      /* Loud, and at the top of the window where it cannot be scrolled past,
         because the last one of these was invisible. And into the diagnostic
         log, so the reason survives the page being closed. */
      UI.upload.err = 'That photo did not go up: ' + why.slice(0, 120);
      if (store && store.note) store.note('photo FAILED', f.name + ' — ' + why);
      u.pct = 100;
    }
    render();
  }
}

const HONOURS = [
  { slot: 'shot_of_the_day', label: 'Shot of the day' },
  { slot: 'round_of_the_day', label: 'Round of the day' },
  { slot: 'best_recovery', label: 'Best recovery' },
  { slot: 'honest_scorecard', label: 'Honest scorecard' },
];

function upNext(rid) {
  const i = D.ROUNDS.findIndex(x => x.id === rid);
  const next = D.ROUNDS[i + 1];
  const day = E.dayOf((E.roundDef(rid) || {}).dayIdx || 0);
  const fixtures = (T.config.schedule || []).filter(e => e.dayIdx === day.n - 1 + 1);
  return `<div class="upnext">
    <span class="un-l">Up next</span>
    <span>${next ? esc(next.full) + ' on ' + esc(E.dayOf(next.dayIdx).dow) + ', '
      + esc(E.roundCfg(T, next.id).tees[0] && E.roundCfg(T, next.id).tees[0].time
        ? E.to12(E.roundCfg(T, next.id).tees[0].time) : 'tee time to set')
      : 'That is the last card of the week.'}</span>
    ${fixtures.length ? `<span>${fixtures.map(f => esc(E.to12(f.time) + ' ' + f.title)).join(' · ')}</span>` : ''}
    ${next && next.noMulligans ? '<span class="un-red">No mulligans in the final.</span>' : ''}
  </div>`;
}

function sampleError(e) {
  const c = (e && e.code) || 'upstream_error';
  if (c === 'not_granted' || c === 'sampling_disabled' || c === 'not_declared' || c === 'capability_disabled') {
    return 'This copy of the book cannot ask Claude.';
  }
  if (c === 'rate_limited') return 'Too many questions at once. Give it a minute.';
  if (c === 'session_expired') return 'Your Claude session has expired — sign in again.';
  if (c === 'cancelled') return '';
  if (c === 'refused') return 'It would not answer that one.';
  if (c === 'prompt_too_large') return 'There is too much to read at once.';
  return 'That did not come back. Try again in a moment.';
}

function scrRyder() {
  const R = E.ryderData(T, now);
  const gs = E.golfers(T);
  return `<h2 class="head">Ryder Cup — UK v USA</h2>
  <p class="lede">Squad match play laid over the same scorecards. Head-to-head singles all three sessions, so everybody plays every time. <a href="#rules" data-act="goRule" data-a="ryder">Full rules</a></p>

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
  ${R.lopsided ? `<div class="notice"><b>The squads are ${R.lopsided} apart</b><div style="font-size:15px;color:var(--turf)">Every session is singles, so ${R.lopsided === 1 ? 'one golfer' : R.lopsided + ' golfers'} on the bigger squad sit out each time — a different ${R.lopsided === 1 ? 'one' : 'few'} each session, so nobody misses twice before everyone has missed once. Even the squads up and they all play all three.</div></div>` : ''}

  ${R.sessions.map(s => `
    <h3 class="sub">${esc(s.label)} — ${esc(s.format)}</h3>
    <div style="font-family:var(--mono);font-size:13px;color:var(--turf);margin-top:2px">UK ${s.uk} · USA ${s.usa}</div>
    ${s.matches.length ? `<div class="rows" style="margin-top:8px;border-top:1px solid var(--rule)">
      ${s.matches.map(m => `<div class="match">
        <span>${esc(m.a)}</span>
        <span class="st ${m.side === 'UK' ? 'uk' : m.side === 'USA' ? 'usa' : ''}">${esc(m.status)}${m.thru && !m.done ? ' · thru ' + m.thru : ''}</span>
        <span class="r">${esc(m.b)}</span></div>`).join('')}
    </div>` : `<p class="empty">No matches yet — put golfers in both squads and the draw builds itself.</p>`}
    ${s.sitting && s.sitting.length ? `<p class="rnote" style="margin-top:6px">Sitting this session: ${esc(s.sitting.join(', '))}.</p>` : ''}
  `).join('')}`;
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
  const locked = !!T.config.calLocked;
  const ed = canEdit() && !locked;
  const kinds = [['social', 'Social'], ['ceremony', 'Ceremony'], ['travel', 'Travel']];

  return `<div class="titlerow">
    <h2 class="head">Calendar</h2>
  </div>
  <p class="lede">The whole week at once. ${locked
    ? 'The calendar is locked — the week is settled.'
    : ed ? 'Add a fixture to any day, change a time, or take one off.'
    : 'Ask a scorer to change a fixture.'}</p>

  ${canAdmin() ? `<div class="gate${locked ? '' : ' want'}">
    <div class="msg"><b>${locked ? 'The calendar is locked' : 'The calendar is open for editing'}</b>
      <span>${locked
        ? 'Nobody can add, move or remove a fixture. Unlock it to make a change.'
        : 'Anyone who can score can change the week. Lock it once it is settled.'}</span></div>
    <button class="btn${locked ? ' ghost' : ''}" data-act="${locked ? 'calUnlock' : 'calLock'}">${
      locked ? 'Unlock the calendar' : 'Lock the calendar'}</button>
  </div>` : ''}

  <div class="weekgrid">
    ${D.DAYS.map(d => {
      const es = dayEntries(d.n);
      const golf = es.find(e => e.kind === 'golf');
      const rest = isRestDay(d.n);
      const social = es.filter(e => e.kind !== 'golf');
      return `<div class="daycard${d.iso === now.iso ? ' today' : ''}${ed ? ' editing' : ''}">
        <span class="dhead">
          <span class="dn num">${d.n}</span>
          <span class="dl">${esc(d.dow)} ${esc(d.date)}</span>
          ${d.iso === now.iso ? `<span class="tt">Today</span>` : ''}
        </span>
        ${golf ? `<span class="dgolf">
          <span class="t num">${esc(golf.time ? E.to12(golf.time) : 'Tee time to set')}</span>
          <span class="ti">${esc(golf.title)}</span>
          <span class="sub">${esc(golf.sub)}</span></span>` : ''}
        ${rest && !social.length ? `<span class="drest">Rest day — no golf, bar open.</span>` : ''}

        ${social.length ? `<span class="dlist">${social.map(e => (ed
          ? `<span class="de edit">
              ${timePick(e.time, { kind: 'event', a: e.id, ed: true, clearable: false,
                                   label: 'Time of ' + e.title })}
              <input class="fxtitle live" type="text" value="${esc(e.title)}" maxlength="60"
                aria-label="Title of fixture" data-act="setEventField" data-a="${e.id}" data-b="title">
              <select class="field small" data-act="setEventField" data-a="${e.id}" data-b="kind"
                aria-label="Kind of fixture">${kinds.map(([k, l]) =>
                  `<option value="${k}"${e.kind === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
              <button class="rm" data-act="removeEvent" data-a="${e.id}">Remove</button>
            </span>`
          : `<span class="de">
              <span class="t num">${esc(E.to12(e.time))}</span>
              <span class="ti ${esc(e.kind)}">${esc(e.title)}</span></span>`)).join('')}</span>` : ''}

        ${ed ? `<button class="dashb daddb" data-act="addEvent" data-a="${d.n}">Add a fixture</button>` : ''}
      </div>`;
    }).join('')}
  </div>

  ${teeBlocks()}`;
}

/* The tee times belong to the rounds, not to the squares of the week, so
   they sit under it rather than inside a day. Four rounds, all on one page,
   which is how they are actually set: the night before, in one go. */
function teeBlocks() {
  const ed = canEdit();
  const rounds = D.ROUNDS.filter(r => roundOnDay(E.dayOf(r.dayIdx).n));
  const list = rounds.length ? rounds : D.ROUNDS;
  return `<h3 class="sub" style="margin-top:34px">Tee times</h3>
  <p class="lede">A group is two pairs, taken in the order they sit on Roster &amp; Pairings — so Group 1 is
  the first two pairs off. Change the pairings and the groups follow.</p>
  ${list.map(r => `<div class="teeblock">
    <h4 class="teehead">${esc(r.full)} — ${esc(E.dayOf(r.dayIdx).dow)}, ${esc(E.courseOf(T, r.id).name)}</h4>
    ${E.groups(T, r.id).map((g, i) => `<div class="teegroup">
      <div class="teerow">
        <span class="gl">${esc(g.label)}</span>
        ${timePick(g.time, { kind: 'tee', a: r.id, b: i, ed, clearable: true,
          label: g.label + ' tee time, ' + r.short })}
      </div>
      <div class="gmem">${g.pairs.length ? esc(g.pairs.join('  ·  ')) : ''}${g.members.length
        ? `<span class="gmem-names">${g.members.map(id => esc((E.person(T, id) || {}).display || '?')).join(', ')}</span>`
        : 'Nobody paired yet'}</div>
    </div>`).join('')}
  </div>`).join('')}`;
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

/* The competition strip pans across, and only across.
 *
 * `touch-action: pan-x` is the declarative way to say this, and it is still
 * declared — but it is a hint the engine may decline. WebKit in particular
 * can ignore it on an element that is also a momentum scroller, so a quick
 * diagonal flick across the sub-tabs still dragged the page up and down. A
 * thin row of tabs has no vertical meaning at all, so rather than ask, the
 * gesture is taken over: the strip is scrolled by hand from the horizontal
 * distance travelled, and the browser is told to do nothing else with it.
 *
 * Only strips that genuinely have somewhere to go sideways are taken over.
 * Claiming a gesture on something that fits on screen would stop the page
 * scrolling under somebody's thumb, which is a worse fault than the one
 * being fixed.
 *
 * Bound to the document, once, because every redraw replaces #app and a
 * listener attached to the strip itself would go with it. */
function lockStripsSideways() {
  let strip = null, fromX = 0, fromLeft = 0;

  document.addEventListener('touchstart', e => {
    strip = null;
    if (!e.touches || e.touches.length !== 1) return;
    const el = e.target && e.target.closest ? e.target.closest('.btabs') : null;
    if (!el || el.scrollWidth <= el.clientWidth + 1) return;   // nowhere to go
    strip = el;
    fromX = e.touches[0].clientX;
    fromLeft = el.scrollLeft;
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (!strip || !e.touches || e.touches.length !== 1) return;
    strip.scrollLeft = fromLeft - (e.touches[0].clientX - fromX);
    if (e.cancelable) e.preventDefault();      // the page stays exactly where it is
  }, { passive: false });

  const done = () => { strip = null; };
  document.addEventListener('touchend', done, { passive: true });
  document.addEventListener('touchcancel', done, { passive: true });
}

/** Which group the screen is on — the one whose points a mark belongs to. */
function curGroupId(rid) {
  const gs = E.groups(T, rid);
  const i = Math.min(UI.entryTee === 'all' ? 0 : +UI.entryTee || 0, Math.max(gs.length - 1, 0));
  return (gs[i] || {}).id || 'g0';
}

function draftFor(rid, h) {
  if (!UI.draft || UI.draft.rid !== rid || UI.draft.hole !== h) {
    UI.draft = { rid, hole: h, strokes: {}, bbb: {}, gid: curGroupId(rid) };
  }
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
/* Bingo Bango Bongo is played inside a group, so each group keeps its own
   three marks per hole. One set per hole meant the second ref to save wiped
   the first ref's points without either of them seeing it. A hole written
   before this still reads, under whichever group is looking at it. */
function bbbOf(rid, h, slot, gid) {
  const d = UI.draft;
  if (d && d.rid === rid && d.hole === h && slot in d.bbb) return d.bbb[slot];
  const cell = (T.bbb[rid] || { holes: [] }).holes[h];
  if (!cell) return null;
  const mine = cell.g && cell.g[gid];
  if (mine) return mine[slot] || null;
  return cell.g ? null : (cell[slot] || null);
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
  if (Object.keys(d.bbb).length) store.writeBbb(d.rid, x => {
    const cell = x.holes[h];
    const gid = d.gid || curGroupId(d.rid);
    if (!cell.g) {
      // first per-group write to this hole: whatever was already on it
      // belongs to whoever is writing now, so it is not simply dropped
      cell.g = {};
      const legacy = {};
      let any = false;
      for (const k of E.BBB_SLOTS) if (cell[k]) { legacy[k] = cell[k]; any = true; delete cell[k]; }
      if (any) cell.g[gid] = legacy;
    }
    cell.g[gid] = { ...(cell.g[gid] || {}), ...d.bbb };
  });
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

  /* Closest to the pin and longest drive are nominated before the first tee
     shot, never after someone has already hit a good one. Both must be set
     for the card to open, and only a scorer can move them afterwards. */
  const nominated = !!cfg.ctpHole && !!cfg.ldHole;

  const groups = E.groups(T, rid);
  const slot = Math.min(UI.entryTee === 'all' ? 0 : +UI.entryTee, Math.max(groups.length - 1, 0));
  const gid = (groups[slot] || {}).id || 'g0';
  const slotPlayers = (groups[slot] || {}).members || [];
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
    gate = `<div class="gate${nominated ? '' : ' want'}"><div class="msg"><b>${esc(r.short)} is not open for scoring</b>
      <span>${nominated
        ? (D.PINS_ENABLED ? 'Opening confirms with your PIN and lets both scorers write to this card.' : 'Opening lets anyone with this page write to the card.')
        : 'Nominate the closest-to-the-pin and longest-drive holes first. They are chosen before anyone tees off and only a scorer can move them once the card is open.'}</span></div>
      ${nominated ? '' : '<button class="btn ghost" data-act="goPins">Nominate them</button>'}
      <button class="btn" data-act="openRound" data-a="${rid}"${nominated ? '' : ' disabled'}>Open round</button></div>`;
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
  /* Bingo Bango Bongo is played inside the group, so it can only ever be won
     by someone in it. Two refs scoring two groups never see each other's
     names, and neither can hand a point to the wrong fourball. A mark set
     before the groups changed is kept on the list so it can still be undone. */
  const inGroup = sel => `<option value="">Nobody yet</option>` + list.map(g =>
    `<option value="${g.id}"${sel === g.id ? ' selected' : ''}>${esc(g.display)}</option>`).join('')
    + (sel && !list.some(g => g.id === sel)
      ? `<option value="${sel}" selected>${esc((E.person(T, sel) || {}).display || sel)} — not in this group</option>` : '');

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
      ${groups.map((g, i) => `<button class="gchip${slot === i ? ' on' : ''}" data-act="entryTee" data-a="${i}">${esc(g.label)}${g.time ? ' — ' + E.to12(g.time) : ''}</button>`).join('')}
      ${usingAll ? `<span class="gnote">Tee groups follow the pairings, and none are made yet — so every golfer is
        listed. Pair them up under Roster &amp; Pairings and the groups fill themselves.</span>` : ''}
    </div>
    ${/* round, then group, then hole: every choice about where you are
          standing sits together, beside the picture of it */ ''}
    <div class="scroller nos"><div class="hstrip">
      ${course.holes.map((x, i) => `<button class="hcell${i === h ? ' on' : ''}${holeSavedBy(rid, i) ? ' saved' : ''}"
        data-act="entryHole" data-a="${i}" aria-label="Hole ${x.n}, par ${x.par}">
        <span class="n num">${x.n}</span><span class="p num">par ${x.par}</span></button>`).join('')}
    </div></div>
   </div>
    ${/* the hole they are standing on, drawn exactly as Course Setup draws it,
          minus its hole strip — here the card decides which hole this is */ ''}
    <div class="cside">
      ${IMG[hole.img] ? `<img decoding="sync" src="${IMG[hole.img]}" alt="Diagram of hole ${hole.n} at ${esc(course.name)}">` : ''}
      <div class="cfacts num">
        <span class="hn">Hole ${hole.n}</span>
        <span>Par ${hole.par}</span>
        <span class="m">SI ${hole.si}</span>
        <span class="m">${hole.mW} m White</span>
      </div>
    </div>
  </div>

  ${gate}${saveBar}

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
              <select class="field" data-act="setBbb" data-a="${k}"${editable ? '' : ' disabled'}>${inGroup(bbbOf(rid, h, k, gid))}</select></label>`).join('')}
        </div>
        <p class="sublede" style="margin-top:8px">Only ${esc((groups[slot] || {}).label || 'this group')} appears here — the other group's ref scores their own.</p>
      </div>

      <div class="side-g" data-reveal="pins">
        <h3>Pin &amp; drive — ${esc(r.short)}</h3>
        <p class="sublede">${nominated
          ? (open ? 'Nominated. Moving a hole now asks a scorer to confirm.' : 'Both nominated — the round can open.')
          : 'Both holes must be nominated before the round can open.'}</p>
        <div class="fieldset">
          <label>Closest to the Pin hole
            <select class="field${cfg.ctpHole ? '' : ' unset'}" data-act="setRoundField" data-a="ctpHole"${ed && !locked ? '' : ' disabled'}>
              <option value="">Not chosen yet</option>
              ${course.holes.filter(x => x.par === 3).map(x => `<option value="${x.n}"${cfg.ctpHole === x.n ? ' selected' : ''}>Hole ${x.n}</option>`).join('')}
            </select></label>
          <label>Closest — current mark
            <select class="field" data-act="setRoundField" data-a="ctpWinner"${ed ? '' : ' disabled'}>${people(cfg.ctpWinner)}</select></label>
          <label>Distance
            <input class="field" type="text" value="${esc(cfg.ctpDist || '')}" placeholder="e.g. 2.4 m"
              data-act="setRoundField" data-a="ctpDist"${ed ? '' : ' disabled'}></label>
          <label>Longest Drive hole
            <select class="field${cfg.ldHole ? '' : ' unset'}" data-act="setRoundField" data-a="ldHole"${ed && !locked ? '' : ' disabled'}>
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

/* The playing band, worn rather than ticked.
 *
 * Four numbered boxes said nothing about what the number is. A band is the
 * strokes a golfer receives — the thing they carry round the course — so it
 * is drawn as the crest on the front of the book: faint and empty until it is
 * theirs, then filled in the pine green of the printing ink with the number
 * struck through the middle of it.
 *
 * The shield is one path so it scales cleanly, and the inner line is a second,
 * inset copy: the detail that stops a flat silhouette looking like a bookmark.
 * The number is real text, not part of the drawing, so it stays selectable,
 * searchable and legible at whatever size a phone decides to use. */
const CREST_SHIELD = 'M3 2.5h34a1.5 1.5 0 0 1 1.5 1.5v20.5c0 8.6-7.1 14.6-17.2 19.1'
  + 'a1.8 1.8 0 0 1-1.6 0C9.6 39.1 2.5 33.1 2.5 24.5V4A1.5 1.5 0 0 1 3 2.5Z';
const CREST_INNER = 'M7 7h26v17c0 6.2-5.2 10.9-13 14.4C12.2 34.9 7 30.2 7 24Z';

function bandCrest(p, band, editable) {
  const on = p.band === band;
  return `<button class="bandcrest${on ? ' on' : ''}" data-act="setBand"
    data-a="${p.id}" data-b="${band}"${editable ? '' : ' disabled'}
    aria-pressed="${on}" aria-label="Band ${band} — ${band} strokes${on ? ', chosen' : ''}"
    title="${band} strokes">
    <svg viewBox="0 0 40 46" aria-hidden="true" focusable="false">
      <path class="sh" d="${CREST_SHIELD}"></path>
      <path class="in" d="${CREST_INNER}"></path>
    </svg>
    <span class="bn num">${band}</span>
  </button>`;
}

function scrRoster() {
  const gs = E.golfers(T);
  const ed = canEdit();
  const assigned = new Set(T.config.pairs.flatMap(p => p.members));
  const unassigned = gs.filter(g => !assigned.has(g.id));
  const bandsSet = gs.filter(g => g.band != null).length;
  const others = T.config.people.length - gs.length;   // on the roster, but not pairable
  /* The practice day is there to find out who is in the wrong band, so bands
     stay open all through it. Once it is concluded they settle, and only a
     scorer or the master reviewer moves one. */
  const bandEd = ed && (!E.bandsLocked(T) || canEdit());

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
    <span class="rnote">${bandsSet} of ${gs.length} bands set. Every golfer plays off a 15, 20, 25 or 30 band — the band is the strokes they receive.
      ${E.bandsLocked(T) ? 'Settled after the practice round; a scorer can still move one.' : 'Open until the practice round is concluded.'}</span>
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
          <td data-l="Squad">${(() => {
            const sq = p.location || null;
            const next = sq === null ? 'United States' : sq === 'USA' ? 'United Kingdom' : 'unassigned';
            return `<span class="sqcell ${sq === 'UK' ? 'uk' : sq === 'USA' ? 'usa' : 'none'}">
              <button class="sqbox" data-act="cycleSquad" data-a="${p.id}"${ed ? '' : ' disabled'}
                aria-label="${esc(p.display)} — ${sq ? esc(sq) : 'unassigned'}. Change to ${esc(next)}."
                title="Change to ${esc(next)}">${squadFlag(sq, 34)}</button>
              <span class="sqlabel">${sq ? esc(sq) : 'Unassigned'}</span></span>`;
          })()}</td>
          <td data-l="Group">${ed ? `<select class="field small" data-act="setPerson" data-a="${p.id}" data-b="group" aria-label="Group">
                ${['7-day', '5-day'].map(v => `<option value="${v}"${p.group === v ? ' selected' : ''}>${v}</option>`).join('')}</select>` : esc(p.group)}</td>
          <td data-l="Band">${p.role === 'golfer' ? `<div class="bandrow">
            ${E.BANDS.map(bnd => bandCrest(p, bnd, bandEd)).join('')}
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
      ${IMG[hole.img] ? `<img decoding="sync" src="${IMG[hole.img]}" alt="Diagram of hole ${hole.n} at ${esc(c.name)}">` : ''}
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
  ['courses', 'Course Setup', 'Courses'], ['rules', 'Games & Rules', 'Rules'], ['setup', 'Setup', 'Setup'],
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
  try { paint(); }
  catch (err) {
    // The screen is the least of it: a throw here used to abort whatever write
    // was in flight. Record it, and let the save carry on.
    if (store && store.note) store.note('RENDER FAILED', String((err && (err.stack || err.message)) || err).slice(0, 220));
    else throw err;
  }
}

function paint() {
  if (inUse()) { renderPending = true; return; }
  renderPending = false;
  const app = document.getElementById('app');
  const focused = captureFocus();
  /* Every redraw replaces the whole tree, which puts the scroll back to the
     top. On the page that was survivable; inside the recap window, where a
     photograph uploading redraws four times, it threw the reader back to the
     headline each time and hid the very row that says what went wrong. */
  const wasAt = window.scrollY;
  const box = document.getElementById('recapBox');
  const boxAt = box ? box.scrollTop : 0;
  const body = { today: scrToday, boards: scrBoards, ryder: scrRyder, calendar: scrCalendar,
                 entry: scrEntry, roster: scrRoster, rules: scrRules, courses: scrCourses,
                 setup: scrSetup }[UI.screen]();

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
      ${IMG.crest ? `<button class="crestbtn" data-act="askOpen" title="Ask the book a question"
        aria-label="Ask the book a question"><img src="${IMG.crest}" alt="The Union Invitational crest"></button>` : ''}
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
  ${UI.modal ? modalHtml() : ''}
  ${askPanel()}
  ${recapPanel()}`;

  // the page behind a window does not scroll with it
  document.documentElement.classList.toggle('noscroll', !!UI.recapOpen);

  const box2 = document.getElementById('recapBox');
  if (box2 && boxAt) box2.scrollTop = boxAt;
  if (wasAt && !UI.recapOpen) window.scrollTo(0, wasAt);

  if (UI.askOpen && UI.askFocus) {
    UI.askFocus = false;
    const f = document.getElementById('askField');
    if (f) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); }
  }
  if (UI.modal && UI.modal.kind === 'pin') { const i = document.getElementById('pinField'); if (i) { i.focus(); i.select(); } }
  else if (UI.modal && UI.modal.kind === 'add') { const i = document.getElementById('addName'); if (i) i.focus(); }
  else restoreFocus(focused);

  persistDraft();

  if (UI.reveal) {
    const want = UI.reveal; UI.reveal = null;
    const el = document.querySelector(`[data-reveal="${want}"]`);
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const field = el.querySelector('select, input');
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
    case 'askOpen':
      UI.askOpen = true; UI.askFocus = true; render();
      return;
    case 'askText':
      return;                      // a field, not a button: typing is handled below
    case 'askClose':
      if (el.classList.contains('scrim') && e.target !== el) return;
      UI.askOpen = false; render();
      return;
    case 'askSend':
      sendQuestion();
      return;
    case 'recapOpen':
      UI.recap = { rid: a, busy: false, err: '', stream: '', edit: false, view: 'report' };
      UI.recapOpen = true;
      render();
      /* Opening it is the ask. A finished round with nothing written yet
         starts writing itself — nobody should have to press a second button
         to be told what happened on a day they played. */
      if (!T.recaps[a] || !T.recaps[a].body) writeRecap(a, false);
      return;
    case 'photoPick':
      pickerRid = a;
      makePicker().click();
      return;
    case 'photoDrop1': {
      const ph = T.photos[a] || {};
      if (!canAdmin() && !ph.mine) return;
      /* Take the files too. A row removed on its own leaves the picture
         sitting in a one-gigabyte allowance with nothing pointing at it. */
      if (store4 && store4.remove && (ph.key || ph.thumbKey)) {
        store4.remove([ph.key, ph.thumbKey]).catch(() => {});
      }
      store.dropPhoto(a);
      return;
    }
    case 'recapPick':
      UI.recap = { rid: a, busy: false, err: '', stream: '', edit: false, view: 'report' };
      render();
      recapTop();
      return;
    case 'goPins':
      UI.screen = 'entry';
      UI.reveal = 'pins';
      render();
      return;
    case 'uploadClear':
      UI.upload.err = '';
      UI.upload.queue = UI.upload.queue.filter(u => !u.err);
      render();
      return;
    case 'recapGallery':
      UI.recap.view = UI.recap.view === 'gallery' ? 'report' : 'gallery';
      render();
      recapTop();
      return;
    case 'recapEditToggle':
      if (!canEdit()) return;
      UI.recap.edit = !UI.recap.edit;
      render();
      return;
    case 'recapGen':
      writeRecap(a, true);
      return;
    case 'recapPublish':
      if (!canEdit()) return;
      store.writeRecap(a, r => { r.status = 'published'; r.at = Date.now(); });
      return;
    case 'recapStop':
      if (recapCtl) recapCtl.abort();
      return;
    case 'recapClose':
      // a tap on the backdrop closes; a tap inside it does not
      if (el.classList.contains('scrim') && e.target !== el) return;
      if (recapCtl) recapCtl.abort();
      UI.recapOpen = false;
      render();
      return;
    case 'goRule': UI.screen = 'rules'; render();
      { const d = document.getElementById('rule-' + a); if (d) { d.open = true; d.scrollIntoView({ block: 'center' }); } }
      return;
    case 'boardTab': UI.boardTab = a; break;
    case 'boardRound': UI.boardRound = a; UI.bookHole = 0; break;
    case 'bookHole': UI.bookHole = +a; break;
    case 'entryRound': guardDraft(() => { UI.entryRound = a; UI.entryHole = 0; UI.entryTee = '0'; }); return;
    case 'entryHole': guardDraft(() => { UI.entryHole = +a; }); return;
    case 'entryTee': guardDraft(() => { UI.entryTee = a; }); return;
    case 'calLock':
    case 'calUnlock':
      if (!canAdmin()) return;
      /* The week gets settled once and then stops moving. Locking it is what
         stops a stray tap on somebody's phone shifting dinner by an hour on
         everyone else's. Only the master reviewer can put it back. */
      store.writeConfig(c => { c.calLocked = act === 'calLock'; });
      return;
    case 'addEvent':
      if (!canEdit()) return;
      store.writeConfig(c => { c.schedule.push({ id: 'e' + Date.now().toString(36), dayIdx: +a, time: '18:00', title: 'New fixture', kind: 'social' }); });
      return;
    case 'removeEvent':
      if (!canEdit()) return;
      store.writeConfig(c => { c.schedule = c.schedule.filter(e => e.id !== a); });
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

    case 'openRound': {
      const rc = E.roundCfg(T, a) || {};
      if (!rc.ctpHole || !rc.ldHole) {
        if (store.note) store.note('openRound', a + ' REFUSED — pin/drive not nominated');
        UI.reveal = 'pins';
        render();
        return;
      }
      askPin('Open ' + E.roundDef(a).short + ' for scoring', 'Confirm with your PIN. Both scorers can then write to this card.', 'Open round',
        role => {
          if (store.note) store.note('openRound', a + ' was ' + (T.config.rounds[a] || {}).state);
          setRound(a, { state: 'open', openedBy: role });
          UI.entryRound = a; UI.screen = 'entry';
        });
      return;
    }
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
      // From an empty cell either button starts at par: plus lands on it,
      // minus one under. Going below par took a tap up and a tap back.
      let v = cur == null ? hole.par + (+b > 0 ? 0 : -1) : cur + (+b);
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
      const h = UI.draft.hole;
      askPin('Save hole ' + (h + 1), 'Enter your PIN to record these scores. Only saved holes reach the leaderboards.',
        'Save hole', role => {
          commitDraft(role);
          // walk on: a scorer saves a hole because the group has finished it
          if (h < 17) { UI.entryHole = h + 1; window.scrollTo(0, 0); }
          render();
        });
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
      // the control is already disabled once the practice round settles them;
      // refuse the write too, so a stale screen cannot move one
      if (E.bandsLocked(T) && !canEdit()) return;
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

  if (act === 'recapEdit') {
    /* The words are the commissioner's to fix; the figures under them are not
       editable anywhere, here or elsewhere. Each line keeps itself on blur. */
    if (!canEdit()) return;
    const rec = UI.recap.rid || E.recapRound(T, now);
    const v = String(el.value || '');
    store.writeRecap(rec, r => {
      const bd = r.body || (r.body = { headline: '', narrative: [], swing: null, pairNotes: {}, honours: [] });
      if (a === 'headline') bd.headline = v.trim().slice(0, 160);
      else if (a === 'para') {
        const list = (bd.narrative || []).slice();
        while (list.length <= +b) list.push('');
        list[+b] = v.trim().slice(0, 1200);
        while (list.length && !list[list.length - 1]) list.pop();   // a cleared last line goes
        bd.narrative = list;
      } else if (a === 'swing') bd.swing = { ...(bd.swing || {}), caption: v.trim().slice(0, 200) };
      else if (a === 'note') {
        bd.pairNotes = { ...(bd.pairNotes || {}) };
        if (v.trim()) bd.pairNotes[b] = v.trim().slice(0, 200); else delete bd.pairNotes[b];
      } else if (a === 'cite' || a === 'winner') {
        const list = (bd.honours || []).slice();
        let h = list.find(x => x.slot === b);
        if (!h) { h = { slot: b, winner: null, citation: '' }; list.push(h); }
        if (a === 'cite') h.citation = v.trim().slice(0, 200); else h.winner = v || null;
        bd.honours = list.filter(x => x.winner || x.citation);
      }
      r.at = Date.now();
    });
    render();
  } else if (act === 'setBbb') {
    if (!editable) return;
    draftFor(rid, UI.entryHole).bbb[a] = el.value || null;
    render();
  } else if (act === 'setRoundField') {
    const nom = a === 'ctpHole' || a === 'ldHole';
    /* The nominations are made before the card opens, so they cannot wait on
       the round being open the way a winner or a distance does. */
    if (nom ? (!canEdit() || E.roundCfg(T, rid).state === 'locked') : !editable) return;
    const v = el.value ? +el.value : null;
    const write = () => store.writeConfig(c => {
      c.rounds[rid][a] = nom ? v : (el.value || (a.endsWith('Dist') ? '' : null));
    });
    if (nom && E.roundCfg(T, rid).state === 'open') {
      askPin('Move the nominated hole', 'The hole was chosen before anyone teed off. Confirm as a scorer to move it.',
        'Move it', write);
      return;
    }
    write();
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
      if (!round) { store.note('tee set', 'NO SUCH ROUND ' + ta); return; }
      // there can be more pairings than the three slots the book shipped with
      while (round.tees.length <= +tb) round.tees.push({ time: null, players: [] });
      store.note('tee set', ta + '[' + tb + '] was ' + round.tees[+tb].time + ' -> ' + t);
      round.tees[+tb].time = t;
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
  if (e.target && e.target.id === 'askField') {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendQuestion(); return; }
    // Escape has to get out of the box as well as off the page
    if (e.key === 'Escape') { UI.askOpen = false; render(); return; }
    return;
  }
  if (e.key === 'Escape' && UI.recapOpen) { if (recapCtl) recapCtl.abort(); UI.recapOpen = false; render(); return; }
  if (e.key === 'Escape' && UI.askOpen) { UI.askOpen = false; render(); return; }
  if (e.key === 'Escape' && UI.modal) { UI.modal = null; UI.modalErr = ''; render(); }
}

/* ---------------- putting the questions ---------------- */

let askSeq = 0;
async function sendQuestion() {
  const field = document.getElementById('askField');
  const q = (field ? field.value : UI.askText).trim();
  if (!q) return;
  if (!askClaude) {
    UI.asks.unshift({ id: ++askSeq, q, a: '', busy: false, err: sampleError({ code: 'not_granted' }) });
    render();
    return;
  }
  const item = { id: ++askSeq, q, a: '', busy: true, err: '' };
  UI.asks.unshift(item);
  UI.askText = '';
  if (field) field.value = '';
  UI.askFocus = true;           // ready for the next question
  render();
  try {
    // Every question carries the book with it: there is no memory between calls.
    const { text } = await askClaude(
      [{ role: 'user', content: ASK_RULES + '\n\nTOURNAMENT NOTES\n' + brief() },
       { role: 'user', content: q }],
      { cache: false, modelTier: 'quick', onText: ({ text }) => { item.a = text; render(); } },
    );
    item.a = text;
  } catch (e) {
    item.a = (e && e.text) || '';
    item.err = sampleError(e);
  } finally {
    item.busy = false;
    render();
  }
}

let recapCtl = null;

/* The register: a back-page column, not a match report and not a comedy bit.
   Every rule here exists because breaking it would spoil the week for
   somebody — the golf gets teased, never the golfer. */
const RECAP_RULES = [
  'You write the back-page column for a golf trip between old friends.',
  'Voice: a sports columnist. A little grand. Willing to treat the golf course as a character.',
  'Dry rather than zany. It should read like a good newspaper column, not a match report and not a joke.',
  '',
  'HARD RULES, all of them:',
  '- Every factual claim must trace to a number in the card below. Invent nothing:',
  '  not a shot, not a hole, not a conversation, not a remark anyone made.',
  '- If you want to say somebody holed out from somewhere, the card must show that hole.',
  '- Humour is gentle, and aimed at the golf, never at the golfer.',
  '- Do not name any player negatively more than once in the whole piece.',
  '- Never mention a player\'s handicap band as a criticism. It is a number of strokes, not a verdict.',
  '- Three paragraphs of roughly 60 to 90 words each.',
  '- At least two honours must be winnable by somebody having a bad round.',
  '',
  'Honour slots are fixed. You choose the winner and write the citation:',
  '  shot_of_the_day, round_of_the_day, best_recovery, honest_scorecard.',
  'Use the exact player and pair ids given at the end of the card.',
  '',
  'Reply with JSON only. No preamble, no code fence, no commentary. This shape:',
  '{"headline":"one line","narrative":["para","para","para"],',
  ' "swing":{"value":"4 shots","caption":"one sentence"},',
  ' "pairNotes":{"p1":"one line"},',
  ' "honours":[{"slot":"shot_of_the_day","winner":"g1","citation":"one or two sentences"}]}',
].join('\n');

/** Fences and preamble get stripped anyway, however firmly we asked. */
function parseRecap(raw) {
  let t = String(raw || '').trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  const v = JSON.parse(t);
  if (!v || typeof v !== 'object') throw new Error('not an object');
  return {
    headline: String(v.headline || '').slice(0, 160),
    narrative: (Array.isArray(v.narrative) ? v.narrative : []).slice(0, 4).map(x => String(x)),
    swing: v.swing && typeof v.swing === 'object'
      ? { value: String(v.swing.value || ''), caption: String(v.swing.caption || '') } : null,
    pairNotes: v.pairNotes && typeof v.pairNotes === 'object'
      ? Object.fromEntries(Object.entries(v.pairNotes).map(([k, x]) => [String(k), String(x)])) : {},
    honours: (Array.isArray(v.honours) ? v.honours : []).slice(0, 6).map(h => ({
      slot: String((h && h.slot) || ''),
      winner: String((h && h.winner) || ''),
      citation: String((h && h.citation) || ''),
    })),
  };
}

async function writeRecap(rid, again) {
  if (!rid || UI.recap.busy) return;
  /* Opening the panel writes the report by itself, but only for a round that
     is actually finished, and only for someone who could have pressed the
     button anyway. Half a card is not a day. */
  if (!again && (!canEdit() || !E.roundStanding(T, rid).complete)) return;
  if (!askClaude) { UI.recap = { rid, busy: false, err: sampleError({ code: 'not_granted' }), stream: '', edit: false, view: 'report' }; render(); return; }
  if (T.recaps[rid] && T.recaps[rid].body && !again) return;   // written once, then kept
  recapCtl = new AbortController();
  UI.recap = { rid, busy: true, err: '', stream: '', edit: false, view: 'report' };
  render();
  const prompt = RECAP_RULES + '\n\nTHE CARD\n' + E.recapInput(T, rid, now);
  try {
    const { text } = await askClaude(prompt, {
      signal: recapCtl.signal,
      modelTier: 'complex',
      cache: false,
      onText: ({ text }) => { UI.recap.stream = text.slice(-400); render(); },
    });
    const body = parseRecap(text);
    if (!body.narrative.length) throw new Error('no narrative');
    await store.writeRecap(rid, r => { r.body = body; r.status = r.status === 'published' ? 'published' : 'draft'; r.at = Date.now(); });
  } catch (e) {
    UI.recap.err = (e && e.code) ? sampleError(e)
      : 'The report came back in a shape the book could not read. Try again.';
  } finally {
    UI.recap.busy = false;
    UI.recap.stream = '';
    recapCtl = null;
    render();
  }
}

/* ---------------- boot ---------------- */

export function boot() {
  /* A write that dies inside the redraw took the whole save with it and said
     nothing — the log showed the tap, then simply no write. Anything that
     throws now names itself, with the line it came from. */
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (UI.recapOpen) { if (recapCtl) recapCtl.abort(); UI.recapOpen = false; render(); return; }
    if (UI.askOpen) { UI.askOpen = false; render(); }
  });
  window.addEventListener('error', e => {
    if (store && store.note) store.note('JS ERROR', (e.message || '') + ' @' + (e.lineno || '?') + ':' + (e.colno || '?'));
  });
  window.addEventListener('unhandledrejection', e => {
    const r = e.reason;
    if (store && store.note) store.note('REJECTED', String((r && (r.stack || r.message)) || r).slice(0, 200));
  });

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
  makePicker();
  // dropping onto the strip is the same as picking
  app.addEventListener('dragover', e => { if (e.target.closest('.phstrip.drop')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  app.addEventListener('drop', e => {
    const strip = e.target.closest('.phstrip.drop');
    if (!strip || !e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
    e.preventDefault();
    addPhotos(strip.dataset.a, e.dataTransfer.files);
  });
  app.addEventListener('keydown', onKey);
  lockStripsSideways();
  /* What was typed, kept as it is typed. `keydown` fires before the character
     lands, so reading the value there is always one keystroke behind — and a
     redraw arriving mid-sentence then rendered the box without the last
     letter in it. With the store polling every few seconds, redraws arrive
     mid-sentence often. */
  app.addEventListener('input', e => {
    if (e.target && e.target.id === 'askField') UI.askText = e.target.value;
  });
  // the page may be allowed to ask Claude, or may not: find out once, quietly,
  // and let the crest and the recap light up if it can
  (async () => {
    /* The book's own writer first; the platform's sampler only on the copy
       that still runs as an artifact. */
    askClaude = askViaFunction(CFG.SUPABASE_URL, CFG.SUPABASE_KEY);
    if (!askClaude) {
      try { askClaude = window.claude && window.claude.use ? await window.claude.use('sample') : null; }
      catch (e) { askClaude = null; }
    }
    /* The book's own bucket first — it is the one everybody can add to. The
       artifact's asset store is writer-only, so on that copy the button only
       appears for the three people who can also change the scores. */
    try {
      const mk = (typeof window !== 'undefined' && window.__supabase) ? window.__supabase.createClient : null;
      store4 = mk ? createSupabaseFiles({
        url: CFG.SUPABASE_URL, key: CFG.SUPABASE_KEY, bucket: CFG.PHOTO_BUCKET, createClient: mk,
      }) : null;
    } catch (e) { store4 = null; }
    if (!store4) {
      try { store4 = window.claude && window.claude.use ? await window.claude.use('assets') : null; }
      catch (e) { store4 = null; }
    }
    render();
  })();
  /* The store redraws whenever it hears anything; this is the same redraw,
     on demand, so a test can land one in the middle of a sentence. */
  window.__forceRender = render;
  setInterval(() => { now = E.nowLocal(); render(); }, 30000);
  render();
  store.connect();
}
