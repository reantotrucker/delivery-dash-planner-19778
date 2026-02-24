import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const OMIE_API_URL = 'https://app.omie.com.br/api/v1';

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
      .eq('cache_key', key)
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
      .eq('cache_key', key)
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
      .upsert({ cache_key: key, cache_value: value, expires_at }, { onConflict: 'cache_key' });
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
      .upsert({ cache_key: key, cache_value: value, expires_at }, { onConflict: 'cache_key' });
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
      .in('cache_key', keys);
    const now = new Date();
    data?.forEach((row: any) => {
      if (new Date(row.expires_at) > now) {
        result.set(row.cache_key, row.cache_value);
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
    const rows = entries.map(e => ({ cache_key: e.key, cache_value: e.value, expires_at }));
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

// Helper to get date range (last 30 days) for NFCe
function getLast30DaysRange() {
  const now = new Date();
  const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const format = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  return { dDtEmissaoDe: format(past), dDtEmissaoAte: format(now) };
}

// Parse dd/mm/yyyy to Date
function parseOmieDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  return new Date(Number(y), Number(m) - 1, Number(d));
}

// Fetch a single NFe page from API
async function fetchNfePage(pageNum: number, appKey: string, appSecret: string): Promise<any> {
  const requestBody = {
    call: 'ListarNF',
    app_key: appKey,
    app_secret: appSecret,
    param: [{ pagina: pageNum, registros_por_pagina: 50, apenas_importado_api: 'N' }],
  };
  console.log('Chamando API Omie NFe, página:', pageNum);
  const response = await fetchWithRetry(`${OMIE_API_URL}/produtos/nfconsultar/`, {
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
    if (data.faultstring.includes('SOAP-ERROR') || data.faultstring.includes('Unexpected')) {
      throw new Error('API Omie temporariamente indisponível. Tente novamente em alguns segundos.');
    }
    if (data.faultstring.includes('Consumo redundante')) {
      throw new Error('API Omie com consumo redundante. Aguarde alguns segundos e tente novamente.');
    }
    throw new Error(`Omie NFe: ${data.faultstring}`);
  }
  return data;
}

// --- Build full result for NFe (last 30 days, paginating backwards) ---
async function buildNfeResult(_page: number, fetchLastPage: boolean, appKey: string, appSecret: string) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const MAX_PAGES_TO_FETCH = 5; // Max pages to fetch backwards to avoid rate limits

  // Step 1: Discover total pages
  const firstData = await fetchNfePage(1, appKey, appSecret);
  const totalPages = firstData.total_de_paginas || 1;
  console.log(`NFe: ${totalPages} páginas totais. Buscando últimas páginas (30 dias)...`);

  // Step 2: Fetch pages backwards from last, collecting 30-day invoices
  const allNfCadastro: any[] = [];
  let currentPage = totalPages;
  let pagesFetched = 0;
  let foundOlderThan30Days = false;

  while (currentPage > 0 && pagesFetched < MAX_PAGES_TO_FETCH && !foundOlderThan30Days) {
    let pageData;

    if (currentPage === 1 && totalPages === 1) {
      // Reuse first page data if there's only 1 page
      pageData = firstData;
    } else {
      // Wait between API calls to avoid rate limits
      if (pagesFetched > 0 || currentPage !== totalPages) {
        console.log(`Aguardando 31s antes de buscar página ${currentPage}...`);
        await new Promise(resolve => setTimeout(resolve, 31000));
      } else {
        // First fetch after discovering pages - still need to wait
        console.log(`Aguardando 31s antes de buscar página ${currentPage}...`);
        await new Promise(resolve => setTimeout(resolve, 31000));
      }
      pageData = await fetchNfePage(currentPage, appKey, appSecret);
    }
    pagesFetched++;

    const pageInvoices = pageData.nfCadastro || [];
    let olderCount = 0;
    for (const nf of pageInvoices) {
      const emiDate = parseOmieDate(nf.ide?.dEmi);
      if (emiDate && emiDate < thirtyDaysAgo) {
        olderCount++;
        continue; // Skip invoices older than 30 days
      }
      allNfCadastro.push(nf);
    }

    console.log(`Página ${currentPage}: ${pageInvoices.length} notas, ${olderCount} anteriores a 30 dias, ${allNfCadastro.length} coletadas`);

    // If we found any older invoices, no need to go further back
    if (olderCount > 0) {
      foundOlderThan30Days = true;
    }

    currentPage--;
  }

  console.log(`NFe: Total ${allNfCadastro.length} notas dos últimos 30 dias (${pagesFetched} páginas buscadas)`);

  // Step 3: Filter valid invoices (not canceled, saída only)
  const validInvoices = allNfCadastro.filter((nf: any) => {
    const status = nf.ide?.cSitNFe;
    const isNotCanceled = status !== 'C' && status !== 'CANCELADA';
    const isSaida = nf.ide?.tpNF === '1' || nf.ide?.tpNF === 1;
    return isNotCanceled && isSaida;
  });

  // Step 4: Enrich with order/client/vendor data
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
    const orderObs = orderObservations.get(orderId) || '';
    const vendedorName = orderVendedorNames.get(orderId) || null;
    const clientId = nf.nfDestInt?.nCodCli;
    return {
      id: nf.compl?.nIdNF || nf.ide?.nNF || String(Math.random()),
      number: nf.ide?.nNF,
      series: nf.ide?.serie,
      emissionDate: nf.ide?.dEmi,
      clientId,
      clientName: nf.nfDestInt?.cRazao || '',
      clientCpfCnpj: nf.nfDestInt?.cnpj_cpf || '',
      address: clientId ? clientAddresses.get(clientId) || null : null,
      totalValue: nf.total?.ICMSTot?.vNF || 0,
      status: nf.ide?.cSitNFe,
      paymentMethod: nf.pag?.[0]?.tPag,
      accessKey: nf.compl?.cChaveNFe,
      orderId,
      orderObservation: orderObs,
      vendedorName,
      products: (nf.det || []).map((item: any) => ({
        name: item.prod?.xProd || '',
        quantity: item.prod?.qCom || 0,
        unit: item.prod?.uCom || '',
        unitValue: item.prod?.vUnCom || 0,
        totalValue: item.prod?.vProd || 0,
        code: item.prod?.cProd || '',
      })),
    };
  }).reverse();

  return {
    type: 'nfe' as const,
    page: 1,
    totalPages: 1,
    totalRecords: invoices.length,
    invoices,
  };
}

