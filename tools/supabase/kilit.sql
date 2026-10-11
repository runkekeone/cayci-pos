-- ============================================================================
-- babuco — VERİTABANI KİLİDİ
--
-- Ne yapar: kv tablosundaki toptancı verisini (müşteriler, borçlar, satışlar,
-- yedekler) yalnız izin listesindeki hesap(lar)a açar. Çay ocaklarının kullandığı
-- satırlar bugünkü gibi çalışmaya devam eder.
--
-- ÇALIŞTIRMADAN ÖNCE (sıra önemli — ayrıntısı tools/supabase/KURULUM.md):
--   0. once-bak.sql'i çalıştır, sonucunu sakla. Mevcut politikaları görmek için en kısa sorgu:
--        select policyname, cmd, roles, qual, with_check from pg_policies
--         where schemaname = 'public' and tablename in ('kv', 'siparisler');
--   1. Yeni sürüm yayınlanmış ve çay ocakları onu almış olmalı.
--   2. Panel "babuco:katalog"u yayınlamış olmalı (yoksa bu betik kendini durdurur).
--   3. Panele kendi e-postan ve şifrenle giriş yapabildiğini görmüş olmalısın.
--
-- Güvenli tarafları:
--   - Tek işlemdir (begin … commit): bir yerde hata çıkarsa HİÇBİR ŞEY değişmez.
--   - Yeniden çalıştırılabilir: var olan politikaları bulur, kaydeder, kendi kurallarıyla değiştirir.
--   - İlk çalıştırmada eski düzeni "babuco_kilit_onceki" tablosuna yazar; geri-al.sql oradan döner.
--   - Hiçbir veri satırını silmez ya da değiştirmez; yalnız kimin neyi görebildiğini değiştirir.
-- ============================================================================
begin;

-- ---------------------------------------------------------------------------
-- 0) AYAR — YALNIZ BURAYI DEĞİŞTİR
--    Panele girdiğin e-postayı tırnakların arasına yaz. İkinci hesap (ör. baban)
--    için alttaki satırın başındaki iki çizgiyi sil ve e-postasını yaz.
--    (Betiği sonradan yeniden çalıştırırken burayı boş bırakabilirsin: izin listesi korunur.)
-- ---------------------------------------------------------------------------
drop table if exists pg_temp._babuco_ayar;
create temporary table _babuco_ayar (eposta text) on commit drop;
insert into _babuco_ayar (eposta) values
   ('BURAYA-KENDI-EPOSTANI-YAZ')
-- ,('ikinci-hesap@ornek.com')
;

-- ---------------------------------------------------------------------------
-- 1) İzin listesi: toptancı verisine girebilen hesaplar
--    Dışarıdan (uygulama anahtarıyla) hiç kimse bu tabloyu okuyamaz, yazamaz.
-- ---------------------------------------------------------------------------
create table if not exists public.babuco_yetkililer (
  user_id uuid primary key references auth.users (id) on delete cascade,
  eposta  text,
  eklendi timestamptz not null default now()
);
alter table public.babuco_yetkililer enable row level security;
revoke all on table public.babuco_yetkililer from public, anon, authenticated;
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'babuco_yetkililer' loop
    execute format('drop policy %I on public.babuco_yetkililer', p.policyname);   -- politika yok = dışarıya tamamen kapalı
  end loop;
end $$;

do $$
declare bulunamayan text;
begin
  select string_agg(trim(a.eposta), ', ') into bulunamayan
    from _babuco_ayar a
   where position('@' in a.eposta) > 0
     and not exists (select 1 from auth.users u where lower(u.email) = lower(trim(a.eposta)));
  if bulunamayan is not null then
    raise exception 'Şu e-posta için giriş hesabı bulunamadı: %. Önce Supabase panosunda (Authentication → Users) hesabı aç ya da yazımı düzelt. Hiçbir şey değişmedi.', bulunamayan;
  end if;
end $$;

insert into public.babuco_yetkililer (user_id, eposta)
select u.id, u.email
  from auth.users u
 where exists (select 1 from _babuco_ayar a where position('@' in a.eposta) > 0 and lower(trim(a.eposta)) = lower(u.email))
on conflict (user_id) do update set eposta = excluded.eposta;

