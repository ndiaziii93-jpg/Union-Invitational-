/* The Union Invitational — the Clubhouse: the season between tournaments.
 *
 * Pure functions over the book. Nothing here touches the DOM or the wire.
 * The season lives in the `club/` rows of the shared book:
 *
 *   club/season            the season itself: phase, stops, packages, rooms,
 *                          deadlines, the week's window — the master's row
 *   club/signup__<pid>     In / Maybe / Out, the package, the shirt — the
 *                          person's own row
 *   club/money__<pid>      what has been paid against the package — the
 *                          master's row, read by everyone
 *   club/travel__<pid>     flights out and back — the person's own row
 *   club/course__<pid>     the home course, entered once, approved by the
 *                          master
 *   club/card__<stop>__<pid>  a virtual round: eighteen gross scores, the
 *                          handicap it was played off, the photo of the
 *                          signed card
 *
 * The 2026 book (Belek) stays exactly where it is, under its own paths, and
 * is read from there: the season adds rows beside it and never moves one. */
import { strokesFor, stablefordPts } from './engine.js';

/* ---------- the season, with its defaults ---------- */

/* The sheet's own names, carried over. Windows are the commissioner's to
   move; these are the month each one has always been played in. */
/* The thirteen the sheet names, a month each, from the reveal in December
   2026 to the week in Las Vegas. The windows are a month apiece and the
   commissioner moves any of them under Manage.

   TWO OF THEM WANT A DECISION. The Turkey Shoot sits in the same month as
   Las Vegas, so it is set to close on the 11th, before the week's window
   opens on the 13th; and the Santa Swing falls AFTER Vegas, which may be a
   fine way to end the year or may not be wanted at all. Neither is a thing
   the book should decide on its own. */
export const STOPS_SEED = [
  { id: 'mulligan',    name: 'The Merry Mulligan Open',  from: '2026-12-01', to: '2026-12-31', format: 'stableford', note: 'The reveal. Eighteen holes at home, net Stableford, a mulligan a nine.' },
  { id: 'frostbite',   name: 'The Frostbite Open',       from: '2027-01-09', to: '2027-01-31', format: 'stableford', note: 'Eighteen holes in whatever January gives you. Net Stableford.' },
  { id: 'sweetheart',  name: 'The Sweetheart Scramble',  from: '2027-02-01', to: '2027-02-28', format: 'stableford', note: 'Eighteen holes with a partner of your choosing beside you. Your own card counts.' },
  { id: 'lucky',       name: 'The Lucky Links Classic',  from: '2027-03-01', to: '2027-03-31', format: 'stableford', note: 'March, and whatever luck is going. Net Stableford.' },
  { id: 'bloom',       name: 'The Bloom Invitational',   from: '2027-04-01', to: '2027-04-30', format: 'stableford', note: 'The ground has dried out and there are no more excuses.' },
  { id: 'fiesta',      name: 'The Fairway Fiesta',       from: '2027-05-01', to: '2027-05-31', format: 'stableford', note: 'May, and the first round anybody enjoys.' },
  { id: 'summer',      name: 'The Summer Swing',         from: '2027-06-01', to: '2027-06-30', format: 'stableford', note: 'Longest days of the year: no excuse for not getting out.' },
  { id: 'firecracker', name: 'The Firecracker Cup',      from: '2027-07-01', to: '2027-07-31', format: 'stableford', note: 'July. Loud shirts encouraged, loud scores less so.' },
  { id: 'dogdays',     name: 'The Dog Days Derby',       from: '2027-08-01', to: '2027-08-31', format: 'stableford', note: 'The hottest month, and the one where the wheels come off.' },
  { id: 'harvest',     name: 'The Harvest Classic',      from: '2027-09-01', to: '2027-09-30', format: 'stableford', note: 'September, and the best golf anybody plays all year.' },
  { id: 'pumpkin',     name: 'The Pumpkin Putter Open',  from: '2027-10-01', to: '2027-10-31', format: 'stableford', note: 'October. Whatever is in the rough in October, it is yours now.' },
  { id: 'turkeyshoot', name: 'The Turkey Shoot',         from: '2027-11-01', to: '2027-11-11', format: 'stableford', note: 'The last card before Las Vegas. It closes on the 11th; the week opens on the 13th.' },
  { id: 'santa',       name: 'The Santa Swing',          from: '2027-12-01', to: '2027-12-31', format: 'stableford', note: 'After Vegas, if there is anything left in the tank.' },
];

export const PACKAGES_SEED = [
  { id: '7g', name: '7 nights · golfer',          nights: 7, golf: true,  price: 0, inc: ['7 nights at the hotel', 'Two practice days and three rounds', 'Merch and the trophies'] },
  { id: '7n', name: '7 nights · not golfing',     nights: 7, golf: false, price: 0, inc: ['7 nights at the hotel', 'The partners’ 9 and the dinners', 'Merch'] },
  { id: '5g', name: '5 nights · golfer',          nights: 5, golf: true,  price: 0, inc: ['5 nights at the hotel', 'Three rounds', 'Merch and the trophies'] },
  { id: '5n', name: '5 nights · not golfing',     nights: 5, golf: false, price: 0, inc: ['5 nights at the hotel', 'The partners’ 9 and the dinners', 'Merch'] },
  { id: '7w', name: '7 nights · women’s division', nights: 7, golf: true,  price: 0, inc: ['7 nights at the hotel', 'The women’s 18 and the practice days', 'Merch and the trophies'] },
];

/* Points a stop pays into the Order of Merit, first place down. */
export const MERIT = [100, 60, 40, 30, 25, 20, 15, 12, 10, 8, 6, 5, 4, 3, 2, 1];

export const VENDORS_SEED = [
  { k: 'hotel',   name: 'Hotel',        status: 'Quotes to ask', due: '' },
  { k: 'courses', name: 'Courses',      status: 'Tee times to ask', due: '' },
  { k: 'rentals', name: 'Club rentals', status: 'To ask', due: '' },
  { k: 'merch',   name: 'Merch and trophies', status: 'To design', due: '' },
];

