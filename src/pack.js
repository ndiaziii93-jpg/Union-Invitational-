/* The Union Invitational — the social pack.
 *
 * One tap in Manage and the commissioner's phone or laptop packs the week
 * for whoever runs the accounts: every photograph and clip in the book,
 * the screens that matter drawn as pictures, the recaps and the coach's
 * notes as words, and a manifest that says what everything is. It is the
 * export the social media plan specifies (manifest.json, screenshots/,
 * media/, recap.md) with a README and a posting plan beside it.
 *
 * Nothing here talks to the server on its own: the photographs come from
 * the book's own photo store by their public addresses, the screens are
 * the app's own renderers drawn into a picture on this device, and the zip
 * is put together here and handed to the browser to save. No library: a
 * zip that stores its files unchanged is a few hundred bytes of headers,
 * and photographs and clips do not compress anyway.
 */
import * as D from './data.js';
import * as E from './engine.js';
import * as RP from './report.js';

/* ---------------- the edition ---------------- */
export const EDITION = {
  number: 2, name: 'Second Edition', year: 2026, country: 'Türkiye', city: 'Belek, Antalya',
  venue: D.EVENT.venue, dates: D.EVENT.startISO + ' to ' + D.EVENT.endISO,
  previous: [{ number: 1, name: 'First Edition', year: 2025, country: 'United Kingdom' }],
  next: { number: 3, name: 'Third Edition', year: 2027, country: 'USA', city: 'Las Vegas', line: 'A Desert Showdown' },
};
export const HASHTAGS = ['#UnionInvitational', '#HighRollersClub'];

