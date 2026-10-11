// Arayüzde kalan emoji taraması: app.js'i fonksiyon fonksiyon gezer, emoji/simge içeren satırları bölge sahibine göre sayar.
// Kullanım: node testler/gorsel/genel-emoji-tara.mjs [--liste]   (çıkış kodu: genel bölgesinde arayüz emojisi kaldıysa 1)
import fs from "node:fs";
import path from "node:path";
const DEPO = process.cwd();
const src = fs.readFileSync(path.join(DEPO, "public/toptanci/app.js"), "utf8").split(/\r?\n/);
const html = fs.readFileSync(path.join(DEPO, "public/toptanci/index.html"), "utf8");
const EMOJI = /(\p{Extended_Pictographic}|[←-⇿☀-➿■-◿⬀-⯿＋])️?/gu;
// Arayüz ikonu sayılmayanlar: tipografik işaretler (ok, madde imi…)
const SERBEST = new Set(["→", "←", "↔", "©", "®", "™", "‼", "↑", "↓", "▲", "▼", "■", "▪", "●", "○", "◦"]);
const SATIS = ["renderSatis", "cartCustName", "cartRowsHTML", "aileGetir", "posSoloCard", "musteriSonSiparis", "bundleBarHTML", "bundleUygula", "katGorsel", "catGridHTML", "prodGridHTML", "openAilePopup", "netLine", "cartCount", "cartTotals", "rebuildCart", "syncTotals", "syncRow", "refreshPOS", "wireCartRow", "openLineModal", "wireLineModal", "musteriFiyat", "repriceCart", "addToCart", "finalizeCustom", "finalizeSale", "wireProdCards", "posGridYenile", "openCustPicker", "openMuhModal", "openIskModal", "mountSatis", "servisSepetHTML"];
const LISTE = ["tableCard", "wireTableSearch", "mobilTabloEtiketle", "enhanceTables", "renderMusteriler", "mountMusteriler", "renderMusteriDetay", "mountMusteriDetay", "renderUrunler", "mountUrunler", "raporSatisTablo", "raporSatisWire"];
// Müşteriye giden yazı (WhatsApp / paylaşım metni) üreten yerler: oradaki emoji arayüz ikonu değil.
const METIN = ["saleIrsaliyeMetni", "bakiyeHesap", "hatirlatmaMetni", "onSiparisMesaj", "stkAlinacakMetin", "ekstreMetni", "cayGonder", "buildFiyatListesi", "irsaliyeAciklama"];
let fn = "(üst)"; const say = { genel: 0, satis: 0, liste: 0, metin: 0 }; const cikti = [];
src.forEach((satir, i) => {
  const m = satir.match(/^(?:async )?function ([A-Za-z0-9_]+)|^const ([A-Za-z0-9_]+) = /); if (m) fn = m[1] || m[2];
  // yorumları ve alert/confirm/prompt/bildirim çağrılarının içini sayma
  let s = /^\s*(\/\/|\/\*|\*)/.test(satir) ? "" : satir.replace(/\/\*.*?\*\//g, "").replace(/\s\/\/ .*$/, "");
  s = s.replace(/\b(alert|confirm|prompt|esBildir|console\.\w+)\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)/g, "");
  const bulunan = [...s.matchAll(EMOJI)].map((x) => x[0]).filter((e) => !SERBEST.has(e.replace("\ufe0f", "")));
  bulunan.push(...[...s.matchAll(/&#(\d+);/g)].filter((x) => Number(x[1]) > 8000).map((x) => x[0]));   // emoji sayı kodu (&#127908; gibi)
  if (!bulunan.length) return;
  const bolge = SATIS.includes(fn) ? "satis" : LISTE.includes(fn) ? "liste" : METIN.includes(fn) ? "metin" : "genel";
  say[bolge] += bulunan.length; cikti.push(`${bolge}\t${i + 1}\t${fn}\t${bulunan.join(" ")}`);
});
// index.html (üst çubuk): emoji ya da emoji sayı kodu (&#128276; gibi) kalmış mı
const htmlKalan = [...html.matchAll(EMOJI)].map((x) => x[0]).concat([...html.matchAll(/&#(\d+);/g)].filter((x) => Number(x[1]) > 8000).map((x) => x[0]));
if (htmlKalan.length) { say.genel += htmlKalan.length; cikti.push("genel\tindex.html\t-\t" + htmlKalan.join(" ")); }
console.log(cikti.filter((x) => process.argv.includes("--liste") || x.startsWith("genel")).join("\n"));
console.log(`emoji/simge: genel=${say.genel} · satis=${say.satis} · liste=${say.liste} · mesaj metni=${say.metin}`);
process.exit(say.genel ? 1 : 0);