export function seasonDefaults() {
  return {
    id: '2027',
    name: 'Las Vegas 2027',
    tag: 'A Desert Showdown',
    place: 'Las Vegas, Nevada',
    window: { from: '2027-11-13', to: '2027-11-21', locked: false },
    phase: 'week',          // 'club' between tournaments · 'week' when the book is the tournament
    frozen: false,          // the 2026 book is closed to every write
    opened: null,
    deadlines: { deposit: '2027-03-31', balance: '2027-08-03' },
    currency: '£',
    packages: PACKAGES_SEED.map(p => ({ ...p, inc: [...p.inc] })),
    stops: STOPS_SEED.map(s => ({ ...s })),
    rooms: [],
    vendors: VENDORS_SEED.map(v => ({ ...v })),
    archive: { '2026': { name: 'Belek 2026', venue: 'Titanic Deluxe Golf Belek', place: 'Antalya, Türkiye', from: '2026-10-26', to: '2026-11-02' } },
  };
}

/** The season as the book holds it, defaults filled in. */
export function season(T) {
  const base = seasonDefaults();
  const held = (T && T.club && T.club.season) || null;
  if (!held) return base;
  const out = { ...base, ...held };
  out.window = { ...base.window, ...(held.window || {}) };
  out.deadlines = { ...base.deadlines, ...(held.deadlines || {}) };
  out.packages = Array.isArray(held.packages) ? held.packages : base.packages;
  out.stops = Array.isArray(held.stops) ? held.stops : base.stops;
  out.rooms = Array.isArray(held.rooms) ? held.rooms : [];
  out.vendors = Array.isArray(held.vendors) ? held.vendors : base.vendors;
  out.archive = { ...base.archive, ...(held.archive || {}) };
  return out;
}
export const phaseOf = T => (T && T.club && T.club.season && T.club.season.phase) === 'club' ? 'club' : 'week';
export const frozen = T => !!(T && T.club && T.club.season && T.club.season.frozen);

/* ---------- dates ---------- */

export const isoToday = ms => new Date(ms == null ? Date.now() : ms).toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
export function fmtDay(iso, opt) {
  if (!iso) return '—';
  const d = new Date(iso + 'T12:00:00Z');
  if (isNaN(d)) return iso;
  const day = d.getUTCDate(), mon = d.toLocaleString('en-GB', { month: opt && opt.long ? 'long' : 'short', timeZone: 'UTC' });
  return day + ' ' + mon + (opt && opt.year ? ' ' + d.getUTCFullYear() : '');
}
export const dowOf = iso => { const d = new Date(iso + 'T12:00:00Z'); return isNaN(d) ? '' : d.toLocaleString('en-GB', { weekday: 'long', timeZone: 'UTC' }); };

/* ---------- stops ---------- */

export function stopState(stop, today) {
  if (!stop || !stop.from || !stop.to) return 'upcoming';
  if (today < stop.from) return 'upcoming';
  if (today > stop.to) return 'closed';
  return 'open';
}
export const stops = T => season(T).stops.slice().sort((a, b) => String(a.from).localeCompare(String(b.from)));
export const stopById = (T, id) => season(T).stops.find(s => s.id === id) || null;
export const openStops = (T, today) => stops(T).filter(s => stopState(s, today) === 'open');
export const nextStop = (T, today) => stops(T).find(s => stopState(s, today) === 'upcoming') || null;
export const closedStops = (T, today) => stops(T).filter(s => stopState(s, today) === 'closed');
/** The stop the season is "at": the open one, else the next, else the last. */
export function currentStop(T, today) {
  const all = stops(T);
  return openStops(T, today)[0] || nextStop(T, today) || all[all.length - 1] || null;
}

/* ---------- people ---------- */

export const golfers = T => (T.config.people || []).filter(p => p.role === 'golfer');
export const everyone = T => (T.config.people || []).filter(p => p.role !== 'official' || true);
export const person = (T, pid) => (T.config.people || []).find(p => p.id === pid) || null;

/* ---------- the home course ---------- */

/* ---------- THE COURSE LIBRARY ----------
   Nobody should type fifty-four numbers off a scorecard. A course goes in
   once — researched and written down here, or entered by the first member
   who plays it — and everybody after that finds it by name, taps it, and
   checks it against their own card before they save.

   `holes` is eighteen triples: par, stroke index, yards off the named tee.
   The stroke index is the part that matters and the part that is hardest
   to find: it decides which holes you get a shot on, so a wrong one
   quietly spoils every net score all season. Each of these was taken from
   a published card, and the member approving it is asked to check it
   against the club's own. */
const card = (tee, par, si, y) => ({ tee, holes: par.map((p, i) => ({ par: p, si: si[i], y: y ? y[i] : null })) });

