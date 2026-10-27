/* The tournament, kept in Supabase instead of the artifact platform.
 *
 * store.js is written against a small document interface — doc(path).get/set/
 * update/delete, collection(name).get/onSnapshot — and everything hard-won
 * about not overwriting a real tournament lives on top of that interface. So
 * this file presents exactly that interface again, over Postgres. The store
 * above it does not know or care which one it got.
 *
 * Three things here are not in the platform version, and each exists because
 * the book is going to be used while walking around a golf course in Türkiye:
 *
 *   1. An OUTBOX. A write that cannot reach the network is kept, and goes
 *      when the signal does. Every write in this book replaces a whole
 *      document, so a later write to the same path simply supersedes the one
 *      waiting — the queue stays small and can never apply changes in the
 *      wrong order.
 *
 *   2. A POLL behind the live socket. A WebSocket on a mobile network does
 *      not announce that it has died; it just stops saying anything, and a
 *      book that has quietly stopped updating is worse than one that is
 *      obviously offline. So a single indexed query catches whatever the
 *      socket missed — but every one wakes the phone's radio, and a phone
 *      on a golf course all day has a battery to think of. The poll keeps
 *      to three minutes while the socket is live, which is only a net; to fifteen
 *      seconds while it is down, when the poll IS the update; and to nothing
 *      at all while the book is in somebody's pocket. Coming back to the
 *      front, or getting signal back, looks at once.
 *
 *   3. FROZEN snapshots, like the platform's. The worst bug in this project
 *      was code mutating a snapshot body; the store deep-clones to avoid it,
 *      and freezing here keeps that mistake impossible rather than merely
 *      unobserved.
 */

/* Every collection the book keeps. A path outside this list is not polled,
   so adding one here is part of adding one at all. */
const PREFIXES = ['config', 'people', 'pairs', 'scores', 'bbb', 'notes', 'recaps', 'photos', 'chat', 'market', 'diag'];
const POLL_LIVE_MS = 180000;  // the net under a live socket: every three minutes (the socket brings everything; this only catches what it dropped)
const POLL_DOWN_MS = 15000;   // the socket is down, so the poll is the update
const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';
const RETRY_MS = 4000;        // a stranded outbox tries again this soon, then waits longer each time it fails
const RETRY_MAX_MS = 60000;   // ... but never longer than a minute, and a signal coming back is tried at once
const OUTBOX_KEY = 'ui.outbox.v1';
/* NOTHING WAITS FOR EVER. On one bar a request does not fail, it hangs: the
   phone sits on "Saving…" for minutes, and the write never reaches the
   outbox, where the next signal would have carried it. So every call to the
   wire is given this long and then given up on, which turns a hang into an
   ordinary queued write. */
