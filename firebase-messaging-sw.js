/*
 * Service worker: PWA presence + push display for Project Alfred.
 *
 * Named firebase-messaging-sw.js because the page-side Firebase Messaging SDK
 * looks for this filename when it registers the push subscription. We do NOT
 * import the Firebase SDK here — FCM delivers over standard Web Push, so a
 * plain `push` listener handles the payload, keeping the worker
 * dependency-free.
 *
 * Deliberately NO fetch handler: the dashboard reads live GViz data and must
 * never serve stale cached responses; Chrome no longer requires a fetch
 * handler for installability.
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (e) { /* non-JSON push */ }
  // FCM webpush payloads arrive as {notification:{title,body,...}, data:{...}}.
  const n = payload.notification || {};
  const d = payload.data || {};
  const title = n.title || 'Project Alfred';
  event.waitUntil(self.registration.showNotification(title, {
    body: n.body || '',
    icon: n.icon || 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: d.tag || 'alfred-digest',
    data: { url: d.url || './' }
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || './', self.registration.scope).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Focus an open dashboard tab if there is one; otherwise open fresh.
    const existing = wins.find(w => w.url.startsWith(self.registration.scope));
    if (existing) { await existing.focus(); if (existing.navigate && existing.url !== target) await existing.navigate(target); }
    else await self.clients.openWindow(target);
  })());
});