export const COURSE_LIB = [
  { id: 'the-grove-back', name: 'The Grove', place: 'Chandler\'s Cross, Hertfordshire, England',
    note: 'Par 72 off the back. Card as the club publishes it; check it against your own.',
    src: 'https://www.thecaddy.co.uk/courses/the-grove',
    ...card('Back',
      [4, 4, 4, 3, 4, 5, 3, 4, 5, 4, 5, 4, 3, 4, 4, 3, 5, 4],
      [17, 11, 1, 9, 3, 7, 15, 13, 5, 10, 12, 2, 6, 16, 8, 18, 14, 4],
      [351, 445, 446, 210, 436, 559, 150, 435, 567, 379, 537, 462, 244, 388, 408, 184, 499, 452]) },
  { id: 'the-grove-white', name: 'The Grove', place: 'Chandler\'s Cross, Hertfordshire, England',
    note: 'Par 72 off the white. Card as the club publishes it; check it against your own.',
    src: 'https://www.thecaddy.co.uk/courses/the-grove',
    ...card('White',
      [4, 4, 4, 3, 4, 5, 3, 4, 5, 4, 5, 4, 3, 4, 4, 3, 5, 4],
      [17, 11, 1, 9, 3, 7, 15, 13, 5, 10, 12, 2, 6, 16, 8, 18, 14, 4],
      [340, 429, 428, 167, 414, 538, 142, 400, 549, 370, 481, 433, 209, 375, 394, 173, 488, 436]) },
  { id: 'the-grove-yellow', name: 'The Grove', place: 'Chandler\'s Cross, Hertfordshire, England',
    note: 'Par 72 off the yellow. Card as the club publishes it; check it against your own.',
    src: 'https://www.thecaddy.co.uk/courses/the-grove',
    ...card('Yellow',
      [4, 4, 4, 3, 4, 5, 3, 4, 5, 4, 5, 4, 3, 4, 4, 3, 5, 4],
      [17, 11, 1, 9, 3, 7, 15, 13, 5, 10, 12, 2, 6, 16, 8, 18, 14, 4],
      [312, 385, 410, 127, 402, 506, 132, 393, 515, 341, 463, 419, 184, 342, 367, 148, 470, 416]) },
  { id: 'the-grove-red-l', name: 'The Grove', place: 'Chandler\'s Cross, Hertfordshire, England',
    note: 'Par 72 off the red (l). Card as the club publishes it; check it against your own.',
    src: 'https://www.thecaddy.co.uk/courses/the-grove',
    ...card('Red (L)',
      [4, 4, 4, 3, 4, 5, 3, 4, 5, 4, 5, 4, 3, 4, 4, 3, 5, 4],
      [17, 11, 1, 9, 3, 7, 15, 13, 5, 10, 12, 2, 6, 16, 8, 18, 14, 4],
      [261, 352, 342, 116, 332, 495, 118, 343, 442, 327, 413, 325, 139, 277, 324, 125, 425, 351]) },
  { id: 'rac-woodcote-park-coronation-course-white', name: 'RAC Woodcote Park (Coronation Course)', place: 'Epsom, Surrey, England',
    note: 'Par 70 off the white. Card as the club publishes it; check it against your own.',
    src: 'https://rac.intelligentgolf.co.uk/uploads/rac/File/Coronation%20Course%20Scorecard.pdf',
    ...card('White',
      [4, 3, 4, 3, 4, 4, 4, 5, 4, 4, 5, 3, 4, 4, 3, 4, 4, 4],
      [6, 14, 8, 18, 12, 16, 2, 10, 4, 11, 7, 5, 13, 1, 15, 3, 17, 9],
      [340, 190, 329, 148, 331, 328, 414, 524, 441, 323, 510, 202, 342, 437, 208, 384, 352, 374]) },
  { id: 'rac-woodcote-park-coronation-course-yellow', name: 'RAC Woodcote Park (Coronation Course)', place: 'Epsom, Surrey, England',
    note: 'Par 70 off the yellow. Card as the club publishes it; check it against your own.',
    src: 'https://rac.intelligentgolf.co.uk/uploads/rac/File/Coronation%20Course%20Scorecard.pdf',
    ...card('Yellow',
      [4, 3, 4, 3, 4, 4, 4, 5, 4, 4, 5, 3, 4, 4, 3, 4, 4, 4],
      [6, 14, 8, 18, 12, 16, 2, 10, 4, 11, 7, 5, 13, 1, 15, 3, 17, 9],
      [336, 184, 320, 129, 324, 322, 393, 498, 405, 317, 503, 189, 324, 423, 182, 349, 348, 364]) },
  { id: 'rac-woodcote-park-coronation-course-red', name: 'RAC Woodcote Park (Coronation Course)', place: 'Epsom, Surrey, England',
    note: 'Par 71 off the red. Card as the club publishes it; check it against your own.',
    src: 'https://rac.intelligentgolf.co.uk/uploads/rac/File/Coronation%20Course%20Scorecard.pdf',
    ...card('Red',
      [4, 3, 4, 3, 4, 4, 5, 5, 4, 4, 5, 3, 4, 4, 3, 4, 4, 4],
      [6, 16, 4, 18, 14, 8, 12, 10, 2, 11, 5, 7, 17, 1, 15, 3, 13, 9],
      [315, 172, 300, 124, 318, 296, 373, 429, 384, 311, 431, 180, 302, 383, 156, 326, 338, 329]) },
  { id: 'rac-woodcote-park-old-course-white', name: 'RAC Woodcote Park (Old Course)', place: 'Epsom, Surrey, England',
    note: 'Par 72 off the white. Card as the club publishes it; check it against your own.',
    src: 'https://rac.intelligentgolf.co.uk/uploads/rac/File/Old%20Course%20Scorecard.pdf',
    ...card('White',
      [4, 4, 3, 5, 4, 4, 4, 4, 4, 5, 4, 4, 3, 4, 4, 4, 3, 5],
      [11, 7, 5, 15, 17, 1, 13, 3, 9, 12, 6, 4, 18, 16, 2, 8, 14, 10],
      [390, 390, 190, 520, 298, 439, 353, 475, 462, 469, 393, 337, 150, 336, 421, 372, 163, 535]) },
  { id: 'rac-woodcote-park-old-course-yellow', name: 'RAC Woodcote Park (Old Course)', place: 'Epsom, Surrey, England',
    note: 'Par 72 off the yellow. Card as the club publishes it; check it against your own.',
    src: 'https://rac.intelligentgolf.co.uk/uploads/rac/File/Old%20Course%20Scorecard.pdf',
    ...card('Yellow',
      [4, 4, 3, 5, 4, 4, 4, 4, 4, 5, 4, 4, 3, 4, 4, 4, 3, 5],
      [11, 7, 5, 15, 17, 1, 13, 3, 9, 12, 6, 4, 18, 16, 2, 8, 14, 10],
      [374, 354, 175, 464, 291, 434, 350, 453, 397, 449, 380, 331, 137, 309, 360, 364, 131, 496]) },
  { id: 'rac-woodcote-park-old-course-red', name: 'RAC Woodcote Park (Old Course)', place: 'Epsom, Surrey, England',
    note: 'Par 73 off the red. Card as the club publishes it; check it against your own.',
    src: 'https://rac.intelligentgolf.co.uk/uploads/rac/File/Old%20Course%20Scorecard.pdf',
    ...card('Red',
      [4, 4, 3, 5, 4, 5, 4, 4, 4, 5, 4, 4, 3, 4, 4, 4, 3, 5],
      [11, 17, 3, 15, 5, 13, 7, 1, 9, 8, 12, 4, 16, 14, 2, 6, 18, 10],
      [339, 342, 162, 448, 283, 423, 334, 399, 381, 424, 339, 273, 132, 309, 318, 336, 126, 479]) },
  { id: 'leatherhead', name: 'Leatherhead Golf Club', place: 'Leatherhead, Surrey, England',
    note: 'Par 71. Card as published for the white tees; check the index against the club\u2019s own.',
    ...card('White',
      [5, 3, 4, 5, 4, 4, 4, 5, 3, 4, 4, 3, 4, 4, 3, 5, 4, 3],
      [18, 8, 4, 14, 10, 2, 12, 6, 16, 1, 11, 5, 15, 13, 7, 3, 17, 9],
      [483, 176, 402, 507, 361, 447, 372, 534, 188, 423, 284, 196, 255, 296, 198, 503, 300, 203]) },
  { id: 'leatherhead-yellow', name: 'Leatherhead Golf Club', place: 'Leatherhead, Surrey, England',
    note: 'Par 70 off the yellows \u2014 the 4th plays as a par 4. Same stroke index as the whites.',
    ...card('Yellow',
      [5, 3, 4, 4, 4, 4, 4, 5, 3, 4, 4, 3, 4, 4, 3, 5, 4, 3],
      [18, 8, 4, 14, 10, 2, 12, 6, 16, 1, 11, 5, 15, 13, 7, 3, 17, 9],
      [444, 166, 367, 440, 302, 424, 364, 519, 175, 414, 274, 175, 248, 284, 182, 494, 290, 195]) },
  { id: 'leatherhead-red', name: 'Leatherhead Golf Club', place: 'Leatherhead, Surrey, England',
    note: 'Par 69 off the reds, and the reds have a stroke index of their own \u2014 the 4th is the hardest hole, not the 10th.',
    ...card('Red',
      [4, 3, 4, 4, 4, 4, 4, 5, 3, 4, 4, 3, 4, 4, 3, 5, 4, 3],
      [9, 15, 7, 1, 17, 3, 11, 5, 13, 2, 14, 12, 18, 10, 4, 8, 16, 6],
      [429, 142, 338, 433, 292, 398, 345, 491, 162, 370, 245, 166, 248, 278, 175, 479, 282, 182]) },
];

