import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const OMIE_API_URL = 'https://app.omie.com.br/api/v1';

// Per-company cache namespace (set per request)
let CACHE_PREFIX = '';
const pk = (key: string) => `${CACHE_PREFIX}${key}`;

// Cache TTL for full listing results (10 minutes)
const LISTING_CACHE_TTL_MINUTES = 10;

function getSupabase() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
}

// --- Cache helpers ---
async function getCached(key: string): Promise<any | null> {
  try {
    const sb = getSupabase();
    const { data } = await sb
      .from('omie_cache')
      .select('cache_value, expires_at')
      .eq('cache_key', pk(key))
      .maybeSingle();
    if (data && new Date(data.expires_at) > new Date()) {
      return data.cache_value;
    }
    return null;
  } catch {
    return null;
  }
}

async function getCachedWithMeta(key: string): Promise<{ value: any; expires_at: string; created_at: string } | null> {
  try {
    const sb = getSupabase();
    const { data } = await sb
      .from('omie_cache')
      .select('cache_value, expires_at, created_at')
      .eq('cache_key', pk(key))
      .maybeSingle();
    if (data && new Date(data.expires_at) > new Date()) {
      return { value: data.cache_value, expires_at: data.expires_at, created_at: data.created_at };
    }
    return null;
  } catch {
    return null;
  }
}

async function setCache(key: string, value: any, ttlHours = 24): Promise<void> {
  try {
    const sb = getSupabase();
    const expires_at = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();
    await sb
      .from('omie_cache')
      .upsert({ cache_key: pk(key), cache_value: value, expires_at }, { onConflict: 'cache_key' });
  } catch (e) {
    console.log('Cache write error:', e);
  }
}

async function setCacheMinutes(key: string, value: any, ttlMinutes: number): Promise<void> {
  try {
    const sb = getSupabase();
    const expires_at = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
    await sb
      .from('omie_cache')
      .upsert({ cache_key: pk(key), cache_value: value, expires_at }, { onConflict: 'cache_key' });
  } catch (e) {
    console.log('Cache write error:', e);
  }
}

async function getMultiCached(keys: string[]): Promise<Map<string, any>> {
  const result = new Map<string, any>();
  if (keys.length === 0) return result;
  try {
    const sb = getSupabase();
    const { data } = await sb
      .from('omie_cache')
      .select('cache_key, cache_value, expires_at')
      .in('cache_key', keys.map(pk));
    const now = new Date();
    data?.forEach((row: any) => {
      if (new Date(row.expires_at) > now) {
        result.set(String(row.cache_key).slice(CACHE_PREFIX.length), row.cache_value);
      }
    });
  } catch {
    // ignore cache errors
  }
  return result;
}

async function setMultiCache(entries: { key: string; value: any }[], ttlHours = 24): Promise<void> {
  if (entries.length === 0) return;
  try {
    const sb = getSupabase();
    const expires_at = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();
    const rows = entries.map(e => ({ cache_key: pk(e.key), cache_value: e.value, expires_at }));
    await sb.from('omie_cache').upsert(rows, { onConflict: 'cache_key' });
  } catch (e) {
    console.log('Cache multi-write error:', e);
  }
}

// --- Omie API helpers ---
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3, timeoutMs = 45000): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      if (response.ok) {
        const cloned = response.clone();
        try {
          const body = await cloned.json();
          if (body.faultstring && body.faultstring.includes('Consumo redundante')) {
            console.log(`Consumo redundante detectado, aguardando 30s (tentativa ${attempt + 1})...`);
            await new Promise(resolve => setTimeout(resolve, 30000));
            continue;
          }
        } catch { /* not json, return as-is */ }
      }
      return response;
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries - 1) {
        const delay = (error as Error).message?.includes('aborted') ? 10000 : 2000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError || new Error('Falha após múltiplas tentativas');
}