/* ---------------- a zip that stores ---------------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(bytes, crc = 0) {
  let c = (crc ^ 0xFFFFFFFF) >>> 0;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
const CHUNK = 8 * 1024 * 1024;
/** The CRC of a blob, read a slice at a time so a clip is never held twice. */
async function crcOfBlob(blob) {
  let crc = 0;
  for (let off = 0; off < blob.size; off += CHUNK) crc = crc32(new Uint8Array(await blob.slice(off, off + CHUNK).arrayBuffer()), crc);
  return crc;
}
const dosTime = d => ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF;
const dosDate = d => (((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
const enc = new TextEncoder();
function header(sig, fields) {
  const n = fields.reduce((a, [w]) => a + w, 4), b = new Uint8Array(n), v = new DataView(b.buffer);
  v.setUint32(0, sig, true);
  let o = 4;
  for (const [w, val] of fields) { if (w === 2) v.setUint16(o, val, true); else v.setUint32(o, val >>> 0, true); o += w; }
  return b;
}
/** entries: [{ name, data (Blob | Uint8Array | string), at (Date) }] → a zip Blob, stored. */
export async function zipBlob(entries, onFile) {
  const parts = [], central = [];
  let off = 0, i = 0;
  for (const e of entries) {
    const name = enc.encode(e.name);
    const blob = e.data instanceof Blob ? e.data : new Blob([typeof e.data === 'string' ? enc.encode(e.data) : e.data]);
    const crc = await crcOfBlob(blob), at = e.at || new Date(), size = blob.size;
    const local = header(0x04034b50, [[2, 20], [2, 0x0800], [2, 0], [2, dosTime(at)], [2, dosDate(at)], [4, crc], [4, size], [4, size], [2, name.length], [2, 0]]);
    parts.push(local, name, blob);
    central.push(header(0x02014b50, [[2, 20], [2, 20], [2, 0x0800], [2, 0], [2, dosTime(at)], [2, dosDate(at)], [4, crc], [4, size], [4, size], [2, name.length], [2, 0], [2, 0], [2, 0], [2, 0], [4, 0], [4, off]]), name);
    off += local.length + name.length + size;
    if (onFile) onFile(++i, entries.length, e.name);
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0);
  parts.push(...central, header(0x06054b50, [[2, 0], [2, 0], [2, entries.length], [2, entries.length], [4, cdSize], [4, off], [2, 0]]));
  if (off + cdSize > 0xFFFFFFFF || entries.length > 0xFFFF) throw new Error('too big for one zip: split the pack');
  return new Blob(parts, { type: 'application/zip' });
}

/* ---------------- names ---------------- */
export const slug = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'x';
export const firstName = s => String(s || '').trim().split(/\s+/)[0] || '';
/** R1 / R2 / R3 / PR for the practice day / TRIP for everything off the course / WEEK for the edition. */
export const roundToken = rid => rid === 'week' ? 'WEEK' : rid === 'trip' || !rid ? 'TRIP' : rid === 'practice' ? 'PR' : String(rid).toUpperCase();
export const roundNumber = rid => { const m = /^r(\d+)$/.exec(String(rid || '')); return m ? +m[1] : null; };
export const localDate = ms => new Date((ms || 0) + D.TZ_OFFSET_MIN * 60000);
/** 2026-11-01T16:42:00+03:00 */
export function iso(ms) {
  if (!ms) return null;
  const d = localDate(ms), p = n => String(n).padStart(2, '0');
  const z = D.TZ_OFFSET_MIN, sg = z < 0 ? '-' : '+';
  return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) + 'T' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':' + p(d.getUTCSeconds()) + sg + p(Math.floor(Math.abs(z) / 60)) + ':' + p(Math.abs(z) % 60);
}
export const hhmm = ms => { const d = localDate(ms); return String(d.getUTCHours()).padStart(2, '0') + String(d.getUTCMinutes()).padStart(2, '0'); };
const extOf = ph => {
  const m = String(ph.mime || '').toLowerCase();
  if (ph.kind === 'video') return m.includes('quicktime') ? 'mov' : m.includes('webm') ? 'webm' : 'mp4';
  if (m.includes('png')) return 'png'; if (m.includes('webp')) return 'webp'; if (m.includes('heic')) return 'heic';
  const u = String(ph.url || '').split('?')[0], e = (u.match(/\.([a-z0-9]{3,4})$/i) || [])[1];
  return e ? e.toLowerCase() : 'jpg';
};
/** R2_H07_matt_1642.jpg: the spec's order, so a folder reads in order without opening anything. */
export function mediaName(ph, byFirst, taken) {
  return [roundToken(ph.rid), ph.hole != null ? 'H' + String(ph.hole + 1).padStart(2, '0') : null, slug(byFirst || 'someone'), hhmm(taken || ph.at)].filter(Boolean).join('_') + '.' + extOf(ph);
}
/** Names that were taken already get a letter: _b, _c. */
export function unique(name, used) {
  if (!used.has(name)) { used.add(name); return name; }
  const dot = name.lastIndexOf('.'), stem = name.slice(0, dot), ext = name.slice(dot);
  for (let i = 1; ; i++) { const n = stem + '_' + String.fromCharCode(97 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : '') + ext; if (!used.has(n)) { used.add(n); return n; } }
}

/* ---------------- the manifest ---------------- */
const half = n => (Number.isInteger(n) ? String(n) : Math.floor(n) + '½');
const ord = n => n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');
export const roundName = rid => rid === 'week' ? 'The week' : rid === 'trip' ? 'The trip' : (E.roundDef(rid) || {}).short === 'Practice' ? 'Practice' : 'Round ' + roundNumber(rid);
function courseJson(T, key) {
  const c = E.courseByKey(T, key);
  return { key, name: c.name, par: c.holes.reduce((a, h) => a + h.par, 0), hole_pars: c.holes.map(h => h.par), stroke_index: c.holes.map(h => h.si), metres_yellow: c.holes.map(h => h.mY) };
}
export function playersJson(T) {
  return (T.config.people || []).filter(p => p.role === 'golfer' || p.role === 'official').map(p => ({
    id: p.id, display_name: p.display, first_name: firstName(p.display), team: p.location || null, handicap_band: p.band == null ? null : p.band, role: p.role,
    pair_id: ((T.config.pairs || []).find(x => (x.members || []).includes(p.id)) || {}).id || null,
    handles: { instagram: null, x: null, tiktok: null, youtube: null },
    /* the book does not keep consent yet: null is "not asked", never "yes" */
    consent: { face: null, name: null, tag: null },
  }));
}
function roundJson(T, rid) {
  const r = E.roundDef(rid); if (!r) return null;
  const cfg = E.roundCfg(T, rid) || {}, st = E.roundStanding(T, rid);
  return { id: rid, number: roundNumber(rid), name: r.full, date: E.dayOf(r.dayIdx).iso, course: E.courseOf(T, rid).name, format: r.format, counts: !!r.counts,
    scoring: { gross_cap: 'par + ' + T.config.capOver + (T.config.capOver === 3 ? ' (triple bogey)' : ''), breakfast_ball: 'one, on the first tee', mulligans: r.noMulligans ? 'none' : 'one per nine', team_allowance_pct: E.teamAllowance(T) },
    status: st.complete ? 'final' : st.started ? 'in_progress' : 'not_started', first_tee: ((cfg.tees || [])[0] || {}).time || r.firstTee || null,
    closest_to_pin: cfg.ctpHole ? { hole: cfg.ctpHole, winner: cfg.ctpWinner || null } : null,
    longest_drive: cfg.ldHole ? { hole: cfg.ldHole, winner: cfg.ldWinner || null, distance: cfg.ldDist || null } : null };
}
export function competitionsJson(T, now, rids) {
  const out = [], pairs = E.pairsBoard(T, now), mvp = E.mvpBoard(T, now), bbb = E.bbbBoard(T), cup = E.ryderData(T, now);
  const pairOf = id => (T.config.pairs || []).find(p => p.id === id) || { members: [] };
  out.push({ id: 'pairs', name: 'Team Competition', type: 'pairs_net', scoring: 'four-ball Stableford, better ball, the counting rounds added', leader_changed: null,
    standings: pairs.map(x => ({ rank: x.pos, pair_id: x.id, name: x.name, player_ids: pairOf(x.id).members, value: x.total, value_label: x.total + ' pts', raw_label: x.gTotalStr, thru: x.thru, movement: null,
      rounds: Object.fromEntries(E.countingRounds(T).map(r => { const row = E.pairRoundBoard(T, r.id).find(y => y.id === x.id); return [r.id, row ? row.today : null]; })) })) });
  out.push({ id: 'mvp', name: 'Tournament MVP', type: 'individual_net', scoring: 'net to par, every stroke counted, the counting rounds added', leader_changed: null,
    standings: mvp.map(x => ({ rank: x.pos, player_ids: [x.id], name: x.name, handicap_band: x.band, value: x.total, value_label: x.totalStr + ' net', raw_label: x.gTotalStr + ' raw', thru: x.thru, movement: null,
      rounds: Object.fromEntries(E.countingRounds(T).map(r => { const row = E.recapField(T, r.id).find(y => y.id === x.id); return [r.id, row ? { gross: row.strokes, raw_to_par: row.raw, net_to_par: row.net } : null]; })) })) });
  out.push({ id: 'ryder_cup', name: 'Ryder Cup', type: 'ryder_cup', scoring: 'singles match play on the same cards, net; a point a match, half for a halve', leader_changed: null,
    standings: [{ rank: cup.ukTotal >= cup.usaTotal ? 1 : 2, team: 'UK', name: 'United Kingdom', value: cup.ukTotal, value_label: half(cup.ukTotal) },
                { rank: cup.usaTotal > cup.ukTotal ? 1 : 2, team: 'USA', name: 'United States', value: cup.usaTotal, value_label: half(cup.usaTotal) }].sort((a, b) => a.rank - b.rank),
    sessions: cup.sessions.filter(s => rids.includes(s.id)).map(s => ({ round: s.id, label: s.label, uk: s.uk, usa: s.usa, sitting_out: s.sitting,
      matches: s.matches.map(m => ({ uk: m.aId, usa: m.bId, result: m.done ? (m.up > 0 ? 'UK' : m.up < 0 ? 'USA' : 'halved') : null, status: m.status, up: m.up, thru: m.thru })) })) });
  if (bbb.length) out.push({ id: 'bbb', name: 'Bingo Bango Bongo', type: 'points', scoring: 'three points a hole: first on, closest once all are on, first in', leader_changed: null,
    standings: bbb.map(x => ({ rank: x.pos, player_ids: [x.id], name: x.name, value: x.pts, value_label: x.pts + ' pts', thru: null, movement: null,
      rounds: Object.fromEntries(E.countingRounds(T).map(r => { const row = E.bbbRoundBoard(T, r.id).find(y => y.id === x.id); return [r.id, row ? row.pts : 0]; })) })) });
  for (const r of E.countingRounds(T).filter(r => rids.includes(r.id))) {
    const c = E.roundCfg(T, r.id) || {};
    if (c.ctpWinner) out.push({ id: 'ctp_' + r.id, name: 'Closest to the pin · ' + roundName(r.id), type: 'ctp', round: r.id, hole: c.ctpHole || null, standings: [{ rank: 1, player_ids: [c.ctpWinner], name: (E.person(T, c.ctpWinner) || {}).display, value: null, value_label: 'hole ' + c.ctpHole }] });
    if (c.ldWinner) out.push({ id: 'long_drive_' + r.id, name: 'Longest drive · ' + roundName(r.id), type: 'long_drive', round: r.id, hole: c.ldHole || null, standings: [{ rank: 1, player_ids: [c.ldWinner], name: (E.person(T, c.ldWinner) || {}).display, value: c.ldDist || null, value_label: c.ldDist || ('hole ' + c.ldHole) }] });
  }
  return out;
}
/** What is worth a post, read off the cards: nothing typed, nothing invented. */
export function highlightsJson(T, now, rids, env) {
  const out = [];
  const nm = id => (E.person(T, id) || {}).display || id;
  for (const r of E.countingRounds(T).filter(r => rids.includes(r.id))) {
    const holes = E.courseOf(T, r.id).holes, iso0 = E.dayOf(r.dayIdx).iso;
    for (const g of E.golfers(T)) {
      const s = RP.roundStats(T, r.id, g.id); if (!s) continue;
      let run = [];
      const flush = () => { if (run.length >= 2) out.push({ type: 'birdie_run', round: r.id, player_ids: [g.id], hole: run[0] + 1, value: run.length, value_label: run.length + ' in a row', note: nm(g.id) + ' went ' + run.length + ' under in a row from the ' + ord(run[0] + 1) + ' (' + run.map(h => h + 1).join(', ') + ')' }); run = []; };
      for (const h of s.holes) {
        if (!h) { flush(); continue; }
        if (h.raw === 1) out.push({ type: 'hole_in_one', round: r.id, player_ids: [g.id], hole: h.h + 1, value: 1, value_label: 'ace', note: nm(g.id) + ' holed the tee shot on the ' + ord(h.h + 1) + ', par ' + h.par });
        else if (h.over <= -2) out.push({ type: 'eagle', round: r.id, player_ids: [g.id], hole: h.h + 1, value: h.over, value_label: h.over <= -3 ? 'albatross' : 'eagle', note: nm(g.id) + ' made ' + h.raw + ' on the par-' + h.par + ' ' + ord(h.h + 1) });
        if (h.over <= -1) run.push(h.h); else flush();
        if (h.over >= 4 && !h.pu) out.push({ type: 'collapse', round: r.id, player_ids: [g.id], hole: h.h + 1, value: h.over, value_label: '+' + h.over, note: nm(g.id) + ' took ' + h.raw + ' on the par-' + h.par + ' ' + ord(h.h + 1) + (h.marks.includes('ob') ? ', out of bounds' : h.marks.includes('water') ? ', in the water' : '') });
      }
      flush();
      if (s.full && s.ptsB - s.ptsF >= 5) out.push({ type: 'comeback', round: r.id, player_ids: [g.id], hole: 10, value: s.ptsB - s.ptsF, value_label: '+' + (s.ptsB - s.ptsF) + ' pts on the back', note: nm(g.id) + ' turned in ' + s.ptsF + ' points and came home in ' + s.ptsB });
      if (s.full && s.gross <= 79) out.push({ type: 'round', round: r.id, player_ids: [g.id], hole: null, value: s.gross, value_label: s.gross + ' gross', note: nm(g.id) + ' shot ' + s.gross + ' at ' + s.course.replace('Cullinan ', '') });
    }
    const c = E.roundCfg(T, r.id) || {};
    if (c.ctpWinner) out.push({ type: 'ctp_set', round: r.id, player_ids: [c.ctpWinner], hole: c.ctpHole || null, value: null, value_label: 'closest to the pin', note: nm(c.ctpWinner) + ' closest to the pin on ' + (c.ctpHole || '?') + ' (' + iso0 + ')' });
    if (c.ldWinner) out.push({ type: 'long_drive_set', round: r.id, player_ids: [c.ldWinner], hole: c.ldHole || null, value: c.ldDist || null, value_label: c.ldDist || 'longest drive', note: nm(c.ldWinner) + ' longest drive on ' + (c.ldHole || '?') + (c.ldDist ? ', ' + c.ldDist : '') });
    const sotd = env && env.sotd ? env.sotd(r.id) : null;
    if (sotd) out.push({ type: 'shot_of_the_day', round: r.id, player_ids: [sotd.pid], hole: sotd.hole + 1, value: null, value_label: 'shot of the day', note: nm(sotd.pid) + ', hole ' + (sotd.hole + 1) + ': "' + sotd.t + '"' + (sotd.byName ? ' (nominated by ' + sotd.byName + ')' : '') });
    const sess = E.ryderData(T, now).sessions.find(s => s.id === r.id);
    if (sess) for (const m of sess.matches) if (m.done && m.up) out.push({ type: 'ryder_point', round: r.id, player_ids: [m.up > 0 ? m.aId : m.bId], hole: null, value: Math.abs(m.up), value_label: m.status, note: (m.up > 0 ? m.a + ' (UK) beat ' + m.b + ' (USA)' : m.b + ' (USA) beat ' + m.a + ' (UK)') + ' ' + m.status });
  }
  return out;
}
function teeSheetJson(T, rid) {
  if (!rid || rid === 'week') return [];
  return E.groups(T, rid).filter(g => (g.members || []).length).map((g, i) => ({ time: g.time ? E.dayOf(E.roundDef(rid).dayIdx).iso + 'T' + g.time + ':00+03:00' : null, group: i + 1, label: g.label, player_ids: g.members, pair_ids: g.pairIds || [], official_id: null }));
}

/* ---------------- words ---------------- */
export function recapMd(T, env, rids) {
  const L = ['# The Union Invitational · Belek 2026 · the words', '', 'Everything the book wrote about the week, as it was published to the group. Quote it, cut it, never contradict it: every number in it is on a card.', ''];
  const who = id => (E.person(T, id) || {}).display || (() => { const pr = (T.config.pairs || []).find(x => x.id === id); return pr ? E.pairName(T, pr) : id; })();
  const recap = (rid, title) => {
    const rec = T.recaps[rid], b = rec && rec.body; if (!b || typeof b !== 'object') return;
    L.push('## ' + title, '');
    if (b.headline) L.push('**' + b.headline + '**', '');
    (b.narrative || []).filter(x => x && String(x).trim()).forEach(p => L.push(p, ''));
    if (b.swing && b.swing.value) L.push('*The number: ' + b.swing.value + (b.swing.caption ? ' — ' + b.swing.caption : '') + '*', '');
    const hs = (b.honours || []).filter(h => h.winner);
    if (hs.length) { L.push('Honours:', ''); hs.forEach(h => L.push('- ' + (env.honourLabel(h.slot) || h.slot) + ' — ' + who(h.winner) + (h.citation ? ': ' + h.citation : ''))); L.push(''); }
    const pn = Object.entries(b.pairNotes || {}).filter(([, v]) => v);
    if (pn.length) { L.push('The pairs:', ''); pn.forEach(([id, v]) => L.push('- ' + who(id) + ': ' + v)); L.push(''); }
    const vs = (b.voices || []).filter(v => v && (v.text || v.quote));
    if (vs.length) { L.push('What the golfers said:', ''); vs.forEach(v => L.push('- ' + (v.who ? who(v.who) + ': ' : '') + '"' + (v.text || v.quote) + '"')); L.push(''); }
    L.push('Public page: ' + D.SITE_URL + 'recap/?r=' + rid, '');
  };
  if (rids.includes('week')) recap('week', 'The Tournament Recap');
  for (const r of D.ROUNDS) if (rids.includes(r.id) || rids.includes('week')) recap(r.id, r.full + ' · ' + E.dayOf(r.dayIdx).dow + ' ' + E.dayOf(r.dayIdx).date);
  const rep = T.recaps.report, rb = rep && rep.body && typeof rep.body === 'object' ? rep.body : null;
  if (rb && (rids.includes('week'))) {
    L.push('## The State of the Union · the players report', '');
    (rb.summary || []).forEach(p => L.push(p, ''));
    for (const g of E.golfers(T)) {
      const w = rb.players && rb.players[g.id]; if (!w) continue;
      L.push('### ' + g.display, '');
      if (w.read) L.push('*' + w.read + '*', '');
      (w.letter || []).forEach(p => L.push(p, ''));
      if ((w.three || []).length) { L.push('Three things:', ''); w.three.forEach((t, i) => L.push((i + 1) + '. ' + t)); L.push(''); }
    }
    L.push('Public page: ' + D.SITE_URL + 'recap/?r=report', '');
  }
  return L.join('\n');
}
export const fmtBytes = n => n >= 1e9 ? (n / 1e9).toFixed(2) + ' GB' : n >= 1e6 ? Math.round(n / 1e6) + ' MB' : Math.round(n / 1e3) + ' KB';
export function readmeMd(M, counts) {
  const S = M.export.scope === 'edition' ? 'the whole ' + EDITION.name.toLowerCase() : M.round ? M.round.name : 'a selection';
  return `# The Union Invitational · Belek 2026 · social pack

Built ${M.export.generated_at} from the yardage book (build ${M.export.app_version}). Scope: ${S}.

This folder is for whoever prepares the posts for Instagram, TikTok and X. Read this file, then \`manifest.json\`, then \`posting-plan.md\`. Everything else is material.

## What is here

- \`manifest.json\` — every file, who is in it, when it was taken, what it shows; the standings, the highlights worth a post, the roster. Numbers in \`value\` are exact; \`value_label\` is display-ready.
- \`recap.md\` — the words the book published: each round's recap, the tournament recap, the honours, the golfers' own quotes, the State of the Union and a coach's letter a golfer. Captions come from here.
- \`posting-plan.md\` — six beats from the wrap to the Vegas tease, each naming the files it uses.
- \`screenshots/\` — ${counts.screens} screens drawn from the app at 1080 px wide${M.export.kind === 'brief' ? ', as JPEGs to keep the brief small' : ''}: leaderboards, the final tables, the honours, every scorecard, every report card. They are the tournament's own look; post them as they are or build cards that match.
${M.export.kind === 'brief' ? '' : '- `sized/feed-4x5/` and `sized/story-9x16/` — the screens that fit, placed on the paper at 1080×1350 and 1080×1920.'}
${M.export.kind === 'brief'
    ? `- **No \`media/\` folder: this is the brief.** The ${counts.photos} photographs and ${counts.clips} clips are listed in \`manifest.json\` under \`media\`, each with its \`url\` (the file itself, full size, on the book's photo store) and \`thumb_url\`. Fetch one by its address when a post needs it. The full pack, with the files inside, is the same manifest with a \`media/\` folder, and lives in the shared Drive folder.`
    : `- \`media/\` — ${counts.photos} photographs and ${counts.clips} clips, full size, unedited, as the party uploaded them. Named \`<round>_<hole>_<who>_<time>.<ext>\`: R1/R2/R3 the counting rounds, PR the practice day, TRIP everything off the course. The who is the person who uploaded it, not necessarily who is in it. Each row in the manifest also carries the file's \`url\` on the book's photo store.`}

## The voice

Every post speaks as the Commissioner: sanctioning-body language for twelve friends ("the Commissioner", "the Officials", "by order of"). Dry beats loud; one joke a post. Tease the golf, never the golfer: a missed putt is fair game, a person's weight, job or marriage is not. Hashtags: ${HASHTAGS.join(' and ')} only. The edition line is HIGH ROLLERS CLUB; the Vegas line is "What happens on the course stays on the leaderboard."

## Before anything goes live

- **Consent is not recorded in the app.** Every \`players[].consent\` field is \`null\` (not asked). Nobody appears on a public account until they have said yes in the group chat: face shown, name or first name only, tagged or not. Until then treat everyone as not consented.
- **Handles are blank.** Fill \`players[].handles\` as they come in; tag only those who opted in.
- Never post who has or hasn't paid, phone numbers, room or flight details, live location, or anyone under 18. Geotag a course after the round, the hotel after checkout. Spectators and partners are not in \`players\`: they opt in separately.
- Scores to par and handicap bands are fine to show. Nothing about work, health or relationships.
- Anyone can ask for a post to come down, and it comes down the same day.

## The edition

${EDITION.name}, ${EDITION.year}: ${EDITION.venue}, ${EDITION.city}, ${EDITION.country}, ${EDITION.dates}. The first edition was ${EDITION.previous[0].country}, ${EDITION.previous[0].year}. The third is ${EDITION.next.city}, ${EDITION.next.year}: ${EDITION.next.line}.

The public pages: ${D.SITE_URL}recap/?r=week (the tournament recap), ${D.SITE_URL}recap/?r=report (the players report), ${D.SITE_URL}recap/?r=r1, r2, r3 (each round).
`;
}
export function planMd(M, picks) {
  const urlOf = {}; for (const m of M.media) if (!m.file) urlOf[m.url] = true;
  const f = list => (list.length ? list.map(x => '  - ' + (urlOf[x] ? x : '`' + x + '`')).join('\n') : '  - (nothing in this pack)');
  const names = M.players.filter(p => p.role === 'golfer');
  const champ = (M.competitions.find(c => c.id === 'pairs') || { standings: [] }).standings[0];
  const mvp = (M.competitions.find(c => c.id === 'mvp') || { standings: [] }).standings[0];
  const cup = M.competitions.find(c => c.id === 'ryder_cup');
  return `# Posting plan · six beats

A suggested order, Commissioner's voice throughout, one joke a post. Instagram is the record (carousels and Reels), TikTok carries the clips, X carries the tables and the rulings. One vertical edit serves TikTok and Reels. Spread the wrap over two to three weeks; the Vegas tease last.

## 1 · The book is closed
The edition in one post: the crest, the final tables, the headline from the tournament recap.
- Screens:
${f(picks.tables)}
- The most-hearted photographs:
${f(picks.hero)}
- Words: the tournament recap headline and first paragraph in \`recap.md\`.

## 2 · The golf, round by round
One carousel a round: the leaderboard as it stood, the recap's headline, the best three or four photographs, the shot of the day clip if there is one.
${['r1', 'r2', 'r3', 'practice'].filter(r => picks.rounds[r]).map(r => `- ${roundName(r)}:\n${f(picks.rounds[r])}`).join('\n')}
- Words: that round's recap in \`recap.md\`; the \`highlights\` block in \`manifest.json\` (eagles, birdie runs, collapses, comebacks, cup points).

## 3 · The people
One post a golfer, in MVP order: the report card, a scorecard or two, the coach's one-line read as the caption. Only golfers who have consented, by name only if they said so.
${names.map(p => `- ${p.display_name} (${p.id}):\n${f(picks.people[p.id] || [])}`).join('\n')}

## 4 · The winners
The champions carousel: Team Competition${champ ? ' (' + champ.name + ', ' + champ.value_label + ')' : ''}, MVP${mvp ? ' (' + mvp.name + ', ' + mvp.value_label + ')' : ''}, the Ryder Cup${cup ? ' (UK ' + cup.standings.find(s => s.team === 'UK').value_label + ' – ' + cup.standings.find(s => s.team === 'USA').value_label + ' USA)' : ''}, Bingo Bango Bongo, closest to the pin and the longest drive, the honours.
- Screens:
${f(picks.winners)}
- Words: "Honours" and "The pairs" under each recap in \`recap.md\`.

## 5 · The trip
Dinners, the pool, team beers, the arrivals: Stories and one feed carousel. Everything off the course, in the order it happened.
${f(picks.trip)}

## 6 · Vegas 2027
The tease: the best clips, the defending champions, the line. "${EDITION.next.line}." Nothing about dates until the Commissioner confirms them.
- Clips:
${f(picks.clips)}
`;
}

/* ---------------- screens, as pictures ----------------
   A screen is the app's own HTML, laid out at phone width in a hidden
   stage, then drawn into a picture through an SVG that carries the HTML
   inside it. Everything the picture needs travels with it: the stylesheet,
   the typeface and every image as data, so the drawing never reaches out. */
const STAGE_W = 432;              // a phone's width; × 2.5 = 1080. A card or a report is laid out wider, as the book lays them out
const OUT_W = 1080;
const MAX_H = 6000;               // CSS px (15000 px drawn): Safari's canvas will not go bigger; a taller screen is drawn smaller
let cssMemo = null;
async function dataUri(url) {
  const r = await fetch(url); if (!r.ok) throw new Error('fetch ' + r.status);
  const b = await r.blob();
  return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(b); });
}
/** The page's stylesheet with the typeface inlined, read once a build. */
async function pageCss() {
  if (cssMemo) return cssMemo;
  const rules = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let list; try { list = Array.from(sheet.cssRules); } catch (e) { continue; }   // another origin's sheet: cannot be read
    for (const r of list) rules.push(r);
  }
  let roots = '';
  const out = [];
  for (const r of rules) {
    if (r.type === 5) {   // @font-face: carry the file inside
      let text = r.cssText;
      const urls = [...text.matchAll(/url\((['"]?)([^'")]+)\1\)/g)].map(m => m[2]);
      for (const u of urls) { try { text = text.replace(u, await dataUri(new URL(u, (r.parentStyleSheet && r.parentStyleSheet.href) || document.baseURI).href)); } catch (e) { /* the browser's fallback face then */ } }
      out.push(text); continue;
    }
    if (r.type === 1 && /^:root\b/.test(r.selectorText || '')) roots += r.style.cssText + ';';
    out.push(r.cssText);
  }
  out.push('svg, .pk-root{' + roots + '}');
  out.push('.pk-root{font-family:"Source Serif 4","Source Serif",Georgia,serif;color:var(--ink);background:var(--paper);box-sizing:border-box;overflow:hidden}');
  cssMemo = out.join('\n');
  return cssMemo;
}
export function resetCss() { cssMemo = null; }
/** The hidden stage the screens are laid out in: in the page (so the stylesheet applies and the height can be measured), never seen. */
function stage(width) {
  let s = document.getElementById('packstage');
  if (!s) { s = document.createElement('div'); s.id = 'packstage'; s.setAttribute('aria-hidden', 'true'); document.body.appendChild(s); }
  s.style.cssText = 'position:fixed;left:0;top:0;width:' + width + 'px;z-index:-1;opacity:0;pointer-events:none;overflow:hidden;contain:layout';
  return s;
}
export function dropStage() { const s = document.getElementById('packstage'); if (s) s.remove(); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const isSafari = () => /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);
/** html → { blob (PNG), width, height } at 1080 wide. `title` is the masthead line; `width` the layout's, a phone's unless told. */
export async function snapshot(html, title, crest, width, jpeg) {
  const css = await pageCss();
  const W = width || STAGE_W, SCALE = OUT_W / W;
  const st = stage(W);
  st.innerHTML = '<div class="pk-root" style="width:' + W + 'px"><div class="pk-shot"><div class="pk-mast">' + (crest ? '<img src="' + crest + '" alt="">' : '') + '<span><b>The Union Invitational</b><small>Belek 2026 · ' + title.replace(/[<>&]/g, '') + '</small></span></div><div class="pk-in">' + html + '</div><div class="pk-foot">' + D.SITE_URL.replace(/^https?:\/\//, '').replace(/\/$/, '') + '</div></div></div>';
  const root = st.firstElementChild;
  /* the screens are read, not used: nothing opens, nothing lazy, every picture carried along */
  root.querySelectorAll('details').forEach(d => d.remove());
  root.querySelectorAll('button, a, input, textarea, select').forEach(b => { b.removeAttribute('data-act'); if (b.tagName === 'A') b.removeAttribute('href'); });
  root.querySelectorAll('[loading]').forEach(i => i.removeAttribute('loading'));
  for (const i of Array.from(root.querySelectorAll('img'))) {
    const src = i.getAttribute('src') || '';
    if (/^data:/.test(src)) continue;
    try { i.setAttribute('src', await dataUri(new URL(src, document.baseURI).href)); } catch (e) { i.remove(); }
  }
  await sleep(0);
  if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) { /* fine */ } }
  const h = Math.max(100, Math.ceil(root.scrollHeight));
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + h + '"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml"><style>' + css.replace(/<\/style/g, '<\\/style') + '</style>' + new XMLSerializer().serializeToString(root) + '</div></foreignObject></svg>';
  const img = new Image();
  const loaded = new Promise((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('the screen would not draw')); });
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await loaded;
  if (img.decode) { try { await img.decode(); } catch (e) { /* drawn anyway */ } }
  const scale = h * SCALE > MAX_H * 2.5 ? SCALE * MAX_H * 2.5 / (h * SCALE) : SCALE;
  const c = document.createElement('canvas');
  c.width = Math.round(W * scale); c.height = Math.round(h * scale);
  const g = c.getContext('2d');
  const draw = () => { g.fillStyle = '#E3DBCB'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height); };
  draw();
  if (isSafari()) { await sleep(60); draw(); }    // Safari paints a foreignObject's type a beat late: draw it again
  const blob = await new Promise((res, rej) => (jpeg ? c.toBlob(b => (b ? res(b) : rej(new Error('no picture'))), 'image/jpeg', 0.84) : c.toBlob(b => (b ? res(b) : rej(new Error('no picture'))), 'image/png')));
  st.innerHTML = '';
  return { blob, width: c.width, height: c.height, canvas: c };
}
/** The screen on the paper at a feed or story size, when it fits at a readable scale; else null. */
export async function sized(shot, W, H) {
  const pad = 60, k = Math.min((W - 2 * pad) / shot.width, (H - 2 * pad) / shot.height, 1);
  if (k < 0.55) return null;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); g.fillStyle = '#E3DBCB'; g.fillRect(0, 0, W, H);
  const w = Math.round(shot.width * k), h = Math.round(shot.height * k);
  g.drawImage(shot.canvas, Math.round((W - w) / 2), Math.round((H - h) / 2), w, h);
  return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('no picture'))), 'image/png'));
}
/** A photograph's orientation from its pixels; a clip's length from its header. Neither is worth failing over. */
async function probe(blob, kind) {
  try {
    if (kind === 'video') {
      const url = URL.createObjectURL(blob);
      try {
        const v = document.createElement('video'); v.preload = 'metadata'; v.muted = true; v.src = url;
        const d = await Promise.race([new Promise(res => { v.onloadedmetadata = () => res({ duration: v.duration, w: v.videoWidth, h: v.videoHeight }); v.onerror = () => res(null); }), sleep(4000).then(() => null)]);
        return d ? { duration_s: Number.isFinite(d.duration) ? Math.round(d.duration * 10) / 10 : null, orientation: d.w && d.h ? (d.w > d.h ? 'landscape' : d.w < d.h ? 'portrait' : 'square') : null } : {};
      } finally { URL.revokeObjectURL(url); }
    }
    if (typeof createImageBitmap !== 'function') return {};
    const bm = await createImageBitmap(blob);
    const o = bm.width > bm.height ? 'landscape' : bm.width < bm.height ? 'portrait' : 'square';
    if (bm.close) bm.close();
    return { orientation: o };
  } catch (e) { return {}; }
}

