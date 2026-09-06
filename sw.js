/* Project Alfred — minimal service worker.
 *
 * WHY THIS EXISTS: installability, not offline. An Android home-screen install
 * that is not backed by a real PWA install becomes a bookmark shortcut, and a
 * shortcut is drawn with the installing browser's badge over the corner of the
 * icon. A registered service worker with a real fetch handler is the one
 * install-criteria box a static page does not tick by default, so this file is
 * the difference between "app" and "shortcut" on the launcher.
 *
 * WHY IT CACHES NOTHING: a cache here would serve a stale index.html after a
 * push to Pages, and the app has no version handshake to break that with. The
 * fetch handler is a deliberate pass-through — every request still goes to the
 * network exactly as it would without this file. Offline is out of scope (the
 * ledger lives in a Google Sheet, so an offline shell would show an error state
 * anyway).
 *
 * ⚠️ Do NOT add a cache to this file without also adding a cache-busting
 * version and an activate-time cleanup. Half a caching strategy is worse than
 * none: it pins users to whatever index.html they installed on.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => { e.respondWith(fetch(e.request)); });
