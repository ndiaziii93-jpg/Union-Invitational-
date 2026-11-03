/* THE FEEDBACK FORM. One definition, drawn the same way twice: in the book,
   as a window that comes up on every open until it is answered, and on a
   page of its own for the link in the WhatsApp. The answers go to a table
   only the master PIN can read (docs/supabase-feedback.sql). */
export const FORM_V = 'a';
export const WAS = [['golfer', 'A golfer'], ['spectator', 'A spectator']];
export const SECTIONS = [
  { id: 'golf', label: 'The golf', rows: [['aspendos', 'Cullinan Aspendos'], ['olympos', 'Cullinan Olympos'], ['clubhouse', 'The clubhouse'], ['format', 'The format & side games']] },
  { id: 'resort', label: 'The resort', rows: [['hotel', 'The hotel & rooms'], ['food', 'Food & drink'], ['evenings', 'The evenings']] },
  { id: 'app', label: 'The app', rows: [['app_scoring', 'Scoring'], ['app_boards', 'Boards & leaderboards'], ['app_chat', 'The chat'], ['app_photos', 'Photos'], ['app_recaps', 'The recaps'], ['app_bets', 'The bets']] },
  { id: 'org', label: 'The organisation', rows: [['organisation', 'Travel, communication, money']] },
];
export const BOXES = [
  ['best', 'Best moment of the week', 'One line', true],
  ['keep', 'What should we keep?', 'The things that worked'],
  ['change', 'What should we change?', 'What didn’t work, or could be better'],
  ['add', 'What should we add next year?', 'New ideas: a game, a night out, a different course, anything'],
];
export const AGAIN = [['yes', 'Yes, book me in'], ['probably', 'Probably'], ['depends', 'Depends'], ['no', 'No']];
export const STAR_LABEL = Object.fromEntries(SECTIONS.flatMap(s => s.rows));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const blank = () => ({ v: FORM_V, name: '', was: 'golfer', stars: {}, best: '', keep: '', change: '', add: '', again: '' });

