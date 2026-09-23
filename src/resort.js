/* The Titanic — the resort, for the people who are not on the golf course.
 *
 * Everything here was read off the hotel's own website in September 2026 and
 * is reproduced as reference, not as promise. Two facts shape the whole tab:
 *
 *  1. The resort runs a SUMMER and a WINTER operation, and most of the
 *     outdoor half of it simply closes for the winter. The hotel publishes
 *     both timetables but never says which date it turns over — so the book
 *     carries both, and the group sets the switch once somebody asks at
 *     reception. Our week, 26 October to 2 November, sits right on the seam.
 *
 *  2. The à la carte restaurants are marked on the hotel's site as "paid
 *     à la carte, reservations required, cover charge applies". The golf
 *     booking company told us something different. Until that is settled
 *     with the hotel, both readings are shown and neither is presented as
 *     the answer.
 *
 * Hours are HH:MM in resort local time. `null` means closed for that season.
 */

export const SEASONS = ['summer', 'winter'];

/* The hotel's address book. */
export const RESORT = {
  name: 'Titanic Deluxe Golf Belek',
  address: ['Kadriye Mah. Canada Cad. 32 K', 'Serik, 07525, Antalya, Türkiye'],
  phone: '+90 242 710 44 44',
  email: 'deluxegolf.belek@titanic-hotels.com',
  lat: 36.86854,
  lng: 30.97629,
};

/* ---------------- eating and drinking ----------------
   `kind`   buffet · snack · alacarte · bar · cafe
   `cost`   'inc'  included in all inclusive
            'cover' cover charge and a reservation, per the hotel's site
   `s` / `w` are lists of {from, to, what} — `what` only where the venue
   serves different things at different times.                             */