/** A course in the library is a name AND a tee: Leatherhead off the whites
 *  is par 71 and Leatherhead off the reds is par 69, with a stroke index of
 *  its own. They are two cards, and a member picks the one they play. */
const libKey = (name, tee) => String(name || '').trim().toLowerCase() + '|' + String(tee || '').trim().toLowerCase();

/** Every course the book knows: the ones written down above, and every one
 *  a member has already entered. A member's own course wins on a name
 *  clash, because they are the one who plays it. */
export function courseLibrary(T) {
  const out = [];
  const seen = new Set();
  for (const [k, c] of Object.entries((T && T.club) || {})) {
    if (!k.startsWith('course__') || !c || !c.name) continue;
    const key = libKey(c.name, c.tee);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: k, name: c.name, place: '', tee: c.tee || '', holes: c.holes, from: 'book', approved: !!c.approved });
  }
  for (const c of COURSE_LIB) {
    const key = libKey(c.name, c.tee);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...c, from: 'library' });
  }
  return out;
}

/** Find a course by what somebody typed. Two letters is enough to start. */
export function courseFind(T, q) {
  const needle = String(q || '').trim().toLowerCase();
  if (needle.length < 2) return [];
  return courseLibrary(T)
    .filter(c => (c.name + ' ' + (c.place || '')).toLowerCase().includes(needle))
    .slice(0, 8);
}

/** One of those, as this person's own course, ready to be checked. */
export function courseFrom(entry, pid) {
  return { pid, name: entry.name, tee: entry.tee || '',
    holes: entry.holes.map(h => ({ par: +h.par, si: +h.si, y: h.y == null ? null : +h.y })),
    approved: false, at: null };
}

/** A home course as the hole window reads a course: a key of its own, the
 *  holes numbered, and the card's yards carried over as metres, because the
 *  ground is modelled in metres. There is no drawing of a home course, so
 *  `img` is null and the window builds the hole from par and length \u2014 and
 *  says on the glass that the shape is drawn, not surveyed. */