/** The form's body, drawn from the answers so far. Every control carries data-fb, so the book's one click handler and the page's own can both read it. */
export function formHtml(a) {
  a = { ...blank(), ...(a || {}) }; a.stars = a.stars || {};
  const stars = k => `<div class="fb-stars" role="radiogroup" aria-label="${esc(STAR_LABEL[k])}">${[1, 2, 3, 4, 5].map(n =>
    `<button type="button" class="fb-star${(a.stars[k] || 0) >= n ? ' on' : ''}" data-act="fbStar" data-fb="${k}" data-a="${n}" aria-label="${n} star${n === 1 ? '' : 's'}" aria-pressed="${a.stars[k] === n}">★</button>`).join('')}</div>`;
  const chips = (key, opts) => `<div class="fb-chips">${opts.map(([k, l]) => `<button type="button" class="fb-chip${a[key] === k ? ' on' : ''}" data-act="fbChip" data-fb="${key}" data-a="${k}">${esc(l)}</button>`).join('')}</div>`;
  return `<div class="fb-q"><label for="fb_name">Your name <small>(optional)</small></label><input type="text" id="fb_name" class="fb-in" data-fb="name" value="${esc(a.name)}" placeholder="Leave blank to stay anonymous" autocomplete="off" maxlength="60"></div>
  <div class="fb-q"><span class="fb-l">I was</span>${chips('was', WAS)}</div>
  ${SECTIONS.map(s => `<div class="fb-sec"><b>${esc(s.label)}</b></div>${s.rows.map(([k, l]) => `<div class="fb-rate"><span>${esc(l)}</span>${stars(k)}</div>`).join('')}`).join('')}
  ${BOXES.map(([k, l, ph, one]) => `<div class="fb-q"><label for="fb_${k}">${esc(l)}</label>${one
    ? `<input type="text" id="fb_${k}" class="fb-in" data-fb="${k}" value="${esc(a[k])}" placeholder="${esc(ph)}" autocomplete="off" maxlength="300">`
    : `<textarea id="fb_${k}" class="fb-in" data-fb="${k}" placeholder="${esc(ph)}" rows="3" maxlength="2000">${esc(a[k])}</textarea>`}</div>`).join('')}
  <div class="fb-q"><span class="fb-l">Would you come again?</span>${chips('again', AGAIN)}</div>`;
}
/** The answers, read off the drawn form: the page's way (the book keeps them in its state as they are typed). */
export function readForm(root) {
  const a = blank();
  root.querySelectorAll('.fb-in[data-fb]').forEach(el => { a[el.dataset.fb] = String(el.value || ''); });
  root.querySelectorAll('.fb-chip.on[data-fb]').forEach(el => { a[el.dataset.fb] = el.dataset.a; });
  root.querySelectorAll('.fb-stars').forEach(g => { const on = g.querySelectorAll('.fb-star.on').length, first = g.querySelector('.fb-star'); if (on && first) a.stars[first.dataset.fb] = on; });
  return a;
}
/** Nothing said at all: no stars, no words, no answer on coming again. */
export const empty = a => !a || (!Object.keys(a.stars || {}).length && !['best', 'keep', 'change', 'add'].some(k => String(a[k] || '').trim()) && !a.again);
/** What goes to the server: trimmed, capped, nothing else. */
export function tidy(a) {
  const out = { v: FORM_V, stars: {} };
  for (const k of ['name', 'was', 'best', 'keep', 'change', 'add', 'again']) out[k] = String((a || {})[k] || '').trim().slice(0, k === 'name' ? 60 : 2000);
  for (const [k, n] of Object.entries((a || {}).stars || {})) if (STAR_LABEL[k] && n >= 1 && n <= 5) out.stars[k] = Math.round(n);
  return out;
}
const againWord = k => ((AGAIN.find(x => x[0] === k) || [])[1] || k || '').replace(', book me in', '');
/** The commissioner's view: an average a row, then every answer, newest first. */
export function summaryHtml(rows, when) {
  rows = rows || [];
  const docs = rows.map(r => r.doc || {}), n = docs.length;
  const avg = k => { const v = docs.map(d => (d.stars || {})[k]).filter(x => x >= 1); return v.length ? [v.reduce((s, x) => s + x, 0) / v.length, v.length] : null; };
  const spect = docs.filter(d => d.was === 'spectator').length;
  const again = AGAIN.map(([k]) => [againWord(k), docs.filter(d => d.again === k).length]).filter(x => x[1]);
  return `<div class="fb-sum">
    <p class="fb-n"><b>${n}</b> answer${n === 1 ? '' : 's'}${spect ? ' · ' + spect + ' from spectator' + (spect === 1 ? '' : 's') : ''}${again.length ? ' · come again: ' + again.map(x => x[0] + ' ' + x[1]).join(', ') : ''}</p>
    ${SECTIONS.map(s => `<div class="fb-sec"><b>${esc(s.label)}</b></div>${s.rows.map(([k, l]) => { const a = avg(k);
      return `<div class="fb-rate"><span>${esc(l)}</span><span class="fb-avg">${a ? `<b>${a[0].toFixed(1)}</b> <small>★ · ${a[1]}</small>` : '<small>—</small>'}</span></div>`; }).join('')}`).join('')}
    <div class="fb-sec"><b>Every answer</b></div>
    ${rows.map(r => { const d = r.doc || {}; return `<div class="fb-one"><div class="fb-who"><b>${esc(d.name || 'Anonymous')}</b> <small>${d.was === 'spectator' ? 'spectator' : 'golfer'}${d.again ? ' · ' + esc(againWord(d.again)) : ''}${when && r.at ? ' · ' + esc(when(r.at)) : ''}</small></div>
      ${Object.keys(d.stars || {}).length ? `<div class="fb-mini">${SECTIONS.flatMap(s => s.rows).filter(([k]) => d.stars[k]).map(([k, l]) => `<span>${esc(l)} <b>${d.stars[k]}</b></span>`).join('')}</div>` : ''}
      ${BOXES.filter(([k]) => String(d[k] || '').trim()).map(([k, l]) => `<p><i>${esc(l)}</i><br>${esc(d[k])}</p>`).join('')}</div>`; }).join('') || '<p class="fb-empty">Nobody has answered yet.</p>'}
  </div>`;
}
/** The same, as plain text, for copying out. */
export function summaryText(rows, when) {
  const L = [];
  for (const r of rows || []) {
    const d = r.doc || {};
    L.push((d.name || 'Anonymous') + ' (' + (d.was === 'spectator' ? 'spectator' : 'golfer') + (d.again ? ', come again: ' + againWord(d.again) : '') + (when && r.at ? ', ' + when(r.at) : '') + ')');
    const st = SECTIONS.flatMap(s => s.rows).filter(([k]) => (d.stars || {})[k]).map(([k, l]) => l + ' ' + d.stars[k]);
    if (st.length) L.push('  Stars: ' + st.join(', '));
    for (const [k, l] of BOXES) if (String(d[k] || '').trim()) L.push('  ' + l + ' ' + d[k].trim());
    L.push('');
  }
  return L.join('\n').trim();
}