export const VENUES = [
  /* --- included --- */
  { id: 'main', name: 'Main Restaurant', kind: 'buffet', cost: 'inc',
    blurb: 'The buffet. Six sections under one roof, each with its own concept, and a separate area for children. Vegetarian, vegan and gluten-free are catered for without asking.',
    s: [{ from: '06:00', to: '08:00', what: 'Early breakfast — mini buffet' },
        { from: '08:00', to: '11:00', what: 'Breakfast' },
        { from: '12:30', to: '14:30', what: 'Lunch' },
        { from: '18:30', to: '21:15', what: 'Dinner' }],
    w: [{ from: '06:00', to: '08:00', what: 'Early breakfast — mini buffet' },
        { from: '08:00', to: '11:00', what: 'Breakfast' },
        { from: '12:30', to: '14:30', what: 'Lunch' },
        { from: '18:30', to: '21:00', what: 'Dinner' }],
    tag: 'The default' },

  { id: 'bistro', name: 'Bistro', kind: 'alacarte', cost: 'inc',
    blurb: 'Indoor and out, à la carte, and — the part that matters to anyone coming off a late round — no reservation, ever. Salads, pasta, burgers, grills.',
    s: [{ from: '18:00', to: '03:00' }],
    w: [{ from: '15:00', to: '03:00' }],
    tag: 'Open latest' },

  { id: 'kikoa-r', name: 'Kikoa Kids Restaurant', kind: 'buffet', cost: 'inc',
    blurb: 'A walled-off corner of the main restaurant built around a decorated railway carriage. It has equipment for parents to make up their own baby formula.',
    s: [{ from: '08:00', to: '11:00', what: 'Breakfast' },
        { from: '12:30', to: '14:30', what: 'Lunch' },
        { from: '18:30', to: '21:15', what: 'Dinner' }],
    w: null,
    note: 'Shown as closed in winter. If it is, ask where the formula-making kit has moved to — it will not have gone away.' },

  { id: 'hasir-s', name: 'Hasır Snack', kind: 'snack', cost: 'inc',
    blurb: 'Poolside. Döner, grills, fast food, fresh pide, lahmacun and salads.',
    s: [{ from: '12:30', to: '16:00' }, { from: '16:00', to: '17:30' }], w: null },

  { id: 'aqua-s', name: 'Aqua Snack', kind: 'snack', cost: 'inc',
    blurb: 'On the riverside by the aquapark. Soup, pizza, pasta, grills.',
    s: [{ from: '12:15', to: '16:00' }], w: null },

  { id: 'riva', name: 'Riva Beach Snack', kind: 'snack', cost: 'inc',
    blurb: 'On the sand. Fish and salads.',
    s: [{ from: '12:30', to: '16:00' }], w: null },

  { id: 'sapore', name: 'Sapore Beach Snack', kind: 'snack', cost: 'inc',
    blurb: 'Also on the sand. Pizza, pasta, salads.',
    s: [{ from: '12:30', to: '16:00' }], w: null },

  /* --- cover charge, per the hotel --- */
  { id: 'pascarella', name: 'Pascarella', kind: 'alacarte', cost: 'cover', cuisine: 'Italian',
    blurb: 'Trattoria by the river, with a wine list worth the walk. In winter it serves a fish menu on some nights and the Italian menu on the rest.',
    s: [{ from: '19:00', to: '21:30' }], w: [{ from: '19:00', to: '21:30' }] },

  { id: 'nori', name: 'Nori', kind: 'alacarte', cost: 'cover', cuisine: 'Asian',
    blurb: 'Chinese and Japanese, riverside.',
    s: [{ from: '19:00', to: '21:30' }], w: [{ from: '19:00', to: '21:30' }] },

  { id: 'teppan', name: 'Teppanyaki', kind: 'alacarte', cost: 'cover', cuisine: 'Japanese',
    blurb: 'Steak, chicken and seafood cooked on the iron griddle in front of you. It is a show as much as a dinner.',
    s: [{ from: '19:00', to: '22:00' }], w: [{ from: '19:00', to: '22:00' }],
    tag: 'Open all year' },

  { id: 'beef', name: 'Beef Grill Club', kind: 'alacarte', cost: 'cover', cuisine: 'Steak',
    blurb: 'Aged and dry-stored cuts, by the river. Villa guests can also take the village breakfast here.',
    s: [{ from: '19:00', to: '21:30' }], w: [{ from: '19:00', to: '21:30' }] },

  { id: 'hasir-a', name: 'Hasır', kind: 'alacarte', cost: 'cover', cuisine: 'Turkish',
    blurb: 'Mezes, grills and kebabs out of the Anatolian tradition, set on the river.',
    s: [{ from: '19:00', to: '21:30' }], w: null },

  { id: 'yamas', name: 'Yamas', kind: 'alacarte', cost: 'cover', cuisine: 'Greek & seafood',
    blurb: 'Fish and premium seafood, riverside, done up with a Greek accent.',
    s: [{ from: '19:00', to: '21:30' }], w: null },

  { id: 'boat', name: 'Dinner on the Boat', kind: 'alacarte', cost: 'cover', cuisine: 'Set menu',
    blurb: 'A boat on the Beşgöz, to yourselves, with dinner on it.',
    s: [{ from: '19:00', to: '21:30' }], w: null },

  { id: 'club-bk', name: 'The Club Breakfast', kind: 'alacarte', cost: 'cover', cuisine: 'Turkish breakfast',
    blurb: 'Serpme kahvaltı — the spread-out village breakfast: cheeses, olives, pastries, jams, honey. Free with some room types.',
    s: [{ from: '09:00', to: '11:00' }], w: null },

  /* --- bars and cafés --- */
  { id: 'cordelia', name: 'Cordelia Lobby Bar', kind: 'bar', cost: 'inc',
    blurb: 'The lobby bar. Turkish coffee after breakfast, and the obvious place to agree to meet.',
    s: [{ from: '09:00', to: '23:30' }], w: [{ from: '09:00', to: '23:30' }] },

  { id: 'caprice', name: 'Caprice Bar & Patisserie', kind: 'cafe', cost: 'inc',
    blurb: 'The bar never shuts. The cake counter keeps office hours.',
    s: [{ from: '00:00', to: '24:00', what: 'Bar' },
        { from: '14:30', to: '22:00', what: 'Patisserie' }],
    w: [{ from: '00:00', to: '24:00', what: 'Bar' },
        { from: '14:30', to: '22:00', what: 'Patisserie' }],
    tag: '24 hours' },

  { id: 'noble', name: 'Noble Irish Bar', kind: 'bar', cost: 'inc',
    blurb: 'The one with the football on. Open all year, and open late.',
    s: [{ from: '16:00', to: '00:00' }], w: [{ from: '16:00', to: '00:00' }],
    tag: 'Sport on' },

  { id: 'citrus', name: 'Citrus Vitamin Bar', kind: 'cafe', cost: 'inc',
    blurb: 'Juices and healthy things, inside the spa.',
    s: [{ from: '10:00', to: '20:00' }], w: [{ from: '10:00', to: '20:00' }] },

  { id: 'bebek', name: 'Bebek Café', kind: 'cafe', cost: 'inc',
    blurb: 'Opens earlier in winter than in summer, which makes it the daytime café once the season turns.',
    s: [{ from: '16:00', to: '23:30' }], w: [{ from: '09:00', to: '23:30' }] },

  { id: 'jacaranda', name: 'Jacaranda Bar', kind: 'bar', cost: 'inc',
    s: [{ from: '09:00', to: '00:00', what: 'Bar' }, { from: '11:00', to: '18:00', what: 'Patisserie' }], w: null },
  { id: 'dalia', name: 'Dalia Bar', kind: 'bar', cost: 'inc', s: [{ from: '09:00', to: '18:00' }], w: null },
  { id: 'sunset1', name: 'Sunset 1 Bar', kind: 'bar', cost: 'inc', s: [{ from: '19:00', to: '23:30' }], w: null },
  { id: 'sunset2', name: 'Sunset 2 Bar', kind: 'bar', cost: 'inc', s: [{ from: '09:00', to: '23:30' }], w: null },
  { id: 'olimpic', name: 'Olimpic Pool Bar', kind: 'bar', cost: 'inc', s: [{ from: '09:00', to: '18:00' }], w: null },
  { id: 'waffle', name: 'Beach Waffle Bar', kind: 'cafe', cost: 'inc', s: [{ from: '09:00', to: '19:00' }], w: null },
  { id: 'pier-bar', name: 'Beach Pier Bar', kind: 'bar', cost: 'inc',
    s: [{ from: '09:00', to: '18:00', what: 'Bar' }, { from: '11:00', to: '19:00', what: 'Patisserie' }], w: null },
  { id: 'aqua-bar', name: 'Aqua Bar', kind: 'bar', cost: 'inc', s: [{ from: '09:00', to: '18:00' }], w: null },
  { id: 'beach-bar', name: 'Beach Bar', kind: 'bar', cost: 'inc', s: [{ from: '09:00', to: '18:00' }], w: null },
  { id: 'schiller', name: 'Schiller Coffee Shop', kind: 'cafe', cost: 'inc', s: [{ from: '08:00', to: '12:30' }], w: null },
  { id: 'rivershow', name: 'River Show Bar', kind: 'bar', cost: 'inc', s: [{ from: '21:30', to: '22:30' }], w: null },
  { id: 'disco', name: 'Floating Disco', kind: 'bar', cost: 'cover',
    blurb: 'Over-18s, on the water. Cover charge and a reservation.',
    s: [{ from: '23:00', to: '01:00' }], w: null },
];

