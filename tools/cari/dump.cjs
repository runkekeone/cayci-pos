// Buluttaki babuco:store'u bir dosyaya döker (cari hesap sayfası üreticisi için).
// Kimlik aracınkiyle aynı: tools/babuco-kimlik.cjs (oturum varsa onunla; veritabanı kilidi kuruluyken oturum şart).
const fs = require("fs");
const kimlik = require("../babuco-kimlik.cjs");
(async () => {
  const j = await kimlik.sb("kv?key=eq." + encodeURIComponent("babuco:store") + "&select=value,updated_at");
  if (!j || !j.length) throw new Error("Bulutta babuco:store kaydi yok.");
  fs.writeFileSync(process.argv[2], JSON.stringify(j[0].value));
  console.log("ok", j[0].updated_at, j[0].value.sales.length);
})().catch((e) => { console.error("HATA: " + e.message); process.exit(1); });
