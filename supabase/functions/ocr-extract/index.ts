// Supabase Edge Function: ocr-extract
// Fotoğraftan (fiş / adisyon / fatura) yapılandırılmış veri çıkarır.
// ANTHROPIC_API_KEY sunucuda GİZLİ secret olarak durur — istemciye asla gitmez.
//
// Deploy:  supabase functions deploy ocr-extract
// Secret:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//          (veya Supabase Panel -> Edge Functions -> Secrets)
//
// İstek gövdesi: { mode: 'alis'|'masa'|'fatura', imageBase64, mediaType, catalog? }
// Yanıt:         { ok:true, mode, data }  |  { ok:false, error }
//
// SDK yerine ham fetch: output_config (structured output) her istemci sürümünden
// bağımsız iletilir.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// json_schema kısıtı: minimum/maximum/minLength YOK. Sadece tip + required + additionalProperties:false.
const SCHEMAS: Record<string, unknown> = {
  alis: {
    type: 'object',
    additionalProperties: false,
    properties: {
      supplier: { type: 'string' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string' },
            qty: { type: 'number' },
            total: { type: 'number' },
          },
          required: ['name', 'qty', 'total'],
        },
      },
    },
    required: ['items'],
  },
  masa: {
    type: 'object',
    additionalProperties: false,
    properties: {
      lines: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string' },
            qty: { type: 'number' },
          },
          required: ['name', 'qty'],
        },
      },
    },
    required: ['lines'],
  },
  fatura: {
    type: 'object',
    additionalProperties: false,
    properties: {
      firma: { type: 'string' },
      tarih: { type: 'string' },
      no: { type: 'string' },
      lines: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ad: { type: 'string' },
            adet: { type: 'number' },
            birimFiyat: { type: 'number' },
          },
          required: ['ad', 'adet', 'birimFiyat'],
        },
      },
    },
    required: ['lines'],
  },
}

function prompt(mode: string, catalog?: string[]): string {
  const eslesme =
    catalog && catalog.length
      ? `\n\nMevcut ürün listesi (name/ad alanını bunlardan en yakın olana eşle; ` +
        `tam eşleşme yoksa fotoğraftaki adı yaz):\n- ${catalog.join('\n- ')}`
      : ''
  const ortak =
    `Bu bir Türkçe ${mode === 'fatura' ? 'alış faturası' : 'fiş/adisyon'} fotoğrafı. ` +
    `Sadece istenen alanları çıkar. Okunamayan sayısal alanı 0, metni boş bırak. ` +
    `Para tutarlarını sayı olarak ver (₺, TL, nokta/virgül ayıklanmış).` +
    eslesme
  if (mode === 'alis')
    return (
      ortak +
      `\n"items": satın alınan her ürün için { name, qty (alınan miktar), total (o kalem için ödenen toplam ₺) }. ` +
      `"supplier": tedarikçi/mağaza adı varsa.`
    )
  if (mode === 'masa')
    return (
      ortak +
      `\n"lines": masadaki her ürün için { name, qty (adet) }. Fiyat çıkarma, sadece ürün ve adet.`
    )
  // fatura
  return (
    ortak +
    `\n"firma": satıcı firma adı. "tarih": fatura tarihi (olduğu gibi). "no": fatura no. ` +
    `"lines": her satır için { ad (ürün/hizmet), adet, birimFiyat (birim fiyat ₺) }.`
  )
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { mode, imageBase64, mediaType, catalog } = await req.json()
    if (!SCHEMAS[mode]) throw new Error('gecersiz mode')
    if (!imageBase64) throw new Error('gorsel yok')

    const key = Deno.env.get('ANTHROPIC_API_KEY')
    if (!key) throw new Error('ANTHROPIC_API_KEY kurulmamis')

    const apiResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: 16000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType || 'image/jpeg',
                  data: imageBase64,
                },
              },
              { type: 'text', text: prompt(mode, catalog) },
            ],
          },
        ],
        output_config: { format: { type: 'json_schema', schema: SCHEMAS[mode] } },
      }),
    })

    const body = await apiResp.json()
    if (!apiResp.ok) throw new Error(body?.error?.message ?? `api ${apiResp.status}`)

    const textBlock = (body.content ?? []).find((b: { type: string }) => b.type === 'text')
    const data = JSON.parse(textBlock?.text ?? '{}')

    return new Response(JSON.stringify({ ok: true, mode, data }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: String((e as Error)?.message ?? e) }),
      { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } },
    )
  }
})