/* ---------------- the spa ----------------
   The hotel publishes no opening hours for BeFine at all, so the book does
   not invent any. What is free and what is charged came from the golf
   booking company's own list of inclusions, which is the more reliable of
   the two sources on that question. */

export const SPA = {
  name: 'BeFine Spa',
  size: '13,000 m²',
  blurb: 'Thirteen thousand square metres of Ottoman-orientalist bathhouse: hamam, saunas, steam rooms, an ice grotto, adventure showers and a run of pools at graded temperatures. The hotel publishes no opening hours for it — worth asking at reception on the first evening.',
  free: [
    'Turkish bath (hamam)',
    'Sauna — traditional and bio',
    'Steam bath',
    'Resting lodges',
    'Snow fountain',
    'Shock showers, warm pools and the shock pool',
    'Indoor swimming pools (semi-Olympic)',
    'Outdoor seawater pool',
    'Fitness centre',
    'Vitamin bar',
  ],
  paid: [
    'Massage and foam-rub services',
    'Skin and body care',
    'VIP spa and the Spa Suites',
  ],
  detail: [
    ['The hamam', 'Six pillars and two private chambers, ceramics painted with scenes of Ottoman baths, a lion’s-head hot pool and a marble massage platform — heated by hot water under the floor, as the originals were. The Valide Sultan bath alongside it has three closed chambers with basins.'],
    ['The pools', 'Four in the spa: a 300 m² warm pool, an indoor pre-Olympic pool, a cold pool and an outdoor seawater pool, plus a heated children’s pool. Four more small relaxation pools are held at 20, 25 and 30 degrees.'],
    ['Relaxation chambers', 'A star-shaped pool under an orientalist ceiling, floors heated from below, and the vitamin bar serving hot and cold drinks.'],
    ['Spa suites', 'Private sauna, steam room, bath and rest area, taken as a single booking. Charged.'],
  ],
};

