// sw.js
const VERSION = "v1.0.0";
const CACHE_NAME = `beforeafter-${VERSION}`;

// GitHub Pages の base path
const BASE = "/before-after-maker/";

// ここは「同一オリジンの静的ファイルだけ」にする
const PRECACHE_URLS = [
  `${BASE}`,
  `${BASE}index.html`,
  `${BASE}edit.html`,
  `${BASE}gallery.html`,
  `${BASE}k9x3.html`,
  `${BASE}offline.html`,

  `${BASE}css/base.css`,
  `${BASE}css/components.css`,
  `${BASE}css/edit.css`,
  `${BASE}css/gallery.css`,
  `${BASE}css/passcode.css`,

  `${BASE}js/home.js`,
  `${BASE}js/edit.js`,
  `${BASE}js/gallery.js`,
  `${BASE}js/compose.js`,
  `${BASE}js/db.js`,
  `${BASE}js/image.js`,
  `${BASE}js/layout.js`,
  `${BASE}js/storage.js`,
  `${BASE}js/theme.js`,
  `${BASE}js/passcodeAuth.js`,
  `${BASE}js/auth.js`,
  `${BASE}js/supabaseClient.js`,

  `${BASE}manifest.json`,
  `${BASE}icons/icon-192.png`,
  `${BASE}icons/icon-512.png`,
  `${BASE}icons/icon-512-maskable.png`
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("beforeafter-") && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// fetch: same-origin はSWR、外部(署名URL含む)はノータッチ
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // GET以外は触らない
  if (req.method !== "GET") return;

  // 外部（Supabase storageの signed URL など）はキャッシュしない
  if (url.origin !== self.location.origin) return;

  // scope外も触らない
  if (!url.pathname.startsWith(BASE)) return;

  event.respondWith(staleWhileRevalidate(req));
});

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);

  const fetchPromise = fetch(req)
    .then((res) => {
      // 成功レスポンスだけ保存
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);

  // まずキャッシュ、なければネット、両方ダメならoffline
  return cached || (await fetchPromise) || (await caches.match(`${BASE}offline.html`));
}
