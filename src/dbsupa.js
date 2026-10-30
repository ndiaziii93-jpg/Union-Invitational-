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
/* THE TOURNAMENT'S OWN ROWS GO THROUGH THE SERVER'S GATE. The config, the
   roster, the pairs, the scores, the bingo and the recaps cannot be written
   with the public key: the database refuses them. They go through write_doc
   and delete_doc, which check the PIN this phone holds before anything
   lands — so a copy of the book with the checks taken out gets exactly as
   far as a stranger with the link: nowhere. */
const PROTECTED = /^(config|people|pairs|scores|bbb|recaps)\//;
/* THE CHAT, THE BETS AND THE NOTES ARE SIGNED. A post, a bet, a reaction or
   a note goes through social_write with the name this phone has claimed and
   that name's PIN; the server checks it and lets a name write only what is
   its own. Nobody posts or bets as anyone else, and nobody touches what
   another phone wrote. */
const SOCIAL = /^(chat|market|notes)\//;
/* A photo comes down only by the phone that put it up, or the master PIN. */
const PHOTO = /^photos\//;
const POLL_LIVE_MS = 180000;  // the net under a live socket: every three minutes (the socket brings everything; this only catches what it dropped)
const POLL_DOWN_MS = 15000;   // the socket is down, so the poll is the update
const POLL_LOW_MS = 600000;   // low power: no socket, and a look every ten minutes while the book is open on screen
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
  const { url, key, deviceId, createClient, onStatus, pinFor, whoFor } = opts || {};
  const pin = () => { try { return pinFor ? String(pinFor() || '') : ''; } catch (e) { return ''; } };
  const who = () => { try { const w = whoFor ? whoFor() : null; return { pid: String((w && w.pid) || ''), pin: String((w && w.pin) || '') }; } catch (e) { return { pid: '', pin: '' }; } };
  const signed = (path, more) => { const w = who(); return { p_path: path, p_pid: w.pid, p_name_pin: w.pin, p_role_pin: pin(), p_who: deviceId || null, ...more }; };
  /* THE GATE ANSWERS IN WORDS, NOT ERRORS. 'ok', or 'denied: …' — a refusal
     is a normal answer so that the server's log of it is kept (an error
     would roll the log back with the write). Here it becomes the error the
     rest of this file already knows how to treat. */
  const gate = async q => {
    const { data, error } = await q;
    if (error) throw error;
    if (typeof data === 'string' && data !== 'ok') { const e = new Error(data.replace(/^denied:\s*/, '')); e.code = '42501'; throw e; }
    return data;
  };
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
  let lowPower = false;            // the moon: no socket, the slow poll
  let stopListen = null;           // closes the socket, while one is open
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
    /* a bingo mark: one entry a hole and group, later marks folding in */
    if (op === 'bbb') { const held = q[path]; q[path] = { op: 'bbb', doc: { ...doc, cell: { ...((held && held.op === 'bbb' && held.doc.cell) || {}), ...doc.cell } }, at: Date.now() }; writeOutbox(q); waiting.add(path); say('queued'); armRetry(); return; }
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
  /* The gate said no to THIS PHONE'S PIN. Not a dead signal, not a rule the
     book is breaking: a write that will go the moment someone signs in with
     a PIN the server accepts. It stays in the outbox, and the screen is told. */
  const denied = e => !!e && /PIN/.test(String(e.message || '')) && !/for that row/.test(String(e.message || ''));
  /* The gate is not built yet (the lockdown SQL has not been run): the book
     writes the way it did before, directly, until it is. So the build and
     the SQL can go in in either order without a phone's writes stranding. */
  const noGate = e => !!e && (e.code === 'PGRST202' || /could not find the function/i.test(String(e.message || '')));

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
                   : job.op === 'bbb' ? await rawBbb(job.doc, true)
                                      : await rawWrite(path, job.doc, job.op === 'merge', true);
        if (done || done === null) {
          unqueue(path, job.at);
          if (done) say('landed', path);
          /* turned down on the way out: the screen has been showing a write
             the book will never hold, so read what the book does hold */
          else pull({ eq: path }).then(rows => { if (rows.length) absorb(rows[0]); else forget(path); }).catch(() => {});
        } else if (done === 'denied') { continue; }    // waits for a PIN, not for a signal: the rest of the queue goes
        else { stuck = true; break; }
      }
      if (stuck) { retryIn = Math.min(retryIn * 2, RETRY_MAX_MS); armRetry(); }
      else { retryIn = RETRY_MS; say('flushed'); }
    }, now ? 50 : retryIn);
  }

  /* ---------------- the wire ---------------- */

  async function rawWrite(path, doc, merge, fromOutbox) {
    try {
      let gated = PROTECTED.test(path) || SOCIAL.test(path);
      if (gated) {
        let error = null;
        try {
          await gate(bound(PROTECTED.test(path)
            ? sb.rpc('write_doc', { p_path: path, p_doc: doc, p_merge: !!merge, p_pin: pin(), p_who: deviceId || null })
            : sb.rpc('social_write', signed(path, { p_doc: doc, p_merge: !!merge }))));
        } catch (e) { error = e; }
        if (error && noGate(error)) gated = false; else if (error) throw error;
      }
      /* a photo's own fields — its round, its hole, a heart — go through the
         photo gate, which lets a phone change only what is its own */
      if (!gated && PHOTO.test(path) && merge) {
        let error = null;
        try { await gate(bound(sb.rpc('photo_patch', { p_path: path, p_fields: doc, p_role_pin: pin(), p_who: deviceId || null }))); gated = true; }
        catch (e) { if (!noGate(e)) throw e; error = e; }
      }
      if (gated) { /* landed through the gate */ } else if (merge) {
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
      if (denied(e)) { if (!fromOutbox) queue(path, merge ? 'merge' : 'set', doc); say('denied', path); return fromOutbox ? 'denied' : false; }
      if (refused(e)) { say('refused'); return fromOutbox ? null : false; }
      if (!fromOutbox) queue(path, merge ? 'merge' : 'set', doc);
      say('offline');
      return false;
    }
  }

  /* A BINGO MARK, ON ITS HOLE ALONE. The server folds it into the row it
     holds; nothing else on the row is touched, so two refs marking two
     groups from two phones never put each other's marks back. 'nogate'
     when the server has no such function yet: the caller writes the row. */
  /* The row, written whole, with this mark folded into the copy the server
     last sent: what a server without (or with an older) bbb_mark gets. */
  async function bbbByRow(m, fromOutbox) {
    const path = 'bbb/' + m.rid;
    const held = ((cache.get(path) || {}).doc) || { holes: Array.from({ length: 18 }, () => ({ bingo: null, bango: null, bongo: null })) };
    const d = JSON.parse(JSON.stringify(held));
    d.holes = d.holes || [];
    const cell = d.holes[m.h] = d.holes[m.h] || {};
    if (!cell.g) {
      cell.g = {};
      const legacy = {}; let any = false;
      for (const k of ['bingo', 'bango', 'bongo']) { if (cell[k]) { legacy[k] = cell[k]; any = true; } delete cell[k]; }
      if (any) cell.g[m.gid] = legacy;
    }
    cell.g[m.gid] = { ...(cell.g[m.gid] || {}), ...m.cell };
    return rawWrite(path, d, false, fromOutbox);
  }
  async function rawBbb(m, fromOutbox) {
    const key = 'bbb/' + m.rid + '#' + m.h + '#' + m.gid;
    try {
      await gate(bound(sb.rpc('bbb_mark', { p_rid: m.rid, p_hole: m.h, p_group: m.gid, p_cell: m.cell, p_pin: pin(), p_who: deviceId || null })));
      say('saved');
      return true;
    } catch (e) {
      /* no bbb_mark on the server, or the first one, which took only t-groups: the row, as before */
      if (noGate(e) || /for that row|not a bingo row/.test(String(e && e.message || ''))) return fromOutbox ? bbbByRow(m, true) : 'nogate';
      if (denied(e)) { if (!fromOutbox) queue(key, 'bbb', m); say('denied', 'bbb/' + m.rid); return fromOutbox ? 'denied' : false; }
      if (refused(e)) { say('refused'); return fromOutbox ? null : false; }
      if (!fromOutbox) queue(key, 'bbb', m);
      say('offline');
      return false;
    }
  }

  async function rawDelete(path, fromOutbox) {
    try {
      const gated = PROTECTED.test(path) || SOCIAL.test(path) || PHOTO.test(path);
      let error = null;
      if (gated) {
        try {
          await gate(bound(PROTECTED.test(path)
            ? sb.rpc('delete_doc', { p_path: path, p_pin: pin(), p_who: deviceId || null })
            : PHOTO.test(path) ? sb.rpc('photo_delete', { p_path: path, p_role_pin: pin(), p_who: deviceId || null })
            : sb.rpc('social_delete', signed(path))));
        } catch (e) { error = e; }
      }
      if (!gated || noGate(error)) ({ error } = await bound(sb.from('docs').delete().eq('path', path)));
      if (error) throw error;
      forget(path);                 // gone from the screen now, not in six seconds
      say('saved');
      return true;
    } catch (e) {
      if (denied(e)) { if (!fromOutbox) queue(path, 'delete'); say('denied', path); return fromOutbox ? 'denied' : false; }
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
    pollTimer = setTimeout(async () => { await sweep(); armPoll(); }, ms != null ? ms : (lowPower ? POLL_LOW_MS : live ? POLL_LIVE_MS : POLL_DOWN_MS));
  }
  /* LOW POWER. The socket is the thing that keeps a phone's radio awake, so
     it is closed, and the poll — the one query — runs every ten minutes
     instead. Turning it off opens the socket again and looks at once. */
  function setLowPower(on) {
    on = !!on;
    if (on === lowPower) return;
    lowPower = on;
    if (closed) return;
    if (on) { if (stopListen) { stopListen(); stopListen = null; } live = false; armPoll(); }
    else { if (!stopListen) stopListen = listen(); soon(); }
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

    /** The role a PIN proves, asked of the server: 'master', 's1', 's2' or null. Throws with no signal. */
    async verifyPin(p) {
      const { data, error } = await bound(sb.rpc('verify_pin', { p_pin: String(p || ''), p_who: deviceId || null }));
      if (error) throw error;
      if (data === 'throttled') throw new Error('Too many PIN attempts. Wait a minute and try again.');
      if (data === 'blocked') throw new Error('This phone is blocked for a while: the book refused too many PINs from it.');
      return data || null;
    },
    /** Change a PIN, proving the master PIN first. */
    async setPin(master, role, next) {
      await gate(bound(sb.rpc('set_pin', { p_master: String(master || ''), p_role: role, p_new: String(next || ''), p_who: deviceId || null })));
      return true;
    },
    /** The master phones, for the master PIN from one of them. */
    async masterPhones(master) {
      const { data, error } = await bound(sb.rpc('master_phones_list', { p_pin: String(master || ''), p_who: deviceId || null }));
      if (error) throw error;
      if (!data || data.denied) { const e = new Error('PIN not accepted'); e.code = '42501'; throw e; }
      return data.phones || [];
    },
    async masterPhoneAdd(master, dev, label) {
      await gate(bound(sb.rpc('master_phone_add', { p_pin: String(master || ''), p_who: deviceId || null, p_dev: String(dev || ''), p_label: String(label || '') })));
      return true;
    },
    async masterPhoneRemove(master, dev) {
      await gate(bound(sb.rpc('master_phone_remove', { p_pin: String(master || ''), p_who: deviceId || null, p_dev: String(dev || '') })));
      return true;
    },
    /** The player PINs, for the master PIN: {pid: pin}. */
    async namePins(master) {
      const { data, error } = await bound(sb.rpc('name_pins_list', { p_pin: String(master || ''), p_who: deviceId || null }));
      if (error) throw error;
      if (!data || data.denied) { const e = new Error('PIN not accepted'); e.code = '42501'; throw e; }
      return data.pins || {};
    },
    /** The security log and the blocked phones, for the master PIN. */
    async securityRecent(master) {
      const { data, error } = await bound(sb.rpc('security_recent', { p_pin: String(master || ''), p_who: deviceId || null, p_limit: 200 }));
      if (error) throw error;
      if (!data || data.denied) { const e = new Error('PIN not accepted'); e.code = '42501'; throw e; }
      return data;
    },
    /** Every earlier version of a row (or of everything), for the master PIN. */
    async historyRecent(master, path) {
      const { data, error } = await bound(sb.rpc('history_recent', { p_pin: String(master || ''), p_path: path || null, p_who: deviceId || null, p_limit: path ? 400 : 60 }));
      if (error) throw error;
      if (!data || data.denied) { const e = new Error('PIN not accepted'); e.code = '42501'; throw e; }
      return data.rows || [];
    },
    async historyRevert(master, id) {
      await gate(bound(sb.rpc('history_revert', { p_pin: String(master || ''), p_id: id, p_who: deviceId || null })));
      /* the row changed under us: read it back now rather than at the next poll */
      return true;
    },
    async securityUnblock(master, dev) {
      await gate(bound(sb.rpc('security_unblock', { p_pin: String(master || ''), p_dev: String(dev || ''), p_who: deviceId || null })));
      return true;
    },
    /** A PIN just arrived on this phone: anything that waited for one goes now. */
    pinChanged() { if (waiting.size) armRetry(true); },
    /** Take a name with a four-digit PIN. Throws 'taken' if it already has one. */
    async claimName(pid, p) {
      const { data, error } = await bound(sb.rpc('claim_name', { p_pid: pid, p_pin: String(p || ''), p_who: deviceId || null }));
      if (error) { if (error.code === '23505' || /already has/i.test(error.message || '')) { const e = new Error('taken'); e.code = 'taken'; throw e; } throw error; }
      if (data === 'taken') { const e = new Error('taken'); e.code = 'taken'; throw e; }
      if (typeof data === 'string' && data !== 'ok' && data != null) { const e = new Error(data.replace(/^denied:\s*/, '')); e.code = '42501'; throw e; }
      return true;
    },
    /** Whether a PIN is the one a name was claimed with. */
    async checkName(pid, p) {
      const { data, error } = await bound(sb.rpc('check_name', { p_pid: pid, p_pin: String(p || ''), p_who: deviceId || null }));
      if (error) throw error;
      return data === true;
    },

    /** One bingo mark: {rid, h, gid, cell}. true landed, false waits in the outbox, 'nogate' means write the row instead. */
    bbbMark(m) { return rawBbb(m, false); },
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
      if (!lowPower) stopListen = listen();
      armPoll();
      armRetry();
      return () => { if (stopListen) { stopListen(); stopListen = null; } };
    },
    setLowPower,
    get lowPower() { return lowPower; },

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
    async upload(blob, thumb, opts) {
      const base = stamp();
      const video = !!(opts && opts.kind === 'video');
      const mime = (opts && opts.mime) || blob.type || (video ? 'video/mp4' : 'image/jpeg');
      const ext = video ? ({ 'video/quicktime': '.mov', 'video/mp4': '.mp4', 'video/webm': '.webm', 'video/x-m4v': '.m4v' }[mime] || '.mp4') : '.jpg';
      const k = base + ext;
      const { error } = await store.upload(k, blob, { contentType: mime, upsert: false });
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
