// ARAÇ — fiyat bakımı: toplu zam (yüzde/tutar, yuvarlama, aile birlikte, özel fiyat seçeneği, prova),
// kâr uyarısı (alim / urun-fiyat), fiyat kontrol listesi, fiyat geçmişi.
// Çalıştır: node testler/stok/arac-fiyat.mjs
import { sahteBulut } from "../ortak/sahte-bulut.mjs";
import { denetci } from "../ortak/panel.mjs";
import { arac, tabanArac, stokStore, satirlar, kopya } from "./yardimci.mjs";

const d = denetci("arac-fiyat");
const yeniBulut = (store = stokStore()) => sahteBulut({ satirlar: satirlar(store) });
const S = (b) => b.deger("babuco:store");
const urun = (b, id) => S(b).products.find((p) => p.id === id);
const ozel = (b, mid) => S(b).customers.find((c) => c.id === mid).ozelFiyatlar;

/* ---------- 1) Toplu zam: yoktu; yüzde + yuvarlama, aile birlikte taşınır, prova yazmaz ---------- */
{
  const b = await yeniBulut(), once = kopya(S(b));
  if (tabanArac()) d.dogru(/Bilinmeyen komut: toplu-zam/.test((await arac(b.url, ["toplu-zam", "--hepsi", "--yuzde=10"], { arac: tabanArac() })).stdout), "taban (YOKTU): toplu zam komutu yoktu");
  // Yalnız KUŞBURNU seçildi; aynı ailedeki Nane Limon da birlikte gitmeli (aile = aynı çeşit + aynı liste fiyatı).
  const prova = await arac(b.url, ["toplu-zam", "--urun=Kuşburnu", "--yuzde=10", "--yuvarla=5", "--yukari"]);
  d.dogru(/\| Örnek Toz İçecek Kuşburnu \| 75,00 ₺ \| \*\*85,00 ₺\*\* \|/.test(prova.stdout), "%10 zam + 5 liraya yukarı yuvarlama: 75 → 82,5 → 85");
  d.dogru(/\| Örnek Toz İçecek Nane Limon \| 75,00 ₺ \| \*\*85,00 ₺\*\* \| [^|]*\| ailesiyle birlikte \|/.test(prova.stdout), "seçilmeyen aile kardeşi de birlikte taşınıyor");
  d.dogru(/4 özel fiyat DEĞİŞMEYECEK/.test(prova.stdout), "özel fiyatlara dokunulmayacağı (ve kaç tane olduğu) söyleniyor");
  d.esit(S(b), once, "toplu zam provası hiçbir şey yazmadı");

  const r = await arac(b.url, ["toplu-zam", "--urun=Kuşburnu", "--yuzde=10", "--yuvarla=5", "--yukari", "--kaydet"]);
  d.dogru(r.kod === 0 && /2 liste fiyatı değişti/.test(r.stdout), "zam kaydedildi");
  d.esit([urun(b, "u7").satis, urun(b, "u8").satis], [85, 85], "aile aynı fiyatta kaldı (bölünmedi)");
  d.esit([ozel(b, "m1").u7, ozel(b, "m1").u8, ozel(b, "m2").u7], [80, 80, 80], "özel fiyatlar seçilmediği için değişmedi");
  d.esit(S(b).products.filter((p) => !["u7", "u8"].includes(p.id)).map((p) => p.satis), once.products.filter((p) => !["u7", "u8"].includes(p.id)).map((p) => p.satis), "diğer ürünlerin fiyatı değişmedi");
  d.esit(S(b).fiyatGecmisi.map((g) => [g.urunId, g.alan, g.eski, g.yeni]), [["u7", "satis", 75, 85], ["u8", "satis", 75, 85]], "zam fiyat geçmişine işlendi");
  await b.dur();
}

/* ---------- 2) Özel fiyatlar da aynı oranda (--ozel); grup seçimi ---------- */
{
  const b = await yeniBulut();
  const prova = await arac(b.url, ["toplu-zam", "--grup=Toz İçecekler", "--yuzde=10", "--yuvarla=5", "--ozel"]);
  d.dogru(/Özel fiyatlar da aynı kuralla değişecek \(4\)/.test(prova.stdout) && /\| Deneme Kıraathanesi \| Örnek Toz İçecek Kuşburnu \| 80,00 ₺ \| \*\*90,00 ₺\*\* \|/.test(prova.stdout), "--ozel: özel fiyatlar da önizlemede (80 → 88 → 90)");
  await arac(b.url, ["toplu-zam", "--grup=Toz İçecekler", "--yuzde=10", "--yuvarla=5", "--ozel", "--kaydet"]);
  d.esit([urun(b, "u7").satis, urun(b, "u8").satis, ozel(b, "m1").u7, ozel(b, "m1").u8, ozel(b, "m2").u7, ozel(b, "m2").u8], [85, 85, 90, 90, 90, 90], "liste 85, özel fiyatlar 90 oldu; müşteride aile tek fiyatta kaldı");
  d.esit([ozel(b, "m1").u1, ozel(b, "m2").u9], [90, 300], "zam kapsamı dışındaki özel fiyatlar değişmedi");
  d.esit(S(b).fiyatGecmisi.filter((g) => g.alan === "ozel").length, 4, "özel fiyat değişimleri de geçmişe işlendi (müşteriyle)");
  await b.dur();
}

