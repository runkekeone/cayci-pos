// tools/supabase/*.sql dosyalarını GERÇEK bir Postgres'te (PGlite — tarayıcısız, bellekte çalışan Postgres) sınar.
// Canlıya hiçbir şey gitmez; veritabanı bu sürecin belleğindedir.
//
// PGlite depoya bağımlılık olarak EKLENMEDİ. Çalıştırmak için bir kez, depo DIŞINDA bir klasöre kur:
//     mkdir C:\gecici\pglite && cd C:\gecici\pglite && npm init -y && npm install @electric-sql/pglite
//     set PGLITE=C:\gecici\pglite\node_modules\@electric-sql\pglite     (PowerShell: $env:PGLITE = "...")
//     node testler/giris/sql-dene.mjs
// PGLITE verilmemişse ve paket bulunamazsa deneme "ATLANDI" der ve 0 ile çıkar.
//
// Supabase'in ortamı elle taklit edilir: anon / authenticated rolleri, auth.users, auth.uid()
// (request.jwt.claim.sub ayarından okur), tablolarda Supabase'in varsayılan hakları (ALL → anon, authenticated).
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { denetci, DEPO } from "../ortak/panel.mjs";
import { ornekStore } from "../ortak/ornek-store.mjs";
import { sinif, TOPTANCI, YABANCI } from "./sahte-kilit.mjs";

let PGlite = null;
try {
  const yol = process.env.PGLITE ? pathToFileURL(path.join(process.env.PGLITE, "dist/index.js")).href : "@electric-sql/pglite";
  ({ PGlite } = await import(yol));
} catch (e) {
  console.log("ATLANDI: PGlite bulunamadı (" + String(e.message).split("\n")[0] + "). Kurulumu dosyanın başında yazıyor.");
  process.exit(0);
}

const d = denetci("sql");
const oku = (ad) => fs.readFileSync(path.join(DEPO, "tools/supabase", ad), "utf8");
const KILIT = oku("kilit.sql"), GERI = oku("geri-al.sql"), BAK = oku("once-bak.sql");
const kilitSql = (...epostalar) => KILIT.replace("('BURAYA-KENDI-EPOSTANI-YAZ')", epostalar.map((e) => "('" + e + "')").join(", "));
const katalog = { v: 1, urunler: ornekStore().products.map((p) => ({ id: p.id, ad: p.ad, grup: p.grup, satis: p.satis, birim: p.birim, barkod: "" })) };

