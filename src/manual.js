/* The Union Invitational — the practice manual, drawn.
 *
 * One golfer's manual as HTML: the band with their grades, how to use it,
 * the week laid out as sessions, then the drills one after another, each
 * with its drawing, its scoring and its coach on video. The same HTML is
 * shown in the book (a sheet over the report), in the public report
 * page's pop-up, and on the manual's own page, where Save as PDF prints it.
 */
import * as D from './data.js';
import * as DR from './drills.js';
import { art } from './drillart.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const manualLink = pid => D.SITE_URL + 'manual/?p=' + encodeURIComponent(pid);
const gradeCls = g => (g ? ' rp-g' + g : ' rp-gN');
const hrs = m => (m >= 60 ? Math.round(m / 60 * 10) / 10 + ' h' : m + ' min');

/** The block under the three things on a report card: what the manual holds and the way in.
 *  `mode` is 'app' (a button opens the sheet in the book) or 'page' (a link to the manual's page). */
export function manualBlock(pr, mode) {
  const list = DR.manualFor(pr);
  if (!list.length) return '';
  const g = pr.grades || {};
  const worst = DR.DEPTS.filter(([k]) => g[k] === 'D' || g[k] === 'C').map(([, l]) => l.toLowerCase());
  return `<div class="rp-manual">
    <b>Practice manual</b>
    <p>${list.length} drills picked from this card${worst.length ? ': most of them for ' + esc(worst.slice(0, 3).join(', ')) : ''}, each with a drawing, a way to score it and a coach on video.</p>
    <div class="rp-mbtns">${mode === 'app' ? `<button class="btn" data-act="manualOpen" data-a="${esc(pr.id)}">Open the manual</button>` : ''}
      <a class="btn${mode === 'app' ? ' ghost' : ''}" href="${esc(manualLink(pr.id))}" target="_blank" rel="noopener">${mode === 'app' ? 'The page · save as PDF' : 'Open the manual · save as PDF'}</a></div>
  </div>`;
}

/** The whole manual. `words` is the coach's page for this golfer (recaps/report body.players[pid]) or null. */
export function renderManual(pr, words, opts) {
  opts = opts || {};
  const list = DR.manualFor(pr);
  const g = pr.grades || {};
  const plan = DR.weekPlan(list);
  const three = words && Array.isArray(words.three) ? words.three : [];
  const read = words && words.read ? String(words.read) : '';
  const total = list.reduce((a, d) => a + d.mins, 0);
  const drill = (d, i) => `<li class="mn-drill" id="mn-${esc(d.id)}">
    <div class="mn-head"><span class="mn-n num">${i + 1}</span>
      <div class="mn-hw"><h3>${esc(d.name)}</h3><small>${esc(DR.AREAS[d.where] || d.where)}${d.mins ? ' · ' + esc(hrs(d.mins)) : ''} · ${esc(d.kit)}</small></div>
      ${d.forDept ? `<span class="mn-for"><em>${esc(DR.deptLabel(d.forDept))}</em><b class="rp-gl${gradeCls(d.forGrade)}">${esc(d.forGrade || '–')}</b></span>` : '<span class="mn-for"><em>Everyone</em></span>'}</div>
    <figure class="mn-art">${art(d.art)}</figure>
    <p class="mn-why">${esc(d.why)}</p>
    <div class="mn-cols">
      <div><h4>Set up</h4><ul>${d.setup.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
      <div><h4>The drill</h4><ol>${d.steps.map(x => `<li>${esc(x)}</li>`).join('')}</ol></div>
    </div>
    <dl class="mn-score"><div><dt>Score it</dt><dd>${esc(d.score)}</dd></div><div><dt>Target</dt><dd>${esc(d.target)}</dd></div><div><dt>Harder</dt><dd>${esc(d.harder)}</dd></div></dl>
    ${d.video && d.video.url ? `<a class="mn-video" href="${esc(d.video.url)}" target="_blank" rel="noopener"><span class="mn-play" aria-hidden="true">▶</span><span><b>Watch ${esc(d.video.who)}</b><small>${esc(d.video.title)} · YouTube</small></span></a>` : ''}
  </li>`;
  return `<div class="manual" data-golfer="${esc(pr.id)}">
    <div class="rp-band mn-band"><small>Practice manual · The Union Invitational · Belek 2026</small><h2>${esc(pr.name)}</h2>
      <p>${pr.band == null ? 'No handicap' : 'Handicap ' + esc(pr.band)} · ${list.length} drills · about ${esc(hrs(total))} a week, over ${plan.length} session${plan.length === 1 ? '' : 's'}</p></div>
    <div class="mn-body">
      <div class="mn-grades">${DR.DEPTS.map(([k, l]) => `<span class="mn-g"><b class="rp-gl${gradeCls(g[k])}">${esc(g[k] || '–')}</b><small>${esc(l)}</small></span>`).join('')}</div>
      ${read ? `<p class="mn-read">${esc(read)}</p>` : ''}
      ${three.length ? `<div class="rp-three mn-three"><b>The coach’s three things</b><ol>${three.map(x => `<li>${esc(x)}</li>`).join('')}</ol></div>` : ''}
      <h3 class="mn-h">How to use this</h3>
      <p class="mn-p">Every drill here was picked from your card: the department you scored worst in gets the most, every department graded C or D gets at least one, and two go to everybody. Each drill has a score, so you know whether today was better than last week, and a target that is right for a golfer playing off ${pr.band == null ? 'your handicap' : esc(pr.band)}. Do the sessions below in the order they come, and write the scores on the card.</p>
      <div class="mn-plan">${plan.map(s => `<div class="mn-sess"><b>${esc(s.name)}</b><small>${s.mins ? esc(hrs(s.mins)) : 'as you go'}</small><span>${s.drills.map(d => `<a href="#mn-${esc(d.id)}">${esc(d.name)}</a>`).join(' · ')}</span></div>`).join('')}</div>
      <ol class="mn-list">${list.map(drill).join('')}</ol>
      <p class="mn-foot">The drills are the book’s own words; the videos are the coaches’ and open on YouTube. Scores are yours. Keep them.${opts.link === false ? '' : ' The manual lives at ' + esc(manualLink(pr.id)) + '.'}</p>
    </div>
  </div>`;
}
