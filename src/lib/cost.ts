import type { Item } from '../types'

/**
 * Maliyet motoru.
 *
 * Kural: maliyet SON ALIŞ fiyatından hesaplanır, ortalama alınmaz.
 *   birim maliyet = son alış tutarı / son alışta giren miktar (temel birimde)
 *
 * Tarifli kalemde maliyet içindekilerden gelir:
 *   parti maliyeti = Σ (satır miktarı × satır kaleminin birim maliyeti)
 *   birim maliyet  = parti maliyeti / partiden çıkan adet (yield)
 *
 * Demlik burada gizlenir: "119 g çay -> 25 bardak" yazılır, bardak başına
 * 119/25 = 4,76 g düşer. Kullanıcı demlik açıp kapatmaz.
 *
 * Tarif içinde başka tarifli ürün olabilir, o yüzden özyineleme + döngü koruması var.
 */
export function unitCost(itemId: string, items: Item[], seen: Set<string> = new Set()): number {
  const item = items.find((i) => i.id === itemId)
  if (!item) return 0
  if (seen.has(itemId)) return 0 // kendini içeren tarif: sonsuz döngüye girme
  const path = new Set(seen).add(itemId)

  if (item.recipe && item.recipe.lines.length > 0) {
    const y = item.recipe.yield > 0 ? item.recipe.yield : 1
    const batch = item.recipe.lines.reduce(
      (sum, line) => sum + line.qty * unitCost(line.itemId, items, path),
      0,
    )
    return batch / y
  }

  const lc = item.lastCost
  if (!lc || lc.qty <= 0) return 0
  return lc.total / lc.qty
}

/** Bir satışın/tarifin bir adedi için hangi hammaddeden ne kadar düşecek (yaprak seviye). */
export function explode(
  itemId: string,
  qty: number,
  items: Item[],
  seen: Set<string> = new Set(),
): Map<string, number> {
  const out = new Map<string, number>()
  const item = items.find((i) => i.id === itemId)
  if (!item || seen.has(itemId)) return out
  const path = new Set(seen).add(itemId)

  if (item.recipe && item.recipe.lines.length > 0) {
    const y = item.recipe.yield > 0 ? item.recipe.yield : 1
    for (const line of item.recipe.lines) {
      const need = (line.qty / y) * qty
      for (const [id, n] of explode(line.itemId, need, items, path)) {
        out.set(id, (out.get(id) ?? 0) + n)
      }
    }
    return out
  }

  out.set(itemId, qty)
  return out
}

/** Stok düşümü. Tarifli ürün kendi stoğundan değil, içindekilerden düşer. */
export function applyStock(items: Item[], itemId: string, qty: number): Item[] {
  const needs = explode(itemId, qty, items)
  return items.map((i) => (needs.has(i.id) ? { ...i, stock: i.stock - needs.get(i.id)! } : i))
}

/** Eldeki hammaddeyle bu üründen kaç adet çıkar. Stok uyarısı için. */
export function availableQty(itemId: string, items: Item[]): number {
  const needs = explode(itemId, 1, items)
  if (needs.size === 0) return 0
  let min = Infinity
  for (const [id, per] of needs) {
    const stock = items.find((i) => i.id === id)?.stock ?? 0
    if (per > 0) min = Math.min(min, stock / per)
  }
  return min === Infinity ? 0 : Math.floor(min)
}

/** Stoğu alt limitin altına düşmüş hammaddeler. */
export function lowStock(items: Item[]): Item[] {
  return items.filter((i) => !i.recipe && i.minStock != null && i.stock <= i.minStock)
}