do $$ begin
  if not exists (select 1 from public.babuco_yetkililer) then
    raise exception 'İzin listesi boş: en üstteki AYAR bölümüne panele girdiğin e-postayı yazmadın. Kilit kurulsaydı veriye kimse giremezdi. Hiçbir şey değişmedi.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2) Yardımcı fonksiyonlar
-- ---------------------------------------------------------------------------
-- İsteği yapan, izin listesindeki bir hesap mı? (Panel ve araç da bunu sorar.)
create or replace function public.babuco_yetkili()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.babuco_yetkililer y where y.user_id = (select auth.uid()));
$$;
revoke all on function public.babuco_yetkili() from public;
grant execute on function public.babuco_yetkili() to anon, authenticated, service_role;

-- Bir kv anahtarı hangi sınıfta?
--   'acik'    herkes okur, yalnız yetkili hesap yazar  (sipariş kataloğu, duyurular, ön ödeme kuralı)
--   'ozel'    yalnız yetkili hesap okur ve yazar       (babuco:store, babuco:yedek:* ve diğer bütün babuco:*)
--   'serbest' bugünkü gibi herkes okur ve yazar        (çay ocağı uygulamasının satırları)
--   'bilinmeyen' kimseye açık değil
-- Not: LIKE yerine starts_with kullanılır; LIKE'ta "_" tek harf joker olduğu için "bayi_puan" yanlış eşleşirdi.
create or replace function public.babuco_kv_sinifi(k text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when k is null then 'bilinmeyen'
    when k = 'babuco:katalog' or k = 'duyurular' or starts_with(k, 'babuco:on-siparis:policy:') then 'acik'
    when starts_with(k, 'babuco:') then 'ozel'
    when starts_with(k, 'bayi_puan:') or starts_with(k, 'cayci-pos:') then 'serbest'
    else 'bilinmeyen'
  end;
$$;
revoke all on function public.babuco_kv_sinifi(text) from public;
grant execute on function public.babuco_kv_sinifi(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) Ön denetimler — biri tutmazsa betik burada durur, hiçbir şey değişmez
-- ---------------------------------------------------------------------------
do $$
declare
  taninmayan text;
  gorunum    text;
  urun       int;
begin
  -- a) Sipariş kataloğu yayınlanmış mı? (Yoksa kilit çay ocaklarının sipariş ekranını boşaltır.)
  select jsonb_array_length(value::jsonb -> 'urunler') into urun
    from public.kv where key = 'babuco:katalog' and jsonb_typeof(value::jsonb -> 'urunler') = 'array';
  if coalesce(urun, 0) = 0 then
    raise exception 'Herkese açık katalog (babuco:katalog) henüz yayınlanmamış. Panelin yeni sürümüne giriş yap, bir dakika bekle, once-bak.sql ile kataloğu gör, sonra bu betiği yeniden çalıştır. Hiçbir şey değişmedi.';
  end if;

  -- b) Tanımadığım anahtar var mı? (Varsa kilit onu herkese kapatır; kimin kullandığı bilinmeden kapatma.)
  select string_agg(distinct split_part(key, ':', 1), ', ') into taninmayan
    from public.kv where public.babuco_kv_sinifi(key) = 'bilinmeyen';
  if taninmayan is not null then
    raise exception 'kv tablosunda tanımadığım anahtar(lar) var: %. Kilit bunları herkese kapatırdı. Önce kimin kullandığına bakılmalı (bu betikteki babuco_kv_sinifi fonksiyonuna eklenmeli). Hiçbir şey değişmedi.', taninmayan;
  end if;

  -- c) kv'yi okuyan bir görünüm (view) var mı? Görünümler satır güvenliğini atlayabilir.
  select string_agg(distinct v.relname::text, ', ') into gorunum
    from pg_depend d
    join pg_rewrite r on r.oid = d.objid
    join pg_class v on v.oid = r.ev_class
   where d.classid = 'pg_rewrite'::regclass and d.refclassid = 'pg_class'::regclass
     and d.refobjid = 'public.kv'::regclass and v.oid <> 'public.kv'::regclass and v.relkind in ('v', 'm');
  if gorunum is not null then
    raise exception 'kv tablosunu okuyan görünüm var: %. Görünüm kilidi delebilir; önce o incelenmeli. Hiçbir şey değişmedi.', gorunum;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4) Eski düzeni kaydet (yalnız ilk çalıştırmada) — geri-al.sql buradan döner
