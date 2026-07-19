import QRCode from 'qrcode'
import type { Order } from '../types'
import { fmtTL } from './units'

/**
 * SİPARİŞ TAŞIMA (Faz 1 — offline).
 *
 * Sipariş kıraathanede oluşur; sunucu olmadığı için QR / WhatsApp / dosya ile
 * toptancıya taşınır. Toptancı paneli aynı `decodeOrder` ile geri okur.
 * Faz 2'de aynı `encodeOrder` çıktısı buluta POST edilecek — şekil değişmez.
 */

const PREFIX = 'CAYSIP1:' // sürüm etiketi — ileride v2 ayrımı için

/** UTF-8 güvenli base64. */
function b64encode(s: string): string {
  return btoa(unescape(encodeURIComponent(s)))
}
function b64decode(s: string): string {
  return decodeURIComponent(escape(atob(s)))
}

/** Siparişi taşınabilir koda çevir (QR/dosya/pano için). */
export function encodeOrder(order: Order): string {
  return PREFIX + b64encode(JSON.stringify({ v: 1, order }))
}

/** Koddan siparişi çöz. Geçersizse null. */
export function decodeOrder(raw: string): Order | null {
  try {
    const s = raw.trim()
    if (!s.startsWith(PREFIX)) return null
    const obj = JSON.parse(b64decode(s.slice(PREFIX.length)))
    if (obj?.v !== 1 || !obj.order?.lines) return null
    return obj.order as Order
  } catch {
    return null
  }
}

/** İnsan-okur sipariş metni — WhatsApp ve önizleme için. */
export function orderToText(order: Order): string {
  const bas = order.from?.name ? `${order.from.name} — SİPARİŞ` : 'SİPARİŞ'
  const satirlar = order.lines
    .map((l) => `• ${l.qty} ${l.birim} ${l.name} (${fmtTL(l.qty * l.unitPrice)})`)
    .join('\n')
  const toplam = order.lines.reduce((n, l) => n + l.qty * l.unitPrice, 0)
  const not = order.note ? `\nNot: ${order.note}` : ''
  return `${bas}\n${satirlar}\nToplam: ${fmtTL(toplam)}${not}`
}

/** WhatsApp linki: insan-okur özet + panele yapıştırılacak kod. */
export function whatsappLink(order: Order, tel?: string): string {
  const govde = `${orderToText(order)}\n\n--- sistem kodu (silme) ---\n${encodeOrder(order)}`
  const numara = (tel ?? '').replace(/\D/g, '')
  return `https://wa.me/${numara}?text=${encodeURIComponent(govde)}`
}

/** Sipariş kodunun QR görselini (dataURL) üret. */
export function orderToQr(order: Order): Promise<string> {
  return QRCode.toDataURL(encodeOrder(order), { margin: 1, width: 320 })
}