/* ---------- 3) Tutar zammı, yuvarlamasız; metin (\"285\") fiyat türü korunur; aile çakışması uyarısı ---------- */
{
  const b = await yeniBulut();
  await arac(b.url, ["toplu-zam", "--grup=Sodalar", "--tutar=12,5", "--kaydet"]);
  d.esit([urun(b, "u9").satis, urun(b, "u10").satis, urun(b, "u6").satis], ["297.5", "327.5", 252.5], "tutar zammı: her ürüne +12,50 (fiyat alanının türü korunuyor)");
  d.esit(urun(b, "u9").adetSatis, 297.5 / 24, "koli ürününde adet fiyatı da güncellendi");
  // u9 297,5 → %6 → 315,35 → 5'e yuvarla 315;  u10 327,5 değişmez → çakışma YOK.  u9'u 327,5'e çekersek u10 ile aynı aile olur → uyarı.
  const cakis = await arac(b.url, ["toplu-zam", "--urun=Sade Soda A", "--yeni=327,5"]);
  d.dogru(/bundan sonra aynı fiyat ailesi sayılırlar/.test(cakis.stdout) && /Örnek Sade Soda B/.test(cakis.stdout), "farklı fiyatlı iki ürün zamla aynı fiyata gelince aile birleşmesi uyarısı çıkıyor");
  const indirim = await arac(b.url, ["toplu-zam", "--urun=Örnek Çay", "--tutar=-300"]);
  d.dogru(/⚠ ALIŞIN ALTINDA/.test(indirim.stdout), "indirim satışı alışın altına düşürüyorsa önizlemede uyarıyor");
  const eksik = await arac(b.url, ["toplu-zam", "--yuzde=10"]);
  d.dogru(eksik.kod === 1 && /Neye zam/.test(eksik.stderr), "kapsam verilmezse (grup/ürün/hepsi) çalışmıyor");
  await b.dur();
}

/* ---------- 4) Kâr uyarısı: alış fiyatı değişince etkilenen ürün ve özel fiyatlı müşteriler ---------- */
{
  const b = await yeniBulut();
  const taban = tabanArac();
  if (taban) d.dogru(!/UYARI/i.test((await arac(b.url, ["urun-fiyat", "Örnek Kola", "alis", "600"], { arac: taban })).stdout), "taban (YOKTU): alış değişince kâr uyarısı vermiyordu");
  const uf = await arac(b.url, ["urun-fiyat", "Örnek Kola", "alis", "600"]);
  d.dogru(/alis: 500,00 ₺  ->  600,00 ₺/.test(uf.stdout), "urun-fiyat eski çıktısını koruyor");
  d.dogru(/KÂR UYARISI — kârı %10,0 altına düşenler:/.test(uf.stdout) && /DUSUK Örnek Kola 250 ml: alış 600,00 ₺ · liste 640,00 ₺ · kâr %6,3/.test(uf.stdout), "urun-fiyat: ürünün yeni kârı eşiğin altında → uyarı");
  d.dogru(/- Sınama Derneği: özel fiyat 620,00 ₺ · kâr %3,2/.test(uf.stdout), "urun-fiyat: özel fiyatı eşiğin altına düşen müşteri de listeleniyor");
  const esik = await arac(b.url, ["urun-fiyat", "Örnek Kola", "alis", "600", "--esik=3"]);
  d.dogru(!/KÂR UYARISI/.test(esik.stdout), "eşik ayarlanabilir (--esik=3 → uyarı yok)");
  const temiz = await arac(b.url, ["urun-fiyat", "Örnek Kola", "alis", "510"]);
  d.dogru(!/KÂR UYARISI/.test(temiz.stdout), "kâr eşiğin üstünde kalıyorsa uyarı çıkmıyor");
  const zarar = await arac(b.url, ["alim", JSON.stringify({ kalemler: [{ urun: "Örnek Kola", adet: 1, alis: 630 }] })]);
  d.dogru(/KÂR UYARISI/.test(zarar.stdout) && /- Sınama Derneği: özel fiyat 620,00 ₺ · kâr %-1,6 \(ZARAR\)/.test(zarar.stdout), "alim: alışın altında kalan özel fiyat ZARAR diye işaretleniyor");
  await arac(b.url, ["urun-fiyat", "Örnek Kola", "alis", "600", "--kaydet"]);
  d.esit(S(b).fiyatGecmisi.map((g) => [g.urunId, g.alan, g.eski, g.yeni, g.kaynak]), [["u3", "alis", 500, 600, "urun-fiyat"]], "urun-fiyat değişimi fiyat geçmişine işlendi");
  const aile = await arac(b.url, ["urun-fiyat", "Kuşburnu", "satis", "90"]);
  d.dogru(/ailesinden AYRILIR/.test(aile.stdout) && /toplu-zam --urun=/.test(aile.stdout), "urun-fiyat tek ürünün satışını değiştirince aileden ayrılacağını söylüyor");
  const gecmis = await arac(b.url, ["fiyat-gecmisi", "kola"]);
  d.dogru(/\| Örnek Kola 250 ml \| alış \| 500,00 ₺ \| 600,00 ₺ \| urun-fiyat \|/.test(gecmis.stdout), "fiyat-gecmisi neyden neye, hangi kaynaktan değiştiğini gösteriyor");
  await b.dur();
}