export const courseSlug = n => String(n || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function courseAsBook(course) {
  if (!courseOk(course)) return null;
  const m = y => (y == null || !isFinite(+y) ? null : Math.round(+y / 1.09361));
  return {
    key: 'home__' + course.pid, name: course.name, tee: course.tee || '',
    /* The ground belongs to the COURSE, not to the member who entered it: two
       members at the same club must stand on the same 1st. So the shapes are
       looked up by the course's name, while the key above stays the member's. */
    shapeKey: courseSlug(course.name),
    home: true, verified: !!course.approved, meta: null,
    holes: course.holes.map((h, i) => ({
      n: i + 1, par: +h.par, si: +h.si,
      y: h.y == null ? null : +h.y, mY: m(h.y), mW: m(h.y), img: null,
    })),
  };
}

export function blankCourse(pid) {
  return { pid, name: '', tee: '', holes: Array.from({ length: 18 }, (_, i) => ({ par: 4, si: i + 1, y: null })), approved: false, at: null };
}
export const courseOf = (T, pid) => (T.club && T.club['course__' + pid]) || null;
export function courseOk(c) {
  if (!c || !c.name || !Array.isArray(c.holes) || c.holes.length !== 18) return false;
  const sis = c.holes.map(h => +h.si);
  return c.holes.every(h => [3, 4, 5, 6].includes(+h.par)) && new Set(sis).size === 18 && sis.every(s => s >= 1 && s <= 18);
}
export const coursePar = c => (c && c.holes ? c.holes.reduce((a, h) => a + (+h.par || 0), 0) : 0);

/* ---------- cards and points ---------- */

export const cardKey = (stop, pid) => 'card__' + stop + '__' + pid;
export const cardOf = (T, stop, pid) => (T.club && T.club[cardKey(stop, pid)]) || null;
export function blankClubCard(stop, pid, hcp, course) {
  return { stop, pid, raw: Array(18).fill(null), hcp, course: course ? { name: course.name, tee: course.tee, holes: course.holes.map(h => ({ par: +h.par, si: +h.si })) } : null, photo: null, at: null, done: false };
}
export const capFor = par => par + 3;

/** Points on a hole: net Stableford off the handicap the card was played off. */
export function holePts(card, h) {
  if (!card || !card.course || !card.course.holes || card.raw[h] == null) return null;
  const hole = card.course.holes[h];
  const raw = Math.min(card.raw[h], capFor(hole.par));
  const st = strokesFor(Math.round(card.hcp == null ? 0 : card.hcp), hole.si) || 0;
  return stablefordPts(raw - st, hole.par);
}
export function cardTotals(card) {
  let pts = 0, gross = 0, thru = 0, back = 0, par = 0;
  if (!card || !card.course) return { pts: 0, gross: 0, thru: 0, back: 0, toPar: null, par: 0 };
  for (let h = 0; h < 18; h++) {
    const p = holePts(card, h);
    if (p == null) continue;
    pts += p; thru++; gross += card.raw[h]; par += card.course.holes[h].par;
    if (h >= 9) back += p;
  }
  return { pts, gross, thru, back, toPar: thru ? gross - par : null, par };
}

/** Everybody's card on a stop, best first: points, then the back nine, then the handicap (lower wins). */
export function stopBoard(T, stopId) {
  const rows = [];
  for (const g of golfers(T)) {
    const c = cardOf(T, stopId, g.id);
    if (!c) continue;
    const t = cardTotals(c);
    if (!t.thru) continue;
    rows.push({ pid: g.id, name: g.display || g.name, card: c, ...t, done: !!c.done && t.thru === 18, course: c.course ? c.course.name : '' });
  }
  rows.sort((a, b) => b.pts - a.pts || b.back - a.back || (a.card.hcp || 0) - (b.card.hcp || 0) || a.name.localeCompare(b.name));
  let pos = 0, last = null;
  rows.forEach((r, i) => { if (r.pts !== last) { pos = i + 1; last = r.pts; } r.pos = pos; r.tie = rows.filter(x => x.pts === r.pts).length > 1; });
  return rows;
}
export const stopWinner = (T, stopId) => stopBoard(T, stopId)[0] || null;

/** The Order of Merit: every closed stop pays its places. */
export function merit(T, today) {
  const pts = {}, wins = {}, played = {};
  for (const s of closedStops(T, today)) {
    const board = stopBoard(T, s.id);
    board.forEach(r => {
      pts[r.pid] = (pts[r.pid] || 0) + (MERIT[r.pos - 1] || 0);
      played[r.pid] = (played[r.pid] || 0) + 1;
      if (r.pos === 1) wins[r.pid] = (wins[r.pid] || 0) + 1;
    });
  }
  const rows = golfers(T).map(g => ({ pid: g.id, name: g.display || g.name, pts: pts[g.id] || 0, wins: wins[g.id] || 0, played: played[g.id] || 0 }))
    .filter(r => r.played)
    .sort((a, b) => b.pts - a.pts || b.wins - a.wins || a.name.localeCompare(b.name));
  let pos = 0, last = null;
  rows.forEach((r, i) => { if (r.pts !== last) { pos = i + 1; last = r.pts; } r.pos = pos; });
  return rows;
}

/* ---------- the Union handicap ----------
   Seeded by the Belek band. Each finished card leaves a differential: the
   handicap it was played off plus how far the points fell short of 36 (or
   minus how far over). Once three cards are in, the handicap is the mean of
   the best three of the last six, at 96%, to a decimal; the playing
   handicap is that rounded. Until then it is the seed. */
export function diffOf(card) {
  const t = cardTotals(card);
  if (t.thru < 18) return null;
  return Math.round(((card.hcp == null ? 0 : +card.hcp) + (36 - t.pts)) * 10) / 10;
}
export function unionHcp(T, pid, today) {
  const p = person(T, pid);
  const seed = p && p.band != null ? +p.band : null;
  const cards = stops(T).map(s => cardOf(T, s.id, pid)).filter(c => c && c.done && cardTotals(c).thru === 18);
  const diffs = cards.map(diffOf).filter(d => d != null);
  const last6 = diffs.slice(-6);
  if (last6.length < 3) return { hcp: seed, from: seed == null ? 'none' : 'belek', n: diffs.length, diffs: last6, need: 3 - last6.length };
  const best = last6.slice().sort((a, b) => a - b).slice(0, 3);
  const hcp = Math.round((best.reduce((a, b) => a + b, 0) / best.length) * 0.96 * 10) / 10;
  return { hcp: Math.max(0, Math.min(45, hcp)), from: 'season', n: diffs.length, diffs: last6, need: 0, seed };
}
export const playingOf = (T, pid, today) => { const u = unionHcp(T, pid, today); return u.hcp == null ? null : Math.round(u.hcp); };

/* ---------- divisions ---------- */

export const DIVISIONS = [['men', 'Tournament · men’s'], ['women', 'Tournament · women’s'], ['none', 'Not golfing']];
/** Men's, women's, or not golfing: the sign-up's word first, the roster's second. */
export function divisionOf(T, pid) {
  const s = signupOf(T, pid), p = person(T, pid);
  if (s && ['men', 'women', 'none'].includes(s.division)) return s.division;
  if (p && (p.division === 'men' || p.division === 'women')) return p.division;
  return p && p.role === 'golfer' ? 'men' : p ? 'none' : null;
}
export const divisionLabel = d => (DIVISIONS.find(x => x[0] === d) || [])[1] || '—';

/* ---------- Vegas HQ ---------- */

export const signupOf = (T, pid) => (T.club && T.club['signup__' + pid]) || null;
export const travelOf = (T, pid) => (T.club && T.club['travel__' + pid]) || null;
export const moneyOf = (T, pid) => (T.club && T.club['money__' + pid]) || null;
export const packageOf = (T, id) => season(T).packages.find(p => p.id === id) || null;

export function field(T) {
  const out = { in: [], maybe: [], out: [], unanswered: [] };
  for (const p of (T.config.people || []).filter(x => x.role !== 'official')) {
    const s = signupOf(T, p.id);
    const st = s && ['in', 'maybe', 'out'].includes(s.status) ? s.status : null;
    (st ? out[st] : out.unanswered).push({ ...p, signup: s });
  }
  return out;
}

/** What a person owes and has paid: the package price (or the master's own figure), the payments, the meter. */
export function ledger(T, pid) {
  const s = signupOf(T, pid), m = moneyOf(T, pid);
  const pkg = s && s.pkg ? packageOf(T, s.pkg) : null;
  const price = m && m.price != null && m.price !== '' ? +m.price : pkg ? +pkg.price || 0 : 0;
  const pays = (m && Array.isArray(m.pays) ? m.pays : []).filter(x => Number.isFinite(+x.amt));
  const paid = Math.round(pays.reduce((a, x) => a + +x.amt, 0) * 100) / 100;
  const left = Math.max(0, Math.round((price - paid) * 100) / 100);
  return { pid, pkg, price, paid, left, pays, pct: price > 0 ? Math.min(1, paid / price) : 0, settled: price > 0 && paid >= price };
}
export function fmtMoney(n, cur) {
  const v = Math.round((+n || 0) * 100) / 100;
  const s = v.toLocaleString('en-GB', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return (cur || '£') + s;
}

/** The checklist a person's line is made of, for the Ready dial. */
export function lineOf(T, pid) {
  const s = signupOf(T, pid), t = travelOf(T, pid), L = ledger(T, pid), p = person(T, pid);
  const room = season(T).rooms.find(r => (r.members || []).includes(pid)) || null;
  const items = [
    { k: 'in',      label: 'In for Vegas',    ok: !!s && s.status === 'in', val: !s ? 'Not answered' : s.status === 'in' ? 'Yes' : s.status === 'maybe' ? 'Maybe' : 'Out' },
    { k: 'division', label: 'Playing',        ok: !!(s && s.division) || (p && p.division), val: divisionLabel(divisionOf(T, pid)) + (!(s && s.division) && !(p && p.division) ? ' · confirm' : '') },
    { k: 'pkg',     label: 'Package',         ok: !!(L.pkg), val: L.pkg ? L.pkg.name : 'Pick one' },
    { k: 'deposit', label: 'Deposit',         ok: L.paid > 0, val: L.paid > 0 ? 'Paid ' + fmtMoney(L.paid) : L.price ? 'Due ' + fmtDay(season(T).deadlines.deposit) : 'After the package' },
    { k: 'balance', label: 'Balance',         ok: L.settled, val: L.settled ? 'Settled' : L.price ? fmtMoney(L.left) + ' to go' : '—' },
    { k: 'shirt',   label: 'Shirt and merch', ok: !!(s && s.shirt && s.initials && s.nameOn), val: s && s.shirt ? [s.shirt, s.initials, s.nameOn].filter(Boolean).join(' · ') + (s.initials && s.nameOn ? '' : ' · finish') : 'Size, initials, name' },
    { k: 'room',    label: 'Room',            ok: !!room, val: room ? 'With ' + (room.members || []).filter(x => x !== pid).map(x => (person(T, x) || {}).display || x).join(' and ') : 'Not set yet' },
    { k: 'flights', label: 'Flights',         ok: !!(t && t.out && t.out.flight), val: t && t.out && t.out.flight ? t.out.flight + ' · lands ' + (t.out.lands || '?') : 'Add when booked' },
  ];
  const done = items.filter(i => i.ok).length;
  return { items, done, of: items.length, pct: done / items.length, next: items.find(i => !i.ok) || null };
}

/* ---------- the dials ---------- */

export function dials(T, pid, today) {
  const u = unionHcp(T, pid, today);
  const stopsSoFar = stops(T).filter(s => stopState(s, today) !== 'upcoming');
  const played = stopsSoFar.filter(s => { const c = cardOf(T, s.id, pid); return c && cardTotals(c).thru > 0; }).length;
  const line = lineOf(T, pid);
  const p = person(T, pid);
  const seed = p && p.band != null ? +p.band : null;
  const move = u.from === 'season' && seed != null ? Math.round((u.hcp - seed) * 10) / 10 : null;
  return {
    form: { big: u.hcp == null ? '—' : String(u.hcp), label: 'Form', small: u.from === 'season' ? (move == null ? 'Union handicap' : (move < 0 ? 'down ' : 'up ') + Math.abs(move) + ' since Belek') : u.from === 'belek' ? 'Belek band · ' + u.need + ' more card' + (u.need === 1 ? '' : 's') : 'no handicap yet', pct: u.hcp == null ? 0 : Math.max(0.08, 1 - u.hcp / 45) },
    played: { big: played + ' of ' + stopsSoFar.length, label: 'Played', small: 'this season', pct: stopsSoFar.length ? played / stopsSoFar.length : 0 },
    ready: { big: Math.round(line.pct * 100) + '%', label: 'Ready', small: 'for Vegas', pct: line.pct },
  };
}

/* ---------- exports ---------- */

const cell = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
/* ---------- Union Bert ----------
   One character, dressed for whichever tournament is on. Every stop has its
   own Bert and the week in Las Vegas has his; `house` is the year-round one
   and the one a stop with no costume of its own falls back to.

   `head` is where the ball's face sits inside each drawing, as a share of the
   picture's width, height and width again: the centre of the circle and its
   radius. It is measured off the artwork once, per costume, because the hat
   sits differently on each of them and a photograph dropped in the wrong
   place eats the costume. A new Bert needs its own three numbers.

   They move with the POSE as well as the hat: every Bert stands differently,
   so one crouching to read a putt and one sat flat on the ground do not carry
   their heads anywhere near the same place in the frame. Measure after the
   drawing is final, never before. */
export const BERTS = [
  { id: 'house', name: 'Union Bert', note: 'The house one — a polo and no occasion.',
    head: [49.5, 20.5, 15.0], stop: null },
  { id: 'mulligan', name: 'Merry Mulligan Bert', note: 'Santa hat, snowflake jumper, a sprig of holly.',
    head: [48.9, 24.4, 16.3], stop: 'mulligan' },
  { id: 'frostbite', name: 'Frostbite Bert', note: 'Bobble hat, puffer, and a club with an icicle on it.',
    head: [37.5, 27.5, 14.0], stop: 'frostbite' },
  { id: 'sweetheart', name: 'Sweetheart Bert', note: 'Flat cap, a rose, and a heart on his jumper.',
    head: [49.0, 23.5, 14.5], stop: 'sweetheart' },
  { id: 'lucky', name: 'Lucky Links Bert', note: 'Emerald waistcoat and a clover, mid heel-click.',
    head: [51.0, 25.0, 15.0], stop: 'lucky' },
  { id: 'bloom', name: 'Bloom Bert', note: 'Straw boater and pink argyle, down on a knee reading a putt.',
    head: [44.5, 22.0, 15.0], stop: 'bloom' },
  { id: 'fiesta', name: 'Fiesta Bert', note: 'Serape and pompoms, dancing with the club overhead.',
    head: [48.5, 22.5, 15.0], stop: 'fiesta' },
  { id: 'summer', name: 'Summer Bert', note: 'Bucket hat and shorts, a hand up shading his eyes.',
    head: [45.5, 21.0, 15.0], stop: 'summer' },
  { id: 'firecracker', name: 'Firecracker Bert', note: 'Stars, stripes and a sparkler, at the top of the follow-through.',
    head: [50.0, 21.0, 15.0], stop: 'firecracker' },
  { id: 'dogdays', name: 'Dog Days Bert', note: 'Visor, towel and one bead of sweat, sat flat on the ground.',
    head: [47.0, 20.5, 15.0], stop: 'dogdays' },
  { id: 'harvest', name: 'Harvest Bert', note: 'Tweed and plus fours, arms folded, surveying.',
    head: [46.0, 20.0, 15.0], stop: 'harvest' },
  { id: 'pumpkin', name: 'Pumpkin Bert', note: 'Cape and a lantern, creeping up on tiptoes.',
    head: [48.5, 22.0, 15.0], stop: 'pumpkin' },
  { id: 'turkeyshoot', name: 'Turkey Shoot Bert', note: 'Buckled pilgrim hat, stood over the ball.',
    head: [50.0, 23.0, 15.0], stop: 'turkeyshoot' },
  { id: 'santa', name: 'Santa Swing Bert', note: 'The whole red suit, striding with the sack over his shoulder.',
    head: [47.5, 21.0, 15.0], stop: 'santa' },
  { id: 'vegas', name: 'Desert Showdown Bert', note: 'The hat and the boots. Las Vegas only.',
    head: [45.0, 24.0, 15.0], stop: null, week: true },
];
export const bertById = id => BERTS.find(b => b.id === id) || null;
/** The Bert a stop wears, or the house one when nobody has drawn it yet. */
export const bertForStop = sid => BERTS.find(b => b.stop && b.stop === sid) || BERTS[0];

/* ---------- a golfer's own page in the book ----------
   club/profile__<pid>: which Bert they go by and, if they have put one there,
   their own face to set into his head. Their row, written by them, read by
   everybody — the group decided it that way. */
export const profileOf = (T, pid) => (T && T.club && T.club['profile__' + pid]) || null;

/** The Bert this person goes by. Theirs if they picked one, else the house. */
export function bertOf(T, pid) {
  const pr = profileOf(T, pid);
  return (pr && pr.bert && bertById(pr.bert)) || BERTS[0];
}

/** Their face, if they put one in: a picture and where it sits in the circle. */
export function faceOf(T, pid) {
  const pr = profileOf(T, pid);
  const f = pr && pr.face;
  if (!f || !f.url) return null;
  return { url: f.url, thumb: f.thumb || null,
    x: f.x == null ? 50 : +f.x, y: f.y == null ? 42 : +f.y, zoom: f.zoom == null ? 130 : +f.zoom,
    at: f.at || null };
}

/* ---------- the player card ----------
   Everything the card shows is read off the cards already in the book: the
   gross on every hole, that hole's par and stroke index, and the handicap the
   card was played off. Nobody types a figure for this.

   Only finished, posted cards count, exactly as the Union handicap counts
   them, so the two can never disagree about how many rounds somebody has
   played. */

/** Scale a reading onto 0..99 between two anchors, so the five attributes can
 *  be read against each other and against somebody else's card. */
const cap99 = (v, lo, hi) => Math.max(1, Math.min(99, Math.round(((v - lo) / (hi - lo)) * 99)));
const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const r1 = n => Math.round(n * 10) / 10;

/** How many finished cards a player must have before the card says anything
 *  about what kind of golfer they are. Two rounds is a mood, not a shape. */
export const CARD_MIN = 3;

export function playerStats(T, pid, today) {
  const p = person(T, pid) || {};
  const got = stops(T)
    .map(s => ({ stop: s, card: cardOf(T, s.id, pid) }))
    .filter(x => x.card && x.card.done && cardTotals(x.card).thru === 18);

  const out = {
    pid, name: p.display || p.name || '', cards: got.length, ready: got.length >= CARD_MIN,
    form: [], byPar: [], bySi: [], nine: [], perHole: [], banker: null, nemesis: null,
    counts: { blanks: 0, netPar: 0, bonus: 0, capped: 0, run: 0, holes: 0 },
    marks: { avg: 0, opening: 0, closing: 0 }, attrs: null,
    hcp: { band: p.band == null ? null : +p.band, now: null, from: 'none', n: 0 },
    record: { played: 0, wins: 0, podiums: 0, best: null, merit: 0, meritPos: null, meritOf: 0 },
    h2h: [], courses: [],
  };
  const u = unionHcp(T, pid, today);
  out.hcp = { band: p.band == null ? null : +p.band, now: u.hcp, from: u.from, n: u.n,
    playing: u.hcp == null ? null : Math.round(u.hcp) };

  /* the record: where the finished stops left him */
  const closed = closedStops(T, today);
  for (const s of closed) {
    const row = stopBoard(T, s.id).find(r => r.pid === pid);
    if (!row) continue;
    out.record.played++;
    if (row.pos === 1) out.record.wins++;
    if (row.pos <= 3) out.record.podiums++;
    if (out.record.best == null || row.pos < out.record.best) out.record.best = row.pos;
  }
  const mrows = merit(T, today);
  const mine = mrows.find(r => r.pid === pid);
  out.record.merit = mine ? mine.pts : 0;
  out.record.meritPos = mine ? mine.pos : null;
  out.record.meritOf = mrows.length;

  if (!got.length) return out;

  /* the last six, newest last, with what each was worth off the handicap:
     thirty-six points is playing to it exactly */
  out.form = got.slice(-6).map(x => {
    const t = cardTotals(x.card);
    return { stop: x.stop.id, name: x.stop.name, pts: t.pts, off: t.pts - 36, at: x.card.at || null };
  });

  /* every hole of every card, flattened once and read many ways */
  const all = [];
  const seen = [];
  for (const x of got) {
    const nm = (x.card.course && x.card.course.name) || '';
    if (nm && seen.indexOf(nm) < 0) seen.push(nm);
    for (let h = 0; h < 18; h++) {
      const pts = holePts(x.card, h);
      if (pts == null) continue;
      const hole = x.card.course.holes[h];
      all.push({ h, par: +hole.par, si: +hole.si, raw: x.card.raw[h], pts });
    }
  }
  out.courses = seen;
  if (!all.length) return out;

  const where = f => all.filter(f);
  const ptsWhere = f => r1(mean(where(f).map(x => x.pts)));
  const overWhere = f => r1(mean(where(f).map(x => x.raw - x.par)));
  const avg = mean(all.map(x => x.pts));

  out.byPar = [3, 4, 5].map(par => ({ par, n: where(x => x.par === par).length,
    over: overWhere(x => x.par === par), pts: ptsWhere(x => x.par === par) }))
    .filter(r => r.n);
  out.bySi = [[1, 6, 'the hard six'], [7, 12, 'the middle six'], [13, 18, 'the gentle six']]
    .map(([a, b, label]) => ({ a, b, label, pts: ptsWhere(x => x.si >= a && x.si <= b),
      over: overWhere(x => x.si >= a && x.si <= b) }));
  out.nine = [['Front', 0, 8], ['Back', 9, 17]].map(([label, a, b]) => ({ label,
    pts: r1(mean(got.map(x => { let t = 0; for (let h = a; h <= b; h++) t += (holePts(x.card, h) || 0); return t; }))) }));
  out.marks = { avg: r1(avg), opening: ptsWhere(x => x.h <= 2), closing: ptsWhere(x => x.h >= 15) };

  out.counts.holes = all.length;
  out.counts.blanks = where(x => x.pts === 0).length;
  out.counts.netPar = where(x => x.pts === 2).length;
  out.counts.bonus = where(x => x.pts >= 3).length;
  out.counts.capped = where(x => x.raw === capFor(x.par)).length;
  let best = 0;
  for (const x of got) { let run = 0;
    for (let h = 0; h < 18; h++) { if ((holePts(x.card, h) || 0) > 0) { run++; if (run > best) best = run; } else run = 0; } }
  out.counts.run = best;

  /* The banker and the nemesis are about a particular hole, so they mean
     nothing once the cards come from more than one course: the 8th at one
     club is not the 8th at another. */
  out.perHole = Array.from({ length: 18 }, (_, h) => {
    const rows = where(x => x.h === h);
    const any = rows[0];
    return { n: h + 1, par: any ? any.par : null, si: any ? any.si : null, played: rows.length,
      pts: r1(mean(rows.map(x => x.pts))), over: r1(mean(rows.map(x => x.raw - x.par))) };
  });
  if (seen.length === 1) {
    const enough = out.perHole.filter(x => x.played >= CARD_MIN);
    if (enough.length) {
      out.banker = enough.slice().sort((a, b) => b.pts - a.pts || a.n - b.n)[0];
      out.nemesis = enough.slice().sort((a, b) => a.pts - b.pts || a.n - b.n)[0];
    }
  }

  /* the five, each one a reading of the holes above and nothing else */
  if (out.ready) {
    const share = n => n / all.length;
    out.attrs = [
      { k: 'Grind', v: cap99(out.bySi[0].pts, 0.6, 2.6),
        of: 'points a hole on stroke index 1 to 6', raw: out.bySi[0].pts + ' pts' },
      { k: 'Nerve', v: cap99(out.marks.closing - avg, -1.0, 0.6),
        of: 'points on 16, 17 and 18 against his own average',
        raw: (out.marks.closing >= avg ? '+' : '') + r1(out.marks.closing - avg) + ' pts' },
      { k: 'Fireworks', v: cap99(share(out.counts.bonus), 0.05, 0.35),
        of: 'share of holes worth three points or more', raw: out.counts.bonus + ' holes' },
      { k: 'Metronome', v: cap99(share(out.counts.netPar), 0.15, 0.50),
        of: 'share of holes at exactly two points', raw: out.counts.netPar + ' holes' },
      { k: 'Damage', v: 100 - cap99(share(out.counts.blanks), 0.05, 0.42),
        of: 'blank holes, counted the other way up', raw: out.counts.blanks + ' blanks' },
    ];
  }

  /* head to head: only stops where both of them posted a finished card */
  const mineBy = {};
  got.forEach(x => { mineBy[x.stop.id] = cardTotals(x.card).pts; });
  out.h2h = golfers(T).filter(g => g.id !== pid).map(g => {
    let w = 0, l = 0, d = 0;
    for (const sid of Object.keys(mineBy)) {
      const c = cardOf(T, sid, g.id);
      if (!c || !c.done || cardTotals(c).thru !== 18) continue;
      const them = cardTotals(c).pts;
      if (mineBy[sid] > them) w++; else if (mineBy[sid] < them) l++; else d++;
    }
    return { pid: g.id, name: g.display || g.name, w, l, d, n: w + l + d };
  }).filter(x => x.n).sort((a, b) => (b.w - b.l) - (a.w - a.l) || b.n - a.n || a.name.localeCompare(b.name));

  return out;
}

export const csv = rows => rows.map(r => r.map(cell).join(',')).join('\n') + '\n';

export function csvHeadcount(T) {
  const f = field(T);
  const rows = [['Name', 'Role', 'Playing', 'Status', 'Package', 'Nights', 'Golfing', 'Shirt', 'Initials on polo', 'Name on merch', 'Price', 'Paid', 'Outstanding']];
  for (const st of ['in', 'maybe']) for (const p of f[st]) {
    const L = ledger(T, p.id);
    rows.push([p.name, p.role, divisionLabel(divisionOf(T, p.id)), st, L.pkg ? L.pkg.name : '', L.pkg ? L.pkg.nights : '', L.pkg ? (L.pkg.golf ? 'yes' : 'no') : '', p.signup && p.signup.shirt || '', p.signup && p.signup.initials || '', p.signup && p.signup.nameOn || '', L.price, L.paid, L.left]);
  }
  return csv(rows);
}
export function csvRooms(T) {
  const rows = [['Room', 'Type', 'Guest', 'Nights', 'Package']];
  season(T).rooms.forEach((r, i) => (r.members || []).forEach(pid => {
    const p = person(T, pid), L = ledger(T, pid);
    rows.push([r.id || i + 1, r.type || '', p ? p.name : pid, L.pkg ? L.pkg.nights : '', L.pkg ? L.pkg.name : '']);
  }));
  return csv(rows);
}
export function csvTravel(T) {
  const rows = [['Name', 'Out date', 'Out flight', 'Lands', 'Back date', 'Back flight', 'Lands', 'Note']];
  const f = field(T);
  for (const p of f.in.concat(f.maybe)) {
    const t = travelOf(T, p.id) || {}; const o = t.out || {}, b = t.back || {};
    rows.push([p.name, o.date || '', o.flight || '', o.lands || '', b.date || '', b.flight || '', b.lands || '', t.note || '']);
  }
  return csv(rows);
}
