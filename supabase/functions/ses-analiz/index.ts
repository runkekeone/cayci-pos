// Supabase Edge Function: ses-analiz  (Saha Koçu)
// Ses kaydı → OpenAI Whisper (metne çevir) → Claude (satış koçluğu analizi).
// Anahtarlar sunucuda GİZLİ: OPENAI_API_KEY (STT) + ANTHROPIC_API_KEY (analiz).
//
// Deploy:  supabase functions deploy ses-analiz
// Secret:  supabase secrets set OPENAI_API_KEY=sk-...
//          (ANTHROPIC_API_KEY zaten kurulu — ocr-extract ile aynı)
//
// İstek gövdesi: { audioBase64, mediaType }  veya  { transcript }
// Yanıt:         { ok, transcript, analiz }  |  { ok:false, error }

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Koçluk kartı şeması (json_schema kısıtı: min/max yok)
const ANALIZ_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ozet: { type: 'string' },
    puan: { type: 'number' }, // 0-100 genel satış performansı
    iyi: { type: 'array', items: { type: 'string' } }, // iyi yapılanlar
    eksik: { type: 'array', items: { type: 'string' } }, // kaçırılanlar
    itirazlar: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { itiraz: { type: 'string' }, karsilanma: { type: 'string' } },
        required: ['itiraz', 'karsilanma'],
      },
    },
    firsatlar: { type: 'array', items: { type: 'string' } }, // kaçan ek/çapraz satış
    oneriler: { type: 'array', items: { type: 'string' } }, // "şöyle deseydin"
  },
  required: ['ozet', 'puan', 'iyi', 'eksik', 'oneriler'],
}

const ANALIZ_PROMPT = [
  'Aşağıda bir saha satış plasiyeri ile müşteri arasındaki YÜZ YÜZE görüşmenin metni var.',
  'Deneyimli bir satış koçu gibi analiz et ve sadece istenen alanları doldur:',
  '- ozet: görüşmenin 1-2 cümle özeti.',
  '- puan: 0-100 arası genel satış performansı.',
  '- iyi: plasiyerin iyi yaptığı şeyler (madde madde).',
  '- eksik: kaçırdığı/geliştirmesi gereken noktalar.',
  '- itirazlar: müşterinin itirazları ve plasiyerin bunları nasıl karşıladığı.',
  '- firsatlar: kaçan ek satış / çapraz satış fırsatları.',
  '- oneriler: "şöyle deseydin daha iyi olurdu" tarzı somut öneriler.',
  'Türkçe, kısa ve uygulanabilir yaz.',
  '',
  'GÖRÜŞME METNİ:',
  '',
].join('\n')

async function whisper(audioBase64: string, mediaType: string): Promise<string> {
  const key = Deno.env.get('OPENAI_API_KEY')
  if (!key) throw new Error('OPENAI_API_KEY kurulmadı (ses→metin için gerekli)')
  // base64 → bytes → Blob
  const bin = atob(audioBase64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const ext = (mediaType || '').includes('mp4') || (mediaType || '').includes('m4a') ? 'm4a'
    : (mediaType || '').includes('mpeg') || (mediaType || '').includes('mp3') ? 'mp3'
    : (mediaType || '').includes('wav') ? 'wav' : 'webm'
  const form = new FormData()
  form.append('file', new Blob([bytes], { type: mediaType || 'audio/webm' }), 'ses.' + ext)
  form.append('model', 'whisper-1')
  form.append('language', 'tr')
  form.append('response_format', 'text')
  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key },
    body: form,
  })
  const t = await r.text()
  if (!r.ok) throw new Error('Whisper hatası: ' + t.slice(0, 200))
  return t.trim()
}

async function analizEt(transcript: string): Promise<unknown> {
  const key = Deno.env.get('ANTHROPIC_API_KEY')
  if (!key) throw new Error('ANTHROPIC_API_KEY kurulmadı')
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-opus-4-8',
      max_tokens: 16000,
      messages: [{ role: 'user', content: [{ type: 'text', text: ANALIZ_PROMPT + transcript }] }],
      output_config: { format: { type: 'json_schema', schema: ANALIZ_SCHEMA } },
    }),
  })
  const body = await r.json()
  if (!r.ok) throw new Error(body?.error?.message ?? ('api ' + r.status))
  const tb = (body.content ?? []).find((b: { type: string }) => b.type === 'text')
  return JSON.parse(tb?.text ?? '{}')
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { audioBase64, mediaType, transcript } = await req.json()
    const metin = transcript && String(transcript).trim()
      ? String(transcript).trim()
      : await whisper(audioBase64, mediaType)
    if (!metin) throw new Error('metin boş — ses anlaşılamadı')
    const analiz = await analizEt(metin)
    return new Response(JSON.stringify({ ok: true, transcript: metin, analiz }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error)?.message ?? e) }), {
      status: 200, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