/* ---------------- water, indoors and out ----------------
   Twelve pools. In late October the distinction that matters is heated or
   not, so that is what the book leads with. */

export const POOLS = [
  { name: 'Indoor pool', heated: true, indoor: true },
  { name: 'Indoor kids’ pool', heated: true, indoor: true },
  { name: 'Indoor jacuzzi pool', heated: true, indoor: true },
  { name: 'Outdoor seawater pool', heated: true, indoor: false },
  { name: 'Lion’s Mouth hamam pool', heated: true, indoor: true },
  { name: 'Olympic pool', heated: true, indoor: false, note: '50 × 25 m, ten lanes, 2.2 m deep. Held for groups.' },
  { name: 'Main outdoor pool', heated: false, indoor: false },
  { name: 'Relax pool', heated: false, indoor: false },
  { name: 'Family kids’ pool', heated: false, indoor: false },
  { name: 'Activity kids’ pool', heated: false, indoor: false },
  { name: 'Slide pool — adults', heated: false, indoor: false },
  { name: 'Slide pool — kids', heated: false, indoor: false },
];

/* ---------------- everything else on the grounds ---------------- */

export const DOING = [
  { id: 'beach', name: 'The beach', season: 'all',
    body: 'Over a kilometre of private sand, with a wooden playground at one end and gazebos you can take for the day. The gazebos are charged.' },
  { id: 'spa', name: 'BeFine Spa', season: 'all',
    body: 'See the spa section. Free to use; treatments are charged.' },
  { id: 'fitness', name: 'Fitness centre', season: 'all',
    body: 'Two floors, 620 m², Technogym throughout, with a stretching area and a running track.' },
  { id: 'tennis', name: 'Tennis', season: 'all',
    body: 'Three clay courts, all floodlit.' },
  { id: 'river', name: 'The Beşgöz river', season: 'all',
    body: 'Runs through the resort to the sea. Turtles, ducks and reed beds; canoes and kayaks; a boat down to the beach, and a walk along the golf course beside it. Birdwatching and fishing if you want them.' },
  { id: 'golf', name: 'Cullinan Links Golf Club', season: 'all',
    body: 'Next door, between the river and the sea, with the Taurus mountains behind. A free shuttle runs from the hotel — which is also how to get out and watch a few holes without playing.' },
  { id: 'kids', name: 'Kikoa Kids Club', season: 'all',
    body: 'Six thousand square metres. Summer 09:00–00:00, winter 10:00–21:00. Ages 0–3 stay with a parent in a room fitted with a bedroom, a nursing room and a changing room; 4–6, 7–11 and 11+ each have their own programme. Paid care for over-24-months. Kikoa Gurme serves snacks 09:00–21:00 and an à la carte children’s menu at meal times.' },
  { id: 'aquapark', name: 'Aquapark', season: 'summer',
    body: 'Fifteen thousand square metres, nine adult slides across three towers and a children’s tower with seven more. The Looping Rocket fires you twenty metres up before the drop; the Rift is the only one of its kind in the region. Both restaurants that serve it close for the winter, so assume the park does too.' },
  { id: 'entertainment', name: 'Shows and clubs', season: 'summer',
    body: 'The open-air Riverside Show Center sits between the monumental pool and the river — dance, acrobatics, DJs and live acts. The Eternity Club and The Pier run theme nights. A mini disco for children every evening.' },
  { id: 'sports', name: 'Games and lessons', season: 'summer',
    body: 'Canoeing, water cycling, beach football, beach volleyball, water polo, darts, table tennis, basketball, step and aerobics, water gymnastics, kangoo jump, five-a-side, bowling, billiards and a PlayStation room. Private lessons and the sport academy are charged.' },
];

