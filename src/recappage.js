/* THE RECAP, AS A PAGE ANYONE CAN OPEN.
 *
 * Not everyone on the trip has the book installed, and nobody in the
 * WhatsApp group should need it to read the day's report. So the recap is
 * also a page of its own on the public site — docs/recap/?r=r1 — that reads
 * the shared book straight from the database (the publishable key, which is
 * safe in any browser) and lays the report out exactly as the book does:
 * the photographs across the top, the headline, the words, the swing of the
 * day, the Pairs Championship, every card, the MVP race, the Bingo Bango
 * Bongo, the honours, the side games and the photographs from the round.
 *
 * The words show only once the commissioner has shared the report (status
 * 'published'); the standings underneath are always live. Everything here
 * is read off the same engine the book uses, so the page and the book can
 * never disagree about a number. Nothing on it links to Claude.
 */
import * as E from './engine.js';
import { renderReport, renderPlayer, fieldReport } from './report.js';
import * as D from './data.js';
import { defaultConfig, normPerson, normPair } from './store.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cls = n => n == null ? '' : n < 0 ? 'under' : n > 0 ? 'over' : 'level';
export const HONOURS = [
  { slot: 'shot_of_the_day', label: 'Shot of the day' },
  { slot: 'round_of_the_day', label: 'Round of the day' },
  { slot: 'best_recovery', label: 'Best recovery' },
  { slot: 'honest_scorecard', label: 'Honest scorecard' },
];

/** The book, put together from its documents the way the store does it. */
/** The Ryder Cup in the recap, as the book draws it (app.js recapCupHtml). */
function cupHtml(cup) {
  if (!cup || !cup.matches.length) return '';
  const h = n => (Number.isInteger(n) ? String(n) : Math.floor(n) + '\u00BD');
  return `<h3 class="sub">Ryder Cup</h3>
    <div class="reccupline"><span>🇬🇧 <b class="num">${h(cup.uk)}</b> – <b class="num">${h(cup.usa)}</b> 🇺🇸 today</span>
      <span class="rc-wk">The cup: United Kingdom <b class="num">${h(cup.ukWeek)}</b> – <b class="num">${h(cup.usaWeek)}</b> United States</span></div>
    <div class="rows rectable reccup" style="margin-top:8px">
      ${cup.matches.map(m => `<div class="row">
        <span class="who rc-a${m.done && m.side === 'UK' ? ' won' : ''}">🇬🇧 ${esc(m.a)}</span>
        <span class="rc-r${m.done && m.side === 'UK' ? ' uk' : m.done && m.side === 'USA' ? ' usa' : ''}">${esc(m.done ? (m.side ? m.status : 'Halved') : m.thru ? (m.up ? Math.abs(m.up) + ' up' : 'A/S') + ' · ' + m.thru : '—')}</span>
        <span class="who rc-b${m.done && m.side === 'USA' ? ' won' : ''}">${esc(m.b)} 🇺🇸</span></div>`).join('')}
    </div>
    <p class="legend">Singles match play on the same cards, net: a point a match, half each for a halve.${cup.sitting && cup.sitting.length ? ' Sitting out: ' + esc(cup.sitting.join(', ')) + '.' : ''}${cup.next && cup.next.matches.length ? ' Next session: ' + esc(cup.next.matches.map(m => m.a + ' v ' + m.b).join(' · ')) + '.' : ''}</p>`;
}
export function assemble(rows) {
  const T = { config: defaultConfig(), scores: {}, bbb: {}, recaps: {}, photos: {}, notes: {}, chat: {}, market: {} };
  const people = [], pairs = [];
  let cfg = null;
  for (const r of rows || []) {
    const path = String(r.path || ''), doc = r.doc;
    if (!doc || typeof doc !== 'object') continue;
    const coll = path.split('/')[0], id = path.slice(coll.length + 1);
    if (path === 'config/tournament') cfg = doc;
    else if (coll === 'people') people.push(normPerson(doc));
    else if (coll === 'pairs') pairs.push(normPair(doc));
    else if (coll === 'scores') T.scores[id] = doc;
    else if (coll === 'bbb') T.bbb[id] = doc;
    else if (coll === 'recaps') T.recaps[id] = doc;
    else if (coll === 'photos') T.photos[id] = doc;
  }
  if (cfg) {
    const base = T.config;
    T.config = { ...base, ...cfg, rounds: { ...base.rounds, ...(cfg.rounds || {}) }, courses: { ...base.courses, ...(cfg.courses || {}) } };
  }
  const byOrder = (a, b) => (a.order || 0) - (b.order || 0);
  /* the roster lives in its own documents; the config's copy is the mirror */
  T.config.people = (people.length ? people : (T.config.people || []).map(normPerson)).sort(byOrder);
  T.config.pairs = (pairs.length ? pairs : (T.config.pairs || []).map(normPair)).sort(byOrder);
  return T;
}

/** The rounds whose report has been shared, in order. */
export function sharedRounds(T) {
  return D.ROUNDS.filter(x => T.recaps[x.id] && T.recaps[x.id].status === 'published').map(x => x.id);
}
/** The tournament recap, once the group has been given it. */
export const weekShared = T => !!(T.recaps.week && T.recaps.week.status === 'published' && T.recaps.week.body);
const WEEK_HONOURS = [
  { slot: 'golfer_of_the_week', label: 'Golfer of the week' },
  { slot: 'round_of_the_week', label: 'Round of the week' },
  { slot: 'shot_of_the_week', label: 'Shot of the week' },
  { slot: 'most_improved', label: 'Most improved' },
  { slot: 'heroic_failure', label: 'Heroic failure' },
];
const goldCard = () => `<a class="weekcard glow" href="?r=week"><small>★ The Union Invitational · Belek</small><b>The Tournament Recap</b><span>The whole week, in one read</span><em>Read the whole week ›</em></a>`;

