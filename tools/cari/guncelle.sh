#!/bin/sh
# ESKİ — yerini canlı sayfa aldı (public/cari/ + tools/babuco-cari.cjs; komutlar: cari-yayinla, cari-link).
# Artık çalıştırmaya gerek yok: hesaplar her kayıttan sonra kendiliğinden yayınlanır. Dosya yalnız geçmiş için duruyor.
# Müşteri cari hesap sayfasını (telefonla giriş) buluttaki son veriden yeniden üretir.
# Depo kökünden: sh tools/cari/guncelle.sh <cikti.html>   → sonra Artifact ile aynı linke yayınla.
set -e
OUT="${1:-/tmp/cari-portal.html}"
STORE="$(mktemp --suffix=.json)"
node tools/cari/dump.cjs "$STORE" >/dev/null
python3 tools/cari/portal_gen.py "$STORE" "$OUT"
rm -f "$STORE"