/* ---------------- the ground itself ----------------
   Taken from the hotel's own interactive site plan, which positions every
   point as a percentage across and down the map. The percentages are
   reproduced here so the book can draw its own plan rather than borrow
   theirs — offline, on brand, and legible on a phone.

   The hotel's plan is older than its restaurant list, so a few names on it
   have since changed; `now` carries the current one where it has.          */

export const PLAN = [
  { t: 'Lobby & Reception',        c: 'core',  x: 30.13, y: 18.82, key: true },
  { t: 'Fireplace Lounge',         c: 'core',  x: 28.15, y: 20.26 },
  { t: 'Titanic Square',           c: 'core',  x: 28.85, y: 32.36, key: true },
  { t: 'Convention Center',        c: 'core',  x: 19.39, y: 25.49 },
  { t: 'Titanic Villas',           c: 'stay',  x: 48.78, y: 33.66 },
  { t: 'Maldive Houses',           c: 'stay',  x: 45.28, y: 46.52 },
  { t: 'Family Pool Suites',       c: 'stay',  x: 51.79, y: 43.60 },

  { t: 'Main Restaurant',          c: 'eat',   x: 22.36, y: 42.27, vid: 'main' },
  { t: 'Cordelia Bar',             c: 'eat',   x: 33.36, y: 23.83, vid: 'cordelia' },
  { t: 'Caprice Bar & Patisserie', c: 'eat',   x: 28.00, y: 44.39, vid: 'caprice' },
  { t: 'Pascarella',               c: 'eat',   x: 31.38, y: 38.89, vid: 'pascarella' },
  { t: 'Okeanos',                  c: 'eat',   x: 29.85, y: 62.75, now: 'Yamas', vid: 'yamas' },
  { t: 'Asian Kitchen',            c: 'eat',   x: 60.97, y: 60.79, now: 'Nori', vid: 'nori' },
  { t: 'Beef Grill Club',          c: 'eat',   x: 64.11, y: 64.06, vid: 'beef' },
  { t: 'Hasır',                    c: 'eat',   x: 40.30, y: 67.41, vid: 'hasir-a' },
  { t: 'Pita Pan Snack',           c: 'eat',   x: 41.89, y: 62.80 },
  { t: 'Sapore',                   c: 'eat',   x: 62.95, y: 37.68, vid: 'sapore' },
  { t: 'Stella Beach Snack & Bar', c: 'eat',   x: 68.92, y: 54.16 },
  { t: 'The Club',                 c: 'eat',   x: 62.58, y: 57.52 },
  { t: 'Palm Bar & Patisserie',    c: 'eat',   x: 64.64, y: 40.91 },
  { t: 'Centric Pool Bar',         c: 'eat',   x: 38.32, y: 53.27 },
  { t: 'Comfort Pool Bar',         c: 'eat',   x: 51.80, y: 54.16 },
  { t: 'Olympic Pool Bar',         c: 'eat',   x: 43.73, y: 37.91, vid: 'olimpic' },
  { t: 'The Pier Night Club',      c: 'eat',   x: 46.01, y: 64.83, vid: 'disco' },

  { t: 'BeFine Spa',               c: 'play',  x: 38.54, y: 32.19 },
  { t: 'Main Pool',                c: 'play',  x: 40.94, y: 47.39 },
  { t: 'Seawater Pool — heated',   c: 'play',  x: 40.94, y: 33.34 },
  { t: 'Olympic Pool — heated',    c: 'play',  x: 46.44, y: 41.18 },
  { t: 'Pool Cabanas',             c: 'play',  x: 36.71, y: 42.19 },
  { t: 'Aquapark',                 c: 'play',  x: 73.66, y: 72.81 },
  { t: 'Kids’ Aquapark',           c: 'play',  x: 60.42, y: 52.80 },
  { t: 'Kikoa Kids Club',          c: 'play',  x: 40.67, y: 24.19, now: 'Kikoa' },
  { t: 'Kids’ Amphitheatre',       c: 'play',  x: 43.19, y: 26.47 },
  { t: 'Kids’ Play Area',          c: 'play',  x: 70.26, y: 50.93 },
  { t: 'Riverside Show Center',    c: 'play',  x: 35.31, y: 61.60 },
  { t: 'Woodsman Fitness',         c: 'play',  x: 62.94, y: 24.84 },
  { t: 'Sports Area',              c: 'play',  x:  6.76, y: 38.89 },
  { t: 'Activity Area',            c: 'play',  x: 51.36, y: 62.57 },
  { t: 'River Sport',              c: 'play',  x: 20.24, y: 63.86 },
  { t: 'Beach Volley',             c: 'play',  x: 23.81, y: 52.95 },
  { t: 'Beach Volley — north',     c: 'play',  x: 58.04, y: 22.49 },
  { t: 'Beach Football',           c: 'play',  x: 74.18, y: 62.57 },
  { t: 'Water Sports',             c: 'play',  x: 67.50, y:  8.36 },
  { t: 'Cullinan Links Golf Club', c: 'play',  x: 51.44, y: 27.02 },

  { t: 'Beach Pier',               c: 'shore', x: 69.19, y: 66.12 },
  { t: 'Haydarpaşa Pier',          c: 'shore', x: 67.05, y: 64.12 },
  { t: 'Beach Gazebos',            c: 'shore', x: 83.45, y: 55.46 },
  { t: 'Sunbeds',                  c: 'shore', x: 68.83, y: 19.91 },
  { t: 'Beach & Golf Club Road',   c: 'shore', x: 64.29, y: 54.58 },
];

