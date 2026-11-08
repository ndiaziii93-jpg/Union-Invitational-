/* The Union Invitational — the practice manual's own page (docs/manual/).
 *
 * One link a golfer: ?p=g3 opens their manual, read live from the book
 * the way the recap page reads it, laid out for a phone and for paper.
 * Save as PDF is the browser's own print; the stylesheet turns the page
 * into a document for it. With no golfer named, the page lists them. */
import * as E from './engine.js';
import { fieldReport } from './report.js';
import { renderManual } from './manual.js';
import { assemble } from './recappage.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function renderIndex(F) {
  return `<div class="manual mn-index">
    <div class="rp-band mn-band"><small>Practice manual · The Union Invitational · Belek 2026</small><h2>The golfers</h2><p>A manual a golfer, picked from their report card. Tap a name.</p></div>
    <div class="mn-body"><div class="rp-list">${F.players.map(p => `<a class="rp-row" href="?p=${encodeURIComponent(p.id)}"><span class="rp-rw"><b>${esc(p.name)}</b><small>${p.band == null ? 'no handicap' : 'hcp ' + esc(p.band)}</small></span><span class="rp-go" aria-hidden="true">›</span></a>`).join('')}</div></div>
  </div>`;
}

export async function boot(cfg) {
  const el = document.getElementById('manual');
  const q = new URLSearchParams(location.search);
  try {
    if (!window.__supabase || !cfg.url) throw new Error('the book is not reachable from here');
    const sb = window.__supabase.createClient(cfg.url, cfg.key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await sb.from('docs').select('path,doc')
      .or('path.eq.config/tournament,path.like.people/*,path.like.pairs/*,path.like.scores/*,path.like.bbb/*,path.like.recaps/*')
      .limit(3000);
    if (error) throw error;
    const T = assemble(data);
    const F = fieldReport(T, E.nowLocal());
    const pid = q.get('p');
    const pr = pid ? F.players.find(p => p.id === pid) : null;
    const rep = T.recaps.report, body = rep && rep.body && typeof rep.body === 'object' ? rep.body : null;
    const words = pr && body && body.players ? body.players[pr.id] : null;
    document.title = (pr ? pr.name + '’s practice manual' : 'The practice manual') + ' · The Union Invitational';
    el.innerHTML = pr ? renderManual(pr, words, { link: false }) : renderIndex(F);
    const bar = document.getElementById('mnbar');
    if (bar) bar.hidden = !pr;
    window.__T = T; window.__pid = pr ? pr.id : null;    // read by the tests
  } catch (e) {
    el.innerHTML = `<div class="manual"><div class="rp-band mn-band"><small>Practice manual</small><h2>Could not read the book</h2><p>${esc(e && e.message ? e.message : 'Try again when there is a signal.')}</p></div></div>`;
  }
}
