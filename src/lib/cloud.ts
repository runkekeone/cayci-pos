/**
 * Bulut senkron (Supabase).
 *
 * localStorage KAYNAK kalır — internet olmasa da uygulama çalışır. Bulut, üstüne
 * "son yazan kazanır" (updated_at karşılaştırması) mantığıyla yedeklenir/senkronlanır.
 *
 * DİKKAT: anon / publishable anahtar PUBLIC'tir — uygulama paketine zaten gömülür,
 * gizlemenin anlamı yok. Bu yüzden veri gerçek anlamda korumalı DEĞİL; bu proje
 * anahtarına erişen herkes bu tabloyu okuyabilir/yazabilir. Gerçek kullanıcı-bazlı
 * koruma gerektiğinde ileride Supabase Auth + RLS eklenmeli.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Order } from '../types'

// Ortam değişkeni varsa onu kullan; yoksa gömülü değer (CI/GitHub Pages için).
const URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??
  'https://zchubpqbvbhcuxclirur.supabase.co'
const KEY =
  (import.meta.env.VITE_SUPABASE_KEY as string | undefined) ??
  'sb_publishable_m5HEx3mFrjDJHBe0qfUznQ_tXkoESp3'

export const cloudEnabled = Boolean(URL && KEY)

let _client: SupabaseClient | null = null
function client(): SupabaseClient | null {
  if (!cloudEnabled) return null
  if (!_client) _client = createClient(URL, KEY, { auth: { persistSession: false } })
  return _client
}

/** Aynı Supabase client'ı başka modüllerin (ör. ocr.ts) yeniden kullanması için. */
export function supabaseClient(): SupabaseClient | null {
  return client()
}

export interface CloudRecord {
  value: unknown
  updatedAt: string
}

/** Buluta gerçekten ulaşılıyor mu — internet kapısı için. Ağ hatası/çevrimdışı → false. */
export async function cloudPing(): Promise<boolean> {
  const c = client()
  if (!c) return false
  try {
    const { error } = await c.from('kv').select('key').limit(1)
    return !error
  } catch {
    return false
  }
}

/** Bir anahtarın bulut kaydını getir. Yoksa ya da çevrimdışıysa null döner (sessiz). */
export async function cloudGet(key: string): Promise<CloudRecord | null> {
  const c = client()
  if (!c) return null
  try {
    const { data, error } = await c
      .from('kv')
      .select('value, updated_at')
      .eq('key', key)
      .maybeSingle()
    if (error || !data) return null
    return { value: data.value, updatedAt: data.updated_at as string }
  } catch {
    return null // çevrimdışı / ağ hatası: uygulama yerelle devam eder
  }
}

/** Bir anahtarı buluta yaz (upsert). Başarısızsa (çevrimdışı) false döner. */
export async function cloudSet(key: string, value: unknown, updatedAt: string): Promise<boolean> {
  const c = client()
  if (!c) return false
  try {
    const { error } = await c.from('kv').upsert({ key, value, updated_at: updatedAt })
    return !error
  } catch {
    return false
  }
}

// ---- Sipariş kanalı (çay ocağı → toptancı, internet üzerinden) ----
// Siparişler ayrı `siparisler` tablosunda satır-bazlı durur (kv değil — çoklu
// sipariş "son yazan kazanır"da çakışır). Toptancı (babuco-app) bu tabloyu okur.

/** Siparişi buluta gönder (toptancı otomatik alır). Çevrimdışıysa false. */
export async function siparisGonderBulut(order: Order): Promise<boolean> {
  const c = client()
  if (!c) return false
  try {
    const { error } = await c.from('siparisler').upsert({
      id: order.id,
      toptanci: 'babuco',
      cay_ocagi: order.from?.name ?? null,
      cay_tel: order.from?.phone ?? null,
      payload: order,
      durum: 'yeni',
      updated_at: new Date().toISOString(),
    })
    return !error
  } catch {
    return false
  }
}

/** Verilen sipariş id'lerinin toptancı-tarafı durumlarını getir. id → durum. */
export async function siparisDurumGetir(ids: string[]): Promise<Record<string, string>> {
  const c = client()
  if (!c || ids.length === 0) return {}
  try {
    const { data, error } = await c.from('siparisler').select('id, durum').in('id', ids)
    if (error || !data) return {}
    const out: Record<string, string> = {}
    for (const r of data as { id: string; durum: string }[]) out[r.id] = r.durum
    return out
  } catch {
    return {}
  }
}
