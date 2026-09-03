/* The Union Invitational — static tournament data.
   Course scorecards, hole images, roster, calendar and rules are REAL and verified.
   Nothing here is simulated; player scores live in the shared store, not in this file. */

export const TZ_OFFSET_MIN = 180; // Antalya is UTC+3 all year (Turkey does not observe DST)

export const EVENT = {
  name: 'The Union Invitational',
  venue: 'Titanic Deluxe Golf Belek',
  place: 'Antalya, Türkiye',
  startISO: '2026-10-26',
  endISO: '2026-11-02',
};

/* Trip days. `iso` is the calendar date in Antalya local time. */
export const DAYS = [
  { n: 1, dow: 'Monday',    date: '26 Oct', iso: '2026-10-26' },
  { n: 2, dow: 'Tuesday',   date: '27 Oct', iso: '2026-10-27' },
  { n: 3, dow: 'Wednesday', date: '28 Oct', iso: '2026-10-28' },
  { n: 4, dow: 'Thursday',  date: '29 Oct', iso: '2026-10-29' },
  { n: 5, dow: 'Friday',    date: '30 Oct', iso: '2026-10-30' },
  { n: 6, dow: 'Saturday',  date: '31 Oct', iso: '2026-10-31' },
  { n: 7, dow: 'Sunday',    date: '1 Nov',  iso: '2026-11-01' },
  { n: 8, dow: 'Monday',    date: '2 Nov',  iso: '2026-11-02' },
];

/* Official Cullinan Links scorecards: [par, stroke index, metres White, metres Yellow] */
const ASPENDOS = [[4,4,396,366],[4,16,290,251],[3,18,124,104],[4,12,298,280],[5,8,429,410],[4,2,341,323],[3,14,110,95],[4,6,365,337],[5,10,447,420],[4,11,358,294],[5,9,478,447],[4,5,360,336],[3,13,152,144],[4,7,312,285],[4,1,346,320],[4,3,415,377],[3,15,139,117],[5,17,447,426]];
const OLYMPOS  = [[4,3,393,369],[3,13,156,135],[5,9,515,497],[3,11,130,123],[5,7,424,417],[4,1,376,345],[5,17,453,429],[3,15,141,123],[4,5,327,315],[4,4,312,302],[3,10,140,126],[4,14,258,248],[4,6,295,265],[4,16,290,254],[3,18,123,111],[5,2,436,411],[3,12,136,110],[5,8,486,449]];

function mkCourse(key, name, rows, meta) {
  return {
    key, name, meta,
    holes: rows.map(([par, si, mW, mY], i) => ({ n: i + 1, par, si, mW, mY, img: 'hole_' + key + '_' + (i + 1) })),
  };
}

export const COURSES = {
  aspendos: mkCourse('aspendos', 'Cullinan Aspendos', ASPENDOS, { par: 72, crW: 70.5, slW: 130, crY: 68.1, slY: 118 }),
  olympos:  mkCourse('olympos',  'Cullinan Olympos',  OLYMPOS,  { par: 71, crW: 68.3, slW: 122, crY: 66.7, slY: 114 }),
};

/* Roster. Bands are deliberately null — every golfer is assigned a 15 / 20 / 25
   playing band during setup before scoring can begin. */
export const GOLFERS = [
  ['g1',  'Norberto Diaz III', 'Norberto III'],
  ['g2',  'Norberto Diaz Jr.', 'Norberto Jr.'],
  ['g3',  'Matt D',            'Matt D'],
  ['g4',  'Manuel P',          'Manuel P'],
  ['g5',  'Gabriel P',         'Gabriel P'],
  ['g6',  'Ray V',             'Ray V'],
  ['g7',  'Robby B',           'Robby B'],
  ['g8',  'Dan A',             'Dan A'],
  ['g9',  'Duncan W',          'Duncan W'],
  ['g10', 'DP',                'DP'],
  ['g11', 'Devin O',           'Devin O'],
];
export const OFFICIALS  = [['o1','Justin P'],['o2','Manuel V'],['o3','Manny J']];
export const SPECTATORS = [['s1','Jennifer D'],['s2','Aimee K'],['s3','Letty D'],['s4','Drea'],['s5','Becky'],['s6','Cary'],['s7','Rosa Acuna'],['s8','Luigi Acuna'],['s9','Genesis Acuna']];

export const PAIRS = [
  { id: 'p1', name: null, members: ['g1', 'g2'] },
  { id: 'p2', name: null, members: ['g3', 'g4'] },
  { id: 'p3', name: null, members: ['g5', 'g6'] },
  { id: 'p4', name: null, members: ['g7', 'g8'] },
  { id: 'p5', name: null, members: ['g9', 'g10'] },
];

/* Rounds. Dates and first tee times are real; `counts` marks the three that
   feed the championship. Every round starts closed and empty. */
export const ROUNDS = [
  { id: 'practice', label: 'Practice — Get Loose Foursomes', full: 'Practice — Get Loose Foursomes', short: 'Practice', dayIdx: 2, course: 'aspendos', format: 'Get Loose — Foursomes',     counts: false, firstTee: '08:30', noMulligans: false },
  { id: 'r1',       label: 'Round 1 — Better Ball',          full: 'Round 1 — Better Ball team play', short: 'R1',       dayIdx: 4, course: 'olympos',  format: 'Better Ball',               counts: true,  firstTee: '08:30', noMulligans: false },
  { id: 'r2',       label: 'Round 2 — Better Ball',          full: 'Round 2 — Better Ball team play', short: 'R2',       dayIdx: 5, course: 'aspendos', format: 'Better Ball',               counts: true,  firstTee: '12:15', noMulligans: false },
  { id: 'r3',       label: 'Round 3 — Championship Final',   full: 'Round 3 — Championship Final', short: 'R3',       dayIdx: 7, course: 'olympos',  format: 'Better Ball — championship final', counts: true, firstTee: '12:15', noMulligans: true },
];

export const SCHEDULE = [
  { id: 'e1',  dayIdx: 1, time: '14:00', title: 'Check-in — 7-day group', kind: 'travel' },
  { id: 'e2',  dayIdx: 3, time: '14:00', title: 'Check-in — 5-day group', kind: 'travel' },
  { id: 'e3',  dayIdx: 3, time: '18:00', title: 'Opening Ceremony Dinner', kind: 'ceremony' },
  { id: 'e4',  dayIdx: 4, time: '18:00', title: 'Dinner', kind: 'social' },
  { id: 'e5',  dayIdx: 4, time: '19:00', title: 'Mandatory Team Beers', kind: 'social' },
  { id: 'e6',  dayIdx: 5, time: '09:30', title: 'Optional team breakfast', kind: 'social' },
  { id: 'e7',  dayIdx: 5, time: '18:00', title: 'Dinner', kind: 'social' },
  { id: 'e8',  dayIdx: 5, time: '19:00', title: 'Mandatory Team Beers', kind: 'social' },
  { id: 'e9',  dayIdx: 6, time: '18:00', title: 'Dinner', kind: 'social' },
  { id: 'e10', dayIdx: 6, time: '19:00', title: 'Mandatory Team Beers', kind: 'social' },
  { id: 'e11', dayIdx: 7, time: '17:00', title: 'Closing Ceremony & Dinner', kind: 'ceremony' },
  { id: 'e12', dayIdx: 7, time: '19:00', title: 'Mandatory Team Beers', kind: 'social' },
  { id: 'e13', dayIdx: 8, time: '12:00', title: 'Check-out & departure', kind: 'travel' },
];
