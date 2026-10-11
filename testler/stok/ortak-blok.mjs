// Panel (app.js) ile araç (babuco.cjs) aynı stok/fiyat/sipariş hesabını kullansın diye ortak işlevler iki dosyada
// HARFİ HARFİNE aynı blok olarak durur (index.html'e yeni betik eklenemediği için kopya). Bu deneme ikisinin
// ayrışmadığını denetler.
//   node testler/stok/ortak-blok.mjs          → aynı mı?
//   node testler/stok/ortak-blok.mjs --yaz    → araçtaki bloğu panele kopyalar (bloğu ARAÇTA düzenle, sonra bunu çalıştır)
import fs from "node:fs";
import path from "node:path";
import { DEPO, denetci } from "../ortak/panel.mjs";

const BAS = "/* >>> STOK-ORTAK-BASLA", SON = "/* <<< STOK-ORTAK-BITTI */";
const aracYol = path.join(DEPO, "tools/babuco.cjs"), panelYol = path.join(DEPO, "public/toptanci/app.js");
const oku = (yol) => fs.readFileSync(yol, "utf8");
const blok = (metin) => { const t = metin.split("\r\n").join("\n"), a = t.indexOf(BAS), b = t.indexOf(SON); return a < 0 || b < 0 ? null : t.slice(a, b + SON.length); };

if (process.argv.includes("--yaz")) {
  const kaynak = blok(oku(aracYol)), ham = oku(panelYol), crlf = ham.includes("\r\n");
  const t = ham.split("\r\n").join("\n"), a = t.indexOf(BAS), b = t.indexOf(SON);
  if (!kaynak || a < 0 || b < 0) throw new Error("blok işaretleri bulunamadı");
  const yeni = t.slice(0, a) + kaynak + t.slice(b + SON.length);
  fs.writeFileSync(panelYol, crlf ? yeni.split("\n").join("\r\n") : yeni);
  console.log("araçtaki ortak blok panele yazıldı (" + kaynak.split("\n").length + " satır)");
}

const d = denetci("ortak-blok");
const A = blok(oku(aracYol)), P = blok(oku(panelYol));
d.dogru(!!A && !!P, "ortak blok iki dosyada da var");
d.dogru(A === P, "araçtaki ve paneldeki ortak blok harfi harfine aynı" + (A && P && A !== P ? " — FARKLI: ilk fark satırı " + (A.split("\n").findIndex((s, i) => s !== P.split("\n")[i]) + 1) + ". 'node testler/stok/ortak-blok.mjs --yaz' ile eşitle" : ""));
d.dogru(!!A && !/^\s*(const|let)\s/m.test(A.split("\n").filter((s) => /^(const|let)\s/.test(s)).join("\n")), "ortak blokta üst düzey const/let yok (araçta komutlardan önce hazır olmazdı)");
d.bitir();
