/* Önden sipariş sayfası, müşterinin kendi özel fiyatını ve son siparişini cari kaydından okur (telefonla).
   Aşağıdaki blok tools/babuco-cari.cjs'deki ortak bloğun BİREBİR kopyasıdır; elle değiştirme:
   node testler/cari/ortak-blok.mjs --yaz */
/* >>> CARI-ORTAK-BASLA
   Bu blok tools/babuco-cari.cjs, public/toptanci/app.js ve public/cari/index.html içinde HARFİ HARFİNE aynıdır:
   araç, panel ve müşteri sayfası aynı anahtarı türetsin, birbirinin yazdığını okusun diye. Bloğu BURADA düzenle,
   sonra kopyala:  node testler/cari/ortak-blok.mjs --yaz   (--yaz'sız çalıştırınca yalnız aynı mı diye bakar).
   Üst düzey sabit (const/let) YOK; hepsi işlev. Şifreleme WebCrypto ile (tarayıcıda da Node'da da aynı kod).

   Kurgu:
     sır   = rastgele 32 bayt; kv "babuco:cari-sir" (kilitten sonra yalnız yetkili hesap okur).
     kod   = HMAC-SHA256(sır, "kod|" + müşteri id) → 128 bit. Kişisel link kodu "#k=" kısmında taşır (sunucuya gitmez).
     hesap = AES-256-GCM(SHA-256(".../anahtar/h/" + kod)), satır adı SHA-256(".../id/h/" + kod) → "babuco:cari:h:<32 hex>".
     telefon kaydı = { k: kod }, anahtarı PBKDF2-SHA256(telefonun son 10 hanesi, sabit tuz, cariSabit().tur tur)'dan;
             satır "babuco:cari:t:<32 hex>". Telefon tahmin edilebilir bir sırdır: pahalı türetme yalnız yavaşlatır.
     o     = HMAC(sır, içerik) özeti (64 bit): yayıncı, satırı çözmeden "içerik değişti mi" diye buna bakar.
   Kayda YALNIZ cariHesap() içindeki alanlar girer. */
function cariSabit() {
  return { onek: "babuco:cari:", sirAnahtar: "babuco:cari-sir", tuz: "babuco-cari/v1/telefon", tur: 300000,
    adres: "https://runkekeone.github.io/cayci-pos/cari/" };
}
function cariKripto() { return (typeof crypto !== "undefined" && crypto.subtle) ? crypto : require("crypto").webcrypto; }
function cariBayt(metin) { return new TextEncoder().encode(String(metin)); }
function cariB64(bayt) { const b = new Uint8Array(bayt); let s = ""; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); }
function cariB64url(bayt) { return cariB64(bayt).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function cariB64Coz(s) { const m = atob(String(s)), b = new Uint8Array(m.length); for (let i = 0; i < m.length; i++) b[i] = m.charCodeAt(i); return b; }
function cariHex(bayt) { return Array.from(new Uint8Array(bayt), (x) => x.toString(16).padStart(2, "0")).join(""); }
/* Telefonun son 10 hanesi ("5XXXXXXXXX"); cep numarası değilse boş. */
function cariTel10(t) { const d = String(t || "").replace(/\D/g, ""), s = d.length >= 10 ? d.slice(-10) : ""; return s[0] === "5" ? s : ""; }
async function cariHmac(sir, metin) {
  const K = cariKripto().subtle;
  const a = await K.importKey("raw", cariBayt(sir), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await K.sign("HMAC", a, cariBayt(metin)));
}
async function cariKod(sir, musteriId) { return cariB64url((await cariHmac(sir, "kod|" + musteriId)).slice(0, 16)); }
async function cariOzet(sir, metin) { return cariHex((await cariHmac(sir, "ozet|" + metin)).slice(0, 8)); }
/* Telefondan anahtar tohumu: pahalı kısım burası (müşterinin telefonunda bir kez, yayıncıda yalnız telefon değişince). */
async function cariTelTohum(tel10) {
  const K = cariKripto().subtle, sabit = cariSabit();
  const a = await K.importKey("raw", cariBayt(tel10), "PBKDF2", false, ["deriveBits"]);
  return cariB64url(await K.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: cariBayt(sabit.tuz), iterations: sabit.tur }, a, 256));
}
/* tur: "h" (hesap; tohum = kod) | "t" (telefon kaydı; tohum = cariTelTohum). Dönen: { key: kv satır adı, aes } */
async function cariAnahtar(tur, tohum) {
  const K = cariKripto().subtle;
  const id = cariHex(new Uint8Array(await K.digest("SHA-256", cariBayt("babuco-cari/v1/id/" + tur + "/" + tohum))).slice(0, 16));
  const ham = await K.digest("SHA-256", cariBayt("babuco-cari/v1/anahtar/" + tur + "/" + tohum));
  return { key: cariSabit().onek + tur + ":" + id, aes: await K.importKey("raw", ham, "AES-GCM", false, ["encrypt", "decrypt"]) };
}
/* Şifreli metin satır adına bağlanır (başka satıra taşınan kayıt çözülmez). Dönen: base64(iv + şifreli + etiket). */
async function cariSifrele(a, metin) {
  const C = cariKripto(), iv = C.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await C.subtle.encrypt({ name: "AES-GCM", iv: iv, additionalData: cariBayt(a.key) }, a.aes, cariBayt(metin)));
  const hepsi = new Uint8Array(12 + ct.length); hepsi.set(iv, 0); hepsi.set(ct, 12);
  return cariB64(hepsi);
}
/* Yanlış anahtar / bozuk kayıt → fırlatır. */
async function cariCoz(a, d) {
  const ham = cariB64Coz(d);
  const pt = await cariKripto().subtle.decrypt({ name: "AES-GCM", iv: ham.slice(0, 12), additionalData: cariBayt(a.key) }, a.aes, ham.slice(12));
  return new TextDecoder().decode(pt);
}
/* Müşterinin göreceği hesap. YALNIZ burada sayılan alanlar kayda girer: firma adı, müşteri adı, açılış bakiyesi,
   bakiye, fişler (no, tarih, kalem adı/adet/satış fiyatı, iskonto, toplam, nakit/kart/açık) ve ödemeler (tarih,
   tutar, tür) ve özel fiyatlar (fy). Alış fiyatı, maliyet, kâr, komisyon, limit, vade, telefon, not metinleri,
   müşteri kimliği ve başka müşteriler GİRMEZ; ürün kimliği yalnız fy'de, herkese açık katalogla eşleşmek için. turBul = tahsilatTuru (ödemenin türü: nakit|kart|havale|iade|duzeltme). */