-- ---------------------------------------------------------------------------
create table if not exists public.babuco_kilit_onceki (
  sira      bigint generated always as identity primary key,
  kayit     timestamptz not null default now(),
  rls_acik  boolean not null,      -- kv'de satır güvenliği açık mıydı
  politika  text,                  -- politikanın adı (boşsa: "hiç politika yoktu" satırı)
  izin_turu text,                  -- PERMISSIVE / RESTRICTIVE
  komut     text,                  -- ALL / SELECT / INSERT / UPDATE / DELETE
  roller    text[],
  kosul     text,                  -- USING
  denetim   text                   -- WITH CHECK
);
alter table public.babuco_kilit_onceki enable row level security;
revoke all on table public.babuco_kilit_onceki from public, anon, authenticated;

do $$ begin
  if not exists (select 1 from public.babuco_kilit_onceki) then
    insert into public.babuco_kilit_onceki (rls_acik, politika, izin_turu, komut, roller, kosul, denetim)
    select c.relrowsecurity, p.policyname, p.permissive, p.cmd, p.roles::text[], p.qual, p.with_check
      from pg_class c
      left join pg_policies p on p.schemaname = 'public' and p.tablename = 'kv'
     where c.oid = 'public.kv'::regclass;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5) Kilit: kv'deki bütün eski politikaları kaldır, yenilerini kur
--    Politikası olmayan her şey RET'tir (varsayılan ret). Aşağıdakiler yalnız izin verir.
-- ---------------------------------------------------------------------------
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'kv' loop
    execute format('drop policy %I on public.kv', p.policyname);
  end loop;
end $$;

alter table public.kv enable row level security;

-- Satır güvenliği TRUNCATE'i kapsamaz; uygulama rollerinden ayrıca alınır. Çay ocağı uygulaması satır silmez.
revoke all on table public.kv from public;      -- "herkes" sözde-rolüne verilmiş hak kalmışsa aşağıdakileri delerdi
revoke truncate, references, trigger on table public.kv from anon, authenticated;
revoke delete on table public.kv from anon;
grant select, insert, update on table public.kv to anon;
grant select, insert, update, delete on table public.kv to authenticated;

-- a) Yetkili toptancı hesabı: özel + açık anahtarların tamamı (okuma, ekleme, güncelleme, silme)
create policy babuco_kv_yetkili on public.kv
  as permissive for all to authenticated
  using      ((select public.babuco_yetkili()) and public.babuco_kv_sinifi(key) in ('ozel', 'acik'))
  with check ((select public.babuco_yetkili()) and public.babuco_kv_sinifi(key) in ('ozel', 'acik'));

-- b) Herkese açık OKUMA: sipariş kataloğu, duyurular, ön ödeme kuralı. Yazma yok (yalnız a ile).
create policy babuco_kv_acik_okuma on public.kv
  as permissive for select to anon, authenticated
  using (public.babuco_kv_sinifi(key) = 'acik');

-- c) Çay ocağı uygulamasının satırları: bugünkü gibi herkes okur, ekler, günceller. Silme yok.
--    (with check: bu satırlar başka bir sınıfın adına taşınamaz — ör. babuco:store yapılamaz.)
create policy babuco_kv_serbest_okuma on public.kv
  as permissive for select to anon, authenticated
  using (public.babuco_kv_sinifi(key) = 'serbest');
create policy babuco_kv_serbest_ekleme on public.kv
  as permissive for insert to anon, authenticated
  with check (public.babuco_kv_sinifi(key) = 'serbest');
create policy babuco_kv_serbest_guncelleme on public.kv
  as permissive for update to anon, authenticated
  using      (public.babuco_kv_sinifi(key) = 'serbest')
  with check (public.babuco_kv_sinifi(key) = 'serbest');

-- API'nin yeni fonksiyonları hemen görmesi için
notify pgrst, 'reload schema';

commit;

-- ---------------------------------------------------------------------------
-- Sonuç: bu tabloyu görüyorsan kilit kuruldu.
-- ---------------------------------------------------------------------------
select 'KİLİT KURULDU' as durum,
       (select string_agg(eposta, ', ' order by eklendi) from public.babuco_yetkililer) as veriye_girebilen_hesaplar,
       (select count(*) from pg_policies where schemaname = 'public' and tablename = 'kv') as kv_politika_sayisi,
       (select relrowsecurity from pg_class where oid = 'public.kv'::regclass) as satir_guvenligi_acik;
