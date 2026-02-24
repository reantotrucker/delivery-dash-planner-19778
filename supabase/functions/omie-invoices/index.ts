import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const OMIE_API_URL = 'https://app.omie.com.br/api/v1';

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 2, timeoutMs = 15000): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      return response;
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
  throw lastError || new Error('Falha após múltiplas tentativas');
}

async function fetchClientDetails(
  clientId: number,
  appKey: string,
  appSecret: string
): Promise<{ name: string; street: string; number: string; complement: string; neighborhood: string; city: string; state: string; cep: string } | null> {
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
    if (data.faultstring) return null;
    return {
      name: data.razao_social || data.nome_fantasia || '',
      street: data.endereco || '',
      number: data.endereco_numero || '',
      complement: data.complemento || '',
      neighborhood: data.bairro || '',
      city: data.cidade || '',
      state: data.estado || '',
      cep: data.cep || '',
    };
  } catch (e) {
    console.log(`Erro ao buscar cliente ${clientId}:`, e);
    return null;
  }
}

async function fetchOrderDetails(
  orderId: number,
  appKey: string,
  appSecret: string
): Promise<{ obs: string; vendedorCode: number }> {
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
    if (orderData.faultstring) {
      console.log(`Pedido ${orderId} fault: ${orderData.faultstring}`);
      return { obs: '', vendedorCode: 0 };
    }
    const pvp = orderData.pedido_venda_produto;
    const obs = pvp?.observacoes?.obs_venda || pvp?.obs_venda || pvp?.informacoes_adicionais?.obs_venda || '';
    const vendedorCode = pvp?.informacoes_adicionais?.codVend || pvp?.cabecalho?.codigo_vendedor || 0;
    return { obs, vendedorCode };
  } catch (e) {
    console.log(`Erro pedido ${orderId}:`, e);
    return { obs: '', vendedorCode: 0 };
  }
}

async function fetchVendedorNames(
  codes: number[],
  appKey: string,
  appSecret: string
): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (codes.length === 0) return map;
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
  } catch (e) {
    console.log('Erro ao buscar vendedores:', e);
  }
  return map;
}

