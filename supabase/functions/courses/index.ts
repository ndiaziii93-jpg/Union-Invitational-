/* The course book — finding any course in the world, not just the ones we typed in.
 *
 * A member setting up their home course should not copy eighteen pars, eighteen
 * stroke indexes and eighteen yardages off a scorecard by hand. They should type
 * the name of their club and tap it. That needs a course database, and a course
 * database needs an API key — and a key cannot live in a page that the group
 * installs on their phones, because this repository is public and so is the page.
 *
 * So the key lives here, in a Supabase secret only this function can read, and
 * the book asks this function instead of asking GolfCourseAPI.
 *
 * Deploy: Supabase dashboard -> Edge Functions -> Deploy a new function ->
 * name it `courses` -> paste this file -> Deploy.
 * Then Edge Functions -> courses -> Secrets, and add:
 *   GOLF_API_KEY   — the key from golfcourseapi.com (Pro tier; the free tier's
 *                    35 requests a day will not survive a group of twenty-three)
 * That secret is the only place the key goes. Not in the repository, not in the
 * app, not in a message, not in a screenshot.
 *
 * Without the secret this function answers `unconfigured`, and the book quietly
 * falls back to the courses already in it. Nothing breaks; the search simply
 * finds less.
 *
 * Note the wrapper, as in `recap`: the book calls with the project's PUBLISHABLE
 * key, which is not a JWT, so `auth` below is what lets it through.
 *
 * TWO THINGS THIS DELIBERATELY DOES NOT DO.
 *
 *   It does not trust the card it is given. Course data of this kind is
 *   gathered at scale and is often missing the stroke index, which is the one
 *   number the book cannot do without: the index decides which holes a member
 *   gets a shot on, so a wrong one quietly changes every result all season. Each
 *   tee set is checked here and marked `ok` only if it is eighteen holes, every
 *   par between 3 and 6, and every index from 1 to 18 exactly once. A card that
 *   fails still comes back, with `why` saying what is wrong, so a member can
 *   take the yardages and fill the rest in themselves — but the book never
 *   presents it as ready.
 *
 *   It does not keep a copy. The first member to save a course writes it into
 *   the book as their own, and from then on every other member finds it in the
 *   local search without this function being called at all. The database is for
 *   courses nobody here has played yet.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from 'jsr:@supabase/server@^1';

const API = 'https://api.golfcourseapi.com';
const MIN_Q = 3;          // a shorter query matches half the world and wastes a call
const MAX_Q = 60;
const MAX_HITS = 8;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });

type Hole = { par?: number; yardage?: number; meters?: number; handicap?: number };
type TeeBox = {
  tee_name?: string; course_rating?: number; slope_rating?: number;
  total_yards?: number; total_meters?: number; number_of_holes?: number;
  par_total?: number; holes?: Hole[];
};

/** Where a course is, in the few words a member needs to tell two apart. */
function placeOf(loc: Record<string, unknown> | undefined): string {
  if (!loc) return '';
  const bits = [loc.city, loc.state, loc.country].filter(x => typeof x === 'string' && x) as string[];
  if (bits.length) return [...new Set(bits)].join(', ');
  return typeof loc.address === 'string' ? loc.address : '';
}

/** The name to show: the club, and the course too when a club has more than one. */
function nameOf(c: Record<string, unknown>): string {
  const club = String(c.club_name || '').trim();
  const course = String(c.course_name || '').trim();
  if (!club) return course;
  if (!course || course.toLowerCase() === club.toLowerCase()) return club;
  return club + ' — ' + course;
}

