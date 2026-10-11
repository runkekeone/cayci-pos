-- ============================================================================
-- babuco — ÖNCE BAK  (hiçbir şeyi değiştirmez, yalnız okur)
--
-- Supabase panosu → SQL Editor → bu dosyanın TAMAMINI yapıştır → Run.
-- Tek bir tablo döner. Kilidi kurmadan önce ve kurduktan sonra çalıştır;
-- sonucu (ekran görüntüsü yeter) sakla. Nasıl okunacağı KURULUM.md'de.
-- ============================================================================
with
tablolar as (
  select c.relname as tablo, c.relrowsecurity as rls
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname in ('kv', 'siparisler') and c.relkind = 'r'
),
politikalar as (
  select tablename, policyname, permissive, cmd, roles::text as roller, qual, with_check
    from pg_policies where schemaname = 'public' and tablename in ('kv', 'siparisler')
),
yetkiler as (
  select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as haklar
    from information_schema.role_table_grants
   where table_schema = 'public' and table_name in ('kv', 'siparisler') and grantee in ('anon', 'authenticated', 'PUBLIC')
   group by table_name, grantee
),
anahtarlar as (
  select case
           when key like 'babuco:on-siparis:policy:%' then 'babuco:on-siparis:policy:*'
           when key like 'babuco:yedek:%'             then 'babuco:yedek:*'
           when key like 'babuco:%'                   then key
           when key like 'cayci-pos:data:%'           then 'cayci-pos:data:*'
           when key like 'bayi\_puan:%'               then 'bayi_puan:*'
           when position(':' in key) > 0              then split_part(key, ':', 1) || ':*'
           else key
         end as grup,
         count(*) as adet, max(updated_at) as son
    from public.kv group by 1
),
gorunumler as (
  select distinct v.relname as ad
    from pg_depend d
    join pg_rewrite r on r.oid = d.objid
    join pg_class v on v.oid = r.ev_class
   where d.classid = 'pg_rewrite'::regclass and d.refclassid = 'pg_class'::regclass
     and d.refobjid = 'public.kv'::regclass and v.oid <> 'public.kv'::regclass and v.relkind in ('v', 'm')
),
fonksiyonlar as (
  select p.proname as ad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef and p.prosrc ~* '\mkv\M' and p.proname not like 'babuco\_%'
),
katalog as (
  select (select count(*) from public.kv where key = 'babuco:katalog') as var,
         (select coalesce(jsonb_array_length(value::jsonb -> 'urunler'), 0) from public.kv
           where key = 'babuco:katalog' and jsonb_typeof(value::jsonb -> 'urunler') = 'array') as katalogdaki,
         (select count(*) from public.kv k,
                 jsonb_array_elements(case when jsonb_typeof(k.value::jsonb -> 'products') = 'array' then k.value::jsonb -> 'products' else '[]'::jsonb end) u
           where k.key = 'babuco:store'
             and coalesce(u ->> 'ad', '') <> '' and coalesce(u ->> 'gorunur', 'true') <> 'false') as paneldeki,
         (select updated_at from public.kv where key = 'babuco:katalog') as katalog_zamani
),
hesaplar as (
  select email, created_at, last_sign_in_at, email_confirmed_at is not null as onayli from auth.users
)
select 1 as sira, '1. Satır güvenliği (RLS)' as bolum, tablo as ne, case when rls then 'AÇIK' else 'KAPALI — tablo herkese açık' end as durum from tablolar
union all
select 2, '2. Politikalar', tablename || ' · ' || policyname,
       cmd || ' · ' || permissive || ' · roller ' || roller || ' · using: ' || coalesce(qual, '—') || ' · with check: ' || coalesce(with_check, '—') from politikalar
union all
select 2, '2. Politikalar', t.tablo, '(hiç politika yok)' from tablolar t where not exists (select 1 from politikalar p where p.tablename = t.tablo)
union all
select 3, '3. Tablo hakları', table_name || ' · ' || grantee, haklar from yetkiler
union all
select 4, '4. kv içindeki anahtarlar', grup, adet || ' satır · son yazma ' || to_char(son, 'YYYY-MM-DD HH24:MI') from anahtarlar
union all
select 5, '5. kv''yi okuyan görünüm (kilidi deler!)', ad, 'VAR — kilitten önce incelenmeli' from gorunumler
union all
select 5, '5. kv''den söz eden yetkili fonksiyon (kilidi delebilir)', ad, 'VAR — kilitten önce incelenmeli' from fonksiyonlar
union all
select 6, '6. Herkese açık katalog', 'babuco:katalog',
       case when var = 0 then 'YOK — panel henüz yayınlamamış; kilidi KURMA'
            else coalesce(katalogdaki, 0) || ' ürün (panelde görünür ürün: ' || paneldeki || ') · son yayın ' || to_char(katalog_zamani, 'YYYY-MM-DD HH24:MI') end
  from katalog
union all
select 7, '7. Giriş hesapları', email,
       'açılış ' || to_char(created_at, 'YYYY-MM-DD') || ' · son giriş ' || coalesce(to_char(last_sign_in_at, 'YYYY-MM-DD HH24:MI'), 'hiç') || case when onayli then '' else ' · ONAYSIZ' end
  from hesaplar
union all
select 8, '8. İzin listesi (kilit kurulduysa)', coalesce(to_regclass('public.babuco_yetkililer')::text, '—'),
       case when to_regclass('public.babuco_yetkililer') is null then 'kilit henüz kurulmamış' else 'kurulu — hesaplar için: select eposta, eklendi from public.babuco_yetkililer;' end
order by sira, ne;
