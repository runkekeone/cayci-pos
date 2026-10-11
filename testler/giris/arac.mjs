// Araç (tools/babuco.cjs) + cari dökümü: kilitten önce ve sonra, oturumlu ve oturumsuz.
// Çalıştır: node testler/giris/arac.mjs
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { aracCalistir, denetci, DEPO } from "../ortak/panel.mjs";
import { ornekSatirlar } from "../ortak/ornek-store.mjs";
import { kilitliBulut, TOPTANCI, YABANCI } from "./sahte-kilit.mjs";
import { geciciKlasor } from "./yardimci.mjs";

const d = denetci("arac");
const KIMLIK = path.join(DEPO, "tools/babuco-kimlik.cjs");
const DOKUM = path.join(DEPO, "tools/cari/dump.cjs");
const g = geciciKlasor();
// Araç her --kaydet'te tools/yedek/ altına önceki hâli yazar; denemenin yazdıklarını sonda temizle.
const YEDEK = path.join(DEPO, "tools/yedek");
const yedekOnce = new Set(fs.existsSync(YEDEK) ? fs.readdirSync(YEDEK) : []);
/** Hata çıkışı: Windows'ta fetch taşımasıyla Node çıkarken çöker (kod 1 değil); o kipte "sıfır değil" yeter. */
const hataKodu = (kod) => (process.env.BABUCO_TASIMA === "fetch" ? kod !== 0 : kod === 1);
let sira = 0;
const yeniDosya = () => path.join(g.dizin, "oturum-" + (++sira) + ".json");
/** Aracın ortamı: gerçek tools/.babuco-oturum.json'a ASLA dokunmasın diye oturum dosyası hep geçici klasörde. */
const ortam = (dosya, ek = {}) => ({ env: { BABUCO_OTURUM_DOSYA: dosya, BABUCO_EPOSTA: "", BABUCO_SIFRE: "", ...ek } });
const kimlikli = (h = TOPTANCI) => ({ BABUCO_EPOSTA: h.eposta, BABUCO_SIFRE: h.sifre });
/** Çıktıda şifre ya da jeton (erişim / yenileme) geçiyor mu? */
const sizinti = (cikti) => cikti.includes(TOPTANCI.sifre) || cikti.includes(YABANCI.sifre) || /eyJ[A-Za-z0-9_-]{10,}\./.test(cikti) || /yenile-\d+-/.test(cikti);
/** Aracı değil başka bir betiği (kimlik / döküm) sahte buluta karşı çalıştır. */
function betik(bulutUrl, dosya, arg, env) {
  return new Promise((coz) => {
    const c = spawn(process.execPath, [dosya, ...arg], { cwd: DEPO, env: { ...process.env, BABUCO_SB_URL: bulutUrl, BABUCO_SB_KEY: "sahte", ...env } });
    let cikti = ""; c.stdout.on("data", (x) => (cikti += x)); c.stderr.on("data", (x) => (cikti += x));
    c.on("close", (kod) => coz({ kod, cikti }));
  });
}