/** One tee set, as the book's own card, with a verdict on whether it is usable. */
function cardOf(t: TeeBox, who: string) {
  const holes = Array.isArray(t.holes) ? t.holes : [];
  const out = holes.map(h => ({
    par: Number(h?.par) || null,
    si: Number(h?.handicap) || null,
    y: Number(h?.yardage) || null,
    m: Number(h?.meters) || null,
  }));
  let why = '';
  if (out.length !== 18) {
    why = out.length ? 'only ' + out.length + ' holes on this card' : 'no hole-by-hole card';
  } else if (!out.every(h => h.par && h.par >= 3 && h.par <= 6)) {
    why = 'a par on this card is missing or out of range';
  } else {
    const sis = out.map(h => h.si);
    if (sis.some(s => !s)) why = 'no stroke index on this card';
    else if (new Set(sis).size !== 18 || sis.some(s => (s as number) < 1 || (s as number) > 18)) {
      why = 'the stroke index on this card is not 1 to 18 once each';
    }
  }
  return {
    tee: String(t.tee_name || '').trim() || 'Unnamed',
    who,
    par: Number(t.par_total) || out.reduce((a, h) => a + (h.par || 0), 0) || null,
    yards: Number(t.total_yards) || null,
    rating: Number(t.course_rating) || null,
    slope: Number(t.slope_rating) || null,
    holes: out,
    ok: !why,
    why,
  };
}

async function callApi(path: string, key: string) {
  const r = await fetch(API + path, {
    headers: { Authorization: 'Bearer ' + key, accept: 'application/json' },
  });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, body };
}

async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'GET') return json({ error: 'GET only' }, 405);

  const key = Deno.env.get('GOLF_API_KEY') || '';
  if (!key) return json({ unconfigured: true, courses: [] });

  const u = new URL(req.url);
  const id = (u.searchParams.get('id') || '').trim().toLowerCase();
  const q = (u.searchParams.get('q') || '').trim().slice(0, MAX_Q);

  try {
    /* ---- one course, with every tee set on it ---- */
    if (id) {
      if (!/^[0-9abcdefghjkmnpqrstvwxyz]{8}$/.test(id)) return json({ error: 'not a course id' }, 400);
      const { status, body } = await callApi('/v1/courses/' + id, key);
      if (status === 401) return json({ error: 'the course book key was refused' }, 502);
      if (status === 404) return json({ error: 'no course with that id' }, 404);
      if (status >= 400) return json({ error: 'the course book is not answering' }, 502);
      const tees = (body?.tees || {}) as Record<string, TeeBox[]>;
      const cards: ReturnType<typeof cardOf>[] = [];
      for (const [who, list] of Object.entries(tees)) {
        if (!Array.isArray(list)) continue;
        for (const t of list) cards.push(cardOf(t, who));
      }
      /* longest first: a member looking for the whites finds them at the top */
      cards.sort((a, b) => (b.yards || 0) - (a.yards || 0));
      return json({
        course: {
          id: String(body?.id || id),
          name: nameOf(body || {}),
          place: placeOf(body?.location),
          scorecard: typeof body?.scorecard_url === 'string' ? body.scorecard_url : '',
          cards,
        },
      });
    }

    /* ---- the search ---- */
    if (q.length < MIN_Q) return json({ courses: [] });
    const { status, body } = await callApi(
      '/v1/search?search_query=' + encodeURIComponent(q) + '&fuzzy_match=true', key);
    if (status === 401) return json({ error: 'the course book key was refused' }, 502);
    if (status >= 400) return json({ error: 'the course book is not answering' }, 502);
    const list = Array.isArray(body?.courses) ? body.courses : [];
    return json({
      courses: list.slice(0, MAX_HITS).map((c: Record<string, unknown>) => ({
        id: String(c.id || ''),
        name: nameOf(c),
        place: placeOf(c.location as Record<string, unknown>),
        tees: Object.values((c.tees || {}) as Record<string, number>)
          .reduce((a: number, n) => a + (Number(n) || 0), 0),
      })).filter((c: { id: string }) => c.id),
    });
  } catch (_e) {
    return json({ error: 'the course book could not be reached' }, 502);
  }
}

export default {
  fetch: withSupabase({ auth: ['publishable', 'secret'] }, handler),
};
