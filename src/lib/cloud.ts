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

export interface CloudRecord {
  value: unknown
  updatedAt: string
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