// Process batches with concurrency limit
async function processBatches<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
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

    const { type, page = 1, fetchLastPage = false } = await req.json();

    if (!type || !['nfe', 'nfce'].includes(type)) {
      throw new Error('Tipo inválido. Use "nfe" ou "nfce".');
    }

    let result;

    if (type === 'nfe') {
      let actualPage = page;
      let data: any = null;

      if (fetchLastPage && page === 1) {
        // First call to discover total pages - we'll reuse this data if it's the only page
        const discoverBody = {
          call: 'ListarNF',
          app_key: OMIE_APP_KEY,
          app_secret: OMIE_APP_SECRET,
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
          // Only 1 page — reuse the data we already have, no second call needed
          data = discoverData;
          console.log('NFe: apenas 1 página, reutilizando dados.');
        } else {
          // Need to fetch the last page — wait to avoid rate limit
          console.log(`NFe: ${totalPages} páginas. Aguardando antes de buscar página ${actualPage}...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      // Only fetch if we don't already have data
      if (!data) {
        const requestBody = {
          call: 'ListarNF',
          app_key: OMIE_APP_KEY,
          app_secret: OMIE_APP_SECRET,
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

      // Filter invoices first to avoid unnecessary API calls
      const validInvoices = (data.nfCadastro || []).filter((nf: any) => {
        const status = nf.ide?.cSitNFe;
        const isNotCanceled = status !== 'C' && status !== 'CANCELADA';
        const isSaida = nf.ide?.tpNF === '1' || nf.ide?.tpNF === 1;
        return isNotCanceled && isSaida;
      });

      // Collect unique order IDs and client IDs from filtered invoices only
      const orderIdSet = new Set<number>();
      const clientIdSet = new Set<number>();
      validInvoices.forEach((nf: any) => {
        if (nf.compl?.nIdPedido && nf.compl.nIdPedido > 0) orderIdSet.add(nf.compl.nIdPedido);
        if (nf.nfDestInt?.nCodCli) clientIdSet.add(nf.nfDestInt.nCodCli);
      });

      const uniqueOrderIds = [...orderIdSet];
      const uniqueClientIds = [...clientIdSet];

      // Fetch orders AND clients in parallel (biggest optimization)
      console.log(`Buscando ${uniqueOrderIds.length} pedidos e ${uniqueClientIds.length} clientes em paralelo...`);
      
      const [orderResults, clientResults] = await Promise.all([
        // Fetch order details (obs + vendedor code) - batch of 15
        processBatches(uniqueOrderIds, 15, (orderId) =>
          fetchOrderDetails(orderId, OMIE_APP_KEY, OMIE_APP_SECRET).then(r => ({ orderId, ...r }))
        ),
        // Fetch client addresses - batch of 15
        processBatches(uniqueClientIds, 15, (clientId) =>
          fetchClientDetails(clientId, OMIE_APP_KEY, OMIE_APP_SECRET).then(r => ({ clientId, details: r }))
        ),
      ]);

      const orderObservations = new Map<number, string>();
      const orderVendedorCodes = new Map<number, number>();
      orderResults.forEach(({ orderId, obs, vendedorCode }) => {
        if (obs) orderObservations.set(orderId, obs);
        if (vendedorCode) orderVendedorCodes.set(orderId, vendedorCode);
      });

      const clientAddresses = new Map<number, any>();
      clientResults.forEach(({ clientId, details }) => {
        if (details) clientAddresses.set(clientId, details);
      });

      // Fetch vendedor names
      const uniqueVendedorCodes = [...new Set(orderVendedorCodes.values())].filter(Boolean);
      const vendedorCodeToName = await fetchVendedorNames(uniqueVendedorCodes, OMIE_APP_KEY, OMIE_APP_SECRET);

      // Build orderId -> vendedorName map
      const orderVendedorNames = new Map<number, string>();
      orderVendedorCodes.forEach((code, orderId) => {
        const name = vendedorCodeToName.get(code);
        if (name) orderVendedorNames.set(orderId, name);
      });

      // Map invoices
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

      result = {
        type: 'nfe',
        page: data.pagina || page,
        totalPages: data.total_de_paginas || 1,
        totalRecords: data.total_de_registros || 0,
        invoices,
      };
    } else {
      // NFC-e
      const actualPage = page;
      const requestBody = {
        call: 'CuponsFiscais',
        app_key: OMIE_APP_KEY,
        app_secret: OMIE_APP_SECRET,
        param: [{ nPagina: actualPage, nRegPorPagina: 50 }],
      };

      console.log('Chamando API Omie NFCe, página:', actualPage);

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

      // Map initial invoices
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

      // Collect unique IDs
      const uniqueClientIds = [...new Set(nfceInvoices.map((inv: any) => inv.clientId).filter(Boolean))] as number[];
      const nfceOrderIds = [...new Set(nfceInvoices.map((inv: any) => inv.orderId).filter((id: number) => id > 0))] as number[];

      // Fetch clients AND orders in parallel
      console.log(`NFCe: Buscando ${uniqueClientIds.length} clientes e ${nfceOrderIds.length} pedidos em paralelo...`);
      
      const [clientResults, orderResults] = await Promise.all([
        processBatches(uniqueClientIds, 15, (clientId) =>
          fetchClientDetails(clientId, OMIE_APP_KEY, OMIE_APP_SECRET).then(r => ({ clientId, details: r }))
        ),
        processBatches(nfceOrderIds, 15, (orderId) =>
          fetchOrderDetails(orderId, OMIE_APP_KEY, OMIE_APP_SECRET).then(r => ({ orderId, ...r }))
        ),
      ]);

      // Apply client addresses
      const clientAddresses = new Map<number, any>();
      clientResults.forEach(({ clientId, details }) => {
        if (details) clientAddresses.set(clientId, details);
      });
      for (const inv of nfceInvoices) {
        if (inv.clientId && clientAddresses.has(inv.clientId)) {
          const clientData = clientAddresses.get(inv.clientId);
          inv.address = clientData;
          if (!inv.clientName && clientData?.name) inv.clientName = clientData.name;
        }
      }

      // Apply order observations and vendedor
      const orderObservations = new Map<number, string>();
      const orderVendedorCodes = new Map<number, number>();
      orderResults.forEach(({ orderId, obs, vendedorCode }) => {
        if (obs) orderObservations.set(orderId, obs);
        if (vendedorCode) orderVendedorCodes.set(orderId, vendedorCode);
      });

      // Fetch vendedor names
      const uniqueVendedorCodes = [...new Set(orderVendedorCodes.values())].filter(Boolean);
      const vendedorCodeToName = await fetchVendedorNames(uniqueVendedorCodes, OMIE_APP_KEY, OMIE_APP_SECRET);

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

      result = {
        type: 'nfce',
        page: data.nPagina || actualPage,
        totalPages: data.nTotPaginas || 1,
        totalRecords: data.nTotRegistros || 0,
        invoices: nfceInvoices,
      };
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Erro na edge function omie-invoices:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    const isTemporary = errorMessage.includes('temporariamente') || errorMessage.includes('SOAP-ERROR');
    return new Response(
      JSON.stringify({ error: errorMessage, isTemporary }),
      { status: isTemporary ? 503 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