// --- Build full result for NFCe ---
async function buildNfceResult(page: number, appKey: string, appSecret: string) {
  const dateRange = getLast30DaysRange();
  console.log(`Filtro de data NFCe: ${dateRange.dDtEmissaoDe} a ${dateRange.dDtEmissaoAte}`);
  const requestBody = {
    call: 'CuponsFiscais',
    app_key: appKey,
    app_secret: appSecret,
    param: [{ nPagina: page, nRegPorPagina: 50, ...dateRange }],
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

  const nfceInvoices = cupons.map((cupom: any) => ({
    id: cupom.cabecalhoCupom?.nIdCupom || String(Math.random()),
    number: cupom.cabecalhoCupom?.nNumCupom,
    series: cupom.cabecalhoCupom?.nSerieCupom,
    emissionDate: cupom.cabecalhoCupom?.dDtEmissaoCupom,
    clientId: cupom.cabecalhoCupom?.idCliente || cupom.cabecalhoCupom?.nCodCli,
    clientName: cupom.cliente?.razao_social || cupom.cliente?.nome_fantasia || '',
    clientCpfCnpj: cupom.cliente?.cnpj_cpf || '',
    address: null as any,
    totalValue: cupom.cabecalhoCupom?.nValorCupom || 0,
    accessKey: cupom.cabecalhoCupom?.cChaveCupom,
    orderId: cupom.cabecalhoCupom?.nIdPedido || 0,
    orderObservation: '',
    vendedorName: null as string | null,
  }));

  const uniqueClientIds = [...new Set(nfceInvoices.map((inv: any) => inv.clientId).filter(Boolean))] as number[];
  const nfceOrderIds = [...new Set(nfceInvoices.map((inv: any) => inv.orderId).filter((id: number) => id > 0))] as number[];

  console.log(`NFCe: Buscando ${uniqueClientIds.length} clientes e ${nfceOrderIds.length} pedidos (com cache)...`);

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

  const uniqueVendedorCodes = [...new Set(orderVendedorCodes.values())].filter(Boolean);
  const vendedorCodeToName = await fetchVendedorNames(uniqueVendedorCodes, appKey, appSecret);

  for (const inv of nfceInvoices) {
    if (inv.orderId > 0) {
      if (orderObservations.has(inv.orderId)) {
        inv.orderObservation = orderObservations.get(inv.orderId) || '';
      }
      const vendCode = orderVendedorCodes.get(inv.orderId);
      if (vendCode) {
        inv.vendedorName = vendedorCodeToName.get(vendCode) || null;
      }
    }
  }

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
    const OMIE_APP_KEY = Deno.env.get('OMIE_APP_KEY');
    const OMIE_APP_SECRET = Deno.env.get('OMIE_APP_SECRET');

    if (!OMIE_APP_KEY) throw new Error('OMIE_APP_KEY não configurada');
    if (!OMIE_APP_SECRET) throw new Error('OMIE_APP_SECRET não configurada');

    const { type, page = 1, fetchLastPage = false, forceRefresh = false } = await req.json();

    if (!type || !['nfe', 'nfce'].includes(type)) {
      throw new Error('Tipo inválido. Use "nfe" ou "nfce".');
    }

    // Clean expired cache periodically (1 in 10 chance)
    if (Math.random() < 0.1) {
      getSupabase().rpc('clean_omie_cache').then(() => {}).catch(() => {});
    }

    // Determine cache key for this listing - NFe always uses single key now (all 30-day data)
    const listingCacheKey = type === 'nfe'
      ? 'listing_nfe_30days'
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
    const isTemporary = isAbort || errorMessage.includes('temporariamente') || errorMessage.includes('SOAP-ERROR') || errorMessage.includes('Consumo redundante') || errorMessage.includes('consumo redundante');
    const userMessage = isAbort 
      ? 'A API do Omie demorou muito para responder. Tente novamente em alguns segundos.' 
      : errorMessage;
    return new Response(
      JSON.stringify({ error: userMessage, isTemporary }),
      { status: isTemporary ? 503 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
