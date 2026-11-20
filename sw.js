/* S1 Tax · Hintergrunddienst
   Hält die App startfähig, wenn kein Netz da ist, und zeigt Erinnerungen an.
   Online wird immer zuerst die neueste Version geladen, damit Änderungen sofort ankommen.
   Daten aus der Datenbank werden hier nie gespeichert. */
const CACHE = 's1tax-v2';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  /* Geteilte Dateien vom Handy ("Teilen" → S1 Tax): kurz merken, die App holt sie ab */
  if (req.method === 'POST' && url.origin === location.origin && url.hash === '' && url.pathname.endsWith('/')) {
    e.respondWith((async () => {
      const form = await req.formData();
      const files = form.getAll('belege');
      const c = await caches.open('s1tax-geteilt');
      await Promise.all(files.map((f, i) => c.put('./geteilt/' + Date.now() + '-' + i, new Response(f, { headers: { 'Content-Type': f.type, 'X-Name': encodeURIComponent(f.name || 'Beleg') } }))));
      return Response.redirect('./#geteilt', 303);
    })());
    return;
  }
  if (req.method !== 'GET') return;
  const shell = url.origin === location.origin || url.hostname === 'cdn.jsdelivr.net' || url.hostname.startsWith('fonts.');
  if (!shell) return;
  /* eigene Dateien immer beim Server nachfragen (kein veralteter Zwischenspeicher), ohne Netz aus dem Cache */
  const frisch = url.origin === location.origin ? new Request(req, { cache: 'no-cache' }) : req;
  e.respondWith(
    fetch(frisch).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('./')))
  );
});
self.addEventListener('push', (e) => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch (_) { m = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(m.title || 'S1 Tax', {
    body: m.body || '', icon: 'icon-192.png', badge: 'icon-192.png', tag: m.tag || undefined,
    data: { url: m.url || self.registration.scope }
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if (c.url.startsWith(self.registration.scope) && 'focus' in c) { c.navigate(target).catch(() => {}); return c.focus(); }
    return self.clients.openWindow(target);
  }));
});
