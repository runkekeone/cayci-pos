/**
 * Fotoğraftan okuma (AI Vision) istemcisi.
 *
 * Görüntüyü Supabase Edge Function `ocr-extract`'e gönderir; fonksiyon Claude vision
 * ile yapılandırılmış JSON döndürür. API anahtarı sunucuda gizli — burada yok.
 * İnternet/kurulum yoksa sessizce `null` döner (uygulama yerelle devam eder).
 */
import { supabaseClient } from './cloud'

export type OcrMode = 'alis' | 'masa' | 'fatura'

export interface AlisData {
  supplier?: string
  items: { name: string; qty: number; total: number }[]
}
export interface MasaData {
  lines: { name: string; qty: number }[]
}
export interface FaturaData {
  firma?: string
  tarih?: string
  no?: string
  lines: { ad: string; adet: number; birimFiyat: number }[]
}

/** Dosyayı base64'e çevir; `data:...;base64,` önekini ayıkla. */
export function fileToBase64(file: File): Promise<{ data: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => {
      const s = String(r.result)
      const comma = s.indexOf(',')
      const header = s.slice(0, comma) // "data:image/jpeg;base64"
      const m = header.match(/data:([^;]+)/)
      resolve({ data: s.slice(comma + 1), mediaType: m?.[1] ?? 'image/jpeg' })
    }
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

/**
 * Bir görsel dosyasını edge function'a gönder, çıkarılan veriyi döndür.
 * `catalog` = eşleştirme için mevcut ürün adları. Hata/çevrimdışı → null.
 */
export async function extract(
  mode: 'alis',
  file: File,
  catalog?: string[],
): Promise<AlisData | null>
export async function extract(
  mode: 'masa',
  file: File,
  catalog?: string[],
): Promise<MasaData | null>
export async function extract(
  mode: 'fatura',
  file: File,
  catalog?: string[],
): Promise<FaturaData | null>
export async function extract(
  mode: OcrMode,
  file: File,
  catalog?: string[],
): Promise<unknown | null> {
  const c = supabaseClient()
  if (!c) return null
  try {
    const { data: img, mediaType } = await fileToBase64(file)
    const { data, error } = await c.functions.invoke('ocr-extract', {
      body: { mode, imageBase64: img, mediaType, catalog },
    })
    if (error) return null
    const res = data as { ok?: boolean; data?: unknown }
    if (!res?.ok) return null
    return res.data ?? null
  } catch {
    return null
  }
}
