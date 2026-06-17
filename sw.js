// =====================================================================
// Service Worker for Planet Puzzle
//
// Update protocol:
//   1. ユーザーがアプリを開く → ブラウザは毎回 sw.js をネット取得（仕様）
//   2. APP_VERSION を上げると CACHE 名が変わる → 新SWが "waiting" 状態でインストール
//   3. self.skipWaiting() で即座に新SWを active 状態へ昇格
//   4. activate で旧キャッシュ (planet-puzzle-v* 以外) を一掃
//   5. self.clients.claim() で既存タブを新SWの制御下へ
//   6. クライアント側の 'controllerchange' でページをリロードして反映完了
// =====================================================================
const APP_VERSION = '2.15.0';
const CACHE = `planet-puzzle-v${APP_VERSION}`;
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // フォント等のクロスオリジンは素通し

  const isNavigation =
    req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isNavigation) {
    // Network-first：開き直すたびに新しい index.html を取りに行く
    event.respondWith(
      fetch(req)
        .then(resp => {
          const copy = resp.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy)).catch(() => {});
          return resp;
        })
        .catch(() => caches.match(req).then(c => c || caches.match('./index.html')))
    );
    return;
  }

  // Stale-while-revalidate：その他資産（manifest, icons, etc.）
  event.respondWith(
    caches.match(req).then(cached => {
      const fetched = fetch(req)
        .then(resp => {
          if (resp && resp.status === 200) {
            const copy = resp.clone();
            caches.open(CACHE).then(cache => cache.put(req, copy)).catch(() => {});
          }
          return resp;
        })
        .catch(() => cached);
      return cached || fetched;
    })
  );
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