function cariHesap(S, c, turBul) {
  const N = (v) => Math.round((Number(v) || 0) * 100) / 100;
  const sirala = (a, b) => (String(a.t) < String(b.t) ? -1 : String(a.t) > String(b.t) ? 1 : 0);
  const st = S.settings || {};
  let bakiye = N(c.acilis);
  const f = (S.sales || []).filter((s) => s && s.musteriId === c.id).map((s) => {
    const o = s.odeme || {};
    const x = { no: String(s.belgeNo || ""), t: String(s.tarih || ""), top: N(s.toplam), nakit: N(o.nakit), kart: N(o.pos), acik: N(o.acik),
      k: (s.items || []).map((it) => [String(it.ad || ""), Number(it.adet) || 0, N(it.fiyat)]) };
    if (N(s.iskonto)) x.isk = N(s.iskonto);
    if (s.odemeAdi === "İade" || x.top < 0) x.iade = 1;
    else if (s.odemeAdi === "Havale") x.havale = 1;
    bakiye += x.acik;
    return x;
  }).sort(sirala);
  const o = (S.payments || []).filter((p) => p && p.musteriId === c.id).map((p) => {
    const x = { t: String(p.tarih || ""), tutar: N(p.tutar), tur: String(turBul(p)) };
    /* "Satış üstü fazla ödeme → borca sayıldı (Belge X)": yalnız belge numarası alınır; not metni kayda girmez. */
    const m = /fazla ödeme/i.test(String(p.not || "")) ? /Belge (\d{4}-\d+)/.exec(String(p.not)) : null;
    if (m) x.fis = m[1];
    bakiye -= x.tutar;
    return x;
  }).sort(sirala);
  /* fy: müşterinin fiyatları (önden sipariş sayfası müşteriye kendi fiyatını gösterir) — herkese açık katalogdaki
     ürün kimliği → fiyat. Fiyat ailesi (aynı altKategori + aynı liste fiyatı) bir birimdir. Öncelik: bu müşteriye
     bu aileden EN SON satılan fiyat (sahadaki gerçek fiyat; hediye/0 ve iade sayılmaz), yoksa kartındaki özel fiyat
     (ailedeki bir kardeşinki de olur). Yalnız fiyat girer; alış/maliyet girmez. */
  const oz = c.ozelFiyatlar || {}, fy = {}, sonFiyat = {};
  const urunler = (S.products || []).filter((p) => p && p.id && p.gorunur !== false);
  const urunBy = {};
  (S.products || []).forEach((p) => { if (p && p.id) urunBy[p.id] = p; });
  const aileAnahtar = (p) => (p.altKategori ? "a|" + p.altKategori + "|" + N(p.satis) : "u|" + p.id);
  const ozel = (p) => (oz[p.id] != null && oz[p.id] !== "" && N(oz[p.id]) > 0) ? N(oz[p.id]) : null;
  (S.sales || []).filter((s) => s && s.musteriId === c.id && N(s.toplam) > 0 && s.odemeAdi !== "İade")
    .sort((a, b) => (String(a.tarih) < String(b.tarih) ? -1 : 1))
    .forEach((s) => (s.items || []).forEach((it) => {
      const p = urunBy[it.urunId];
      if (p && N(it.fiyat) > 0) sonFiyat[aileAnahtar(p)] = N(it.fiyat);
    }));
  urunler.forEach((p) => {
    let v = sonFiyat[aileAnahtar(p)];
    if (v == null) v = ozel(p);
    if (v == null && p.altKategori) {
      const k = urunler.find((x) => x !== p && aileAnahtar(x) === aileAnahtar(p) && ozel(x) != null);
      if (k) v = ozel(k);
    }
    if (v != null) fy[String(p.id)] = v;
  });
  const h = { v: 1, firma: String(st.fisBaslik || st.firmaAdi || ""), ad: String(c.ad || ""), acilis: N(c.acilis), bakiye: N(bakiye), f: f, o: o };
  if (Object.keys(fy).length) h.fy = fy;
  return h;
}
/* Yayın planı: buluttaki satırlarla (mevcut: [{ key, o }]) karşılaştırır; yalnız içeriği değişeni yazar, artık
   karşılığı olmayanı (silinen müşteri, değişen/silinen telefon, değişen sır) siler. Buluta dokunmaz.
   Dönen: { yaz: [{ key, value }], sil: [key], atlanan: [{ ad, neden }], musteri } */
