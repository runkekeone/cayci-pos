// Senaryo 8: araç (tools/babuco.cjs) — günlük bulut yedeği + yedekler / yedek-al / geri-yukle komutları.
// Çalıştır: node testler/senkron/8-arac-yedek.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { senkronBulut, aracCalistir, denetci, ornekStore, ornekSatirlar, borc, ayni, istGun, yedekSatiri, STORE } from "./yardimci.mjs";

const d = denetci("8-arac-yedek");
const ilk = ornekStore();
const bugun = istGun(0), GUNLUK = "babuco:yedek:" + bugun;
const gecici = fs.mkdtempSync(path.join(os.tmpdir(), "babuco-deneme-"));
const eski = [];
for (let n = 25; n <= 34; n++) eski.push(yedekSatiri(istGun(n), ilk));
const bulut = await senkronBulut({ satirlar: ornekSatirlar(ilk).concat(eski) });
const arac = (...a) => aracCalistir(bulut, a);
const kosulsuz = () => bulut.storeYazmalari().filter((y) => !(y.yontem === "PATCH" && y.kosullu)).length;
try {
  // --- günün ilk yazmasını araç yaparsa günlük yedeği de araç alır ---
  let r = await arac("yedekler");
  d.dogru(r.kod === 0 && !r.cikti.includes(bugun), "yazma yokken bugünün yedeği listede yok");
  r = await arac("tahsilat", "Örnek Çay Ocağı", "100");
  d.dogru(r.kod === 0 && /PROVA/.test(r.cikti) && !bulut.kv.has(GUNLUK), "--kaydet'siz prova yedek de almaz, hiçbir şey yazmaz");
  r = await arac("tahsilat", "Örnek Çay Ocağı", "100", "--kaydet");
  d.dogru(r.kod === 0 && /KAYDEDILDI/.test(r.cikti), "araç tahsilatı kaydetti");
  const y = bulut.deger(GUNLUK);
  d.dogru(!!y && ayni(y.store, ilk) && y.ozet.kim === "arac" && y.ozet.tur === "gunluk" && y.ozet.satis === 5, "günün ilk yazmasından ÖNCEKİ hâl bulutta yedeklendi (babuco:yedek:" + bugun + ")");
  d.dogru(!bulut.kv.has("babuco:yedek:" + istGun(30)) && !bulut.kv.has("babuco:yedek:" + istGun(34)) && bulut.kv.has("babuco:yedek:" + istGun(29)), "araç 30 günden eski yedekleri sildi, 29 günlük duruyor");
  r = await arac("satis", JSON.stringify({ musteri: "Deneme Kıraathanesi", kalemler: [{ urun: "Örnek Kola 250 ml", adet: 2 }], odeme: "acik" }), "--kaydet");
  d.dogru(r.kod === 0 && ayni(bulut.deger(GUNLUK).store, ilk), "aynı gün ikinci yazma yedeği değiştirmedi");
  d.dogru(fs.readdirSync(path.join(path.resolve(import.meta.dirname, "../.."), "tools/yedek")).some((f) => /\.json$/.test(f)), "yerel tools/yedek/ yedeği de alınmaya devam ediyor");

  // --- yedekler ---
  r = await arac("yedekler");
  const satir = r.cikti.split("\n").find((l) => l.startsWith("| " + bugun + " |")) || "";
  d.dogru(r.kod === 0 && /\| 5 \| 4 \| 2 \| 6 \| gunluk \(arac\) \|/.test(satir), "yedekler: bugünün yedeği sayılarıyla listeleniyor → " + satir.trim());
  d.esit(r.cikti.split("\n").filter((l) => /^\| \d{4}-\d{2}-\d{2}/.test(l)).length, 6, "listede 6 yedek var (5 eski + bugün)");

  // --- yedek-al ---
  const dosya = path.join(gecici, "indirilen.json");
  r = await arac("yedek-al", dosya);
  const indirilen = fs.existsSync(dosya) ? JSON.parse(fs.readFileSync(dosya, "utf8")) : null;
  d.dogru(r.kod === 0 && !!indirilen && ayni(indirilen, bulut.store()), "yedek-al: buluttaki şimdiki hâl dosyaya indi (6 satış)");
  const yazmaOnce = bulut.ayar.yazmalar.length;
  r = await arac("yedek-al", path.join(gecici, "ikinci.json"));
  d.esit(bulut.ayar.yazmalar.length, yazmaOnce, "yedek-al buluta hiçbir şey yazmıyor");

  // --- geri-yukle: prova ---
  const once = JSON.parse(JSON.stringify(bulut.store()));
  r = await arac("geri-yukle", bugun);
  d.dogru(r.kod === 0 && /PROVA/.test(r.cikti) && ayni(bulut.store(), once), "geri-yukle (prova): hiçbir şey yazılmadı");
  d.dogru(/\| Satış \| 6 \| 5 \| 1 \| 0 \| 0 \|/.test(r.cikti) && /\| Tahsilat \| 3 \| 2 \| 1 \| 0 \| 0 \|/.test(r.cikti) && /\| Ürün \| 6 \| 6 \| 0 \| 0 \| 1 \|/.test(r.cikti), "prova farkı gösteriyor: 1 satış + 1 tahsilat silinecek, 1 ürün değişecek");
  d.dogru(r.cikti.includes("Sahadaki alacak"), "prova alacak toplamının nasıl değişeceğini de söylüyor");

  // --- geri-yukle: kaydet ---
  r = await arac("geri-yukle", bugun, "--kaydet");
  d.dogru(r.kod === 0 && /GERİ YÜKLENDİ/.test(r.cikti), "geri-yukle --kaydet çalıştı");
  let s = bulut.store();
  d.dogru(ayni(s, ilk), "bulut bugünün başındaki hâle döndü");
  d.esit([borc(s, "m1"), borc(s, "m2")], [borc(ilk, "m1"), borc(ilk, "m2")], "borçlar eski hâlinde");
  const onceKey = bulut.yedekAnahtarlari().find((k) => k.endsWith("-geri-yukleme-oncesi"));
  d.dogru(!!onceKey && ayni(bulut.deger(onceKey).store, once), "geri yüklemeden önceki hâl bulutta yedeklendi");
  d.esit(kosulsuz(), 0, "aracın bütün yazmaları koşullu (compare-and-swap)");

  // --- vazgeç: önceki hâle dön (etiketli yedek adıyla) ve dosyadan geri yükle ---
  r = await arac("geri-yukle", onceKey.slice("babuco:yedek:".length), "--kaydet");
  d.dogru(r.kod === 0 && ayni(bulut.store(), once), "etiketli yedeğe dönülerek geri yüklemeden vazgeçilebildi");
  r = await arac("geri-yukle", dosya, "--kaydet");
  d.dogru(r.kod === 0 && ayni(bulut.store(), indirilen), "yerel dosyadan geri yükleme çalıştı");

  // --- hatalı kullanım hiçbir şey yazmaz ---
  const sayi = bulut.ayar.yazmalar.length;
  r = await arac("geri-yukle", "1999-01-01", "--kaydet");
  d.dogru(r.kod !== 0 && /Yedek bulunamadi/.test(r.cikti), "olmayan tarih: hata verir");
  fs.writeFileSync(path.join(gecici, "bozuk.json"), JSON.stringify({ merhaba: 1 }));
  r = await arac("geri-yukle", path.join(gecici, "bozuk.json"), "--kaydet");
  d.dogru(r.kod !== 0 && /yedegi degil/.test(r.cikti), "yedek olmayan dosya: hata verir");
  r = await arac("geri-yukle");
  d.dogru(r.kod !== 0, "kaynak verilmezse hata verir");
  d.esit(bulut.ayar.yazmalar.length, sayi, "hatalı kullanımlarda buluta hiçbir şey yazılmadı");

  // --- çakışma: okuma ile yazma arasında bulut değişirse geri yükleme reddedilir ---
  bulut.ayar.yazmadanOnce = (ctx) => { const satirB = ctx.tablolar.kv.get(STORE); satirB.updated_at = new Date(Date.parse(satirB.updated_at) + 7).toISOString().replace("Z", "+00:00"); };
  const oncesi = JSON.parse(JSON.stringify(bulut.store()));
  r = await arac("geri-yukle", bugun, "--kaydet");
  d.dogru(r.kod !== 0 && /CAKISMA/.test(r.cikti) && ayni(bulut.store(), oncesi), "araya yazma girince geri yükleme CAKISMA ile reddedildi, bulut değişmedi");
} catch (e) { d.dogru(false, "senaryo yarıda kesildi: " + e.message); }
finally { await bulut.dur(); fs.rmSync(gecici, { recursive: true, force: true }); }
d.bitir();
