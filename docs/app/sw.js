/* The Union Invitational — offline shell.
   Build 20261027-0810.

   The book is one file, so there is little to cache and no dependency graph
   to get wrong. The page itself is served network-first, so a phone picks up
   a new build the moment it has signal, and falls back to the copy it already
   has when it does not. Fonts and icons never change under a given URL, so
   they are served from the cache the instant they are in it.

   Anything that is not a GET — every score, every photo — is left entirely
   alone. Writes are the store's business, and it queues them itself. */

const CACHE = 'union-20261027-0810';
const SHELL = ['./', './index.html', './manifest.webmanifest',
               './icon-192.png', './icon-512.png', './apple-touch-icon.png',
               './fonts/source-serif-latin-normal.woff2',
               './fonts/source-serif-latin-italic.woff2'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // never touch a write
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;             // the database talks for itself

  // the typeface and the icons: whatever is in the cache is right, and both
  // ship with the book, so there is nothing cross-origin left to wait on
  const immutable = /\.(png|webp|woff2?|ico)$/.test(url.pathname);
  if (immutable) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => hit)));
    return;
  }

  // the book itself: newest if there is signal, the copy on the phone if not
  e.respondWith(fetch(req).then(res => {
    if (res && res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
    }
    return res;
  }).catch(() => caches.match(req).then(hit => hit || caches.match('./index.html'))));
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