/** The whole week, in gold: the same article as a day's, about the tournament, with the final tables under it. */
export function renderWeek(T, IMG, opts) {
  opts = opts || {};
  const now = E.nowLocal();
  const rec = T.recaps.week || null;
  const published = !!(rec && rec.status === 'published');
  const body = rec && (published || opts.draft) ? rec.body : null;
  const web = u => /^https?:\/\//i.test(String(u || ''));
  const all = Object.values(T.photos || {}).filter(p => p && web(p.url) && p.kind !== 'video').map(p => ({ ...p, thumb: web(p.thumb) ? p.thumb : '' }));
  const chrono = all.slice().sort((a, b) => (a.at || 0) - (b.at || 0));
  const slides = chrono.length <= 150 ? chrono : Array.from({ length: 150 }, (_, i) => chrono[Math.floor((i + 0.5) * chrono.length / 150)]);
  const shared = opts.shared || sharedRounds(T);
  const rounds = D.ROUNDS.filter(r => r.counts);
  const pairs = E.pairsBoard(T, now), mvp = E.mvpBoard(T, now), bbb = E.bbbBoard(T), cup = E.ryderData(T, now);
  const half = n => (Number.isInteger(n) ? String(n) : Math.floor(n) + '\u00BD');
  const nm = id => (E.person(T, id) || {}).display || (() => { const pr = (T.config.pairs || []).find(x => x.id === id); return pr ? E.pairName(T, pr) : '—'; })();
  const tm = ms => { try { return E.to12(new Date(ms + D.TZ_OFFSET_MIN * 60000).toISOString().slice(11, 16)); } catch (e) { return ''; } };
  /* the same placing as the book: a picked photo stays; beside a quote written on a hole, a photograph from that round and hole; the rest walk through the week in order */
  const n = body ? (body.narrative || []).filter(x => x && x.trim()).length : 0, slotsN = Math.max(0, n - 1);
  const voiceAt = k => { const vs = (body && body.voices) || []; return vs.some(x => x.para) ? vs.find(x => +x.para === k + 1) : vs[k]; };
  const placed = (() => {
    const out = Array(slotsN).fill(null), used = new Set(), pics = (body && body.pics) || {};
    for (let k = 0; k < slotsN; k++) { const c = pics[k] ? all.find(p => p.id === pics[k]) : null; if (c) { out[k] = c; used.add(c.id); } }
    for (let k = 0; k < slotsN; k++) { if (out[k]) continue; const v = voiceAt(k); if (v && v.hole != null) { const c = all.find(p => p.hole === v.hole && p.rid === v.rid && !used.has(p.id)); if (c) { out[k] = c; used.add(c.id); } } }
    for (let k = 0; k < slotsN; k++) {
      if (out[k] || !chrono.length) continue;
      let at = Math.min(chrono.length - 1, Math.floor((k + 0.5) * chrono.length / slotsN));
      for (let m = 0; m < chrono.length && used.has(chrono[at].id); m++) at = (at + 1) % chrono.length;
      if (!used.has(chrono[at].id)) { out[k] = chrono[at]; used.add(chrono[at].id); }
    }
    return out;
  })();
  const inlinePhoto = i => {
    const ph = placed[i] || null;
    if (!ph) return '';
    const cap = ph.caption || (ph.hole != null ? 'Hole ' + (ph.hole + 1) : 'From the week');
    return `<figure class="rinline"><button class="rin-open" data-full="${esc(ph.url)}" data-cap="${esc(cap + (ph.byName ? ' · 📷 ' + ph.byName : ''))}" aria-label="Open this photo full screen"><img src="${esc(ph.url)}" alt="${esc(ph.caption || 'From the week')}" loading="lazy" decoding="async"></button>
      <figcaption>${esc(cap)}${ph.byName ? ' · 📷 ' + esc(ph.byName) : ''}</figcaption></figure>`;
  };
  const voiceHtml = v => { const rd = v.rid ? D.ROUNDS.find(x => x.id === v.rid) : null;
    return `<blockquote class="rvoice"><p>“${esc(v.text)}”</p><cite>— ${esc(v.who || 'From My round')}${v.hole != null ? ` <span class="rv-h">· ${rd ? esc(rd.short === 'Practice' ? 'Practice' : 'R' + rd.short.slice(1)) + ' ' : ''}hole ${+v.hole + 1}</span>` : ''}</cite></blockquote>`; };
  const left = (() => {
    const vs = (body && body.voices) || [];
    if (!vs.some(v => v.para)) return vs.length > n - 1 ? vs.slice(Math.max(n - 1, 0)) : [];
    const seen = new Set();
    return vs.filter(v => { const k = +v.para; if (k >= 1 && k <= n - 1 && !seen.has(k)) { seen.add(k); return false; } return true; });
  })();
  const honours = body ? (body.honours || []).filter(h => h.winner) : [];
  return `<div class="recapbox gold" id="recapBox">
    <div class="recaptop"><b>The Tournament Recap</b><span class="rt-s">The Union Invitational · Belek</span><a class="rm" href="../app/">Open the book</a></div>
    <div class="rhero">
      <div class="rh-track nos" data-n="${slides.length}">${slides.map((ph, i) => `<figure class="rh-slide open" data-by="${esc(ph.byName || '')}" data-grp="hero" data-full="${esc(ph.url)}" data-cap="${esc((ph.hole != null ? 'Hole ' + (ph.hole + 1) : 'From the week') + (ph.byName ? ' · 📷 ' + ph.byName : ''))}">
        <img src="${esc(ph.url)}" alt="${esc(ph.caption || 'From the week')}"${i > 1 ? ' loading="lazy"' : ''} decoding="async"></figure>`).join('')}</div>
      ${slides.length > 1 ? `<span class="rh-count num" aria-live="polite">📷 <b>1</b> / ${slides.length}${slides[0].byName ? ' · ' + esc(slides[0].byName) : ''}</span>
        ${slides.length <= 24 ? `<div class="rh-dots" aria-hidden="true">${slides.map((_, i) => `<i class="${i === 0 ? 'on' : ''}"></i>`).join('')}</div>` : ''}` : ''}
      <div class="rh-in">
        <span class="rh-k">★ The whole week · Titanic Deluxe Golf Belek · 26 Oct to 2 Nov${body && !published ? ' · Draft' : ''}</span>
        <h2 class="rechead">${body ? esc(body.headline || '') : 'The Tournament Recap'}</h2>
      </div>
    </div>
    <div class="chiprow recaparch"><span class="gl">Recaps</span>
      ${shared.map(id => { const x = E.roundDef(id) || {}; return `<a class="chip" href="?r=${esc(id)}">${esc(x.short || id)}</a>`; }).join('')}
      <a class="chip gold on" href="?r=week">★ The Week</a></div>
    <p class="metaline"><b>The Union Invitational</b> · ${rounds.length} counting rounds · ${E.golfers(T).length} golfers, ${(T.config.pairs || []).length} pairs · ${all.length} photos</p>
    <div class="recapgrid">
      <div class="recapmain">
        <div class="arthead">${body ? `<p class="byline"><b>By the Union Register</b>${rec && rec.at ? `<span>${esc(tm(rec.at))}</span>` : ''}${published ? '' : '<span class="draftflag">Draft</span>'}</p>` : ''}</div>
        <div class="artbody">
        ${body && body.narrative ? body.narrative.filter(x => x && x.trim())
            .map((x, i) => `<p class="recpara${i === 0 ? ' lead' : ''}">${esc(x)}</p>${i < n - 1 ? inlinePhoto(i) + (voiceAt(i) ? voiceHtml(voiceAt(i)) : '') : ''}`).join('') + left.map(voiceHtml).join('')
          : `<p class="recpara">The tournament recap has not been shared yet.</p>`}
        </div>
      </div>
      <aside class="recapside">
        ${body && body.swing && body.swing.value ? `<div class="swing"><div class="sw-l">The week in a number</div><div class="sw-v num">${esc(body.swing.value)}</div><div class="sw-c">${esc(body.swing.caption || '')}</div></div>` : ''}
      </aside>
    </div>
    <h3 class="sub">Worth mentioning</h3>
    <div class="rows" style="margin-top:8px">
      ${WEEK_HONOURS.map(h => { const won = honours.find(x => x.slot === h.slot);
        return `<div class="row honour"><span class="who">${esc(h.label)}<small>${won && won.citation ? esc(won.citation) : 'Not awarded.'}</small></span><span class="n rt-v win">${won ? esc(nm(won.winner)) : '—'}</span></div>`; }).join('')}
    </div>
    <h3 class="sub">The final tables</h3>
    <div class="rows rectable" style="margin-top:8px">
      <div class="rowhead"><span class="rt-pos"></span><span class="rt-who">Team Competition</span><span class="rt-t">Points</span></div>
      ${pairs.map(x => `<div class="row${x.pos === 1 ? ' lead' : ''}"><span class="pos rt-pos">${x.pos}</span>
        <span class="who rt-who">${esc(x.name)}<small>${rounds.map(r => { const row = E.pairRoundBoard(T, r.id).find(y => y.id === x.id); return 'R' + r.short.slice(1) + ' ' + (row ? row.today : '—'); }).join(' · ')}</small></span>
        <span class="num rt-t pts">${x.total}</span></div>`).join('')}
    </div>
    <div class="rows rectable" style="margin-top:14px">
      <div class="rowhead"><span class="rt-pos"></span><span class="rt-who">MVP</span><span class="rt-t">Net<small class="rawh">net · raw</small></span></div>
      ${mvp.map(x => `<div class="row${x.pos === 1 ? ' lead' : ''}"><span class="pos rt-pos">${x.pos}</span>
        <span class="who rt-who">${esc(x.name)}<small>${rounds.map(r => { const row = E.recapField(T, r.id).find(y => y.id === x.id); return 'R' + r.short.slice(1) + ' ' + (row && row.net != null ? E.fmtToPar(row.net) : '—'); }).join(' · ')}</small></span>
        <span class="num rt-t ${cls(x.total)}">${esc(x.totalStr)}<small class="rawv">${esc(x.gTotalStr)}</small></span></div>`).join('')}
    </div>
    ${bbb.length ? `<div class="rows rectable" style="margin-top:14px">
      <div class="rowhead"><span class="rt-pos"></span><span class="rt-who">Bingo Bango Bongo</span><span class="rt-t">Points</span></div>
      ${bbb.map(x => `<div class="row${x.pos === 1 ? ' lead' : ''}"><span class="pos rt-pos">${x.pos}</span><span class="who rt-who">${esc(x.name)}</span><span class="num rt-t">${x.pts}</span></div>`).join('')}
    </div>` : ''}
    <h3 class="sub">Ryder Cup</h3>
    <div class="reccupline"><span>🇬🇧 <b class="num">${half(cup.ukTotal)}</b> – <b class="num">${half(cup.usaTotal)}</b> 🇺🇸</span></div>
    <div class="rows rectable reccup" style="margin-top:8px">
      ${cup.sessions.map(s => `<div class="row"><span class="who rc-a">${esc(s.label)}</span><span class="rc-r">UK ${half(s.uk)} – ${half(s.usa)} USA</span><span class="who rc-b"></span></div>`).join('')}
    </div>
  </div>`;
}

