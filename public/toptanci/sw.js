/* Toptancı paneli — çevrimdışı kabuk (service worker).
 *
 * Tek amacı: daha önce açılmış panel, internet YOKKEN de açılabilsin. Veri zaten telefonda duruyor
 * (localStorage); eksik olan, sayfanın kendi dosyalarıydı (index.html, app.js, stiller…).
 *
 * Kural: ÖNCE AĞ. İnternet varken her dosya her zaman ağdan gelir ve kopyası tazelenir — önbellekte
 * eski sürüm kalıp yeni sürümün önüne geçemez. Yalnız ağ yoksa (ya da 4 sn yanıt vermezse) son
 * indirilen kopya verilir. Başka adreslere (Supabase, yazı tipleri) ve GET dışı isteklere hiç karışmaz.
 *
 * Kaydı app.js yapar (esKabukKur). Kapatmak gerekirse: bu dosyayı, içinde yalnız
 *   self.addEventListener("install", () => self.skipWaiting());
 *   self.addEventListener("activate", (e) => e.waitUntil(self.registration.unregister()));
 * olan hâliyle yayınla.
 */
const ONBELLEK = "toptanci-kabuk-v1";
const KOK = new URL("./", self.location).pathname;            // …/toptanci/

function bizim(adres) {
  try { const u = new URL(adres); return u.origin === self.location.origin && u.pathname.indexOf(KOK) === 0; }
  catch (e) { return false; }
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

/* Sayfa, yüklediği dosyaların listesini yollar: eksik olanlar indirilir, listede olmayan (eski sürüm) kopyalar atılır. */
self.addEventListener("message", (e) => {
  const v = e.data || {};
  if (v.tur !== "kabuk" || !Array.isArray(v.adresler)) return;
  e.waitUntil((async () => {
    const kasa = await caches.open(ONBELLEK);
    const istenen = new Set(v.adresler.filter(bizim));
    for (const adres of istenen) {
      try {
        if (await kasa.match(adres)) continue;
        const yanit = await fetch(adres, { cache: "reload" });
        if (yanit.ok) await kasa.put(adres, yanit);
      } catch (err) { /* şimdi olmadıysa sonraki açılışta */ }
    }
    for (const istek of await kasa.keys()) if (!istenen.has(istek.url)) await kasa.delete(istek);
  })());
});

self.addEventListener("fetch", (e) => {
  const istek = e.request;
  if (istek.method !== "GET" || !bizim(istek.url)) return;
  e.respondWith(onceAg(istek));
});

async function onceAg(istek) {
  const kasa = await caches.open(ONBELLEK);
  const kopya = async () => (await kasa.match(istek)) ||
    (istek.mode === "navigate" ? (await kasa.match(KOK + "index.html")) || (await kasa.match(KOK)) : undefined);
  const sakla = (yanit) => { if (yanit && yanit.ok && yanit.status === 200) kasa.put(istek, yanit.clone()).catch(() => {}); return yanit; };
  const ag = fetch(istek);
  try {
    const ilk = await Promise.race([ag, new Promise((coz) => setTimeout(coz, 4000, "gec"))]);
    if (ilk !== "gec") return sakla(ilk);
    const eldeki = await kopya();                               // ağ çok yavaş: kopya varsa onu ver, ağ arkada tazelesin
    if (eldeki) { ag.then(sakla).catch(() => {}); return eldeki; }
    return sakla(await ag);
  } catch (err) {
    const eldeki = await kopya();
    if (eldeki) return eldeki;
    throw err;
  }
}
