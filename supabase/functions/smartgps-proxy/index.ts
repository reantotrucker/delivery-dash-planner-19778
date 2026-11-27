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

// Cache em memória para limitar chamadas à SmartGPS
const cache = new Map<string, { at: number; data: unknown }>()
async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const c = cache.get(key)
  if (c && Date.now() - c.at < ttlMs) return c.data as T
  const data = await fn()
  cache.set(key, { at: Date.now(), data })
  if (cache.size > 200) cache.delete(cache.keys().next().value!)
  return data
}

function collectPoints(node: any, out: [number, number, string?][] = []): [number, number, string?][] {
  if (Array.isArray(node)) { for (const n of node) collectPoints(n, out); return out }
  if (node && typeof node === 'object') {
    const lat = Number(node.lat ?? node.latitude), lng = Number(node.lng ?? node.longitude)
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0 && (node.time || node.raw_time || node.t || node.speed !== undefined)) {
      out.push([lat, lng, node.time ?? node.raw_time])
      return out
    }
    for (const k of ['items', 'data', 'positions']) if (node[k]) collectPoints(node[k], out)
  }
  return out
}

function flatDevices(data: any): any[] {
  let arr: any = Array.isArray(data) ? data : (Array.isArray(data?.items?.data) ? data.items.data : (data?.items ?? data?.data ?? data?.devices ?? []))
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
    const hit = list.find((d: any) => [d?.plate_number, d?.registration_number, d?.device_data?.plate_number, d?.name].some((x) => x && normalizePlate(String(x)).includes(target)))
    if (hit) return hit
  }
  // Fallback: percorre todas as páginas sem filtro
  for (let page = 1; page <= 20; page++) {
    const raw = await sg('/api/get_devices', { ungrouped: '1', page: String(page) })
    const list = flatDevices(raw)
    const hit = list.find((d: any) => [d?.plate_number, d?.registration_number, d?.device_data?.plate_number, d?.name].some((x) => x && normalizePlate(String(x)).includes(target)))
    if (hit) return hit
    const last = Number(raw?.items?.last_page ?? 1)
    if (!list.length || page >= last) break
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

    if (action === 'ao_vivo') {
      // RLS do usuário limita aos veículos da empresa dele
      const companyId = String(body.company_id || '')
      if (!/^[0-9a-f-]{36}$/i.test(companyId)) return json({ error: 'company_id inválido' }, 400)
      const { data: vs } = await userClient.from('vehicles').select('id, plate, vehicle_type, smartgps_device_id')
        .eq('company_id', companyId).eq('smartgps_tracked', true).not('smartgps_device_id', 'is', null)
      const list = await cached('latest', 25_000, async () => {
        const l = flatDevices(await sg('/api/get_devices_latest', { ungrouped: '1' })).filter((d: any) => d?.id != null && d?.lat != null)
        // Algumas instalações devolvem outra estrutura; usa a lista completa numa única chamada
        return l.length ? l : flatDevices(await sg('/api/get_devices', { ungrouped: '1' }))
      })
      const byId = new Map(list.map((d: any) => [String(d?.id), d]))
      const result = (vs ?? []).map((v: any) => {
        const d: any = byId.get(String(v.smartgps_device_id))
        return { vehicle_id: v.id, plate: v.plate, vehicle_type: v.vehicle_type ?? 'carro', device_id: v.smartgps_device_id,
          lat: d?.lat ?? null, lng: d?.lng ?? null, speed: d?.speed ?? null, time: d?.time ?? null,
          online: d?.online ?? null, ignition: d?.ignition ?? null, course: d?.course ?? null }
      })
      return json({ vehicles: result })
    }

    if (action === 'geocodificar') {
      // Geocodifica rotas sem coordenadas via Nominatim (1 consulta/s), no máximo 15 por chamada
      const ids: string[] = Array.isArray(body.route_ids) ? body.route_ids.filter((x: unknown) => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)).slice(0, 15) : []
      if (!ids.length) return json({ updated: [] })
      const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString()
      // RLS do usuário garante acesso às rotas
      const { data: rs } = await userClient.from('routes').select('id, address, neighborhood, city, cep, latitude, geocode_attempted_at').in('id', ids)
      const pend = (rs ?? []).filter((r: any) => r.latitude == null && (!r.geocode_attempted_at || r.geocode_attempted_at < dayAgo))
      const updated: { id: string; lat: number; lng: number }[] = []
      for (let i = 0; i < pend.length; i++) {
        const r: any = pend[i]
        if (i > 0) await new Promise((res) => setTimeout(res, 1100))
        const q = [r.address, r.neighborhood, r.city || 'Manaus', 'AM', 'Brasil'].filter(Boolean).join(', ')
        let lat: number | null = null, lng: number | null = null
        try {
          const u = new URL('https://nominatim.openstreetmap.org/search')
          u.searchParams.set('q', q); u.searchParams.set('format', 'json'); u.searchParams.set('limit', '1'); u.searchParams.set('countrycodes', 'br')
          const resp = await fetch(u, { headers: { 'User-Agent': 'Stock360-Logistica/1.0', 'Accept-Language': 'pt-BR' } })
          if (resp.ok) { const j = await resp.json(); if (j?.[0]) { lat = Number(j[0].lat); lng = Number(j[0].lon) } }
        } catch (_) { /* endereço não encontrado: segue sem coordenadas */ }
        await admin.from('routes').update({ latitude: lat, longitude: lng, geocode_attempted_at: new Date().toISOString() }).eq('id', r.id)
        if (lat != null && lng != null) updated.push({ id: r.id, lat, lng })
      }
      return json({ updated })
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
      const key = `h:${deviceId}:${from_date}:${to_date}:${from_time}:${to_time}`
      const points = await cached(key, 5 * 60_000, async () =>
        collectPoints(await sg('/api/get_history', { device_id: deviceId, from_date, to_date, from_time, to_time })))
      return json({ device_id: deviceId, points })
    }
    return json({ error: 'Ação inválida' }, 400)
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