/** The whole page for one round. `IMG` holds the crest and the course pictures. */
export const reportShared = T => !!(T.recaps.report && T.recaps.report.status === 'published' && T.recaps.report.body);
/** The players report as a page: the numbers for everyone, the coach's words once written. */
export function renderReportPage(T, opts) {
  opts = opts || {};
  const shared = opts.shared || sharedRounds(T);
  const rec = T.recaps.report || null, body = rec && rec.status === 'published' ? rec.body : null;
  return `<div class="recapbox" id="recapBox">
    <div class="recaptop"><b>The Players Report</b><span class="rt-s">The Union Invitational · Belek</span><a class="rm" href="../app/">Open the book</a></div>
    <div class="chiprow recaparch"><span class="gl">Recaps</span>
      ${shared.map(id => { const x = E.roundDef(id) || {}; return `<a class="chip" href="?r=${esc(id)}">${esc(x.short || id)}</a>`; }).join('')}
      ${weekShared(T) ? '<a class="chip gold" href="?r=week">★ The Week</a>' : ''}
      <a class="chip on" href="?r=report">Report</a></div>
    <div class="rp-page">${renderReport(T, body, { rowAttr: id => `data-player="${esc(id)}"` })}</div>
    <div class="rp-pops" hidden>${fieldReport(T, E.nowLocal()).players.map(p => `<div class="rp-pop" data-pop="${esc(p.id)}">${renderPlayer(T, body, p.id, {})}</div>`).join('')}</div>
  </div>`;
}
export function renderRecap(T, rid, IMG, opts) {
  opts = opts || {};
  if (rid === 'report') return renderReportPage(T, opts);
  if (rid === 'week') return renderWeek(T, IMG, opts);
  const now = E.nowLocal();
  const r = E.roundDef(rid) || {};
  const day = E.dayOf(r.dayIdx || 0) || {};
  const course = E.courseOf(T, rid);
  const st = E.roundStanding(T, rid);
  const rec = T.recaps[rid] || null;
  const published = !!(rec && rec.status === 'published');
  const body = rec && (published || opts.draft) ? rec.body : null;
  const table = E.recapTable(T, rid, now);
  const rib = E.ribbon(T, rid);
  const sw = E.swingOfTheDay(T, rid);
  const sg = E.sideGames(T, rid);
  const field = E.recapField(T, rid);
  const fmt = n => n == null ? '—' : E.fmtToPar(n);
  const nm = id => (E.person(T, id) || {}).display || '—';
  const who = id => (E.person(T, id) || {}).display || (() => { const pr = (T.config.pairs || []).find(x => x.id === id); return pr ? E.pairName(T, pr) : '—'; })();
  const pairNote = pid => (body && body.pairNotes && body.pairNotes[pid]) || '';
  const mvpRace = r.counts ? E.mvpBoard(T, now).map(x => { const f = field.find(y => y.id === x.id); return { ...x, today: f ? f.net : null, todayRaw: f ? f.raw : null }; }) : [];
  const bbbWeek = E.bbbBoard(T);
  const bbbDay = E.bbbRoundBoard(T, rid).map(x => { const w = bbbWeek.find(y => y.id === x.id); return { ...x, week: w ? w.pts : null }; });
  const cup = r.counts ? E.ryderRecap(T, rid, now) : null;
  const web = u => /^https?:\/\//i.test(String(u || ''));
  const snaps = Object.values(T.photos || {}).filter(p => p && p.rid === rid && web(p.url)).map(p => ({ ...p, thumb: web(p.thumb) ? p.thumb : '' })).sort((a, b) => (b.at || 0) - (a.at || 0));
  const stills = snaps.filter(p => p.kind !== 'video');    // the front and the inline pictures are photographs; clips are in the strip
  const slides = stills.length ? (stills.length <= 150 ? stills : Array.from({ length: 150 }, (_, i) => stills[Math.floor((i + 0.5) * stills.length / 150)]))
    : IMG['course_' + course.key] ? [{ url: IMG['course_' + course.key], caption: course.name, course: true }] : [];
  const top = table[0];
  const shots = st.field;
  const shared = opts.shared || sharedRounds(T);
  const tm = ms => { try { return E.to12(new Date(ms + D.TZ_OFFSET_MIN * 60000).toISOString().slice(11, 16)); } catch (e) { return ''; } };
  /* the commissioner can swap any slot for another photograph from that day (body.pics): the round's own, or the trip's from the same date */
  const dayIso = (E.dayOf(r.dayIdx) || {}).iso || '';
  const tripDay = p => p.day || (p.at ? new Date(p.at + 3 * 3600e3).toISOString().slice(0, 10) : '');
  const pool = stills.concat(Object.values(T.photos || {}).filter(p => p && p.rid === 'trip' && web(p.url) && p.kind !== 'video' && dayIso && tripDay(p) === dayIso));
  /* the same placing as the book: a picked photo stays; beside a quote written on a hole, a photograph from that hole; then the next along, none twice */
  const voiceAt = k => { const vs = (body && body.voices) || []; return vs.some(x => x.para) ? vs.find(x => +x.para === k + 1) : vs[k]; };
  const slotsN = body ? Math.max(0, (body.narrative || []).filter(x => x && x.trim()).length - 1) : 0;
  const placed = (() => {
    const out = Array(slotsN).fill(null), used = new Set(), pics = (body && body.pics) || {};
    for (let k = 0; k < slotsN; k++) { const c = pics[k] ? pool.find(p => p.id === pics[k]) : null; if (c) { out[k] = c; used.add(c.id); } }
    for (let k = 0; k < slotsN; k++) { if (out[k]) continue; const v = voiceAt(k); if (v && v.hole != null) { const c = stills.find(p => p.hole === v.hole && !used.has(p.id)); if (c) { out[k] = c; used.add(c.id); } } }
    for (let k = 0; k < slotsN; k++) { if (out[k]) continue; let at = k + 1; while (at < stills.length && used.has(stills[at].id)) at++; if (stills[at]) { out[k] = stills[at]; used.add(stills[at].id); } }
    return out;
  })();
  const inlinePhoto = i => {
    const ph = placed[i] || null;
    if (!ph) return '';
    const cap = ph.caption || (ph.hole != null ? 'Hole ' + (ph.hole + 1) : 'From the round');
    return `<figure class="rinline"><button class="rin-open" data-full="${esc(ph.url)}" data-cap="${esc(cap + (ph.byName ? ' · 📷 ' + ph.byName : ''))}" aria-label="Open this photo full screen"><img src="${esc(ph.url)}" alt="${esc(ph.caption || 'From the round')}" loading="lazy" decoding="async"></button>
      <figcaption>${esc(cap)}${ph.byName ? ' · 📷 ' + esc(ph.byName) : ''}</figcaption></figure>`;
  };
  const voiceHtml = v => `<blockquote class="rvoice"><p>“${esc(v.text)}”</p><cite>— ${esc(v.who || 'From My round')}${v.hole != null ? ` <span class="rv-h">· hole ${+v.hole + 1}</span>` : ''}</cite></blockquote>`;
  const inlineVoice = i => {
    const vs = (body && body.voices) || [];
    const v = vs.some(x => x.para) ? vs.find(x => +x.para === i + 1) : vs[i];
    return v ? voiceHtml(v) : '';
  };
  const roundName = x => x.short === 'Practice' ? 'Practice day' : (x.full || x.short);
  const next = D.ROUNDS[D.ROUNDS.findIndex(x => x.id === rid) + 1];
  const nextTee = next && E.roundCfg(T, next.id).tees && E.roundCfg(T, next.id).tees[0] && E.roundCfg(T, next.id).tees[0].time;

  return `<div class="recapbox" id="recapBox">
    <div class="recaptop">
      <b>The Day's Recap</b>
      <span class="rt-s">${esc(roundName(r))}</span>
      <a class="rm" href="../app/">Open the book</a>
    </div>
    <div class="rhero">
      <div class="rh-track nos" data-n="${slides.length}">${slides.map((ph, i) => `<figure class="rh-slide${ph.course ? '' : ' open'}" data-by="${esc(ph.course ? '' : ph.byName || '')}"${ph.course ? '' : ` data-grp="hero" data-full="${esc(ph.url)}" data-cap="${esc((ph.hole != null ? 'Hole ' + (ph.hole + 1) : 'From the round') + (ph.byName ? ' · 📷 ' + ph.byName : ''))}"`}>
        <img src="${esc(ph.url)}" alt="${esc(ph.caption || 'From the round')}"${i > 1 ? ' loading="lazy"' : ''} decoding="async"></figure>`).join('')}</div>
      ${slides.length > 1 ? `<span class="rh-count num" aria-live="polite">📷 <b>1</b> / ${slides.length}${slides[0].byName ? ' · ' + esc(slides[0].byName) : ''}</span>
        ${slides.length <= 24 ? `<div class="rh-dots" aria-hidden="true">${slides.map((_, i) => `<i class="${i === 0 ? 'on' : ''}"></i>`).join('')}</div>` : ''}` : ''}
      <div class="rh-in">
        <span class="rh-k">${esc(r.short === 'Practice' ? 'Practice day' : 'Round ' + String(r.short || '').slice(1) + ' of 3')} · ${esc(course.name)} · ${esc(day.dow || '')} ${esc(day.date || '')}${body && !published ? ' · Draft' : ''}</span>
        <h2 class="rechead">${body ? esc(body.headline || '') : st.complete ? 'No report yet' : esc(r.full || '')}</h2>
      </div>
    </div>
    <div class="rtiles">
      <div class="rtile"><span class="rt-l">Leading pair</span>
        <b class="g num">${top && top.today != null ? esc(String(top.today)) : '—'}<small>pts</small></b>
        ${top && top.todayRaw != null ? `<em class="num">${esc(E.fmtToPar(top.todayRaw))} raw</em>` : ''}
        <span class="rt-n">${top ? esc(top.name) : '—'}</span></div>
      <div class="rtile"><span class="rt-l">Swing of the day</span>
        <b class="num">${sw ? sw.shots : '—'}<small>${sw ? (sw.shots === 1 ? 'point' : 'points') : ''}</small></b>
        <span class="rt-n">${sw ? 'Holes ' + sw.fromHole + '–' + sw.toHole : 'Not yet'}</span></div>
      <div class="rtile"><span class="rt-l">Cards in</span>
        <b class="num">${st.inCards}<small>of ${st.field}</small></b>
        <span class="rt-n">${st.complete ? 'All in' : st.started ? 'Still out' : 'Not started'}</span></div>
    </div>

    ${shared.length > 1 || weekShared(T) || reportShared(T) ? `<div class="chiprow recaparch">
      <span class="gl">Recaps</span>
      ${shared.map(id => { const x = E.roundDef(id) || {}; return `<a class="chip${id === rid ? ' on' : ''}" href="?r=${esc(id)}">${esc(x.short || id)}</a>`; }).join('')}
      ${weekShared(T) ? '<a class="chip gold glow" href="?r=week">★ The Week</a>' : ''}
      ${reportShared(T) ? '<a class="chip" href="?r=report">Report</a>' : ''}
    </div>` : ''}

    <p class="metaline"><b>${esc(course.name)}</b> · ${esc(day.dow || '')} ${esc(day.date || '')} · ${esc(r.counts ? 'Four-ball Stableford' : 'Practice, counts for nothing')} · ${shots} player${shots === 1 ? '' : 's'}, ${st.pairs} pair${st.pairs === 1 ? '' : 's'}</p>

    <div class="recapgrid">
      <div class="recapmain">
        <div class="arthead">
          ${body ? `<p class="byline"><b>By the Union Register</b>${rec && rec.at ? `<span>${esc(tm(rec.at))}</span>` : ''}${published ? '' : '<span class="draftflag">Draft</span>'}</p>` : ''}
        </div>
        <div class="artbody">
        ${body && body.narrative ? body.narrative.filter(x => x && x.trim())
            .map((x, i) => `<p class="recpara${i === 0 ? ' lead' : ''}">${esc(x)}</p>${i < body.narrative.length - 1 ? inlinePhoto(i) + inlineVoice(i) : ''}`).join('')
            + (() => {
                const vs = body.voices || [], n = (body.narrative || []).filter(x => x && x.trim()).length;
                if (!vs.some(v => v.para)) return vs.length > n - 1 ? vs.slice(Math.max(n - 1, 0)).map(voiceHtml).join('') : '';
                const seen = new Set();
                return vs.filter(v => { const k = +v.para; if (k >= 1 && k <= n - 1 && !seen.has(k)) { seen.add(k); return false; } return true; }).map(voiceHtml).join('');
              })()
          : st.complete ? `<p class="recpara">${rec && rec.body ? 'The report is written and will be shared by the commissioner.' : 'The report has not been written yet.'} The standings below are live.</p>`
          : `<p class="recpara">The standings below are live. The report is written once every card is in.</p>`}
        </div>
      </div>
      <aside class="recapside">
        ${weekShared(T) && rid === (D.ROUNDS.filter(x => x.counts).slice(-1)[0] || {}).id ? goldCard() : ''}
        ${sw ? `<div class="swing">
          <div class="sw-l">Swing of the day</div>
          <div class="sw-v num">${sw.shots} point${sw.shots === 1 ? '' : 's'}</div>
          <div class="sw-c">${body && body.swing && body.swing.caption ? esc(body.swing.caption)
            : 'opened between the leaders and third place across holes ' + sw.fromHole + ' to ' + sw.toHole + '.'}</div>
        </div>` : ''}
      </aside>
    </div>

    <div class="ribwrap">
      <div class="ribhead"><span>Leaders' hole by hole</span>
        <span class="riblegend"><i class="rl under"></i>3 pts or more <i class="rl level"></i>2 <i class="rl over"></i>1 or none</span></div>
      <div class="scroller nos"><div class="ribbon">
        ${rib.map(c => `<div class="ribcell ${c.d == null ? '' : c.d < 0 ? 'under' : c.d > 0 ? 'over' : 'level'}">
          <span class="num">${c.n}</span></div>`).join('')}
      </div></div>
    </div>

    <h3 class="sub">Pairs Championship</h3>
    <div class="rows rectable" style="margin-top:8px">
      <div class="rowhead"><span class="rt-pos"></span><span class="rt-who">Pair</span>
        <span class="rt-n">Today<small class="rawh">pts · raw</small></span>
        ${r.counts ? '<span class="rt-t">Total<small class="rawh">pts · raw</small></span>' : ''}</div>
      ${table.length ? table.map(x => `<div class="row${x.pos === 1 ? ' lead' : ''}">
        <span class="pos rt-pos">${x.pos}</span>
        <span class="who rt-who">${esc(x.name)}${pairNote(x.id) ? `<small>${esc(pairNote(x.id))}</small>` : ''}</span>
        <span class="num rt-n">${x.today == null ? '—' : x.today}${x.todayRaw == null ? '' : `<small class="rawv">${esc(fmt(x.todayRaw))}</small>`}</span>
        ${r.counts ? `<span class="num rt-t pts">${x.total == null ? '—' : x.total}${x.totalRaw == null ? '' : `<small class="rawv">${esc(fmt(x.totalRaw))}</small>`}</span>` : ''}
      </div>`).join('') : '<p class="empty">No cards in yet.</p>'}
    </div>
    <p class="legend">${r.counts ? 'Four-ball Stableford: the better partner’s points on each hole, off ' + E.teamAllowance(T) + '% of each handicap — the more the better. ' : 'The practice day counts for nothing, so there is no running total. '}Under each figure is raw, the better ball’s strokes as written against par.</p>

    ${cupHtml(cup)}

    <h3 class="sub">Every card</h3>
    ${field.length ? `<div class="rows rectable recfield" style="margin-top:8px">
      <div class="rowhead"><span class="rt-pos"></span><span class="rt-who">Golfer</span>
        <span class="rt-c">Strokes</span><span class="rt-c">Raw</span><span class="rt-c">Net</span></div>
      ${field.map(x => `<div class="row${x.pos === 1 ? ' lead' : ''}">
        <span class="pos rt-pos">${x.pos}</span>
        <span class="who rt-who">${esc(x.name)}<small>${x.band != null ? 'hcp ' + x.band : 'no handicap'}${x.thru < 18 ? ' · thru ' + x.thru : ''}</small></span>
        <span class="num rt-c">${x.strokes}</span>
        <span class="num rt-c ${cls(x.raw)}">${esc(fmt(x.raw))}</span>
        <span class="num rt-c ${cls(x.net)}">${esc(fmt(x.net))}</span></div>`).join('')}
    </div>
    <p class="legend">${r.counts ? 'In order of net to par, as the MVP is decided.' : 'In order of raw to par, as the practice day is scored.'} Strokes are the total as written; raw is that against par; net takes off each handicap’s strokes and caps any hole at triple bogey.</p>`
    : '<p class="empty">No cards in yet.</p>'}

    ${r.counts && mvpRace.length ? `<h3 class="sub">MVP race</h3>
    <div class="rows rectable recmvp" style="margin-top:8px">
      <div class="rowhead"><span class="rt-pos"></span><span class="rt-who">Golfer</span>
        <span class="rt-n">Today<small class="rawh">net · raw</small></span><span class="rt-t">Week<small class="rawh">net · raw</small></span></div>
      ${mvpRace.map(x => `<div class="row${x.pos === 1 ? ' lead' : ''}">
        <span class="pos rt-pos">${x.pos}</span>
        <span class="who rt-who">${esc(x.name)}<small>${x.band != null ? 'hcp ' + x.band : 'no handicap'}${x.gap ? ' · ' + x.gapStr + ' back' : x.pos === 1 ? ' · leads' : ''}</small></span>
        <span class="num rt-n ${cls(x.today)}">${esc(fmt(x.today))}${x.todayRaw == null ? '' : `<small class="rawv">${esc(fmt(x.todayRaw))}</small>`}</span>
        <span class="num rt-t ${cls(x.total)}">${esc(x.totalStr)}<small class="rawv">${esc(x.gTotalStr)}</small></span></div>`).join('')}
    </div>
    <p class="legend">The week’s individual standing after this round: lowest net to par across the counting rounds, off the full handicap. Today is this round alone.</p>` : ''}

    ${bbbDay.length ? `<h3 class="sub">Bingo Bango Bongo${r.counts ? '' : ' — practice'}</h3>
    <div class="rows rectable recbbb" style="margin-top:8px">
      <div class="rowhead"><span class="rt-pos"></span><span class="rt-who">Golfer</span>
        <span class="rt-n">Today</span>${r.counts ? '<span class="rt-t">Week</span>' : ''}</div>
      ${bbbDay.map(x => `<div class="row${x.pos === 1 ? ' lead' : ''}">
        <span class="pos rt-pos">${x.pos}</span>
        <span class="who rt-who">${esc(x.name)}<small>${x.bingo} bingo · ${x.bango} bango · ${x.bongo} bongo</small></span>
        <span class="num rt-n">${x.pts}</span>${r.counts ? `<span class="num rt-t">${x.week == null ? '—' : x.week}</span>` : ''}</div>`).join('')}
    </div>
    <p class="legend">Points banked today: first on the green, closest once everyone is on, first in the hole. ${r.counts ? 'Week is the running total across the counting rounds.' : 'The practice day’s points count for nothing.'}</p>` : ''}

    <div class="recapcols">
      <div>
        <h3 class="sub">Worth mentioning</h3>
        <div class="rows" style="margin-top:8px">
          ${HONOURS.map(h => {
            const won = body && (body.honours || []).find(x => x.slot === h.slot);
            return `<div class="row honour"><span class="who">${esc(h.label)}
              <small>${won && won.citation ? esc(won.citation) : 'Not awarded yet.'}</small></span>
              <span class="n rt-v win">${won && won.winner ? esc(who(won.winner)) : '—'}</span></div>`;
          }).join('')}
        </div>
      </div>
      <div>
        <h3 class="sub">Side games</h3>
        <div class="rows" style="margin-top:8px">
          <div class="row"><span class="who">Closest to the pin${sg.ctp && sg.ctp.hole ? ', ' + sg.ctp.hole : ''}</span>
            <span class="n rt-v">${sg.ctp ? esc(sg.ctp.who + (sg.ctp.note ? ', ' + sg.ctp.note : '')) : '—'}</span></div>
          <div class="row"><span class="who">Longest drive${sg.ld && sg.ld.hole ? ', ' + sg.ld.hole : ''}</span>
            <span class="n rt-v">${sg.ld ? esc(sg.ld.who + (sg.ld.note ? ', ' + sg.ld.note : '')) : '—'}</span></div>
          <div class="row"><span class="who">Bingo Bango Bongo</span>
            <span class="n rt-v">${sg.bbb ? esc(sg.bbb.who + ', ' + sg.bbb.note) : '—'}</span></div>
          <div class="row"><span class="who">MVP standings</span>
            <span class="n rt-v">${sg.mvp ? esc(sg.mvp.who + ', ' + sg.mvp.note) : '—'}</span></div>
          <div class="row"><span class="who">Triple bogey cap hit</span>
            <span class="n num rt-v">${sg.caps} time${sg.caps === 1 ? '' : 's'} today</span></div>
        </div>
      </div>
    </div>

    <div class="fromround">
      <div class="titlerow">
        <h3 class="sub" style="margin:0">From the round</h3>
        <span class="rnote">${snaps.length ? snaps.length + ' photo' + (snaps.length === 1 ? '' : 's') + '. Tap one to open it full size.' : 'No photos from this round yet.'}</span>
      </div>
      <div class="phstrip">
        ${snaps.map(ph => `<figure class="ph${ph.kind === 'video' ? ' video' : ''}">
          <a href="${esc(ph.url)}" target="_blank" rel="noopener" aria-label="${ph.kind === 'video' ? 'Play this clip' : 'Open this photo full size'}">
            ${ph.kind === 'video' && !ph.thumb ? '<span class="ph-blank"></span>' : `<img src="${esc(ph.thumb || ph.url)}" alt="${esc(ph.caption || 'From the round')}" loading="lazy">`}${ph.kind === 'video' ? '<span class="pg-play" aria-hidden="true">▶</span>' : ''}</a>
          <figcaption>${ph.hole != null ? `<b class="phh">Hole ${ph.hole + 1}</b> ` : ''}${esc(ph.byName || 'Someone')}</figcaption>
        </figure>`).join('')}
      </div>
    </div>

    <div class="upnext">
      <span class="un-l">Up next</span>
      <span>${next ? esc(next.full) + ' on ' + esc(E.dayOf(next.dayIdx).dow) + ', ' + esc(nextTee ? E.to12(nextTee) : 'tee time to set') : 'That is the last card of the week.'}</span>
      ${next && next.noMulligans ? '<span class="un-red">No mulligans in the final.</span>' : ''}
    </div>

    <div class="folio">
      <span class="fl-r"></span>
      ${IMG.crest ? `<img src="${IMG.crest}" alt="">` : ''}
      <span class="fl-t">The Union Invitational · Belek, Türkiye · 2026</span>
      <span class="fl-r"></span>
    </div>
  </div>`;
}