try {
  // ---------- kilit kurulmadan önce ----------
  {
    console.log("— kilit yok —");
    const bulut = await kilitliBulut({ satirlar: ornekSatirlar() });
    try {
      let a = await aracCalistir(bulut.url, ["durum"], ortam(yeniDosya()));
      d.dogru(a.kod === 0 && /Musteri 4/.test(a.cikti), "kilitsiz + oturumsuz: araç bugünkü gibi çalışıyor");
      d.esit(bulut.sayac.giris, 0, "kilitsiz + oturumsuz: giriş denemesi yok");
      a = await aracCalistir(bulut.url, ["durum"], ortam(yeniDosya(), kimlikli()));
      d.dogru(a.kod === 0 && /Musteri 4/.test(a.cikti) && bulut.sayac.giris === 1, "kilitsiz + ortam değişkeniyle: giriş yapıp çalışıyor");
      a = await aracCalistir(bulut.url, ["gider", "50", "deneme gideri", "--kaydet"], ortam(yeniDosya(), kimlikli()));
      d.dogru(a.kod === 0 && bulut.deger("babuco:store").expenses.length === 2, "kilitsiz + oturumlu: yazma çalışıyor");
      d.esit(bulut.deger("babuco:katalog").urunler.length, 6, "araç store'u yazınca herkese açık kataloğu da yayınladı");
      d.dogru(!/alis|stok|customers|telefon/.test(JSON.stringify(bulut.deger("babuco:katalog"))), "aracın yayınladığı katalogda özel alan yok");
    } finally { await bulut.dur(); }
  }

  // ---------- kilit öncesi: eski politika yalnız oturumsuz role açıksa ----------
  {
    console.log("\n— kilit yok, eski politika yalnız oturumsuz role açık —");
    const bulut = await kilitliBulut({ satirlar: ornekSatirlar(), oncekiDuzen: "yalniz-anon" });
    try {
      const a = await aracCalistir(bulut.url, ["gider", "50", "deneme gideri", "--kaydet"], ortam(yeniDosya(), kimlikli()));
      d.dogru(a.kod === 0 && bulut.deger("babuco:store").expenses.length === 2, "eski düzen + oturumlu: herkese açık anahtara düşerek okuyup yazıyor");
    } finally { await bulut.dur(); }
  }

  // ---------- kilit kurulduktan sonra ----------
  {
    console.log("\n— kilitli —");
    const bulut = await kilitliBulut({ satirlar: ornekSatirlar(), kilit: true });
    try {
      // oturumsuz: "kayıt yok" değil, açık bir hata
      let a = await aracCalistir(bulut.url, ["durum"], ortam(yeniDosya()));
      d.dogru(hataKodu(a.kod) && /Veritabani kilitli: giris yapmadan/.test(a.cikti), "kilitli + oturumsuz: 'kilitli, giriş gerekli' diyor");
      d.dogru(!/kaydı yok|kaydi yok/.test(a.cikti), "kilitli + oturumsuz: 'bulutta kayıt yok' gibi yanıltıcı mesaj vermiyor");
      if (!process.env.BABUCO_TASIMA) d.dogru(a.kod === 1 && !/Assertion failed/.test(a.cikti), "hata çıkışı temiz: çıkış kodu 1, Node çökme satırı yok");
      a = await aracCalistir(bulut.url, ["gider", "50", "x", "--kaydet"], ortam(yeniDosya()));
      d.dogru(hataKodu(a.kod) && bulut.deger("babuco:store").expenses.length === 1, "kilitli + oturumsuz: yazma olmuyor");

      // yanlış şifre
      a = await aracCalistir(bulut.url, ["durum"], ortam(yeniDosya(), { BABUCO_EPOSTA: TOPTANCI.eposta, BABUCO_SIFRE: "yanlis-parola-987" }));
      d.dogru(hataKodu(a.kod) && /Giris basarisiz/.test(a.cikti) && !a.cikti.includes("yanlis-parola-987"), "yanlış şifre: sade hata, şifre çıktıda yok");

      // izin listesinde olmayan hesap
      a = await aracCalistir(bulut.url, ["durum"], ortam(yeniDosya(), kimlikli(YABANCI)));
      d.dogru(hataKodu(a.kod) && /izni yok/.test(a.cikti) && !sizinti(a.cikti), "izinsiz hesap: 'izni yok' diyor, şifre/jeton çıktıda yok");

      // ortam değişkeni tek başına yeterli (dosya yazılamayan ortam: telefon/bulut oturumu)
      const yazilamaz = path.join(g.dizin, "yok-klasor", "alt", "oturum.json");
      a = await aracCalistir(bulut.url, ["durum"], ortam(yazilamaz, kimlikli()));
      d.dogru(a.kod === 0 && /Musteri 4/.test(a.cikti) && !fs.existsSync(yazilamaz), "kilitli + yalnız ortam değişkeni (dosya yazılamıyor): çalışıyor");
      d.dogru(!sizinti(a.cikti), "çıktıda şifre ya da jeton yok");
      a = await aracCalistir(bulut.url, ["urun-fiyat", "Örnek Kola", "satis", "700", "--kaydet"], ortam(yazilamaz, kimlikli()));
      d.dogru(a.kod === 0 && Number(bulut.deger("babuco:store").products.find((x) => x.id === "u3").satis) === 700, "kilitli + ortam değişkeni: fiyat değişikliği yazıldı");
      d.esit(bulut.deger("babuco:katalog").urunler.find((x) => x.id === "u3").satis, 700, "kilitli: araç yeni fiyatı kataloğa da yansıttı (çay ocağı eski fiyat görmez)");
      d.dogru(bulut.istekler.filter((i) => i.yol === "/rest/v1/kv" && i.yontem !== "GET").every((i) => i.rol === "authenticated"), "kilitli: aracın bütün yazımları oturumla gitti");

      // bir kez giriş → dosya; sonra şifresiz
      const dosya = yeniDosya();
      let k = await betik(bulut.url, KIMLIK, ["giris"], { BABUCO_OTURUM_DOSYA: dosya, ...kimlikli() });
      d.dogru(k.kod === 0 && /Giris yapildi: toptanci@ornek\.test · izin listesinde/.test(k.cikti) && fs.existsSync(dosya), "kimlik giris: oturum dosyaya kaydedildi");
      const icerik = fs.readFileSync(dosya, "utf8");
      d.dogru(!icerik.includes(TOPTANCI.sifre) && icerik.includes("refresh_token") && !sizinti(k.cikti), "oturum dosyasında şifre yok (yalnız jeton); çıktıda şifre/jeton yok");
      const girisOnce = bulut.sayac.giris;
      a = await aracCalistir(bulut.url, ["musteri", "Deneme"], ortam(dosya));
      d.dogru(a.kod === 0 && /Deneme Kıraathanesi/.test(a.cikti) && bulut.sayac.giris === girisOnce, "saklı oturumla: şifre vermeden çalışıyor, yeniden giriş yapmıyor");
      k = await betik(bulut.url, KIMLIK, ["durum"], { BABUCO_OTURUM_DOSYA: dosya, BABUCO_EPOSTA: "", BABUCO_SIFRE: "" });
      d.dogru(k.kod === 0 && /Oturum: toptanci@ornek\.test · izin listesinde/.test(k.cikti), "kimlik durum: kimin bağlı olduğunu söylüyor");
      // erişim jetonunun süresi doldu → yenileme anahtarıyla sürer, dosya güncellenir
      bulut.jetonlariEskit();
      const j = JSON.parse(icerik); j[bulut.url].expires_at = 1; fs.writeFileSync(dosya, JSON.stringify(j));
      a = await aracCalistir(bulut.url, ["durum"], ortam(dosya));
      d.dogru(a.kod === 0 && bulut.sayac.yenileme === 1 && JSON.parse(fs.readFileSync(dosya, "utf8"))[bulut.url].refresh_token !== j[bulut.url].refresh_token, "süresi dolan jeton: yenilendi, dosya güncellendi, şifre gerekmedi");
      // sunucu jetonu erken reddederse (saat farkı vb.) → yenileyip tekrar dener
      bulut.jetonlariEskit();
      a = await aracCalistir(bulut.url, ["durum"], ortam(dosya));
      d.dogru(a.kod === 0 && bulut.sayac.yenileme === 2, "sunucu jetonu reddederse: yenileyip tekrar deniyor");
      // oturum tamamen iptal edildi → açık hata; ortam değişkeni varsa onunla toparlar
      bulut.oturumlariDusur();
      const j2 = JSON.parse(fs.readFileSync(dosya, "utf8")); j2[bulut.url].expires_at = 1; fs.writeFileSync(dosya, JSON.stringify(j2));
      a = await aracCalistir(bulut.url, ["durum"], ortam(dosya));
      d.dogru(hataKodu(a.kod) && /sakli oturumun suresi dolmus/.test(a.cikti) && /Veritabani kilitli/.test(a.cikti), "iptal edilmiş oturum: 'yeniden giriş yap' diyor, veri uydurmuyor");
      a = await aracCalistir(bulut.url, ["durum"], ortam(dosya, kimlikli()));
      d.dogru(a.kod === 0 && /Musteri 4/.test(a.cikti), "iptal edilmiş oturum + ortam değişkeni: yeniden giriş yapıp çalışıyor");
      // çıkış
      k = await betik(bulut.url, KIMLIK, ["cikis"], { BABUCO_OTURUM_DOSYA: dosya });
      d.dogru(k.kod === 0 && !JSON.parse(fs.readFileSync(dosya, "utf8"))[bulut.url], "kimlik cikis: saklı oturum silindi");

      // cari dökümü
      const cikti = path.join(g.dizin, "dokum.json");
      let c = await betik(bulut.url, DOKUM, [cikti], { BABUCO_OTURUM_DOSYA: yeniDosya(), BABUCO_EPOSTA: "", BABUCO_SIFRE: "" });
      d.dogru(hataKodu(c.kod) && /Veritabani kilitli/.test(c.cikti) && !fs.existsSync(cikti), "cari dökümü kilitli + oturumsuz: açık hata, dosya yazmıyor");
      c = await betik(bulut.url, DOKUM, [cikti], { BABUCO_OTURUM_DOSYA: yeniDosya(), ...kimlikli() });
      d.dogru(c.kod === 0 && JSON.parse(fs.readFileSync(cikti, "utf8")).customers.length === 4, "cari dökümü kilitli + oturumlu: store'u döküyor");
    } finally { await bulut.dur(); }
  }

  // ---------- çakışmada katalog yazılmaz; gerçek oturum dosyasına dokunulmadı ----------
  {
    console.log("\n— diğer —");
    const kimlik = (await import("node:module")).createRequire(import.meta.url)(KIMLIK);
    d.esit(kimlik.katalogUrunleri([{ id: 1, ad: "A", alis: 5, satis: "12.5", stok: 3, gorunur: true }, { id: 2, ad: "Gizli", gorunur: false }, { id: 3, ad: "" }, null]),
      [{ id: "1", ad: "A", grup: "", satis: 12.5, birim: "", barkod: "" }], "katalogUrunleri: yalnız açık alanlar, gizli/adsız ürün yok");
    const panelKaynak = fs.readFileSync(path.join(DEPO, "public/toptanci/app.js"), "utf8");
    const govde = (kaynak, ad) => { const i = kaynak.indexOf("function " + ad + "("); return kaynak.slice(i, kaynak.indexOf("\n}", i)).replace(/\s+/g, " ").trim(); };
    const aracKaynak = fs.readFileSync(KIMLIK, "utf8");
    d.dogru(govde(panelKaynak, "katalogUrunleri") === govde(aracKaynak, "katalogUrunleri") && govde(panelKaynak, "katalogOzet") === govde(aracKaynak, "katalogOzet"), "panel ve araç kataloğu AYNI kodla çıkarıyor (özetleri tutar)");
    d.dogru(!fs.existsSync(path.join(DEPO, "tools/.babuco-oturum.json")), "denemeler gerçek tools/.babuco-oturum.json dosyasını oluşturmadı");
    d.dogru(/^tools\/\.babuco-oturum\.json\r?$/m.test(fs.readFileSync(path.join(DEPO, ".gitignore"), "utf8")), "oturum dosyası .gitignore'da");
  }
} finally {
  g.sil();
  if (fs.existsSync(YEDEK)) for (const y of fs.readdirSync(YEDEK)) if (!yedekOnce.has(y)) fs.rmSync(path.join(YEDEK, y), { force: true });
}

d.bitir();
