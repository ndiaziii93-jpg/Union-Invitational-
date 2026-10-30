/* The Day's Recap — the one thing the book cannot do by itself.
 *
 * Asking Claude needs an API key, and a key cannot live in a page that
 * twenty-three people install on their phones. So it lives here, in a
 * Supabase secret that only this function can read, and the book asks the
 * function instead of asking Anthropic.
 *
 * Deploy: Supabase dashboard -> Edge Functions -> Deploy a new function ->
 * name it `recap` -> paste this file -> Deploy.
 * Then Edge Functions -> recap -> Secrets, and add ANTHROPIC_API_KEY.
 *
 * Note the wrapper. The book calls this with the project's PUBLISHABLE key,
 * and the 2026 keys are not JWTs — a function left on the default JWT check
 * rejects them before this file ever runs, and a page that sends one as a
 * bearer token gets a 401 with a message about a token it never had. The
 * `auth` list below is what says a publishable key may call this, and the
 * book sends that key in the `apikey` header where it belongs.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from 'jsr:@supabase/server@^1';
import { createClient } from 'npm:@supabase/supabase-js@2';

const MODEL = 'claude-opus-5';
const MAX_PROMPT = 60_000;      // a whole day's cards is a few thousand characters
const MAX_TOKENS = 6_000;       // a headline, eight to ten paragraphs, the voices and the honours

/* The book is installed on phones, so the function is called from a browser
   and needs to answer the preflight. */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });

async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'post a prompt' }, 405);

  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return json({ error: 'not_granted', message: 'No API key is set on this project.' }, 500);

  let prompt = '';
  let system: string | undefined;
  let pid = '', pin = '', rolePin = '';
  try {
    const body = await req.json();
    prompt = String(body?.prompt ?? '');
    if (body?.system) system = String(body.system);
    pid = String(body?.pid ?? ''); pin = String(body?.pin ?? ''); rolePin = String(body?.rolePin ?? '');
  } catch {
    return json({ error: 'bad_request', message: 'Send {"prompt": "..."}' }, 400);
  }

  /* WHO IS ASKING. The writer answers a phone the book can place: a name it
     has claimed with its PIN, or a role PIN. The same server functions the
     book uses judge it; a phone with neither gets nothing, and the key is
     spent on nobody who is not on the trip. */
  const apikey = req.headers.get('apikey') || '';
  const supaUrl = Deno.env.get('SUPABASE_URL') || '';
  const asAnon = createClient(supaUrl, apikey, { auth: { persistSession: false } });
  let placed = false;
  try {
    if (/^[0-9]{4,8}$/.test(rolePin)) { const { data } = await asAnon.rpc('verify_pin', { p_pin: rolePin, p_who: 'writer' }); placed = data === 'master' || data === 's1' || data === 's2'; }
    if (!placed && pid && /^[0-9]{4}$/.test(pin)) { const { data } = await asAnon.rpc('check_name', { p_pid: pid, p_pin: pin, p_who: 'writer' }); placed = data === true; }
  } catch (e) { console.error('place', String(e).slice(0, 200)); }
  if (!placed) return json({ error: 'not_granted', message: 'Choose your name in the book (with your PIN) before asking.' }, 401);

  /* HOW MUCH. A day's worth across the whole trip, kept on the book's own
     log row with the service key, which no phone holds. */
  const DAILY_CAP = 150;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (serviceKey) {
    try {
      const asOwner = createClient(supaUrl, serviceKey, { auth: { persistSession: false } });
      const day = new Date().toISOString().slice(0, 10);
      const { data: rows } = await asOwner.from('docs').select('doc').eq('path', 'diag/ai_usage').limit(1);
      const u = (rows && rows[0] && rows[0].doc) || {};
      const n = u.day === day ? Number(u.n || 0) : 0;
      if (n >= DAILY_CAP) return json({ error: 'rate_limited', message: 'The writer has done a full day\'s work. Ask again tomorrow.' }, 429);
      await asOwner.from('docs').upsert({ path: 'diag/ai_usage', doc: { k: 'usage', day, n: n + 1, last: pid || 'role' }, writer: 'writer' }, { onConflict: 'path' });
    } catch (e) { console.error('usage', String(e).slice(0, 200)); }
  }

  /* Anyone who can open the book can call this, which is the same set of
     people who can score — so the guard that matters is not who, but how
     much. A capped prompt and a capped answer mean a runaway page cannot
     spend more than pennies, and the spend limit in the Anthropic console
     is the real backstop. */
  if (!prompt.trim()) return json({ error: 'bad_request', message: 'Nothing to write about.' }, 400);
  if (prompt.length > MAX_PROMPT) {
    return json({ error: 'prompt_too_large', message: 'There is too much to read at once.' }, 413);
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        /* Adaptive thinking is on by default on this model. A recap is three
           paragraphs about a round of golf, not a proof, so it runs at medium
           effort: the writing is no worse and the day costs a few pence
           rather than a few tens of pence across a week of regenerating. */
        output_config: { effort: 'medium' },
        ...(system ? { system } : {}),
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      /* Pass the shape of the failure back, never the key or the raw body. */
      const code = res.status === 401 ? 'not_granted'
        : res.status === 429 ? 'rate_limited'
        : res.status === 400 ? 'bad_request'
        : 'upstream_error';
      console.error('anthropic', res.status, detail.slice(0, 300));
      return json({ error: code, message: 'Claude did not answer (' + res.status + ').' }, 502);
    }

    const data = await res.json();

    /* A safety decline arrives as a perfectly good 200, so the stop reason is
       checked before the content is read. */
    if (data?.stop_reason === 'refusal') {
      return json({ error: 'refused', message: 'It would not write that one.' }, 200);
    }

    const text = (data?.content ?? [])
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('');

    return json({
      text,
      truncated: data?.stop_reason === 'max_tokens',
      usage: { in: data?.usage?.input_tokens ?? 0, out: data?.usage?.output_tokens ?? 0 },
    });
  } catch (e) {
    console.error('recap', String(e).slice(0, 300));
    return json({ error: 'upstream_error', message: 'That did not come back. Try again in a moment.' }, 502);
  }
}

export default {
  fetch: withSupabase({ auth: ['publishable', 'secret'] }, handler),
};