/** Read the book, pick the round, put the page up. */
export async function boot(cfg) {
  const el = document.getElementById('recap');
  const q = new URLSearchParams(location.search);
  const IMG = window.UI_IMAGES || {};
  try {
    if (!window.__supabase || !cfg.url) throw new Error('the book is not reachable from here');
    const sb = window.__supabase.createClient(cfg.url, cfg.key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await sb.from('docs').select('path,doc')
      .or('path.eq.config/tournament,path.like.people/*,path.like.pairs/*,path.like.scores/*,path.like.bbb/*,path.like.recaps/*,path.like.photos/*')
      .limit(3000);
    if (error) throw error;
    const T = assemble(data);
    const shared = sharedRounds(T);
    let rid = q.get('r');
    if (rid !== 'week' && rid !== 'report' && (!rid || !E.roundDef(rid))) rid = shared[shared.length - 1] || E.recapRound(T, E.nowLocal());
    const r = rid === 'week' ? { full: 'The Tournament Recap' } : rid === 'report' ? { full: 'The Players Report' } : E.roundDef(rid) || {};
    const rec = T.recaps[rid];
    document.title = (rec && rec.body && rec.body.headline && rec.status === 'published' ? rec.body.headline + ' · ' : '') + (r.full || 'The Day\'s Recap') + ' · The Union Invitational';
    el.innerHTML = renderRecap(T, rid, IMG, { draft: q.get('draft') === '1', shared });
    slides(el);
    fullScreen(el);
    playerPops(el);
    window.__T = T; window.__rid = rid;    // read by the tests
  } catch (e) {
    el.innerHTML = `<div class="recapbox"><div class="recaptop"><b>The Day's Recap</b><a class="rm" href="../app/">Open the book</a></div>
      <p class="empty" style="padding:28px 0">Could not read the book just now${e && e.message ? ' (' + esc(e.message) + ')' : ''}. Try again when there is a signal.</p></div>`;
  }
}

/* A tap on a golfer in the players report opens their page over the summary; Done, the backdrop or Escape puts it away. */
function playerPops(el) {
  const close = () => { const o = document.getElementById('rpop'); if (o) o.remove(); document.body.classList.remove('rpop-open'); };
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-player]');
    if (!b) return;
    const pop = el.querySelector('.rp-pop[data-pop="' + b.getAttribute('data-player').replace(/"/g, '') + '"]');
    if (!pop) return;
    close();
    const o = document.createElement('div');
    o.id = 'rpop'; o.className = 'rpop'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true');
    o.innerHTML = '<div class="rpop-in"><button class="rpop-x" aria-label="Close">Done</button>' + pop.innerHTML + '</div>';
    o.addEventListener('click', ev => { if (ev.target === o || ev.target.closest('.rpop-x')) close(); });
    document.body.appendChild(o); document.body.classList.add('rpop-open');
    o.scrollTop = 0;
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
}
/* A tap on a photograph in the article opens it full screen; a tap, or Escape, puts it away. */
function fullScreen(el) {
  const close = () => { const o = document.getElementById('rfull'); if (o) o.remove(); };
  let list = [], at = 0;
  /* the ones in the same set (the front's, or the article's) are paged through with the arrows, a swipe, or the keys */
  const show = n => {
    const o = document.getElementById('rfull'); if (!o || !list.length) return;
    at = (n + list.length) % list.length;
    const b = list[at];
    o.querySelector('img').src = b.getAttribute('data-full');
    o.querySelector('.rfull-cap').textContent = (list.length > 1 ? (at + 1) + ' / ' + list.length + ' · ' : '') + (b.getAttribute('data-cap') || '');
  };
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-full]');
    if (!b) return;
    close();
    const grp = b.getAttribute('data-grp') || '';
    list = Array.from(el.querySelectorAll('[data-full]')).filter(x => (x.getAttribute('data-grp') || '') === grp);
    const o = document.createElement('div');
    o.id = 'rfull'; o.className = 'rfull'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-label', 'Photo, full screen');
    o.innerHTML = '<button class="rfull-x" aria-label="Close">Done</button>' + (list.length > 1 ? '<button class="rfull-nav l" aria-label="Previous photo">‹</button><button class="rfull-nav r" aria-label="Next photo">›</button>' : '') + '<img alt=""><div class="rfull-cap"></div>';
    o.addEventListener('click', ev => {
      const nav = ev.target.closest('.rfull-nav');
      if (nav) { ev.stopPropagation(); show(at + (nav.classList.contains('r') ? 1 : -1)); return; }
      close();
    });
    let x0 = null;
    o.addEventListener('touchstart', ev => { x0 = ev.touches[0].clientX; }, { passive: true });
    o.addEventListener('touchend', ev => { if (x0 == null) return; const dx = ev.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 50) { ev.preventDefault(); show(at + (dx < 0 ? 1 : -1)); } });
    document.body.appendChild(o);
    show(list.indexOf(b));
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') close();
    else if (document.getElementById('rfull') && e.key === 'ArrowRight') show(at + 1);
    else if (document.getElementById('rfull') && e.key === 'ArrowLeft') show(at - 1);
  });
}