/* `key: true` marks the two points the whole resort is navigated by. They
   keep their names on the plan whatever is selected; naming all four of the
   arrival points at once has them sitting on top of one another. */

/** The bounding box of every point, with room left for the labels that sit
 *  above them. The plan is drawn to this rather than to a round 0–100, which
 *  would be four fifths empty paper. */
export const PLAN_BOX = { x: 2, y: 3, w: 87, h: 75 };

export const PLAN_KEYS = [
  ['core',  'Arrival & square'],
  ['stay',  'Where you sleep'],
  ['eat',   'Eating & drinking'],
  ['play',  'Pools, spa & sport'],
  ['shore', 'The shore'],
];

/* ---------------- finding it on the ground ----------------
   Google does not hold the resort's own footpaths, and the book has no
   satellite fix for any single bar within the grounds — the site plan gives
   each point only as a percentage across a drawing. So a link out is a
   SEARCH for the place by name against the hotel, which lands on the venue
   where Google knows it and on the hotel where it does not, rather than a
   set of coordinates the book would be making up. The hotel itself is the
   one thing we do have a real fix for, so that link is a true one. */

export function findUrl(name) {
  return 'https://www.google.com/maps/search/?api=1&query='
    + encodeURIComponent(name + ' ' + RESORT.name);
}

/** Walking directions back to the hotel — from an actual latitude and longitude. */
export function hotelUrl() {
  return 'https://www.google.com/maps/dir/?api=1&travelmode=walking&destination='
    + RESORT.lat + ',' + RESORT.lng;
}

/* ---------------- things it is useful to know ---------------- */