const WIRE_MS = 20000;
const bounded = () => (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? AbortSignal.timeout(WIRE_MS) : undefined;
const bound = q => { const sig = bounded(); return sig && q && typeof q.abortSignal === 'function' ? q.abortSignal(sig) : q; };

const freeze = o => { try { return Object.freeze(o); } catch (e) { return o; } };

/** A snapshot of one document, shaped and frozen like the platform's. */
function docSnap(row) {
  const v = row ? row.doc : null;
  const held = v && typeof v === 'object' ? freeze(v) : null;
  return freeze({ exists: !!held, id: row ? String(row.path).split('/').pop() : null, data: () => held });
}

function rowSnap(rows) {
  return freeze({
    docs: rows.map(r => freeze({
      id: String(r.path).split('/').pop(),
      data: () => freeze(r.doc),
    })),
  });
}

export function createSupabaseDb(opts) {
  const { url, key, deviceId, createClient, onStatus } = opts || {};
  if (!url || !key || typeof createClient !== 'function') return null;

  let sb;
  try {
    sb = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 20 } },
    });
  } catch (e) { return null; }

  /* Everything the book has seen, by path. Collections are served from here
     so a subscriber always gets the whole set, exactly as the platform's
     collection snapshots did. */
  const cache = new Map();
  const docWatch = new Map();      // path -> Set(cb)
  const collWatch = new Map();     // prefix -> Set({cb, err})
  let live = false;                // is the socket actually delivering?
  let lastSeen = null;             // newest updated_at we have applied
  let closed = false;
  let pollTimer = null, retryTimer = null;
  let retryIn = RETRY_MS;          // the next wait before the outbox tries again
  const waiting = new Set();       // the outbox's paths, mirrored so the screen can ask without reading storage
  try { Object.keys(JSON.parse(localStorage.getItem(OUTBOX_KEY) || '{}')).forEach(k => waiting.add(k)); } catch (e) { /* none */ }

  const say = (s, path) => { try { onStatus && onStatus(s, path); } catch (e) { /* never let a listener break a write */ } };
  const prefixOf = p => String(p).split('/')[0];

  function fanOut(path) {
    const one = docWatch.get(path);
    if (one) { const s = docSnap(cache.get(path) || null); one.forEach(cb => { try { cb(s); } catch (e) {} }); }
    const pre = prefixOf(path);
    const many = collWatch.get(pre);
    if (many) {
      const s = rowSnap([...cache.values()].filter(r => prefixOf(r.path) === pre));
      many.forEach(w => { try { w.cb(s); } catch (e) {} });
    }
  }

  function absorb(row, quiet) {
    if (!row || !row.path) return false;
    const before = cache.get(row.path);
    if (before && before.updated_at && row.updated_at && before.updated_at > row.updated_at) return false;
    cache.set(row.path, row);
    if (row.updated_at && (!lastSeen || row.updated_at > lastSeen)) lastSeen = row.updated_at;
    if (!quiet) fanOut(row.path);
    return true;
  }

  /* A write this device just made, shown before the server echoes it back.
     Deliberately does NOT move lastSeen: that marks how far the POLL has
     read, and pushing it forward on a local write would make the sweep skip
     whatever another device wrote in the same second. */
  function absorbLocal(path, doc) {
    const held = cache.get(path);
    cache.set(path, { path, doc, updated_at: held ? held.updated_at : null });
    fanOut(path);
  }

  function forget(path, quiet) {
    if (!cache.has(path)) return;
    cache.delete(path);
    if (!quiet) fanOut(path);
  }

  /* ---------------- the outbox ---------------- */

  function readOutbox() {
    try { const raw = localStorage.getItem(OUTBOX_KEY); return raw ? JSON.parse(raw) : {}; }
    catch (e) { return {}; }
  }
  function writeOutbox(q) {
    try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(q)); } catch (e) { /* full or blocked */ }
  }
  function queue(path, op, doc) {
    const q = readOutbox();
    /* One entry per path. A set replaces whatever was waiting; a merge folds
       into a waiting set or merge so the order it eventually lands in cannot
       matter. A delete wipes the lot. */
    const held = q[path];
    if (op === 'delete') q[path] = { op: 'delete', at: Date.now() };
    else if (op === 'set') q[path] = { op: 'set', doc, at: Date.now() };
    else if (held && held.op !== 'delete') q[path] = { op: held.op, doc: { ...(held.doc || {}), ...doc }, at: Date.now() };
    else q[path] = { op: 'merge', doc, at: Date.now() };
    writeOutbox(q);
    waiting.add(path);
    say('queued');
    armRetry();
  }
  function unqueue(path, stamp) {
    const q = readOutbox();
    if (q[path] && q[path].at === stamp) { delete q[path]; writeOutbox(q); }
    if (!q[path]) waiting.delete(path);
  }
  function pending() { return waiting.size; }
  function pendingPaths() { return [...waiting]; }

  /* REFUSED IS NOT OFFLINE. A write the database turns down on principle —
     its rules do not allow that path — will be turned down again on every
     retry, for ever. Queued like a write with no signal, it sat at the head
     of the outbox and every score saved after it waited behind it. So a
     refusal is dropped, said so in the phone's log, and never queued: the
     outbox only ever holds writes that a signal will deliver. */
  const refused = e => !!e && (e.code === '42501' || e.code === 'PGRST301'
    || /row-level security|violates|permission denied/i.test(String(e.message || '')));

  /* The outbox tries again after a while, and after a longer while each
     time the signal is still not there — four seconds, eight, sixteen, up
     to a minute — so a phone in a bag on the 7th is not waking its radio
     every four seconds all afternoon. Anything that suggests the signal is
     back (the phone says so, the book comes to the front) tries at once. */
  function armRetry(now) {
    if (closed) return;
    if (now) { clearTimeout(retryTimer); retryTimer = null; retryIn = RETRY_MS; }
    if (retryTimer) return;
    retryTimer = setTimeout(async () => {
      retryTimer = null;
      const q = readOutbox();
      const paths = Object.keys(q);
      if (!paths.length) return;
      let stuck = false;
      for (const path of paths) {
        const job = q[path];
        const done = job.op === 'delete' ? await rawDelete(path, true)
                                         : await rawWrite(path, job.doc, job.op === 'merge', true);
        if (done || done === null) {
          unqueue(path, job.at);
          if (done) say('landed', path);
          /* turned down on the way out: the screen has been showing a write
             the book will never hold, so read what the book does hold */
          else pull({ eq: path }).then(rows => { if (rows.length) absorb(rows[0]); else forget(path); }).catch(() => {});
        } else { stuck = true; break; }
      }
      if (stuck) { retryIn = Math.min(retryIn * 2, RETRY_MAX_MS); armRetry(); }
      else { retryIn = RETRY_MS; say('flushed'); }
    }, now ? 50 : retryIn);
  }

  /* ---------------- the wire ---------------- */

  async function rawWrite(path, doc, merge, fromOutbox) {
    try {
      if (merge) {
        const { error } = await bound(sb.rpc('merge_doc', { p: path, patch: doc, who: deviceId || null }));
        if (error) throw error;
      } else {
        const { error } = await bound(sb.from('docs')
          .upsert({ path, doc, writer: deviceId || null }, { onConflict: 'path' }));
        if (error) throw error;
      }
      /* Show it now. Realtime will send the same row back with the server's
         timestamp a moment later; until then the book is not waiting on the
         network to display what the ref just wrote. */
      absorbLocal(path, merge ? { ...(((cache.get(path) || {}).doc) || {}), ...doc } : doc);
      say('saved');
      return true;
    } catch (e) {
      if (refused(e)) { say('refused'); return fromOutbox ? null : false; }
      if (!fromOutbox) queue(path, merge ? 'merge' : 'set', doc);
      say('offline');
      return false;
    }
  }

  async function rawDelete(path, fromOutbox) {
    try {
      const { error } = await bound(sb.from('docs').delete().eq('path', path));
      if (error) throw error;
      forget(path);                 // gone from the screen now, not in six seconds
      say('saved');
      return true;
    } catch (e) {
      if (refused(e)) { say('refused'); return fromOutbox ? null : false; }
      if (!fromOutbox) queue(path, 'delete');
      say('offline');
      return false;
    }
  }

  async function pull(where) {
    const q = bound(sb.from('docs').select('path,doc,updated_at'));
    const { data, error } = where.eq ? await q.eq('path', where.eq)
                                     : await q.like('path', where.like);
    if (error) throw error;
    return data || [];
  }

  /* ---------------- live, and the net under it ---------------- */

  function listen() {
    let chan;
    try {
      chan = sb.channel('book')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'docs' }, msg => {
          live = true;
          if (msg.eventType === 'DELETE') {
            const gone = msg.old && msg.old.path;
            if (gone) forget(gone);
          } else if (msg.new) {
            absorb(msg.new);
          }
        })
        .subscribe(state => {
          if (state === 'SUBSCRIBED') { live = true; say('live'); armPoll(); }
          else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'CLOSED') {
            live = false; say('socket-down');   // not 'polling' yet: that is said when a poll actually answers
            soon();                   // the socket just went: look now, then every fifteen seconds
          }
        });
    } catch (e) { live = false; }
    return () => { try { sb.removeChannel(chan); } catch (e) {} };
  }

  /* One query, indexed on updated_at, for whatever the socket did not bring.
     Cheap enough to run for the whole week and still be inside a free tier. */
  async function sweep() {
    try {
      let q = bound(sb.from('docs').select('path,doc,updated_at').order('updated_at', { ascending: true }).limit(400));
      if (lastSeen) q = q.gt('updated_at', lastSeen);
      const { data, error } = await q;
      if (error) throw error;
      (data || []).forEach(r => absorb(r));
      if (!live) say('polling');
    } catch (e) { say('offline'); }
  }

  /* The next look, at the pace the socket allows. In a pocket there is no
     next look: the book catches up the moment it is back in a hand. */
  function armPoll(ms) {
    if (closed) return;
    clearTimeout(pollTimer); pollTimer = null;
    if (hidden()) return;
    pollTimer = setTimeout(async () => { await sweep(); armPoll(); }, ms != null ? ms : (live ? POLL_LIVE_MS : POLL_DOWN_MS));
  }
  const soon = () => armPoll(800);
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (closed) return; if (hidden()) armPoll(); else { soon(); if (waiting.size) armRetry(true); } });
  }
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('online', () => { if (closed) return; soon(); armRetry(true); });
  }

  /* ---------------- the interface store.js is written against ---------------- */

  return {
    kind: 'supabase',
    get pending() { return pending(); },
    pendingPaths,
    get live() { return live; },

    doc(path) {
      return {
        async get() {
          const rows = await pull({ eq: path });
          if (rows.length) absorb(rows[0], true); else forget(path, true);
          return docSnap(rows[0] || null);
        },
        set(obj) { return rawWrite(path, obj, false); },
        update(patch) { return rawWrite(path, patch, true); },
        delete() { return rawDelete(path); },
        onSnapshot(cb, err) {
          if (!docWatch.has(path)) docWatch.set(path, new Set());
          docWatch.get(path).add(cb);
          pull({ eq: path })
            .then(rows => { if (rows.length) absorb(rows[0]); else cb(docSnap(null)); })
            .catch(() => { if (err) err(new Error('unreachable')); });
          return () => { const s = docWatch.get(path); if (s) s.delete(cb); };
        },
      };
    },

    collection(name) {
      const like = name + '/%';
      return {
        async get() {
          const rows = await pull({ like });
          rows.forEach(r => absorb(r, true));
          return rowSnap(rows);
        },
        onSnapshot(cb, err) {
          if (!collWatch.has(name)) collWatch.set(name, new Set());
          const w = { cb, err };
          collWatch.get(name).add(w);
          pull({ like })
            .then(rows => {
              rows.forEach(r => absorb(r, true));
              cb(rowSnap(rows));
            })
            .catch(() => { if (err) err(new Error('unreachable')); });
          return () => { const s = collWatch.get(name); if (s) s.delete(w); };
        },
      };
    },

    /** Opened once, after the subscriptions are registered. */
    start() {
      const stop = listen();
      armPoll();
      armRetry();
      return () => { stop(); };
    },

    close() {
      closed = true;
      clearTimeout(pollTimer); clearTimeout(retryTimer);
      try { sb.removeAllChannels(); } catch (e) {}
    },

    PREFIXES,
  };
}

