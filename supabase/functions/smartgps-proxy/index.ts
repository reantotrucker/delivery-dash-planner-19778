import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
export const normalizePlate = (p: string) => (p || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0').replace(/I/g, '1')

const RAW_BASE = (Deno.env.get('SMARTGPS_BASE_URL') || '').trim().replace(/\/+$/, '')
const BASE = RAW_BASE && !/^https?:\/\//i.test(RAW_BASE) ? `https://${RAW_BASE}` : RAW_BASE
const HASH = Deno.env.get('SMARTGPS_API_HASH') || ''

async function sg(path: string, params: Record<string, string>) {
  const u = new URL(BASE + path)
  for (const [k, v] of Object.entries({ ...params, user_api_hash: HASH, lang: 'pt' })) u.searchParams.set(k, v)
  const r = await fetch(u, { headers: { Accept: 'application/json' } })
  const t = await r.text()
  if (!r.ok) throw new Error(`SmartGPS ${r.status}: ${t.slice(0, 200)}`)
  return JSON.parse(t)
}

function flatDevices(data: any): any[] {
  let arr: any = Array.isArray(data) ? data : (data?.items ?? data?.data ?? data?.devices ?? [])
  if (!Array.isArray(arr)) arr = arr && typeof arr === 'object' ? Object.values(arr) : []
  if (!arr.length && data && typeof data === 'object' && !Array.isArray(data)) console.log('SmartGPS shape:', JSON.stringify(data).slice(0, 300))
  return arr.flatMap((d: any) => Array.isArray(d?.items) ? d.items : [d])
}

async function findDevice(plate: string) {
  const target = normalizePlate(plate)
  const variants = [...new Set([plate, plate.replace(/-/g, ''), target])]
  for (const v of variants) {
    const raw = await sg('/api/get_devices', { plate: v, ungrouped: '1' })
    const list = flatDevices(raw)
    console.log('SmartGPS busca', v, 'itens', list.length, JSON.stringify(list[0] ?? raw).slice(0, 400))
    const hit = list.find((d: any) => [d?.plate_number, d?.device_data?.plate_number, d?.name].some((x) => x && normalizePlate(String(x)).includes(target)))
    if (hit) return hit
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    if (!BASE || !HASH) return json({ error: 'SmartGPS não configurado' }, 500)
    const auth = req.headers.get('Authorization') || ''
    const url = Deno.env.get('SUPABASE_URL')!
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
    const { data: u } = await userClient.auth.getUser(auth.replace('Bearer ', ''))
    if (!u?.user) return json({ error: 'Não autenticado' }, 401)
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const body = await req.json().catch(() => ({}))
    const action = String(body.action || '')

    if (action === 'vincular') {
      const { data: isAdmin } = await admin.rpc('has_role', { _user_id: u.user.id, _role: 'admin' })
      if (!isAdmin) return json({ error: 'Apenas admin' }, 403)
      const { data: vs } = await admin.from('vehicles').select('id, plate').eq('smartgps_tracked', true)
      const result = []
      for (const v of vs ?? []) {
        const d = await findDevice(v.plate)
        if (d?.id != null) await admin.from('vehicles').update({ smartgps_device_id: String(d.id) }).eq('id', v.id)
        result.push({ plate: v.plate, device_id: d?.id ?? null })
      }
      return json({ result })
    }
    if (action === 'diagnostico') {
      const { data: isAdmin } = await admin.rpc('has_role', { _user_id: u.user.id, _role: 'admin' })
      if (!isAdmin) return json({ error: 'Apenas admin' }, 403)
      const raw = await sg('/api/get_devices', { ungrouped: '1' })
      const list = flatDevices(raw)
      return json({ tipo: Array.isArray(raw) ? 'array' : typeof raw, chaves: raw && !Array.isArray(raw) ? Object.keys(raw) : null, total: list.length,
        amostra: list.slice(0, 40).map((d: any) => ({ id: d?.id, name: d?.name, plate: d?.plate_number ?? d?.device_data?.plate_number })) })
    }

    const vehicleId = String(body.vehicle_id || '')
    if (!/^[0-9a-f-]{36}$/i.test(vehicleId)) return json({ error: 'vehicle_id inválido' }, 400)
    // RLS do usuário garante acesso à empresa do veículo
    const { data: v } = await userClient.from('vehicles').select('id, plate, smartgps_device_id').eq('id', vehicleId).maybeSingle()
    if (!v) return json({ error: 'Veículo não encontrado' }, 404)
    let deviceId = v.smartgps_device_id
    if (!deviceId) {
      const d = await findDevice(v.plate)
      if (!d?.id) return json({ error: 'Veículo não encontrado na SmartGPS' }, 404)
      deviceId = String(d.id)
      await admin.from('vehicles').update({ smartgps_device_id: deviceId }).eq('id', v.id)
    }

    if (action === 'posicao') {
      const list = flatDevices(await sg('/api/get_devices', { ungrouped: '1' }))
      const d = list.find((x: any) => String(x?.id) === deviceId)
      if (!d) return json({ error: 'Posição indisponível' }, 404)
      return json({ device_id: deviceId, lat: d.lat, lng: d.lng, speed: d.speed, time: d.time, online: d.online, address: d.address ?? null })
    }
    if (action === 'historico') {
      const re = /^\d{4}-\d{2}-\d{2}$/, rt = /^\d{2}:\d{2}(:\d{2})?$/
      const { from_date, to_date, from_time = '00:00', to_time = '23:59' } = body
      if (!re.test(from_date) || !re.test(to_date) || !rt.test(from_time) || !rt.test(to_time)) return json({ error: 'Período inválido' }, 400)
      const h = await sg('/api/get_history', { device_id: deviceId, from_date, to_date, from_time, to_time })
      return json({ device_id: deviceId, history: h })
    }
    return json({ error: 'Ação inválida' }, 400)
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
