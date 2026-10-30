// Bump VERSION whenever you change app files so phones pick up the update.
const VERSION = 'v6';
const SHELL = `trip-shell-${VERSION}`;
const FONTS = 'trip-fonts';
const ASSETS = [
  './', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest',
  'crew/sophia.webp', 'crew/sophia-face.webp',
  'crew/elizabeth.webp', 'crew/elizabeth-face.webp',
  'crew/jackie.webp', 'crew/jackie-face.webp',
  'crew/hector.webp', 'crew/hector-face.webp',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== FONTS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // Google Fonts: cache forever once fetched.
  if (url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com')) {
    e.respondWith(
      caches.open(FONTS).then(async (c) => {
        const hit = await c.match(e.request);
        if (hit) return hit;
        const res = await fetch(e.request);
        if (res.ok || res.type === 'opaque') c.put(e.request, res.clone());
        return res;
      })
    );
    return;
  }

  // App files: network first (so updates show up), cache when offline.
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) caches.open(SHELL).then((c) => c.put(e.request, res.clone()));
          return res;
        })
        .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
    );
  }
});
