// Supabase kv tablosu + anon izinleri doğrulama.
// Çalıştır: node scripts/bulut-test.mjs
import { createClient } from '@supabase/supabase-js'

const URL = 'https://zchubpqbvbhcuxclirur.supabase.co'
const KEY = 'sb_publishable_m5HEx3mFrjDJHBe0qfUznQ_tXkoESp3'

const c = createClient(URL, KEY, { auth: { persistSession: false } })
const key = 'test:baglanti'
const ts = new Date().toISOString()

const yaz = await c.from('kv').upsert({ key, value: { merhaba: 'dunya', ts }, updated_at: ts })
if (yaz.error) {
  console.error('YAZMA HATASI:', yaz.error.message)
  process.exit(1)
}
console.log('✓ yazma başarılı')

const oku = await c.from('kv').select('value, updated_at').eq('key', key).maybeSingle()
if (oku.error || !oku.data) {
  console.error('OKUMA HATASI:', oku.error?.message ?? 'kayıt yok')
  process.exit(1)
}
console.log('✓ okuma başarılı:', JSON.stringify(oku.data.value))

await c.from('kv').delete().eq('key', key) // test satırını temizle
console.log('✓ tablo + anon izinleri ÇALIŞIYOR')
