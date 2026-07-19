/**
 * Basit çevrimdışı kabuk.
 *
 * Uygulamanın tüm verisi zaten telefonun kendi localStorage'ında duruyor —
 * sunucuya hiç istek atılmıyor. Bu service worker sadece uygulamanın
 * dosyalarını (HTML/JS/CSS) önbelleğe alır ki internet olmayan bir dükkânda
 * da açılsın.
 *
 * Strateji:
 *   - Gezinme (sayfa açma): önce ağ, olmazsa önbellekteki index.html
 *   - Diğer dosyalar: önce önbellek, yoksa ağdan al ve önbelleğe koy
 */
// GitHub Pages'te uygulama depo adının altında yayınlanır: /cayci-pos/
const TABAN = new URL('./', self.location).pathname

const CACHE = 'cayci-pos-v3'
const KABUK = [
  TABAN,
  TABAN + 'index.html',
  TABAN + 'manifest.webmanifest',
  TABAN + 'icon.svg',
  TABAN + 'icon-maskable.svg',
]

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(KABUK))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((adlar) => Promise.all(adlar.filter((a) => a !== CACHE).map((a) => caches.delete(a))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() =>
        caches.match(TABAN + 'index.html').then((r) => r || caches.match(TABAN)),
      ),
    )
    return
  }

  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req)
          .then((res) => {
            if (res.ok && new URL(req.url).origin === self.location.origin) {
              const kopya = res.clone()
              caches.open(CACHE).then((c) => c.put(req, kopya))
            }
            return res
          })
          .catch(() => hit),
    ),
  )
})
