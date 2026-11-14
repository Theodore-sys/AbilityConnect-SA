// frontend/public/sw.js  -  receives notifications even when the website is closed
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { body: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(d.title || 'AbilityConnect SA', {
    body: d.body || '', icon: '/icon-192.png', badge: '/icon-192.png', tag: d.tag || 'ac', renotify: true, data: { url: d.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  let target = self.location.origin + '/';
  try { const u = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin); if (u.origin === self.location.origin) target = u.href; } catch (e) { /* keep the home page */ }
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if (c.url.startsWith(self.location.origin) && 'focus' in c) return c.focus(); }
    return self.clients.openWindow(target);
  }));
});