// --- Famílias de produtos (nome da família por código do produto) ---
async function fetchFamilyNames(appKey: string, appSecret: string): Promise<Map<number, string>> {
  const cacheKey = `familias:${appKey.slice(0, 8)}`;
  const cached = await getCached(cacheKey);
  if (cached) return new Map(cached as [number, string][]);

  const map = new Map<number, string>();
  let page = 1;
  let totalPages = 1;
  do {
    const res = await fetchWithRetry(`${OMIE_API_URL}/geral/familias/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        call: 'PesquisarFamilias',
        app_key: appKey,
        app_secret: appSecret,
        param: [{ pagina: page, registros_por_pagina: 50, apenas_importado_api: 'N' }],
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (data?.faultstring) break;
    totalPages = data.total_de_paginas || 1;
    (data.famCadastro || []).forEach((f: any) => {
      if (f.codigo) map.set(Number(f.codigo), f.nomeFamilia || '');
    });
    page++;
  } while (page <= totalPages && page <= 10);

  await setCache(cacheKey, Array.from(map.entries()), 24 * 7);
  return map;
}

// Descobre a família de cada código de produto (cache 7 dias por produto)
async function fetchProductFamilies(
  codes: string[],
  appKey: string,
  appSecret: string,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const uniqueCodes = [...new Set(codes.filter(Boolean))];
  if (uniqueCodes.length === 0) return result;

  const prefix = `prodfam:${appKey.slice(0, 8)}:`;
  const cached = await getMultiCached(uniqueCodes.map(c => `${prefix}${c}`));
  const missing: string[] = [];
  uniqueCodes.forEach(c => {
    const hit = cached.get(`${prefix}${c}`);
    if (hit !== undefined && hit !== null) result.set(c, String(hit));
    else missing.push(c);
  });

  if (missing.length === 0) return result;

  let familyNames: Map<number, string>;
  try {
    familyNames = await fetchFamilyNames(appKey, appSecret);
  } catch (e) {
    console.log('Erro ao buscar famílias:', e);
    return result;
  }

  const toCache: { key: string; value: any }[] = [];
  for (const code of missing.slice(0, 40)) {
    try {
      const res = await fetchWithRetry(`${OMIE_API_URL}/geral/produtos/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          call: 'ConsultarProduto',
          app_key: appKey,
          app_secret: appSecret,
          param: [{ codigo: code }],
        }),
      }, 2, 20000);
      const data = await res.json().catch(() => ({}));
      const famId = Number(data?.codigo_familia || 0);
      const famName = famId ? (familyNames.get(famId) || '') : '';
      result.set(code, famName);
      toCache.push({ key: `${prefix}${code}`, value: famName });
    } catch (e) {
      console.log('Erro ao consultar produto', code, e);
    }
  }
  await setMultiCache(toCache, 24 * 7);
  return result;
}