async function cariPlan(S, sir, mevcut, turBul) {
  const sabit = cariSabit(), var_ = {}, telKaydi = {}, kalsin = {}, yaz = [], atlanan = [], telGoren = {};
  (mevcut || []).forEach((r) => { if (r && String(r.key).indexOf(sabit.onek) === 0) var_[r.key] = typeof r.o === "string" ? r.o : ""; });
  Object.keys(var_).forEach((k) => { if (k.indexOf(sabit.onek + "t:") === 0 && var_[k]) telKaydi[var_[k]] = k; });
  let musteri = 0;
  for (const c of (S.customers || [])) {
    if (!c || !c.id) continue;
    musteri++;
    const kod = await cariKod(sir, c.id), a = await cariAnahtar("h", kod);
    const metin = JSON.stringify(cariHesap(S, c, turBul)), o = await cariOzet(sir, "h|" + kod + "|" + metin);
    kalsin[a.key] = 1;
    if (var_[a.key] !== o) yaz.push({ key: a.key, value: { v: 1, o: o, d: await cariSifrele(a, metin) } });
    const tel = cariTel10(c.telefon);
    if (!tel) { atlanan.push({ ad: c.ad, neden: "cep telefonu kayıtlı değil" }); continue; }
    if (telGoren[tel]) { atlanan.push({ ad: c.ad, neden: "numarası \"" + telGoren[tel] + "\" ile aynı" }); continue; }
    telGoren[tel] = c.ad;
    const ot = await cariOzet(sir, "t|" + tel + "|" + kod);
    if (telKaydi[ot]) { kalsin[telKaydi[ot]] = 1; continue; }          // telefon kaydı güncel: pahalı türetmeye gerek yok
    const at = await cariAnahtar("t", await cariTelTohum(tel));
    kalsin[at.key] = 1;
    yaz.push({ key: at.key, value: { v: 1, o: ot, d: await cariSifrele(at, JSON.stringify({ v: 1, k: kod })) } });
  }
  return { yaz: yaz, sil: Object.keys(var_).filter((k) => !kalsin[k]), atlanan: atlanan, musteri: musteri };
}
async function cariLink(sir, musteriId) { return cariSabit().adres + "#k=" + (await cariKod(sir, musteriId)); }
/* Linki müşteriye gönderen hazır WhatsApp bağlantısı (numara panelin waNo kuralıyla; telefon yoksa kişi seçtirir). */
function cariWa(c, firma, link) {
  let d = String((c && c.telefon) || "").replace(/\D/g, "");
  if (d.indexOf("0") === 0) d = "9" + d; else if (d.length === 10) d = "90" + d;
  const metin = "Merhaba " + ((c && c.ad) || "") + ",\n" + (firma ? firma + " " : "") + "cari hesabınızı bu linkten her zaman güncel görebilirsiniz " +
    "(bıraktığımız ürünler, ödemeleriniz, kalan bakiyeniz):\n" + link;
  return "https://wa.me/" + d + "?text=" + encodeURIComponent(metin);
}
/* <<< CARI-ORTAK-BITTI */