const ORTAM = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text unique, created_at timestamptz default now(), last_sign_in_at timestamptz, email_confirmed_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
create table public.kv (key text primary key, value jsonb, updated_at timestamptz default now());
create table public.siparisler (id text primary key, toptanci text, payload jsonb, durum text, updated_at timestamptz default now());
grant all on public.kv, public.siparisler to anon, authenticated, service_role;
insert into auth.users (id, email) values ('${TOPTANCI.id}', '${TOPTANCI.eposta}'), ('${YABANCI.id}', '${YABANCI.eposta}'), ('00000000-0000-4000-8000-000000000003', 'Baba@Ornek.Test');
`;
const VERI = [
  ["babuco:store", ornekStore()], ["babuco:yedek:2026-10-01", { a: 1 }], ["duyurular", [{ metin: "merhaba" }]],
  ["babuco:on-siparis:policy:5550000002", { minPesinOrani: 0.4 }], ["bayi_puan:05550000002", { puan: 12 }],
  ["cayci-pos:data:u-1", { items: [] }], ["cayci-pos:users", [{ id: "u-1" }]],
  ["babuco:cari:h:0123abcd", { v: 1, o: "ozet", d: "sifreli" }], ["babuco:cari-sir", { v: 1, sir: "gizli" }],   // müşteri cari sayfası: şifreli kayıt (açık) + kodların sırrı (özel)
];
const ONCEKI_DUZENLER = {
  "satır güvenliği kapalı, politika yok": "",
  "herkese açık tek politika": "alter table public.kv enable row level security; create policy \"Herkes her sey\" on public.kv for all using (true) with check (true);",
  "satır güvenliği kapalı, haklar 'herkes' (PUBLIC) sözde-rolüne verilmiş": "grant all on public.kv to public;",
  "yalnız anon politikaları": "alter table public.kv enable row level security; create policy anon_oku on public.kv for select to anon using (true); create policy anon_ekle on public.kv for insert to anon with check (true); create policy anon_guncelle on public.kv for update to anon using (true) with check (true);",
};

async function kur(onceki, { katalogVar = true } = {}) {
  const db = new PGlite();
  await db.exec(ORTAM);
  for (const [k, v] of VERI) await db.query("insert into public.kv (key, value) values ($1, $2)", [k, JSON.stringify(v)]);
  if (katalogVar) await db.query("insert into public.kv (key, value) values ('babuco:katalog', $1)", [JSON.stringify(katalog)]);
  if (onceki) await db.exec(onceki);
  return db;
}
/** Betiği çalıştır; hata verirse (Supabase SQL Editor'ün yaptığı gibi) işlemi geri al ve hata metnini döndür. */
async function calistir(db, sql) {
  try { await db.exec(sql); return ""; }
  catch (e) { await db.exec("rollback").catch(() => {}); return String(e.message); }
}
/** Bir rol olarak sorgu: kim = "anon" | kullanıcı kimliği (authenticated). Dönen: { satirlar } ya da { hata: sqlstate }. */
async function rolle(db, kim, sql, par = []) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [kim === "anon" ? "" : kim]);
  await db.exec("set role " + (kim === "anon" ? "anon" : "authenticated"));
  try { const r = await db.query(sql, par); return { satirlar: r.rows, etkilenen: r.affectedRows }; }
  catch (e) { return { hata: e.code || String(e.message) }; }
  finally { await db.exec("reset role"); }
}
const UPSERT = "insert into public.kv (key, value, updated_at) values ($1, $2, now()) on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at";
const durumOzeti = async (db) => JSON.stringify((await db.query("select (select relrowsecurity from pg_class where oid = 'public.kv'::regclass) as rls, coalesce((select json_agg(json_build_array(policyname, permissive, cmd, roles::text, qual, with_check) order by policyname) from pg_policies where schemaname = 'public' and tablename = 'kv'), '[]'::json) as p")).rows[0]);
const storeMetni = async (db) => (await db.query("select value::text as v from public.kv where key = 'babuco:store'")).rows[0].v;

/** Kilit kuruluyken beklenen davranışın tamamı. */
async function kilitliDavranis(db, ad) {
  const once = await storeMetni(db);
  // dışarıdan (anon)
  d.esit((await rolle(db, "anon", "select key from public.kv where key = 'babuco:store'")).satirlar, [], ad + ": anon babuco:store'u göremez");
  d.esit((await rolle(db, "anon", "select key from public.kv order by key")).satirlar.map((r) => r.key),
    ["babuco:cari:h:0123abcd", "babuco:katalog", "babuco:on-siparis:policy:5550000002", "bayi_puan:05550000002", "cayci-pos:data:u-1", "cayci-pos:users", "duyurular"], ad + ": anon yalnız açık (şifreli cari kaydı dahil) + çay ocağı satırlarını görür");
  d.esit((await rolle(db, "anon", "select value ->> 'd' as d from public.kv where key = 'babuco:cari:h:0123abcd'")).satirlar, [{ d: "sifreli" }], ad + ": anon şifreli cari kaydını okur (müşteri sayfası)");
  d.esit((await rolle(db, "anon", "select key from public.kv where key = 'babuco:cari-sir'")).satirlar, [], ad + ": anon cari kodlarının sırrını göremez");
  d.esit((await rolle(db, "anon", "update public.kv set value = '{}' where key = 'babuco:cari:h:0123abcd'")).etkilenen, 0, ad + ": anon update cari kaydı → 0 satır (okur ama yazamaz)");
  for (const k of ["babuco:store", "babuco:katalog", "duyurular", "babuco:on-siparis:policy:5550000002", "babuco:yedek:2099-01-01", "babuco:yepyeni", "baska:anahtar", "Babuco:store", "babuco:cari:h:0123abcd", "babuco:cari:t:yeni", "babuco:cari-sir"])
    d.esit((await rolle(db, "anon", UPSERT, [k, "{}"])).hata, "42501", ad + ": anon yazamaz → " + k);
  d.esit((await rolle(db, "anon", "update public.kv set value = '{}' where key = 'babuco:store'")).etkilenen, 0, ad + ": anon update babuco:store → 0 satır");
  d.esit((await rolle(db, "anon", "update public.kv set value = '[]' where key = 'duyurular'")).etkilenen, 0, ad + ": anon update duyurular → 0 satır (okur ama yazamaz)");
  d.esit((await rolle(db, "anon", "delete from public.kv where key in ('babuco:store', 'cayci-pos:users', 'duyurular')")).hata, "42501", ad + ": anon'un silme hakkı yok");
  d.esit((await rolle(db, "anon", "truncate public.kv")).hata, "42501", ad + ": anon tabloyu boşaltamaz (TRUNCATE)");
  d.esit((await rolle(db, "anon", "update public.kv set key = 'babuco:store2' where key = 'cayci-pos:data:u-1'")).hata, "42501", ad + ": anon serbest satırı babuco:* adına taşıyamaz");
  d.esit((await rolle(db, "anon", "select count(*)::int n from public.babuco_yetkililer")).hata, "42501", ad + ": anon izin listesini okuyamaz");
  d.esit((await rolle(db, "anon", "insert into public.babuco_yetkililer (user_id) values ('" + YABANCI.id + "')")).hata, "42501", ad + ": anon izin listesine kendini ekleyemez");
  d.esit((await rolle(db, "anon", "select count(*)::int n from public.babuco_kilit_onceki")).hata, "42501", ad + ": anon eski düzen kaydını okuyamaz");
  d.esit((await rolle(db, "anon", "select public.babuco_yetkili() as y")).satirlar, [{ y: false }], ad + ": anon için babuco_yetkili() = false");
  // çay ocağı uygulamasının işleri sürüyor
  d.esit((await rolle(db, "anon", UPSERT, ["bayi_puan:05550000002", '{"puan":7}'])).hata, undefined, ad + ": anon bayi puanını günceller (upsert)");
  d.esit((await rolle(db, "anon", UPSERT, ["cayci-pos:data:u-1", '{"items":[1]}'])).hata, undefined, ad + ": anon çay ocağı verisini günceller (upsert)");
  d.esit((await rolle(db, "anon", UPSERT, ["cayci-pos:data:u-yeni", "{}"])).hata, undefined, ad + ": anon yeni çay ocağı satırı açar");
  d.esit((await rolle(db, "anon", "select value from public.kv where key = 'cayci-pos:data:u-1'")).satirlar, [{ value: { items: [1] } }], ad + ": anon çay ocağı verisini okur");
  d.esit((await rolle(db, "anon", "select jsonb_array_length(value -> 'urunler') n from public.kv where key = 'babuco:katalog'")).satirlar, [{ n: 6 }], ad + ": anon kataloğu okur");
  d.esit((await rolle(db, "anon", "select count(*)::int n from public.siparisler")).satirlar, [{ n: 0 }], ad + ": siparisler tablosuna dokunulmadı (anon okuyor)");
  // giriş yapmış ama izin listesinde olmayan hesap = dışarıdan biri
  d.esit((await rolle(db, YABANCI.id, "select key from public.kv where key like 'babuco:%' order by key")).satirlar.map((r) => r.key), ["babuco:cari:h:0123abcd", "babuco:katalog", "babuco:on-siparis:policy:5550000002"], ad + ": izinsiz hesap özel satırları (store, yedek, cari sırrı) göremez");
  d.esit((await rolle(db, YABANCI.id, UPSERT, ["babuco:cari:h:0123abcd", "{}"])).hata, "42501", ad + ": izinsiz hesap cari kaydı yazamaz");
  d.esit((await rolle(db, YABANCI.id, UPSERT, ["babuco:store", "{}"])).hata, "42501", ad + ": izinsiz hesap yazamaz");
  d.esit((await rolle(db, YABANCI.id, "delete from public.kv where key = 'babuco:store'")).etkilenen, 0, ad + ": izinsiz hesap silemez");
  d.esit((await rolle(db, YABANCI.id, "select public.babuco_yetkili() as y")).satirlar, [{ y: false }], ad + ": izinsiz hesap için babuco_yetkili() = false");
  d.dogru((await storeMetni(db)) === once, ad + ": bütün bu denemelerden sonra babuco:store değişmedi");
  // yetkili toptancı
  d.esit((await rolle(db, TOPTANCI.id, "select public.babuco_yetkili() as y")).satirlar, [{ y: true }], ad + ": yetkili hesap için babuco_yetkili() = true");
  d.esit((await rolle(db, TOPTANCI.id, "select jsonb_array_length(value -> 'customers') n from public.kv where key = 'babuco:store'")).satirlar, [{ n: 4 }], ad + ": yetkili hesap babuco:store'u okur");
  d.esit((await rolle(db, TOPTANCI.id, "update public.kv set value = jsonb_set(value, '{deneme}', '1'), updated_at = now() where key = 'babuco:store' and updated_at = (select updated_at from public.kv where key = 'babuco:store')")).etkilenen, 1, ad + ": yetkili hesap koşullu güncelleme yapar (aracın yazma biçimi)");
  for (const k of ["babuco:store", "babuco:katalog", "duyurular", "babuco:on-siparis:policy:5550000009", "babuco:yedek:2099-01-01", "bayi_puan:05550000009"])
    d.esit((await rolle(db, TOPTANCI.id, UPSERT, [k, k === "babuco:store" ? JSON.stringify(ornekStore()) : k === "babuco:katalog" ? JSON.stringify(katalog) : "{}"])).hata, undefined, ad + ": yetkili hesap yazar (upsert) → " + k);
  d.esit((await rolle(db, TOPTANCI.id, "delete from public.kv where key = 'babuco:yedek:2099-01-01'")).etkilenen, 1, ad + ": yetkili hesap eski yedeği siler");
  d.esit((await rolle(db, TOPTANCI.id, "select value ->> 'sir' as s from public.kv where key = 'babuco:cari-sir'")).satirlar, [{ s: "gizli" }], ad + ": yetkili hesap cari sırrını okur");
  d.esit((await rolle(db, TOPTANCI.id, UPSERT, ["babuco:cari:t:yeni", "{}"])).hata, undefined, ad + ": yetkili hesap cari kaydı yazar (upsert)");
  d.esit((await rolle(db, TOPTANCI.id, "delete from public.kv where key = 'babuco:cari:t:yeni'")).etkilenen, 1, ad + ": yetkili hesap eski cari kaydını siler");
  d.esit((await rolle(db, TOPTANCI.id, UPSERT, ["baska:anahtar", "{}"])).hata, "42501", ad + ": yetkili hesap bile tanınmayan anahtar açamaz (varsayılan ret)");
  d.esit((await rolle(db, TOPTANCI.id, "insert into public.babuco_yetkililer (user_id) values ('" + YABANCI.id + "')")).hata, "42501", ad + ": yetkili hesap bile izin listesini uygulamadan değiştiremez");
  await db.query("delete from public.kv where key in ('bayi_puan:05550000009', 'babuco:on-siparis:policy:5550000009', 'cayci-pos:data:u-yeni')");
  await db.query("update public.kv set value = $1 where key = 'cayci-pos:data:u-1'", ['{"items":[]}']);
  await db.query("update public.kv set value = $1 where key = 'bayi_puan:05550000002'", ['{"puan":12}']);
}

// ---------- 1) üç olası eski düzende: kur → davranış → yeniden kur → geri al → eski düzen aynen ----------
for (const [ad, onceki] of Object.entries(ONCEKI_DUZENLER)) {
  console.log("\n— eski düzen: " + ad + " —");
  const db = await kur(onceki);
  const eskiDurum = await durumOzeti(db);
  d.dogru((await db.query(BAK)).rows.length > 8, ad + ": once-bak.sql çalışıyor (kilitten önce)");
  d.esit(await calistir(db, kilitSql(TOPTANCI.eposta)), "", ad + ": kilit.sql hatasız çalıştı");
  d.esit((await db.query("select eposta from public.babuco_yetkililer")).rows, [{ eposta: TOPTANCI.eposta }], ad + ": izin listesinde yalnız yazılan hesap var");
  await kilitliDavranis(db, ad);
  const kilitliDurum = await durumOzeti(db);
  // yeniden çalıştırılabilir; AYAR boş bırakılsa da izin listesi korunur; ikinci hesap eklenebilir (büyük/küçük harf fark etmez)
  d.esit(await calistir(db, KILIT), "", ad + ": kilit.sql ikinci kez (AYAR değiştirilmeden) hatasız çalıştı");
  d.dogru((await durumOzeti(db)) === kilitliDurum, ad + ": ikinci çalıştırma aynı sonucu verdi");
  d.esit(await calistir(db, kilitSql("baba@ornek.test")), "", ad + ": ikinci hesap eklendi");
  d.esit((await db.query("select count(*)::int n from public.babuco_yetkililer")).rows, [{ n: 2 }], ad + ": izin listesi 2 hesap");
  d.esit((await rolle(db, "00000000-0000-4000-8000-000000000003", "select count(*)::int n from public.kv where key = 'babuco:store'")).satirlar, [{ n: 1 }], ad + ": eklenen ikinci hesap veriyi okur");
  d.dogru((await db.query(BAK)).rows.some((r) => /KAPALI/.test(r.durum) === false && r.ne === "kv"), ad + ": once-bak.sql kilitten sonra kv için AÇIK diyor");
  // geri al → tam eski düzen
  d.esit(await calistir(db, GERI), "", ad + ": geri-al.sql hatasız çalıştı");
  d.dogru((await durumOzeti(db)) === eskiDurum, ad + ": geri alınca politikalar ve satır güvenliği AYNEN eski hâline döndü");
  d.esit((await rolle(db, "anon", "select count(*)::int n from public.kv where key = 'babuco:store'")).satirlar, [{ n: 1 }], ad + ": geri alınca anon yine babuco:store'u görüyor (eski açık hâl)");
  d.esit((await rolle(db, "anon", "delete from public.kv where key = 'yok-boyle'")).hata, undefined, ad + ": geri alınca anon'un silme hakkı geri geldi");
  // geri aldıktan sonra yeniden kilitlenebilir
  d.esit(await calistir(db, KILIT), "", ad + ": geri aldıktan sonra kilit yeniden kurulabildi");
  d.dogru((await durumOzeti(db)) === kilitliDurum, ad + ": yeniden kurulan kilit ilkinin aynısı");
  await db.close();
}

// ---------- 2) ön denetimler: tutmazsa hiçbir şey değişmez ----------
{
  console.log("\n— ön denetimler —");
  const degismedi = async (db, onceki, ne) => {
    d.dogru((await durumOzeti(db)) === onceki && (await db.query("select to_regclass('public.babuco_yetkililer') is null as yok")).rows[0].yok, ne + " → hiçbir şey değişmedi (tablo, politika, satır güvenliği)");
    d.esit((await rolle(db, "anon", "select count(*)::int n from public.kv where key = 'babuco:store'")).satirlar, [{ n: 1 }], ne + " → eski erişim sürüyor");
  };
  let db = await kur("");
  let once = await durumOzeti(db);
  let h = await calistir(db, KILIT);
  d.dogru(/İzin listesi boş/.test(h), "e-posta yazılmadan çalıştırılırsa durur: " + h.slice(0, 40) + "…");
  await degismedi(db, once, "e-posta yazılmamış");
  h = await calistir(db, kilitSql("yanlis-yazim@ornek.test"));
  d.dogru(/hesabı bulunamadı: yanlis-yazim@ornek\.test/.test(h), "olmayan e-posta yazılırsa durur ve hangisi olduğunu söyler");
  await degismedi(db, once, "olmayan e-posta");
  await db.exec("insert into public.kv (key, value) values ('gizemli:anahtar', '{}')");
  h = await calistir(db, kilitSql(TOPTANCI.eposta));
  d.dogru(/tanımadığım anahtar\(lar\) var: gizemli/.test(h), "tanınmayan anahtar varsa durur ve önekini söyler");
  await degismedi(db, once, "tanınmayan anahtar");
  await db.exec("delete from public.kv where key = 'gizemli:anahtar'; create view public.kv_acik as select * from public.kv;");
  h = await calistir(db, kilitSql(TOPTANCI.eposta));
  d.dogru(/okuyan görünüm var: kv_acik/.test(h), "kv'yi okuyan görünüm varsa durur");
  await degismedi(db, once, "kv'yi okuyan görünüm");
  await db.close();

  db = await kur("", { katalogVar: false });
  once = await durumOzeti(db);
  h = await calistir(db, kilitSql(TOPTANCI.eposta));
  d.dogru(/katalog \(babuco:katalog\) henüz yayınlanmamış/.test(h), "katalog yayınlanmamışsa durur (çay ocağı sipariş ekranı boşalmasın)");
  await degismedi(db, once, "katalog yok");
  d.dogru((await db.query(BAK)).rows.some((r) => /YOK — panel henüz yayınlamamış/.test(r.durum)), "once-bak.sql katalog yokken açıkça söylüyor");
  h = await calistir(db, GERI);
  d.dogru(/Önceki düzenin kaydı yok/.test(h), "kilit hiç kurulmadan geri-al.sql çalıştırılırsa durur");
  await db.exec("insert into public.kv (key, value) values ('babuco:katalog', '{\"urunler\": []}')");
  d.dogru(/henüz yayınlanmamış/.test(await calistir(db, kilitSql(TOPTANCI.eposta))), "katalog boşsa da durur");
  await db.close();
}

// ---------- 3) taklit (sahte-kilit.mjs) ile SQL aynı sınıflandırmayı yapıyor mu ----------
{
  console.log("\n— taklit ile SQL tutarlı mı —");
  const db = await kur("");
  await calistir(db, kilitSql(TOPTANCI.eposta));
  const anahtarlar = ["babuco:store", "babuco:katalog", "babuco:katalogx", "babuco:yedek:2026-01-01", "babuco:on-siparis:policy:555", "babuco:on-siparis:last:555", "babuco:on-siparis:policy", "duyurular", "duyurular2",
    "bayi_puan:0555", "bayi_puan", "bayiXpuan:0555", "cayci-pos:users", "cayci-pos:data:u1", "cayci-posx", "Babuco:store", "babuco", "", "siparisler", "kv", "babuco:",
    "babuco:cari:h:0123abcd", "babuco:cari:t:0123abcd", "babuco:cari:", "babuco:cari", "babuco:cari-sir", "babuco:carix:1"];
  const sql = (await db.query("select k, public.babuco_kv_sinifi(k) s from unnest($1::text[]) k", [anahtarlar])).rows;
  d.esit(sql.map((r) => r.k + "=" + r.s), anahtarlar.map((k) => k + "=" + sinif(k)), "babuco_kv_sinifi (SQL) = sinif (denemelerdeki taklit), " + anahtarlar.length + " anahtarda");
  d.esit((await db.query("select public.babuco_kv_sinifi(null) s")).rows, [{ s: "bilinmeyen" }], "boş (null) anahtar: bilinmeyen");
  await db.close();
}

d.bitir();
