// Araç (tools/babuco-cari.cjs), panel (public/toptanci/app.js) ve müşteri sayfası (public/cari/index.html) cari
// hesabı AYNI kodla üretsin/çözsün diye ortak işlevler üç dosyada HARFİ HARFİNE aynı blok olarak durur. Sayfa ayrıca
// aracın para/vade işlevlerinin (patron listesi: borç, gecikme, limit) birebir kopyasını taşır. Bu deneme ayrışmayı yakalar.
//   node testler/cari/ortak-blok.mjs          → aynı mı?
//   node testler/cari/ortak-blok.mjs --yaz    → araçtaki bloğu panele ve sayfaya, para işlevlerini sayfaya kopyalar
import fs from "node:fs";
import path from "node:path";
import { DEPO, denetci } from "../ortak/panel.mjs";

const BAS = "/* >>> CARI-ORTAK-BASLA", SON = "/* <<< CARI-ORTAK-BITTI */";
const PBAS = "/* >>> PARA-KOPYA-BASLA", PSON = "/* <<< PARA-KOPYA-BITTI */";
const yol = { arac: path.join(DEPO, "tools/babuco-cari.cjs"), anaArac: path.join(DEPO, "tools/babuco.cjs"), panel: path.join(DEPO, "public/toptanci/app.js"), sayfa: path.join(DEPO, "public/cari/index.html") };
const oku = (y) => fs.readFileSync(y, "utf8").split("\r\n").join("\n");
const blok = (metin, bas, son) => { const a = metin.indexOf(bas), b = metin.indexOf(son); return a < 0 || b < 0 ? null : metin.slice(a, b + son.length); };

/** Aracın para/vade işlevleri, kaynakta yazdığı gibi (satır satır). */
const PARA_ADLAR = ["const pad2 =", "const localDateStr =", "const todayStr =", "const kurus =", "function customerBorc(", "const KART_NOT_RE =", "const HAVALE_NOT_RE =",
  "function tahsilatTuru(", "const VADE_VARSAYILAN =", "function genelVade(", "function musteriVade(", "function gunFarki(", "function idZamani(", "function borcYas(", "function musteriLimit("];
function paraKopya() {
  const satirlar = oku(yol.anaArac).split("\n"), parcalar = [];
  for (const ad of PARA_ADLAR) {
    const i = satirlar.findIndex((s) => s.indexOf(ad) === 0);
    if (i < 0) throw new Error("araçta bulunamadı: " + ad);
    let j = i, derinlik = 0;
    if (ad.indexOf("function") === 0) {
      for (; j < satirlar.length; j++) { derinlik += (satirlar[j].match(/\{/g) || []).length - (satirlar[j].match(/\}/g) || []).length; if (derinlik === 0) break; }
    }
    parcalar.push(satirlar.slice(i, j + 1).join("\n"));
  }
  return parcalar;
}
const paraBlok = () => PBAS + "\n   tools/babuco.cjs'deki para/vade işlevlerinin BİREBİR kopyası (patron listesi: borç, gecikme, limit).\n   Elle değiştirme: node testler/cari/ortak-blok.mjs --yaz */\n" + paraKopya().join("\n") + "\n" + PSON;

function yerlestir(dosya, bas, son, yeni) {
  const ham = fs.readFileSync(dosya, "utf8"), crlf = ham.includes("\r\n");
  const t = ham.split("\r\n").join("\n"), a = t.indexOf(bas), b = t.indexOf(son);
  if (a < 0 || b < 0) throw new Error("blok işaretleri bulunamadı: " + dosya);
  const sonuc = t.slice(0, a) + yeni + t.slice(b + son.length);
  fs.writeFileSync(dosya, crlf ? sonuc.split("\n").join("\r\n") : sonuc);
}
if (process.argv.includes("--yaz")) {
  const kaynak = blok(oku(yol.arac), BAS, SON);
  if (!kaynak) throw new Error("araçta ortak blok yok");
  yerlestir(yol.panel, BAS, SON, kaynak);
  yerlestir(yol.sayfa, BAS, SON, kaynak);
  yerlestir(yol.sayfa, PBAS, PSON, paraBlok());
  console.log("ortak blok panele ve sayfaya, para işlevleri sayfaya yazıldı (" + kaynak.split("\n").length + " satır)");
}

const d = denetci("cari-ortak-blok");
const A = blok(oku(yol.arac), BAS, SON), P = blok(oku(yol.panel), BAS, SON), S = blok(oku(yol.sayfa), BAS, SON);
d.dogru(!!A && !!P && !!S, "ortak blok üç dosyada da var");
d.dogru(A === P, "araçtaki ve paneldeki cari bloğu harfi harfine aynı");
d.dogru(A === S, "araçtaki ve müşteri sayfasındaki cari bloğu harfi harfine aynı");
d.dogru(!!A && !/^(const|let|var)\s/m.test(A), "ortak blokta üst düzey const/let yok");
d.dogru(blok(oku(yol.sayfa), PBAS, PSON) === paraBlok(), "sayfadaki para/vade işlevleri araçtakilerin birebir kopyası (" + PARA_ADLAR.length + " parça)");
const al = (metin, ad) => (metin.match(new RegExp(ad + ' = "([^"]+)"')) || [])[1];
d.dogru(!!al(oku(yol.panel), "SB_URL") && al(oku(yol.panel), "SB_URL") === al(oku(yol.sayfa), "SB_URL") && al(oku(yol.panel), "SB_KEY") === al(oku(yol.sayfa), "SB_KEY"), "sayfanın bağlantı bilgisi panelinkiyle aynı");
d.bitir();
