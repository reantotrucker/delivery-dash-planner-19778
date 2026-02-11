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
): Promise<{ street: string; number: string; complement: string; neighborhood: string; city: string; state: string; cep: string } | null> {
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

      // Map invoices with nfDestInt for client name/cpf
      const invoices = (data.nfCadastro || []).map((nf: any) => ({
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
        orderId: nf.compl?.nIdPedido,
        orderObservation: nf.infAdic?.infCpl || '',
        products: (nf.det || []).map((item: any) => ({
          name: item.prod?.xProd || '',
          quantity: item.prod?.qCom || 0,
          unit: item.prod?.uCom || '',
          unitValue: item.prod?.vUnCom || 0,
          totalValue: item.prod?.vProd || 0,
          code: item.prod?.cProd || '',
        })),
      })).reverse();

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
      let actualPage = page;

      if (fetchLastPage && page === 1) {
        const discoverBody = {
          call: 'CuponsFiscais',
          app_key: OMIE_APP_KEY,
          app_secret: OMIE_APP_SECRET,
          param: [{ nPagina: 1, nRegPorPagina: 50 }],
        };
        const discoverRes = await fetchWithRetry(`${OMIE_API_URL}/produtos/cupomfiscalconsultar/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(discoverBody),
        });
        const discoverData = await discoverRes.json();
        console.log('NFCe discover:', JSON.stringify(discoverData).substring(0, 300));
        if (discoverData.nTotPaginas && discoverData.nTotPaginas > 1) {
          actualPage = discoverData.nTotPaginas;
        }
      }

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
      
      result = {
        type: 'nfce',
        page: data.nPagina || actualPage,
        totalPages: data.nTotPaginas || 1,
        totalRecords: data.nTotRegistros || 0,
        invoices: cupons.map((cupom: any) => ({
          id: cupom.cabecalhoCupom?.nIdCupom || String(Math.random()),
          number: cupom.cabecalhoCupom?.nNumCupom,
          series: cupom.cabecalhoCupom?.nSerieCupom,
          emissionDate: cupom.cabecalhoCupom?.dDtEmissaoCupom,
          clientId: cupom.cabecalhoCupom?.idCliente,
          clientName: cupom.cliente?.razao_social || cupom.cliente?.nome_fantasia || '',
          clientCpfCnpj: cupom.cliente?.cnpj_cpf || '',
          address: cupom.cliente?.endereco ? {
            street: cupom.cliente.endereco,
            number: cupom.cliente.endereco_numero,
            complement: cupom.cliente.complemento,
            neighborhood: cupom.cliente.bairro,
            city: cupom.cliente.cidade,
            state: cupom.cliente.estado,
            cep: cupom.cliente.cep,
          } : null,
          totalValue: cupom.cabecalhoCupom?.nValorCupom || 0,
          accessKey: cupom.cabecalhoCupom?.cChaveCupom,
        })),
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