export const PRACTICAL = [
  { q: 'Getting here',
    a: 'Antalya International Airport is about 35 km west. The hotel’s own site says twenty minutes; allow forty and you will not be wrong.' },
  { q: 'Wi-Fi',
    a: 'Free, and in every room.' },
  { q: 'Which season are we in?',
    a: 'Our week sits on the join. The hotel runs two timetables and does not publish the changeover date, so whoever asks at reception first should set the switch at the top of this tab — it re-times everything below.' },
  { q: 'Do the à la carte restaurants cost extra?',
    a: 'The hotel’s website says yes — cover charge, reservation required — on every one of them. The golf booking company indicated otherwise. Nobody should assume until it has been asked at reception, and whoever asks should write the answer into the note below.' },
  { q: 'Booking a table',
    a: 'Every à la carte needs a reservation. Bistro never does, and it runs to three in the morning, which makes it the fallback after a long day.' },
  { q: 'With a baby',
    a: 'The kids’ restaurant has equipment for making up formula, the kids’ club has a nursing room and a changing room, and paid care starts at 24 months. Indoor pools are heated; most outdoor pools are not. The spa’s small pools are held at 20, 25 and 30 degrees.' },
  { q: 'Watching the golf',
    a: 'Cullinan Links is next door and a free shuttle runs from the hotel, so anyone can come out for a few holes and get a lift back.' },
];

/* ---------------- clock helpers ----------------
   A venue can run past midnight — the Bistro shuts at three — so an interval
   is treated as a window on a circle rather than a line. */

export function toMin(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  return m ? (+m[1]) * 60 + (+m[2]) : null;
}

export function fmt(hhmm) {
  const t = toMin(hhmm);
  if (t == null) return '';
  const h = Math.floor(t / 60) % 24, mm = t % 60;
  const ap = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return mm ? `${h12}:${String(mm).padStart(2, '0')}${ap}` : `${h12}${ap}`;
}

/** The hours a venue keeps in the given season, or null if it is shut. */
export function slots(v, season) {
  return (season === 'winter' ? v.w : v.s) || null;
}

/** A venue that never shuts. Written as midnight to midnight, which would
 *  otherwise come out of the clock as the useless "12am–12am". */
export function isAllDay(slot) { return slot.from === '00:00' && slot.to === '24:00'; }

/** Is `min` (minutes past midnight) inside this slot? Handles wrapping. */
export function inSlot(slot, min) {
  const a = toMin(slot.from), b = toMin(slot.to);
  if (a == null || b == null) return false;
  if (b === 1440 && a === 0) return true;          // the 24-hour bar
  return b > a ? (min >= a && min < b) : (min >= a || min < b);
}

/** Minutes until this slot opens, or 0 if it is open now. */
export function untilOpen(slot, min) {
  if (inSlot(slot, min)) return 0;
  const a = toMin(slot.from);
  if (a == null) return Infinity;
  return a >= min ? a - min : a + 1440 - min;
}

/** Everything serving at `min`, and what opens next, for one season. */
export function whatsOn(season, min) {
  const open = [], soon = [];
  for (const v of VENUES) {
    const ss = slots(v, season);
    if (!ss) continue;
    const now = ss.filter(s => inSlot(s, min));
    if (now.length) { open.push({ v, slots: now }); continue; }
    let best = null;
    for (const s of ss) {
      const d = untilOpen(s, min);
      if (best == null || d < best.in) best = { slot: s, in: d };
    }
    if (best && best.in <= 240) soon.push({ v, slot: best.slot, in: best.in });
  }
  /* Somewhere you can walk into comes before somewhere that wants a
     reservation and a cover charge — at half past nine at night that is the
     whole of the difference between the two. */
  const rank = { buffet: 0, alacarte: 1, snack: 2, bar: 3, cafe: 4 };
  open.sort((a, b) => (a.v.cost === b.v.cost ? 0 : a.v.cost === 'inc' ? -1 : 1)
    || (rank[a.v.kind] - rank[b.v.kind]) || a.v.name.localeCompare(b.v.name));
  soon.sort((a, b) => a.in - b.in);
  return { open, soon };
}

/** How many of everything stays open once the season turns. */
export function seasonToll() {
  let shut = 0;
  for (const v of VENUES) if (!v.w) shut++;
  return { total: VENUES.length, shut, open: VENUES.length - shut };
}
