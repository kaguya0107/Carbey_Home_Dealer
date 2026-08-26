// DB の適用状態を読み取りだけで点検する (副作用なし)。
// 使い方: node --env-file=.env scripts/check-db.mjs
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }

async function probe(label, path, extraHeaders = {}) {
  const res = await fetch(`${url}${path}`, { headers: { ...headers, ...extraHeaders } })
  const text = await res.text()
  let detail = ''
  try {
    const j = JSON.parse(text)
    detail = j.message || j.code || ''
  } catch {
    detail = text.slice(0, 80)
  }
  console.log(`[${res.status}] ${label}: ${detail || 'OK'}`)
  return res.status
}

console.log('=== Exposed schemas (root) ===')
const rootRes = await fetch(`${url}/rest/v1/`, { headers })
console.log(`root status: ${rootRes.status}`)

console.log('\n=== public スキーマ (既存Carbey相乗り確認) ===')
await probe('public.user_profiles (既存Carbey)', '/rest/v1/user_profiles?select=id&limit=1')

console.log('\n=== portal スキーマ (本システム) ===')
await probe('portal.plans (Accept-Profile)', '/rest/v1/plans?select=code&limit=1', {
  'Accept-Profile': 'portal',
})
await probe('portal.franchises (Accept-Profile)', '/rest/v1/franchises?select=id&limit=1', {
  'Accept-Profile': 'portal',
})