/* ---------- 5) Fiyat kontrol listesi ---------- */
{
  const st = stokStore();
  st.products.find((p) => p.id === "u2").alis = 170;        // satış 170 = alış → zararına
  st.products.find((p) => p.id === "u6").alis = 225;        // 240'a satılıyor → %6,3 kâr
  st.products.find((p) => p.id === "u4").alis = 0;          // alışı yok → kâr hesaplanamaz
  const b = await yeniBulut(st);
  if (tabanArac()) d.dogru(/Bilinmeyen komut/.test((await arac(b.url, ["fiyat-kontrol"], { arac: tabanArac() })).stdout), "taban (YOKTU): fiyat kontrol komutu yoktu");
  const k = (await arac(b.url, ["fiyat-kontrol"])).stdout;
  d.dogru(/## Zararına satılan: satış ≤ alış \(1\)[\s\S]*\| Örnek Pet Su 500 ml \| 170,00 ₺ \| 170,00 ₺ \| %0,0 \|/.test(k), "satış ≤ alış olan ürün listeleniyor");
  d.dogru(/## Kârı düşük ürünler \(1\)[\s\S]*\| Örnek Soda \| 225,00 ₺ \| 240,00 ₺ \| %6,3 \|/.test(k), "kârı eşiğin altındaki ürün listeleniyor");
  d.dogru(/## Kârı düşük özel fiyatlar \(1\)[\s\S]*\| Sınama Derneği \| Örnek Küp Şeker \| 52,50 ₺ \| 55,00 ₺ \| %4,5 \|/.test(k), "kârı düşük özel fiyat listeleniyor (alışı olmayan üründeki sayılmıyor)");
  d.dogru(/## Özel fiyatı liste fiyatından yüksek \(3 müşteri fiyatı, 2 ürün ailesi\)/.test(k), "özel fiyatı liste fiyatından yüksek olanlar aile aile sayılıyor");
  d.dogru(/öneri: liste fiyatını \*\*80,00 ₺\*\* yap \(2 müşteri zaten bu fiyattan alıyor\) → `toplu-zam --urun="Örnek Toz İçecek Kuşburnu" --yeni=80`/.test(k), "en yaygın özel fiyat öneri olarak, çalıştırılacak komutla veriliyor");
  d.dogru(!/Örnek Sade Soda A[^\n]*\n  öneri/.test(k), "tek müşterinin yüksek fiyatı için öneri verilmiyor (yaygın değil)");
  d.dogru(/Alış fiyatı girilmemiş 1 üründe kâr hesaplanamadı: Örnek Çay 5 kg/.test(k), "alış fiyatı olmayan ürün ayrıca belirtiliyor");
  // öneriyi uygula: aile birlikte 80 olur, özel fiyatlar yerinde kalır
  await arac(b.url, ["toplu-zam", "--urun=Örnek Toz İçecek Kuşburnu", "--yeni=80", "--kaydet"]);
  d.esit([urun(b, "u7").satis, urun(b, "u8").satis, ozel(b, "m1").u7], [80, 80, 80], "öneri uygulandı: aile birlikte 80 oldu");
  d.dogru(/## Özel fiyatı liste fiyatından yüksek \(1 müşteri fiyatı, 1 ürün ailesi\)/.test((await arac(b.url, ["fiyat-kontrol"])).stdout), "uygulamadan sonra o aile listeden çıktı");
  d.dogru(/## Kârı düşük ürünler \(0\)/.test((await arac(b.url, ["fiyat-kontrol", "--esik=5"])).stdout), "eşik ayarlanabilir (--esik=5)");
  await b.dur();
}
d.bitir();