/* ---------------- the build ----------------
   env: what the app lends the pack —
     now, build, crest, sotd(rid), honourLabel(slot), hearts(ph), byPid(ph),
     screens(rids) → [{ key, screen, competition_id, round, title, html }]
   opts: { scope: 'week' | rid, photos, clips, screens, hearted }
   progress(pct, note) is called as it goes; signal (AbortSignal) stops it. */
export async function build(T, env, opts, progress, signal) {
  const say = (pct, note) => progress && progress(Math.max(0, Math.min(100, Math.round(pct))), note);
  const stop = () => { if (signal && signal.aborted) throw new Error('stopped'); };
  const now = env.now || E.nowLocal(), at = Date.now();
  const scope = opts.scope || 'week';
  const rids = scope === 'week' ? ['week', ...D.ROUNDS.map(r => r.id), 'trip'] : [scope];
  const scopeKey = scope === 'week' ? 'edition' : 'round';
  const stamp = iso(at).slice(0, 10) + '_' + (scope === 'week' ? 'edition' : scope);
  const used = new Set(), entries = [], when = new Date(at);
  const golfers = E.golfers(T);
  const byName = {}; for (const g of golfers) byName[g.display] = g.id;

  /* the photographs and clips */
  let all = Object.values(T.photos || {}).filter(p => p && /^https?:/i.test(String(p.url || '')) && (scope === 'week' || p.rid === scope));
  all = all.filter(p => (p.kind === 'video' ? opts.clips : opts.photos) && (!opts.hearted || env.hearts(p) > 0)).sort((a, b) => (a.at || 0) - (b.at || 0));
  const media = [];
  let done = 0, failed = 0;
  for (const ph of all) {
    stop();
    say(5 + 55 * done / Math.max(1, all.length), (ph.kind === 'video' ? 'Clip' : 'Photo') + ' ' + (done + 1) + ' of ' + all.length);
    try {
      const pid = env.byPid ? env.byPid(ph) : (byName[ph.byName] || null);
      const name = unique('media/' + mediaName(ph, pid ? firstName((E.person(T, pid) || {}).display) : firstName(ph.byName), ph.at), used);
      let blob = null, info = {};
      if (!opts.brief) {
        const r = await fetch(ph.url, { signal }); if (!r.ok) throw new Error('http ' + r.status);
        blob = await r.blob();
        info = await probe(blob, ph.kind);
        entries.push({ name, data: blob, at: localDate(ph.at || at) });
      }
      media.push({ file: opts.brief ? null : name, url: ph.url, thumb_url: ph.thumb || null, type: ph.kind === 'video' ? 'video' : 'photo', taken_at: iso(ph.at), day: env.photoDay ? env.photoDay(ph) : null, uploaded_by: pid, uploaded_by_name: ph.byName || null,
        round: ph.rid === 'trip' ? null : ph.rid, hole: ph.hole == null ? null : ph.hole + 1, people_ids: [],
        caption_hint: ph.caption || [roundName(ph.rid || 'trip'), ph.hole != null ? 'hole ' + (ph.hole + 1) : null, ph.byName ? 'by ' + ph.byName : null].filter(Boolean).join(' · '),
        orientation: info.orientation || null, duration_s: info.duration_s == null ? null : info.duration_s, bytes: blob ? blob.size : (ph.bytes || null), mime: (blob && blob.type) || ph.mime || null,
        hearts: env.hearts(ph), starred: env.hearts(ph) > 0, id: ph.id });
    } catch (e) { if (signal && signal.aborted) throw e; failed++; }
    done++;
  }

  /* the screens */
  const screens = [];
  if (opts.screens) {
    resetCss();
    const list = env.screens(rids);
    const tm = hhmm(at);
    for (let i = 0; i < list.length; i++) {
      stop();
      const s = list[i];
      say(60 + 32 * i / Math.max(1, list.length), 'Screen ' + (i + 1) + ' of ' + list.length + ' · ' + s.title);
      try {
        const shot = await snapshot(s.html, s.title, env.crest, s.width, !!opts.brief);
        const base = roundToken(s.round || 'week') + '_' + s.key + '_' + tm;
        const name = unique('screenshots/' + base + (opts.brief ? '.jpg' : '.png'), used);
        entries.push({ name, data: shot.blob, at: when });
        const row = { file: name, screen: s.screen, competition_id: s.competition_id || null, player_ids: s.player_ids || [], round: s.round || null, title: s.title, captured_at: iso(at), theme: 'light', width: shot.width, height: shot.height, sized: {} };
        if (opts.brief) { screens.push(row); continue; }
        const feed = await sized(shot, 1080, 1350); if (feed) { const n = unique('sized/feed-4x5/' + base + '.png', used); entries.push({ name: n, data: feed, at: when }); row.sized.feed_4x5 = n; }
        const story = await sized(shot, 1080, 1920); if (story) { const n = unique('sized/story-9x16/' + base + '.png', used); entries.push({ name: n, data: story, at: when }); row.sized.story_9x16 = n; }
        screens.push(row);
      } catch (e) { if (signal && signal.aborted) throw e; failed++; }
    }
    dropStage();
  }

  /* the manifest, the words, the plan */
  say(94, 'The manifest');
  const M = {
    export: { id: 'exp_' + stamp + '_' + tm2(at), generated_at: iso(at), scope: scopeKey, round: scope === 'week' ? null : scope, app_version: env.build || D.BUILD, kind: opts.brief ? 'brief' : 'full', includes: { photos: !!opts.photos, clips: !!opts.clips, screens: !!opts.screens, hearted_only: !!opts.hearted, media_bytes: !opts.brief }, failed_files: failed },
    edition: { ...EDITION, courses: Object.keys(D.COURSES).map(k => courseJson(T, k)), rounds: D.ROUNDS.map(r => roundJson(T, r.id)) },
    round: scope === 'week' ? null : roundJson(T, scope),
    players: playersJson(T),
    pairs: (T.config.pairs || []).map(p => ({ id: p.id, name: E.pairName(T, p), player_ids: p.members || [] })),
    competitions: competitionsJson(T, now, scope === 'week' ? D.ROUNDS.map(r => r.id) : [scope]),
    highlights: highlightsJson(T, now, scope === 'week' ? D.ROUNDS.map(r => r.id) : [scope], env),
    tee_sheet: teeSheetJson(T, scope),
    screenshots: screens,
    media,
  };
  const picks = pickFor(M);
  entries.unshift({ name: 'README.md', data: readmeMd(M, { screens: screens.length, photos: media.filter(m => m.type === 'photo').length, clips: media.filter(m => m.type === 'video').length }), at: when },
                  { name: 'manifest.json', data: JSON.stringify(M, null, 2), at: when },
                  { name: 'recap.md', data: recapMd(T, env, rids), at: when },
                  { name: 'posting-plan.md', data: planMd(M, picks), at: when });
  say(96, 'Zipping');
  const blob = await zipBlob(entries, (i, n) => { stop(); if (i % 20 === 0) say(96 + 4 * i / n, 'Zipping ' + i + ' of ' + n); });
  say(100, 'Done');
  return { blob, name: 'union-invitational-' + stamp + (opts.brief ? '-brief' : '') + '.zip', manifest: M, failed };
}
const tm2 = at => hhmm(at);
/** Which files each beat of the plan uses. */
function pickFor(M) {
  const sc = M.screenshots, md = M.media;
  const by = f => sc.filter(f).map(s => s.file);
  const photos = md.filter(m => m.type === 'photo').map(m => ({ ...m, file: m.file || m.url })), clips = md.filter(m => m.type === 'video').map(m => ({ ...m, file: m.file || m.url }));
  const rounds = {};
  for (const r of ['practice', 'r1', 'r2', 'r3']) {
    const ps = photos.filter(m => m.round === r).sort((a, b) => b.hearts - a.hearts || (a.taken_at || '').localeCompare(b.taken_at || '')).slice(0, 4).map(m => m.file);
    const ss = by(s => s.round === r && s.screen !== 'scorecard');
    const cs = clips.filter(m => m.round === r).map(m => m.file);
    if (ps.length || ss.length || cs.length) rounds[r] = [...ss, ...ps, ...cs];
  }
  const people = {};
  for (const p of M.players.filter(p => p.role === 'golfer')) people[p.id] = [...by(s => (s.player_ids || []).includes(p.id)), ...photos.filter(m => m.uploaded_by === p.id).slice(0, 3).map(m => m.file)];
  return {
    tables: by(s => s.screen === 'leaderboard' || (s.screen === 'competition' && s.round == null && (s.competition_id === 'pairs' || s.competition_id === 'mvp'))),
    hero: photos.slice().sort((a, b) => b.hearts - a.hearts).slice(0, 6).map(m => m.file),
    rounds, people,
    winners: by(s => s.screen === 'honours' || (s.screen === 'competition' && s.round == null)),
    trip: photos.filter(m => m.round == null).map(m => m.file),
    clips: clips.slice().sort((a, b) => b.hearts - a.hearts).slice(0, 3).map(m => m.file),
  };
}
