import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const OMIE_API_URL = 'https://app.omie.com.br/api/v1';

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (error) {
      lastError = error as Error;
      console.log(`Tentativa ${attempt + 1} falhou, aguardando...`);
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
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

      if (fetchLastPage && page === 1) {
        const discoverBody = {
          call: 'ListarNF',
          app_key: OMIE_APP_KEY,
          app_secret: OMIE_APP_SECRET,
          param: [{ pagina: 1, registros_por_pagina: 50, apenas_importado_api: 'N' }],
        };
        const discoverRes = await fetchWithRetry(`${OMIE_API_URL}/produtos/nfconsultar/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(discoverBody),
        });
        const discoverData = await discoverRes.json();
        if (discoverData.total_de_paginas) {
          actualPage = discoverData.total_de_paginas;
        }
      }

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
        throw new Error(`Omie NFe: ${data.faultstring}`);
      }

      // Collect order IDs to fetch observations from pedidos de venda
      const orderIdSet = new Set<number>();
      (data.nfCadastro || []).forEach((nf: any) => {
        if (nf.compl?.nIdPedido && nf.compl.nIdPedido > 0) orderIdSet.add(nf.compl.nIdPedido);
      });

      const orderObservations = new Map<number, string>();
      const orderVendedorCodes = new Map<number, number>(); // orderId -> vendedor code
      const uniqueOrderIds = [...orderIdSet];
      if (uniqueOrderIds.length > 0) {
        console.log(`Buscando observações de ${uniqueOrderIds.length} pedidos...`);
        for (let i = 0; i < uniqueOrderIds.length; i += 5) {
          const batch = uniqueOrderIds.slice(i, i + 5);
          const results = await Promise.all(
            batch.map(async (orderId) => {
              try {
                const body = {
                  call: 'ConsultarPedido',
                  app_key: OMIE_APP_KEY,
                  app_secret: OMIE_APP_SECRET,
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
                  return { orderId, obs: '', vendedorCode: 0 };
                }
                const pvp = orderData.pedido_venda_produto;
                const obs = pvp?.observacoes?.obs_venda
                  || pvp?.obs_venda
                  || pvp?.informacoes_adicionais?.obs_venda
                  || '';
                // codVend is in informacoes_adicionais
                const vendedorCode = pvp?.informacoes_adicionais?.codVend
                  || pvp?.cabecalho?.codigo_vendedor
                  || 0;
                return { orderId, obs, vendedorCode };
              } catch (e) {
                console.log(`Erro pedido ${orderId}:`, e);
                return { orderId, obs: '', vendedorCode: 0 };
              }
            })
          );
          results.forEach(({ orderId, obs, vendedorCode }) => {
            if (obs) orderObservations.set(orderId, obs);
            if (vendedorCode) orderVendedorCodes.set(orderId, vendedorCode);
          });
        }
      }

      // Fetch all vendedores in one call and build a code->name map
      const vendedorCodeToName = new Map<number, string>();
      const uniqueVendedorCodes = [...new Set(orderVendedorCodes.values())].filter(Boolean);
      if (uniqueVendedorCodes.length > 0) {
        try {
          console.log(`Buscando lista de vendedores para códigos: ${uniqueVendedorCodes.join(', ')}`);
          const vendBody = {
            call: 'ListarVendedores',
            app_key: OMIE_APP_KEY,
            app_secret: OMIE_APP_SECRET,
            param: [{ pagina: 1, registros_por_pagina: 100 }],
          };
          const vendRes = await fetchWithRetry(`${OMIE_API_URL}/geral/vendedores/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(vendBody),
          });
          const vendData = await vendRes.json();
          console.log('Resposta ListarVendedores:', JSON.stringify(vendData).substring(0, 500));
          const vendedores = vendData.cadastro || vendData.vendedores || vendData.lista_vendedores || [];
          vendedores.forEach((v: any) => {
            const code = v.codigo || v.nCodigo || v.id;
            const name = v.nome || v.cNome || v.razao_social || v.nomeVendedor;
            if (code && name) vendedorCodeToName.set(Number(code), name);
          });
          console.log(`Vendedores carregados: ${vendedorCodeToName.size}`);
        } catch (e) {
          console.log('Erro ao buscar vendedores:', e);
        }
      }

      // Build orderId -> vendedorName map
      const orderVendedorNames = new Map<number, string>();
      orderVendedorCodes.forEach((code, orderId) => {
        const name = vendedorCodeToName.get(code);
        if (name) orderVendedorNames.set(orderId, name);
      });

      // Map invoices with nfDestInt for client name/cpf
      const invoices = (data.nfCadastro || [])
        .filter((nf: any) => {
          const status = nf.ide?.cSitNFe;
          const isNotCanceled = status !== 'C' && status !== 'CANCELADA';
          // tpNF: '0' = entrada, '1' = saída — só queremos notas de saída emitidas por nós
          const isSaida = nf.ide?.tpNF === '1' || nf.ide?.tpNF === 1;
          return isNotCanceled && isSaida;
        })
        .map((nf: any) => {
        const orderId = nf.compl?.nIdPedido || 0;
        const orderObs = orderObservations.get(orderId) || '';
        const vendedorName = orderVendedorNames.get(orderId) || null;
        return {
          id: nf.compl?.nIdNF || nf.ide?.nNF || String(Math.random()),
          number: nf.ide?.nNF,
          series: nf.ide?.serie,
          emissionDate: nf.ide?.dEmi,
          clientId: nf.nfDestInt?.nCodCli,
          clientName: nf.nfDestInt?.cRazao || '',
          clientCpfCnpj: nf.nfDestInt?.cnpj_cpf || '',
          address: null as any,
          totalValue: nf.total?.ICMSTot?.vNF || 0,
          status: nf.ide?.cSitNFe,
          paymentMethod: nf.pag?.[0]?.tPag,
          accessKey: nf.compl?.cChaveNFe,
          orderId: orderId,
          orderObservation: orderObs,
          vendedorName: vendedorName,
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

      // Fetch client addresses in parallel (deduplicate by clientId)
      const uniqueClientIds = [...new Set(invoices.map((inv: any) => inv.clientId).filter(Boolean))] as number[];
      console.log(`Buscando endereços de ${uniqueClientIds.length} clientes...`);

      const clientAddresses = new Map<number, any>();
      // Fetch in batches of 5 to avoid overwhelming the API
      for (let i = 0; i < uniqueClientIds.length; i += 5) {
        const batch = uniqueClientIds.slice(i, i + 5);
        const results = await Promise.all(
          batch.map(id => fetchClientDetails(id, OMIE_APP_KEY, OMIE_APP_SECRET))
        );
        batch.forEach((id, idx) => {
          if (results[idx]) clientAddresses.set(id, results[idx]);
        });
      }

      // Attach addresses to invoices
      for (const inv of invoices) {
        if (inv.clientId && clientAddresses.has(inv.clientId)) {
          inv.address = clientAddresses.get(inv.clientId);
        }
      }

      result = {
        type: 'nfe',
        page: data.pagina || page,
        totalPages: data.total_de_paginas || 1,
        totalRecords: data.total_de_registros || 0,
        invoices,
      };
    } else {
      // NFC-e using CuponsFiscais on cupomfiscalconsultar endpoint
      // NFCe API returns newest first (page 1 = most recent), opposite of NF-e
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
      }));

      // Fetch client addresses in parallel
      const uniqueClientIds = [...new Set(nfceInvoices.map((inv: any) => inv.clientId).filter(Boolean))] as number[];
      if (uniqueClientIds.length > 0) {
        console.log(`NFCe: Buscando endereços de ${uniqueClientIds.length} clientes...`);
        const clientAddresses = new Map<number, any>();
        for (let i = 0; i < uniqueClientIds.length; i += 5) {
          const batch = uniqueClientIds.slice(i, i + 5);
          const results = await Promise.all(
            batch.map(id => fetchClientDetails(id, OMIE_APP_KEY, OMIE_APP_SECRET))
          );
          batch.forEach((id, idx) => {
            if (results[idx]) clientAddresses.set(id, results[idx]);
          });
        }
        for (const inv of nfceInvoices) {
          if (inv.clientId && clientAddresses.has(inv.clientId)) {
            const clientData = clientAddresses.get(inv.clientId);
            inv.address = clientData;
            if (!inv.clientName && clientData?.name) {
              inv.clientName = clientData.name;
            }
          }
        }
      }

      // Fetch order observations for NFC-e
      const nfceOrderIds = [...new Set(nfceInvoices.map((inv: any) => inv.orderId).filter((id: number) => id > 0))] as number[];
      if (nfceOrderIds.length > 0) {
        console.log(`NFCe: Buscando observações de ${nfceOrderIds.length} pedidos...`);
        const orderObservations = new Map<number, string>();
        for (let i = 0; i < nfceOrderIds.length; i += 5) {
          const batch = nfceOrderIds.slice(i, i + 5);
          const results = await Promise.all(
            batch.map(async (orderId) => {
              try {
                const body = {
                  call: 'ConsultarPedido',
                  app_key: OMIE_APP_KEY,
                  app_secret: OMIE_APP_SECRET,
                  param: [{ codigo_pedido: orderId }],
                };
                const res = await fetchWithRetry(`${OMIE_API_URL}/produtos/pedido/`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(body),
                });
                const orderData = await res.json();
                if (orderData.faultstring) return { orderId, obs: '' };
                const pvp = orderData.pedido_venda_produto;
                const obs = pvp?.observacoes?.obs_venda || '';
                return { orderId, obs };
              } catch {
                return { orderId, obs: '' };
              }
            })
          );
          results.forEach(({ orderId, obs }) => {
            if (obs) orderObservations.set(orderId, obs);
          });
        }
        for (const inv of nfceInvoices) {
          if (inv.orderId > 0 && orderObservations.has(inv.orderId)) {
            inv.orderObservation = orderObservations.get(inv.orderId) || '';
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