/* ---------------- photographs ----------------
 *
 * The same shape the artifact's asset store had — upload(blob) resolving to
 * something with a url — so the strip above does not care which it got. Two
 * differences, both of which matter here.
 *
 * Everyone can add. The artifact's store was writer-only: a reader got null
 * and the button had to be hidden, which meant photographs could only come
 * from the three people who could also change the scores. Here anyone who
 * can open the book can add to it, which is what was wanted all along.
 *
 * And every photograph is stored twice: the picture, and a thumbnail. The
 * strip shows thumbnails, so scrolling a week of the trip costs a few
 * hundred kilobytes rather than a hundred megabytes — the free allowance is
 * one gigabyte of storage and it is bandwidth, not space, that a party of
 * twenty-three scrolling on hotel wifi would burn through first.
 */
export function createSupabaseFiles(opts) {
  const { url, key, bucket, createClient } = opts || {};
  if (!url || !key || typeof createClient !== 'function') return null;
  let sb;
  try { sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }); }
  catch (e) { return null; }
  const store = sb.storage.from(bucket || 'photos');

  const stamp = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  return {
    kind: 'supabase',
    /** @returns {{key, url, thumbKey, thumbUrl, sizeBytes}} */
    async upload(blob, thumb) {
      const base = stamp();
      const k = base + '.jpg';
      const { error } = await store.upload(k, blob, { contentType: blob.type || 'image/jpeg', upsert: false });
      if (error) throw new Error(error.message || 'upload failed');
      const out = {
        key: k,
        url: store.getPublicUrl(k).data.publicUrl,
        sizeBytes: blob.size,
        thumbKey: null,
        thumbUrl: null,
      };
      /* A missing thumbnail is a smaller picture, not a failure: the strip
         falls back to the full one rather than losing the photograph. */
      if (thumb) {
        try {
          const tk = base + '-t.jpg';
          const r = await store.upload(tk, thumb, { contentType: thumb.type || 'image/jpeg', upsert: false });
          if (!r.error) { out.thumbKey = tk; out.thumbUrl = store.getPublicUrl(tk).data.publicUrl; }
        } catch (e) { /* keep the photograph */ }
      }
      return out;
    },

    async remove(keys) {
      const list = (Array.isArray(keys) ? keys : [keys]).filter(Boolean);
      if (!list.length) return true;
      try { await store.remove(list); return true; } catch (e) { return false; }
    },
  };
}
