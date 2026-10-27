/* The Union Invitational — offline shell.
   Build 20261027-1251.

   THE COPY ON THE PHONE IS THE ONE THAT OPENS. A page served network-first
   does not fail on a weak signal, it crawls — and a phone on one bar sat on
   blank paper for a minute before the worker gave up and showed the copy it
   had all along. So the page is served from the cache the instant it is
   there, and refreshed behind the screen when the signal allows. A new
   build installs a new worker, which fetches the new page into a new cache
   before it takes over; the page is told when that has happened.

   The pictures live outside the page, in a cache of their own that outlasts
   builds: a hole diagram fetched on Tuesday is still on the phone on Sunday
   whatever has been changed in the words beside it. Fonts and icons never
   change under a given URL either, so they are served from the cache the
   instant they are in it.

   Anything that is not a GET — every score, every photo — is left entirely
   alone. Writes are the store's business, and it queues them itself. */

const CACHE = 'union-20261027-1251';
const PICTURES = 'union-pictures';
const SHELL = ['./', './index.html', './manifest.webmanifest',
               './icon-192.png', './icon-512.png', './apple-touch-icon.png',
               './fonts/source-serif-latin-normal.woff2',
               './fonts/source-serif-latin-italic.woff2'];
const FRESH_MS = 15 * 60 * 1000;   // a page cached this recently is not fetched again behind the screen

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== PICTURES).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const keep = (name, req, res) => {
  if (res && (res.ok || res.type === 'opaque')) {
    const copy = res.clone();
    caches.open(name).then(c => c.put(req, copy));
  }
  return res;
};

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // never touch a write
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;             // the database talks for itself
  if (/\/sw\.js$/.test(url.pathname)) return;             // the page reads the build off the wire, on purpose

  // the pictures, the typeface and the icons: whatever is in the cache is right
  const picture = /\/img\/.*\.webp$/.test(url.pathname);
  const immutable = picture || /\.(png|webp|woff2?|ico)$/.test(url.pathname);
  if (immutable) {
    const bin = picture ? PICTURES : CACHE;
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => keep(bin, req, res)).catch(() => hit)));
    return;
  }

  // the book itself: the copy on the phone, now; the wire behind it, when the copy is old enough to be worth asking
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => {
    if (hit) {
      const at = Date.parse(hit.headers.get('date') || '') || 0;
      if (!at || Date.now() - at > FRESH_MS) e.waitUntil(fetch(req).then(res => keep(CACHE, req, res)).catch(() => {}));
      return hit;
    }
    return fetch(req).then(res => keep(CACHE, req, res)).catch(() => caches.match('./index.html'));
  }));
});

/* A chat message from someone else, while the book is closed or in a pocket.
   Every push shows a notification — a phone that is sent one and shows
   nothing loses the right to be sent any. One a chat at a time: a busy chat
   updates the one on the lock screen rather than stacking twenty. */
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data ? e.data.text() : '' }; }
  const shown = self.registration.showNotification(d.title || 'The Union Invitational', {
    body: d.body || 'New in the chat', tag: d.tag || 'chat', renotify: true,
    icon: './icon-192.png', badge: './icon-192.png', data: { room: d.room || '', bet: d.bet || '' },
  });
  const badge = self.navigator && self.navigator.setAppBadge ? self.navigator.setAppBadge().catch(() => {}) : null;
  e.waitUntil(Promise.all([shown, badge]));
});

/* Tapped: back into the book, on the chat it came from, or the bet it is
   about — the open book if there is one, a new one if not. */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const d = e.notification.data || {};
  const msg = d.bet ? { bet: d.bet } : { chat: d.room || '' };
  const url = d.bet ? './?bet=' + encodeURIComponent(d.bet) : './?chat=' + encodeURIComponent(d.room || '');
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) { if ('focus' in c) { c.postMessage(msg); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