/* The photographs across the top slide by on their own; a swipe takes over. */
function slides(el) {
  const track = el.querySelector('.rh-track');
  if (!track || track.children.length < 2) return;
  const count = el.querySelector('.rh-count b'), by = el.querySelector('.rh-count'), dots = el.querySelectorAll('.rh-dots i');
  let held = 0, i = 0;
  const show = n => {
    i = (n + track.children.length) % track.children.length;
    track.scrollTo({ left: i * track.clientWidth, behavior: 'smooth' });
  };
  const sync = () => {
    const n = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    if (count) count.textContent = String(n + 1);
    const who = track.children[n] && track.children[n].dataset.by;
    if (by) { const tail = by.childNodes[by.childNodes.length - 1]; if (tail && tail.nodeType === 3) tail.textContent = ' / ' + track.children.length + (who ? ' · ' + who : ''); }
    dots.forEach((d, k) => d.classList.toggle('on', k === n));
  };
  track.addEventListener('scroll', () => { sync(); }, { passive: true });
  track.addEventListener('touchstart', () => { held = Date.now(); }, { passive: true });
  setInterval(() => { if (document.hidden || Date.now() - held < 12000) return; show(Math.round(track.scrollLeft / Math.max(1, track.clientWidth)) + 1); }, 5000);
}
