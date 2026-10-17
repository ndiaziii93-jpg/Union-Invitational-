/* ---------------- the holes, as ground ----------------
 *
 * Every hole in the book can be stood up as a modelled island: a centreline
 * from the tee to the green, a fairway along it, a green at the end, sand
 * where sand is, trees down the sides. The window draws it live and lays the
 * yardages over it.
 *
 * WHAT IS REAL AND WHAT IS NOT. The length is the card's — the white tees,
 * in metres — and the par is the card's. The SHAPE of a hole is only real
 * once somebody has traced it; until then it is drawn from the card, a
 * plausible hole of that length and par, bending the way its number says,
 * and the window says so. A traced hole goes in SHAPES below, keyed by
 * course and number, and takes over the moment it is there.
 *
 * Units are metres, the tee at the origin, the hole running away along -z.
 * Nothing here needs the 3D library: this is the description, not the
 * drawing.
 */

export const YARDS = 1.09361;

/** A traced hole: the same fields the generator makes, written by hand. */
export const SHAPES = {
  /* none traced yet */
};

/* A small deterministic random, seeded by the hole, so the same hole is the
   same hole every time it is opened and on every phone. */
function rng(seed) {
  let s = (seed * 9301 + 49297) % 233280;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}
function seedOf(key, n) {
  let h = n * 131;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) % 100003;
  return h;
}

/** The ground of one hole: control points for the line, the fairway, the
 *  green, the sand, how many trees. `traced` says whether the shape is a
 *  survey or a drawing from the card. */
export function model(courseKey, hole) {
  const shaped = SHAPES[courseKey + '_' + hole.n];
  if (shaped) return { ...shaped, key: courseKey + '_' + hole.n, par: hole.par, len: shaped.len || hole.mW, traced: true };
  const r = rng(seedOf(courseKey, hole.n));
  const L = Math.max(90, hole.mW || (hole.par === 3 ? 150 : hole.par === 5 ? 480 : 360));
  const s = r() < .5 ? -1 : 1;              // which way it bends
  let cl, fw, bunkers;
  if (hole.par === 3) {
    cl = [[0, 0], [s * (2 + r() * 4), -L * .5], [s * (4 + r() * 6), -L]];
    fw = { w0: 12, w1: 16, t0: .3, t1: .84 };
    bunkers = [{ t: .9, d: -s * (18 + r() * 6), rx: 7, rz: 5 }, { t: .99, d: s * (16 + r() * 5), rx: 6, rz: 4.5 }];
  } else if (hole.par === 5) {
    cl = [[0, 0], [s * (6 + r() * 6), -L * .3], [-s * (10 + r() * 10), -L * .62], [s * (14 + r() * 14), -L]];
    fw = { w0: 18, w1: 22, t0: .07, t1: .88 };
    bunkers = [{ t: .42 + r() * .1, d: s * (24 + r() * 4), rx: 9, rz: 6 }, { t: .66 + r() * .08, d: -s * (22 + r() * 4), rx: 8, rz: 6 },
               { t: .93, d: -s * (24 + r() * 4), rx: 8, rz: 5.5 }, { t: .985, d: s * (20 + r() * 4), rx: 7, rz: 5 }];
  } else {
    cl = [[0, 0], [-s * (2 + r() * 4), -L * .32], [s * (6 + r() * 8), -L * .66], [s * (16 + r() * 14), -L]];
    fw = { w0: 17, w1: 22, t0: .08, t1: .86 };
    bunkers = [{ t: .55 + r() * .12, d: s * (22 + r() * 5), rx: 9, rz: 6 }, { t: .93, d: -s * (24 + r() * 4), rx: 8, rz: 5.5 },
               { t: .985, d: s * (20 + r() * 4), rx: 7, rz: 5 }, { t: .9, d: s * (22 + r() * 4), rx: 6, rz: 4.5 }];
  }
  return { key: courseKey + '_' + hole.n, par: hole.par, len: L, cl, fw,
    green: { t: .965, rx: hole.par === 3 ? 16 : 19, rz: hole.par === 3 ? 12 : 13.5 },
    bunkers, trees: hole.par === 3 ? 36 : 60, seed: seedOf(courseKey, hole.n), traced: false };
}

/* ---------- where you are, on the model ----------
 *
 * A hole's ground is in metres from its tee. The phone's fix is in degrees.
 * The two meet through two surveyed points — the tee and the middle of the
 * green — which give the bearing of the hole and the scale of a degree
 * here. Until a hole has those two points nothing can be placed on it, and
 * the window reads from the tee instead. */
export function geoOf(T, courseKey, n) {
  const g = T && T.config && T.config.holeGeo && T.config.holeGeo[courseKey];
  const e = g && g[n];
  return e && Array.isArray(e.tee) && Array.isArray(e.green) ? e : null;
}
const R = 6371000;
function enu(lat0, lon0, lat, lon) {
  const k = Math.PI / 180;
  return { e: (lon - lon0) * k * R * Math.cos(lat0 * k), n: (lat - lat0) * k * R };
}
/** A fix, as a point on the hole's ground: x across, z along (negative
 *  towards the green). `greenZ` is where the model puts the green centre. */
export function localOf(geo, lat, lon, greenZ) {
  const tee = geo.tee, grn = geo.green;
  const g = enu(tee[0], tee[1], grn[0], grn[1]);
  const span = Math.hypot(g.e, g.n); if (!span) return null;
  const ux = g.e / span, un = g.n / span;        // unit vector tee -> green, in east/north
  const p = enu(tee[0], tee[1], lat, lon);
  const along = p.e * ux + p.n * un, across = p.e * -un + p.n * ux;
  const scale = Math.abs(greenZ) / span;        // the model's green is where the surveyed one is
  return { x: across * scale, z: -along * scale, scale };
}
