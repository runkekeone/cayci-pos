-- ============================================================================
-- babuco — KİLİDİ GERİ AL
--
-- kv tablosunu kilit.sql'den ÖNCEKİ düzene döndürür (o düzen ilk çalıştırmada
-- "babuco_kilit_onceki" tablosuna kaydedilmişti).
--
-- DİKKAT: bunu çalıştırınca müşteri/borç verisi yeniden internete açılır.
-- Yalnız bir şey bozulduysa ve nedenini bulana kadar eski hâle dönmek gerekiyorsa kullan.
--
-- Hiçbir veri satırını silmez ya da değiştirmez. Tek işlemdir: hata çıkarsa hiçbir şey değişmez.
-- İzin listesi ve yardımcı fonksiyonlar yerinde kalır (zararsız); kilit.sql yeniden çalıştırılabilir.
-- ============================================================================
begin;

do $$
declare
  p        record;
  r        record;
  roller   text;
  eski_rls boolean;
begin
  if to_regclass('public.babuco_kilit_onceki') is null then
    raise exception 'Önceki düzenin kaydı yok (kilit.sql hiç çalıştırılmamış). Hiçbir şey değişmedi.';
  end if;
  if not exists (select 1 from public.babuco_kilit_onceki) then
    raise exception 'Önceki düzenin kaydı yok (kayıt tablosu boş). Hiçbir şey değişmedi.';
  end if;

  -- kilidin politikalarını kaldır
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'kv' loop
    execute format('drop policy %I on public.kv', p.policyname);
  end loop;

  -- eski politikaları aynen geri kur
  for r in select * from public.babuco_kilit_onceki where politika is not null order by sira loop
    select string_agg(quote_ident(x), ', ') into roller from unnest(r.roller) as x;
    execute format('create policy %I on public.kv as %s for %s to %s%s%s',
      r.politika, r.izin_turu, r.komut, coalesce(roller, 'public'),
      case when r.kosul   is not null then format(' using (%s)', r.kosul) else '' end,
      case when r.denetim is not null then format(' with check (%s)', r.denetim) else '' end);
  end loop;

  -- satır güvenliği eskiden kapalıysa yine kapat
  select bool_or(rls_acik) into eski_rls from public.babuco_kilit_onceki;
  if eski_rls then
    alter table public.kv enable row level security;
  else
    alter table public.kv disable row level security;
  end if;

  grant select, insert, update, delete on table public.kv to anon, authenticated;
end $$;

notify pgrst, 'reload schema';

commit;

select 'KİLİT GERİ ALINDI — veri yeniden herkese açık' as durum,
       (select relrowsecurity from pg_class where oid = 'public.kv'::regclass) as satir_guvenligi_acik,
       (select count(*) from pg_policies where schemaname = 'public' and tablename = 'kv') as kv_politika_sayisi;
