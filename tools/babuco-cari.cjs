/**
 * Müşterilerin CANLI cari hesap sayfası (public/cari/) için yayın.
 *
 * Her müşterinin hesabı şifrelenip herkese açık OKUNAN bir kv satırına yazılır (babuco:cari:h:<kimlik>);
 * sayfa onu tarayıcıda çözer. Telefonla giriş için ayrıca küçük bir "telefon → kod" satırı (babuco:cari:t:<kimlik>).
 * Müşterinin kodu, yalnız yetkili hesabın okuyabildiği babuco:cari-sir satırındaki sırdan türetilir
 * (store'a alan eklenmez). Ayrıntı ve kurgu: aşağıdaki ortak bloğun başındaki not.
 *
 * tools/babuco.cjs bunu store'u her başarıyla yazdığında çağırır (storeYaz); panel aynı bloğu kendi içinde taşır
 * ve her eşitlemeden sonra çalıştırır. İkisi aynı kaydı üretir; yalnız içeriği değişen müşterinin satırı yazılır.
 */

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
   tutar, tür). Alış fiyatı, maliyet, kâr, komisyon, limit, vade, telefon, not metinleri, müşteri/ürün kimlikleri
   ve başka müşteriler GİRMEZ. turBul = tahsilatTuru (ödemenin türü: nakit|kart|havale|iade|duzeltme). */
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
  return { v: 1, firma: String(st.fisBaslik || st.firmaAdi || ""), ad: String(c.ad || ""), acilis: N(c.acilis), bakiye: N(bakiye), f: f, o: o };
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

/* ---------- araç tarafı: bulut okuma/yazma (sb = tools/babuco-kimlik.cjs'deki istek işlevi) ---------- */
const SIR_SORGU = "kv?key=eq." + encodeURIComponent(cariSabit().sirAnahtar) + "&select=value";
/** Sırrı okur; yoksa ve olustur=true ise oluşturur. Aynı anda iki yerden oluşturulursa ilki kazanır (yoksa-ekle + geri oku). */
async function sirGetir(sb, olustur) {
  const oku = async () => { const r = await sb(SIR_SORGU); return r && r[0] && r[0].value && r[0].value.sir ? String(r[0].value.sir) : null; };
  let sir = await oku();
  if (sir || !olustur) return sir;
  const ts = new Date().toISOString();
  await sb("kv?on_conflict=key", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({ key: cariSabit().sirAnahtar, value: { v: 1, sir: cariB64url(cariKripto().getRandomValues(new Uint8Array(32))), olusturuldu: ts }, updated_at: ts }) });
  sir = await oku();
  if (!sir) throw new Error("cari sirri olusturulamadi");
  return sir;
}
/** Buluttaki cari satırları: [{ key, o }]. Önce yalnız özet istenir; sunucu bu seçimi anlamazsa satırların tamamı okunur. */
async function mevcutOku(sb) {
  const onek = cariSabit().onek, q = "kv?key=like." + encodeURIComponent(onek + "*") + "&select=";
  const bizim = (r) => (r || []).filter((x) => x && String(x.key).indexOf(onek) === 0);
  let rows = null;
  try { rows = bizim(await sb(q + encodeURIComponent("key,o:value->>o"))); } catch (e) { rows = null; }
  if (rows && rows.every((r) => typeof r.o === "string")) return rows;
  return bizim(await sb(q + "key,value")).map((r) => ({ key: r.key, o: r.value && r.value.o }));
}
/**
 * Hesabı değişen müşterilerin satırlarını yazar, karşılığı kalmayanları siler.
 * prova=true → buluta yazmaz (sır yoksa oluşturmaz; plan geçici bir sırla hesaplanır).
 * Dönen: { yazilan, silinen, musteri, atlanan, sir }
 */
async function yayinla(sb, store, turBul, secenek) {
  const prova = !!(secenek && secenek.prova);
  let sir = await sirGetir(sb, !prova);
  const sirYok = !sir;
  if (sirYok) sir = "prova";
  const plan = await cariPlan(store, sir, await mevcutOku(sb), turBul);
  if (!prova) {
    const ts = new Date().toISOString();
    if (plan.yaz.length) {
      await sb("kv?on_conflict=key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(plan.yaz.map((x) => ({ key: x.key, value: x.value, updated_at: ts }))) });
    }
    if (plan.sil.length) await sb("kv?key=in." + encodeURIComponent("(" + plan.sil.map((k) => '"' + k + '"').join(",") + ")"), { method: "DELETE" });
  }
  return { yazilan: plan.yaz.length, silinen: plan.sil.length, musteri: plan.musteri, atlanan: plan.atlanan, sir: sirYok ? null : sir };
}
/** Sırrı siler (yeni sır bir sonraki yayında oluşur): bütün kişisel linkler değişir, eski kayıtlar o yayında silinir. */
async function sirSil(sb) { await sb("kv?key=eq." + encodeURIComponent(cariSabit().sirAnahtar), { method: "DELETE" }); }

module.exports = { cariSabit, cariTel10, cariKod, cariAnahtar, cariTelTohum, cariSifrele, cariCoz, cariHesap, cariPlan, cariLink, cariWa, cariOzet,
  sirGetir, mevcutOku, yayinla, sirSil };