// Process with cache-aware batching
async function fetchClientsWithCache(
  clientIds: number[],
  appKey: string,
  appSecret: string
): Promise<Map<number, any>> {
  const result = new Map<number, any>();
  if (clientIds.length === 0) return result;

  const cacheKeys = clientIds.map(id => `client_${id}`);
  const cachedData = await getMultiCached(cacheKeys);
  
  const uncachedIds: number[] = [];
  clientIds.forEach(id => {
    const cached = cachedData.get(`client_${id}`);
    if (cached) {
      result.set(id, cached);
    } else {
      uncachedIds.push(id);
    }
  });

  console.log(`Clientes: ${clientIds.length - uncachedIds.length} do cache, ${uncachedIds.length} da API`);

  if (uncachedIds.length > 0) {
    const cacheEntries: { key: string; value: any }[] = [];
    for (let i = 0; i < uncachedIds.length; i += 3) {
      const batch = uncachedIds.slice(i, i + 3);
      if (i > 0) await new Promise(resolve => setTimeout(resolve, 5000));
      const batchResults = await Promise.all(batch.map(async (clientId) => {
        try {
          const body = {
            call: 'ConsultarCliente',
            app_key: appKey,
            app_secret: appSecret,
            param: [{ codigo_cliente_omie: clientId }],
          };
          const res = await fetchWithRetry(`${OMIE_API_URL}/geral/clientes/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          const data = await res.json();
          if (data.faultstring) return { clientId, details: null };
          const details = {
            name: data.razao_social || data.nome_fantasia || '',
            street: data.endereco || '',
            number: data.endereco_numero || '',
            complement: data.complemento || '',
            neighborhood: data.bairro || '',
            city: data.cidade || '',
            state: data.estado || '',
            cep: data.cep || '',
          };
          return { clientId, details };
        } catch {
          return { clientId, details: null };
        }
      }));
      batchResults.forEach(({ clientId, details }) => {
        if (details) {
          result.set(clientId, details);
          cacheEntries.push({ key: `client_${clientId}`, value: details });
        }
      });
    }
    await setMultiCache(cacheEntries, 168);
  }

  return result;
}

async function fetchOrdersWithCache(
  orderIds: number[],
  appKey: string,
  appSecret: string
): Promise<{ orderObservations: Map<number, string>; orderVendedorCodes: Map<number, number> }> {
  const orderObservations = new Map<number, string>();
  const orderVendedorCodes = new Map<number, number>();
  if (orderIds.length === 0) return { orderObservations, orderVendedorCodes };

  const cacheKeys = orderIds.map(id => `order_${id}`);
  const cachedData = await getMultiCached(cacheKeys);
  
  const uncachedIds: number[] = [];
  orderIds.forEach(id => {
    const cached = cachedData.get(`order_${id}`);
    if (cached) {
      if (cached.obs) orderObservations.set(id, cached.obs);
      if (cached.vendedorCode) orderVendedorCodes.set(id, cached.vendedorCode);
    } else {
      uncachedIds.push(id);
    }
  });

  console.log(`Pedidos: ${orderIds.length - uncachedIds.length} do cache, ${uncachedIds.length} da API`);

  if (uncachedIds.length > 0) {
    const cacheEntries: { key: string; value: any }[] = [];
    for (let i = 0; i < uncachedIds.length; i += 3) {
      const batch = uncachedIds.slice(i, i + 3);
      if (i > 0) await new Promise(resolve => setTimeout(resolve, 5000));
      const batchResults = await Promise.all(batch.map(async (orderId) => {
        try {
          const body = {
            call: 'ConsultarPedido',
            app_key: appKey,
            app_secret: appSecret,
            param: [{ codigo_pedido: orderId }],
          };
          const res = await fetchWithRetry(`${OMIE_API_URL}/produtos/pedido/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          const orderData = await res.json();
          if (orderData.faultstring) return { orderId, obs: '', vendedorCode: 0 };
          const pvp = orderData.pedido_venda_produto;
          const obs = pvp?.observacoes?.obs_venda || pvp?.obs_venda || pvp?.informacoes_adicionais?.obs_venda || '';
          const vendedorCode = pvp?.informacoes_adicionais?.codVend || pvp?.cabecalho?.codigo_vendedor || 0;
          return { orderId, obs, vendedorCode };
        } catch {
          return { orderId, obs: '', vendedorCode: 0 };
        }
      }));
      batchResults.forEach(({ orderId, obs, vendedorCode }) => {
        if (obs) orderObservations.set(orderId, obs);
        if (vendedorCode) orderVendedorCodes.set(orderId, vendedorCode);
        if (obs || vendedorCode) {
          cacheEntries.push({ key: `order_${orderId}`, value: { obs, vendedorCode } });
        }
      });
    }
    await setMultiCache(cacheEntries, 24);
  }

  return { orderObservations, orderVendedorCodes };
}

// --- NFCe: cupons não trazem o id do pedido. Os cupons do PDV geram Pedido de Venda
// com observação no formato "Pré-venda: #170447|ROTA". Listamos os pedidos do dia
// e casamos por cliente + valor total para recuperar observação/nº da pré-venda ---
type PedidoResumo = { obs: string; vendedorCode: number; total: number; clientId: number; numero: string };

// Separa "Pré-venda: #170447|ROTA" em { numero, obs }
function parsePreVendaObs(raw: string): { numero: string; obs: string } {
  const text = (raw || '').trim();
  const m = text.match(/pr[ée]-?venda:\s*#?(\d+)\s*\|?\s*(.*)$/i);
  if (m) return { numero: m[1], obs: (m[2] || '').trim() };
  return { numero: '', obs: text };
}

async function fetchPedidosByDate(
  date: string, // dd/MM/yyyy
  appKey: string,
  appSecret: string
): Promise<PedidoResumo[]> {
  const cacheKey = `pedidos_data_${date.replace(/\//g, '-')}`;
  const cached = await getCached(cacheKey);
  if (cached) return cached as PedidoResumo[];

  const pedidos: PedidoResumo[] = [];
  try {
    let page = 1;
    let totalPages = 1;
    do {
      const body = {
        call: 'ListarPedidos',
        app_key: appKey,
        app_secret: appSecret,
        param: [{
          pagina: page,
          registros_por_pagina: 100,
          apenas_importado_api: 'N',
          filtrar_por_data_de: date,
          filtrar_por_data_ate: date,
        }],
      };
      const res = await fetchWithRetry(`${OMIE_API_URL}/produtos/pedido/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.faultstring) {
        console.log('ListarPedidos(data) fault:', data.faultstring);
        break;
      }
      totalPages = data.total_de_paginas || 1;
      for (const p of data.pedido_venda_produto || []) {
        pedidos.push({
          obs: p?.observacoes?.obs_venda || p?.informacoes_adicionais?.obs_venda || '',
          vendedorCode: p?.informacoes_adicionais?.codVend || p?.cabecalho?.codigo_vendedor || 0,
          total: p?.total_pedido?.valor_total_pedido ?? 0,
          clientId: p?.cabecalho?.codigo_cliente || 0,
          numero: String(p?.cabecalho?.numero_pedido || ''),
        });
      }
      page++;
      if (page <= totalPages) await new Promise(r => setTimeout(r, 800));
    } while (page <= totalPages && page <= 5);
  } catch (e) {
    console.log('Erro ao listar pedidos da data', date, e);
  }

  console.log(`Pedidos do dia ${date}: ${pedidos.length}`);
  await setCacheMinutes(cacheKey, pedidos, 10);
  return pedidos;
}

function matchPedido(pedidos: PedidoResumo[], clientId: number, total: number): PedidoResumo | null {
  const doCliente = pedidos.filter(p => p.clientId === clientId);
  if (doCliente.length === 0) return null;
  // Só aceita casamento pelo valor exato, para não trazer observação de outro pedido
  return doCliente.find(p => Math.abs((p.total || 0) - (total || 0)) < 0.05) || null;
}



async function fetchVendedorNames(
  codes: number[],
  appKey: string,
  appSecret: string
): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (codes.length === 0) return map;

  const cacheKey = 'vendedores_all';
  const cached = await getCached(cacheKey);
  if (cached) {
    const entries = cached as Array<[number, string]>;
    entries.forEach(([code, name]) => map.set(code, name));
    if (codes.every(c => map.has(c))) {
      console.log('Vendedores servidos do cache');
      return map;
    }
  }

  try {
    console.log(`Buscando vendedores para códigos: ${codes.join(', ')}`);
    const vendBody = {
      call: 'ListarVendedores',
      app_key: appKey,
      app_secret: appSecret,
      param: [{ pagina: 1, registros_por_pagina: 100 }],
    };
    const vendRes = await fetchWithRetry(`${OMIE_API_URL}/geral/vendedores/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(vendBody),
    });
    const vendData = await vendRes.json();
    const vendedores = vendData.cadastro || vendData.vendedores || vendData.lista_vendedores || [];
    vendedores.forEach((v: any) => {
      const code = v.codigo || v.nCodigo || v.id;
      const name = v.nome || v.cNome || v.razao_social || v.nomeVendedor;
      if (code && name) map.set(Number(code), name);
    });
    console.log(`Vendedores carregados: ${map.size}`);
    await setCache(cacheKey, Array.from(map.entries()), 24);
  } catch (e) {
    console.log('Erro ao buscar vendedores:', e);
  }
  return map;
}

// --- Build full result for NFe ---
async function buildNfeResult(page: number, fetchLastPage: boolean, appKey: string, appSecret: string) {
  let actualPage = page;
  let data: any = null;

  if (fetchLastPage && page === 1) {
    const discoverBody = {
      call: 'ListarNF',
      app_key: appKey,
      app_secret: appSecret,
      param: [{ pagina: 1, registros_por_pagina: 50, apenas_importado_api: 'N' }],
    };
    console.log('Chamando API Omie NFe para descobrir última página...');
    const discoverRes = await fetchWithRetry(`${OMIE_API_URL}/produtos/nfconsultar/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(discoverBody),
    });
    const discoverData = await discoverRes.json();
    
    if (discoverData.faultstring) {
      if (discoverData.faultstring.includes('SOAP-ERROR') || discoverData.faultstring.includes('Unexpected')) {
        throw new Error('API Omie temporariamente indisponível. Tente novamente em alguns segundos.');
      }
      throw new Error(`Omie NFe: ${discoverData.faultstring}`);
    }

    const totalPages = discoverData.total_de_paginas || 1;
    actualPage = totalPages;

    if (totalPages === 1) {
      data = discoverData;
      console.log('NFe: apenas 1 página, reutilizando dados.');
    } else {
      console.log(`NFe: ${totalPages} páginas. Aguardando 30s antes de buscar página ${actualPage}...`);
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
  }

  if (!data) {
    const requestBody = {
      call: 'ListarNF',
      app_key: appKey,
      app_secret: appSecret,
      param: [{ pagina: actualPage, registros_por_pagina: 50, apenas_importado_api: 'N' }],
    };
    console.log('Chamando API Omie NFe, página:', actualPage);
    const response = await fetchWithRetry(`${OMIE_API_URL}/produtos/nfconsultar/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    const responseText = await response.text();
    console.log('Status HTTP:', response.status);
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error(`Erro ao parsear resposta Omie: ${responseText.substring(0, 200)}`);
    }
    if (data.faultstring) {
      if (data.faultstring.includes('SOAP-ERROR') || data.faultstring.includes('Unexpected')) {
        throw new Error('API Omie temporariamente indisponível. Tente novamente em alguns segundos.');
      }
      throw new Error(`Omie NFe: ${data.faultstring}`);
    }
  }

  const validInvoices = (data.nfCadastro || []).filter((nf: any) => {
    const isSaida = nf.ide?.tpNF === '1' || nf.ide?.tpNF === 1;
    return isSaida;
  });

  const orderIdSet = new Set<number>();
  const clientIdSet = new Set<number>();
  validInvoices.forEach((nf: any) => {
    if (nf.compl?.nIdPedido && nf.compl.nIdPedido > 0) orderIdSet.add(nf.compl.nIdPedido);
    if (nf.nfDestInt?.nCodCli) clientIdSet.add(nf.nfDestInt.nCodCli);
  });

  const uniqueOrderIds = [...orderIdSet];
  const uniqueClientIds = [...clientIdSet];

  console.log(`Buscando ${uniqueOrderIds.length} pedidos e ${uniqueClientIds.length} clientes (com cache)...`);

  const { orderObservations, orderVendedorCodes } = await fetchOrdersWithCache(uniqueOrderIds, appKey, appSecret);
  if (uniqueOrderIds.length > 0 && uniqueClientIds.length > 0) {
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  const clientAddresses = await fetchClientsWithCache(uniqueClientIds, appKey, appSecret);

  const uniqueVendedorCodes = [...new Set(orderVendedorCodes.values())].filter(Boolean);
  const vendedorCodeToName = await fetchVendedorNames(uniqueVendedorCodes, appKey, appSecret);

  const orderVendedorNames = new Map<number, string>();
  orderVendedorCodes.forEach((code, orderId) => {
    const name = vendedorCodeToName.get(code);
    if (name) orderVendedorNames.set(orderId, name);
  });

  const invoices = validInvoices.map((nf: any) => {
    const orderId = nf.compl?.nIdPedido || 0;
    const rawObs = orderObservations.get(orderId) || '';
    // Obs da Omie vem como "Pré-venda: #170447|ROTA" — separamos nº da pré-venda e o texto
    const parsedObs = parsePreVendaObs(rawObs);
    const orderObs = parsedObs.obs;
    const vendedorName = orderVendedorNames.get(orderId) || null;

    const clientId = nf.nfDestInt?.nCodCli;
    return {
      id: nf.compl?.nIdNF || nf.ide?.nNF || String(Math.random()),
      number: nf.ide?.nNF,
      series: nf.ide?.serie,
      emissionDate: nf.ide?.dEmi,
      emissionTime: nf.ide?.hEmi || null,
      clientId,
      clientName: nf.nfDestInt?.cRazao || '',
      clientCpfCnpj: nf.nfDestInt?.cnpj_cpf || '',
      address: clientId ? clientAddresses.get(clientId) || null : null,
      totalValue: nf.total?.ICMSTot?.vNF || 0,
      status: nf.ide?.cSitNFe,
      canceled: nf.ide?.cSitNFe === 'C' || nf.ide?.cSitNFe === 'CANCELADA',
      paymentMethod: nf.pag?.[0]?.tPag,
      accessKey: nf.compl?.cChaveNFe,
      orderId,
      orderObservation: orderObs,
      orderNumber: parsedObs.numero || '',
      vendedorName,

      products: (nf.det || []).map((item: any) => ({
        name: item.prod?.xProd || '',
        quantity: item.prod?.qCom || 0,
        unit: item.prod?.uCom || '',
        unitValue: item.prod?.vUnCom || 0,
        totalValue: item.prod?.vProd || 0,
        code: item.prod?.cProd || '',
        family: '',
      })),
    };
  }).reverse();

  await attachFamilies(invoices, appKey, appSecret);

  return {
    type: 'nfe' as const,
    page: data.pagina || page,
    totalPages: data.total_de_paginas || 1,
    totalRecords: data.total_de_registros || 0,
    invoices,
  };
}

// Preenche a família de cada produto das notas
async function attachFamilies(invoices: any[], appKey: string, appSecret: string) {
  try {
    const codes = invoices.flatMap((inv: any) => (inv.products || []).map((p: any) => p.code)).filter(Boolean);
    const families = await fetchProductFamilies(codes, appKey, appSecret);
    invoices.forEach((inv: any) => {
      (inv.products || []).forEach((p: any) => {
        p.family = families.get(p.code) || '';
      });
    });
  } catch (e) {
    console.log('Erro ao anexar famílias:', e);
  }
}

// --- Build full result for NFCe ---
async function buildNfceResult(page: number, appKey: string, appSecret: string) {
  const requestBody = {
    call: 'CuponsFiscais',
    app_key: appKey,
    app_secret: appSecret,
    param: [{ nPagina: page, nRegPorPagina: 50 }],
  };
  console.log('Chamando API Omie NFCe, página:', page);
  const response = await fetchWithRetry(`${OMIE_API_URL}/produtos/cupomfiscalconsultar/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });
  const responseText = await response.text();
  console.log('Status HTTP:', response.status);
  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(`Erro ao parsear resposta Omie: ${responseText.substring(0, 200)}`);
  }
  if (data.faultstring) {
    throw new Error(`Omie NFCe: ${data.faultstring}`);
  }
  const cupons = data.cupons || data.cupomFiscalCadastro || [];

  // Log first cupom structure for debugging
  if (cupons.length > 0) {
    const first = cupons[0];
    const itemKeys = first.det ? 'det' : first.itensCupom ? 'itensCupom' : first.itens ? 'itens' : 'none';
    const items = first.det || first.itensCupom || first.itens || [];
    console.log(`NFCe items field: ${itemKeys}, count: ${items.length}`);
    if (items.length > 0) {
      console.log('NFCe first item keys:', JSON.stringify(Object.keys(items[0])));
      console.log('NFCe first item:', JSON.stringify(items[0]).substring(0, 500));
    }
    console.log('NFCe cupom top-level keys:', JSON.stringify(Object.keys(first)));
    console.log('NFCe cabecalhoCupom keys:', JSON.stringify(Object.keys(first.cabecalhoCupom || {})));
    console.log('NFCe cabecalhoCupom:', JSON.stringify(first.cabecalhoCupom).substring(0, 800));
  }

  const nfceInvoices = cupons.map((cupom: any) => {
    const items = cupom.det || cupom.itensCupom || cupom.itens || [];
    return {
      id: cupom.cabecalhoCupom?.nIdCupom || String(Math.random()),
      number: cupom.cabecalhoCupom?.nNumCupom,
      series: cupom.cabecalhoCupom?.nSerieCupom,
      emissionDate: cupom.cabecalhoCupom?.dDtEmissaoCupom,
      emissionTime: cupom.cabecalhoCupom?.cHrEmissaoCupom || cupom.cabecalhoCupom?.hEmi || null,
      clientId: cupom.cabecalhoCupom?.idCliente || cupom.cabecalhoCupom?.nCodCli,
      clientName: cupom.cliente?.razao_social || cupom.cliente?.nome_fantasia || '',
      clientCpfCnpj: cupom.cliente?.cnpj_cpf || '',
      address: null as any,
      totalValue: cupom.cabecalhoCupom?.nValorCupom || 0,
      accessKey: cupom.cabecalhoCupom?.cChaveCupom,
      orderId: cupom.cabecalhoCupom?.nIdPedido || 0,
      orderNumber: '' as string,
      orderObservation: '',

      vendedorId: cupom.cabecalhoCupom?.idVendedor || 0,
      vendedorName: null as string | null,
      paymentMethod: cupom.pagamentosCupom?.[0]?.tPag || null,
      products: items.map((item: any) => ({
        name: item.xProd || '',
        quantity: item.nQuant || 0,
        unit: item.cUn || '',
        unitValue: item.vUnit || 0,
        totalValue: item.vItem || 0,
        code: item.cCodigo || '',
        family: '',
      })),
    };
  });

  const uniqueClientIds = [...new Set(nfceInvoices.map((inv: any) => inv.clientId).filter(Boolean))] as number[];
  const nfceOrderIds = [...new Set(nfceInvoices.map((inv: any) => inv.orderId).filter((id: number) => id > 0))] as number[];

  // Collect vendedor IDs directly from cupom headers
  const cupomVendedorIds = [...new Set(nfceInvoices.map((inv: any) => inv.vendedorId).filter((id: number) => id > 0))] as number[];

  console.log(`NFCe: Buscando ${uniqueClientIds.length} clientes, ${nfceOrderIds.length} pedidos, ${cupomVendedorIds.length} vendedores diretos...`);

  const clientAddresses = await fetchClientsWithCache(uniqueClientIds, appKey, appSecret);
  if (uniqueClientIds.length > 0 && nfceOrderIds.length > 0) {
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  const { orderObservations, orderVendedorCodes } = await fetchOrdersWithCache(nfceOrderIds, appKey, appSecret);

  for (const inv of nfceInvoices) {
    if (inv.clientId && clientAddresses.has(inv.clientId)) {
      const clientData = clientAddresses.get(inv.clientId);
      inv.address = clientData;
      if (!inv.clientName && clientData?.name) inv.clientName = clientData.name;
    }
  }

  // Cupons de balcão (PDV) nascem de pré-venda, mas a Omie gera um Pedido de Venda com
  // observação "Pré-venda: #170447|ROTA". Listamos os pedidos das datas dos cupons e
  // casamos por cliente + valor total (1 chamada por data, cache de 10 min).
  const matchedPedidos = new Map<string, PedidoResumo>();
  const cupomDates = [...new Set(nfceInvoices.map((i: any) => i.emissionDate).filter(Boolean))] as string[];
  const pedidosPorData = new Map<string, PedidoResumo[]>();
  for (let i = 0; i < cupomDates.slice(0, 3).length; i++) {
    pedidosPorData.set(cupomDates[i], await fetchPedidosByDate(cupomDates[i], appKey, appSecret));
    if (i < cupomDates.length - 1) await new Promise(r => setTimeout(r, 800));
  }
  for (const inv of nfceInvoices) {
    const lista = pedidosPorData.get(inv.emissionDate) || [];
    const match = matchPedido(lista, inv.clientId, inv.totalValue);
    if (match) matchedPedidos.set(String(inv.id), match);
  }





  // Merge vendedor codes from orders + direct cupom vendedor IDs
  const allVendedorCodes = [...new Set([
    ...orderVendedorCodes.values(),
    ...[...matchedPedidos.values()].map(p => p.vendedorCode),
    ...cupomVendedorIds,
  ])].filter(Boolean);
  const vendedorCodeToName = await fetchVendedorNames(allVendedorCodes, appKey, appSecret);

  for (const inv of nfceInvoices) {
    // Try order-based vendor first, then direct cupom vendedor
    if (inv.orderId > 0) {
      if (orderObservations.has(inv.orderId)) {
        inv.orderObservation = orderObservations.get(inv.orderId) || '';
      }
      const vendCode = orderVendedorCodes.get(inv.orderId);
      if (vendCode) {
        inv.vendedorName = vendedorCodeToName.get(vendCode) || null;
      }
    }
    // Pedido casado pela data/cliente/valor (obs no formato "Pré-venda: #170447|ROTA")
    const match = matchedPedidos.get(String(inv.id));
    if (match) {
      const parsed = parsePreVendaObs(match.obs);
      if (!inv.orderObservation && parsed.obs) inv.orderObservation = parsed.obs;
      if (!inv.orderNumber) inv.orderNumber = parsed.numero || match.numero || '';
      if (!inv.vendedorName && match.vendedorCode) {
        inv.vendedorName = vendedorCodeToName.get(match.vendedorCode) || null;
      }
    }

    // Fallback: use idVendedor from cupom header
    if (!inv.vendedorName && inv.vendedorId > 0) {
      inv.vendedorName = vendedorCodeToName.get(inv.vendedorId) || null;
    }
    // Clean up vendedorId from response
    delete inv.vendedorId;
  }


  await attachFamilies(nfceInvoices, appKey, appSecret);



  return {
    type: 'nfce' as const,
    page: data.nPagina || page,
    totalPages: data.nTotPaginas || 1,
    totalRecords: data.nTotRegistros || 0,
    invoices: nfceInvoices,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Require authenticated user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    // Chamada interna (cron / função servidor) usando a service role key
    const isInternal =
      authHeader === `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`;

    let userId: string | null = null;
    let userRoles: any[] = [];

    if (!isInternal) {
      const authClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: userData, error: userError } = await authClient.auth.getUser();
      if (userError || !userData?.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      userId = userData.user.id;

      // Require admin, comercial or expedicao role
      const sbRoles = getSupabase();
      const { data: roles } = await sbRoles
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);
      userRoles = roles ?? [];
      const allowed = userRoles.some((r: any) => ['admin', 'comercial', 'expedicao'].includes(r.role));
      if (!allowed) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const sb = getSupabase();



    const { type, page = 1, fetchLastPage = false, forceRefresh = false, companyId } = await req.json();

    // Resolve company (defaults to Stock 360) and check membership
    let companySlug = 'stock360';
    if (companyId) {
      const { data: company } = await sb
        .from('companies')
        .select('id, slug')
        .eq('id', companyId)
        .maybeSingle();
      if (!company) {
        return new Response(JSON.stringify({ error: 'Empresa não encontrada' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (!isInternal) {
        const isAdmin = userRoles.some((r: any) => r.role === 'admin');
        const { data: membership } = await sb
          .from('user_companies')
          .select('id')
          .eq('user_id', userId!)
          .eq('company_id', company.id)
          .maybeSingle();
        if (!membership && !isAdmin) {
          return new Response(JSON.stringify({ error: 'Sem acesso a esta empresa' }), {
            status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      companySlug = company.slug;
    }

    // Per-company Omie credentials
    const suffix = companySlug === 'stock360' ? '' : `_${companySlug.toUpperCase()}`;
    const OMIE_APP_KEY = Deno.env.get(`OMIE_APP_KEY${suffix}`);
    const OMIE_APP_SECRET = Deno.env.get(`OMIE_APP_SECRET${suffix}`);

    if (!OMIE_APP_KEY) throw new Error(`OMIE_APP_KEY${suffix} não configurada`);
    if (!OMIE_APP_SECRET) throw new Error(`OMIE_APP_SECRET${suffix} não configurada`);

    CACHE_PREFIX = `${companySlug}:`;

    if (!type || !['nfe', 'nfce'].includes(type)) {
      throw new Error('Tipo inválido. Use "nfe" ou "nfce".');
    }

    // Clean expired cache periodically (1 in 10 chance)
    if (Math.random() < 0.1) {
      getSupabase().rpc('clean_omie_cache').then(() => {}).catch(() => {});
    }

    // Determine cache key for this listing
    const listingCacheKey = type === 'nfe'
      ? (fetchLastPage ? 'listing_nfe_last' : `listing_nfe_page_${page}`)
      : `listing_nfce_page_${page}`;

    // Check listing cache first (unless forceRefresh)
    if (!forceRefresh) {
      const cachedListing = await getCachedWithMeta(listingCacheKey);
      if (cachedListing) {
        console.log(`Servindo ${type} do cache (criado em ${cachedListing.created_at})`);
        const result = cachedListing.value;
        result.fromCache = true;
        result.cachedAt = cachedListing.created_at;
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    console.log(`Cache miss ou forceRefresh para ${listingCacheKey}, buscando da API Omie...`);

    let result;
    if (type === 'nfe') {
      result = await buildNfeResult(page, fetchLastPage, OMIE_APP_KEY, OMIE_APP_SECRET);
    } else {
      result = await buildNfceResult(page, OMIE_APP_KEY, OMIE_APP_SECRET);
    }

    // Save to listing cache (10 min TTL)
    await setCacheMinutes(listingCacheKey, result, LISTING_CACHE_TTL_MINUTES);
    console.log(`Resultado salvo no cache: ${listingCacheKey} (TTL: ${LISTING_CACHE_TTL_MINUTES}min)`);

    const responseResult = { ...result, fromCache: false, cachedAt: new Date().toISOString() };

    return new Response(JSON.stringify(responseResult), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Erro na edge function omie-invoices:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    const isAbort = errorMessage.includes('aborted') || errorMessage.includes('AbortError');
    const isTemporary = isAbort || errorMessage.includes('temporariamente') || errorMessage.includes('SOAP-ERROR') || errorMessage.includes('Consumo redundante');
    const userMessage = isAbort 
      ? 'A API do Omie demorou muito para responder. Tente novamente em alguns segundos.' 
      : errorMessage;
    return new Response(
      JSON.stringify({ error: userMessage, isTemporary }),
      { status: isTemporary ? 503 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
