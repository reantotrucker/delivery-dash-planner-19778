import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const OMIE_API_URL = 'https://app.omie.com.br/api/v1';

// Helper function to fetch with retry
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (error) {
      lastError = error as Error;
      console.log(`Tentativa ${attempt + 1} falhou, aguardando...`);
      // Wait with exponential backoff
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
  
  throw lastError || new Error('Falha após múltiplas tentativas');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OMIE_APP_KEY = Deno.env.get('OMIE_APP_KEY');
    const OMIE_APP_SECRET = Deno.env.get('OMIE_APP_SECRET');

    if (!OMIE_APP_KEY) {
      throw new Error('OMIE_APP_KEY não configurada');
    }
    if (!OMIE_APP_SECRET) {
      throw new Error('OMIE_APP_SECRET não configurada');
    }

    const { type, page = 1 } = await req.json();

    if (!type || !['nfe', 'nfce'].includes(type)) {
      throw new Error('Tipo inválido. Use "nfe" ou "nfce".');
    }

    let result;

    if (type === 'nfe') {
      // Listar NF-e usando API ListarNF
      const requestBody = {
        call: 'ListarNF',
        app_key: OMIE_APP_KEY,
        app_secret: OMIE_APP_SECRET,
        param: [{
          pagina: page,
          registros_por_pagina: 50,
          apenas_importado_api: 'N',
        }],
      };

      console.log('Chamando API Omie NFe, página:', page);

      const response = await fetchWithRetry(`${OMIE_API_URL}/produtos/nfconsultar/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const responseText = await response.text();
      console.log('Status HTTP:', response.status);
      console.log('Resposta Omie NFe (primeiros 300 chars):', responseText.substring(0, 300));

      let data;
      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error(`Erro ao parsear resposta Omie: ${responseText.substring(0, 200)}`);
      }
      
      // Handle SOAP errors with more context
      if (data.faultstring) {
        if (data.faultstring.includes('SOAP-ERROR') || data.faultstring.includes('Unexpected')) {
          throw new Error(`API Omie temporariamente indisponível. Tente novamente em alguns segundos.`);
        }
        throw new Error(`Omie NFe: ${data.faultstring}`);
      }

      result = {
        type: 'nfe',
        page: data.pagina || page,
        totalPages: data.total_de_paginas || 1,
        totalRecords: data.total_de_registros || 0,
        invoices: (data.nfCadastro || []).map((nf: any) => ({
          id: nf.compl?.nIdNF || nf.ide?.nNF || String(Math.random()),
          number: nf.ide?.nNF,
          series: nf.ide?.serie,
          emissionDate: nf.ide?.dEmi,
          clientId: nf.dest?.nCodCli,
          clientName: nf.dest?.xNome,
          clientCpfCnpj: nf.dest?.CNPJ || nf.dest?.CPF,
          address: nf.dest?.enderDest ? {
            street: nf.dest.enderDest.xLgr,
            number: nf.dest.enderDest.nro,
            complement: nf.dest.enderDest.xCpl,
            neighborhood: nf.dest.enderDest.xBairro,
            city: nf.dest.enderDest.xMun,
            state: nf.dest.enderDest.UF,
            cep: nf.dest.enderDest.CEP,
          } : null,
          totalValue: nf.total?.ICMSTot?.vNF || 0,
          status: nf.ide?.cSitNFe,
          paymentMethod: nf.pag?.[0]?.tPag,
          accessKey: nf.compl?.cChaveNFe,
          orderId: nf.compl?.nIdPedido,
        })),
      };
    } else {
      // Listar NFC-e usando API CuponsFiscais
      const requestBody = {
        call: 'ListarCupom',
        app_key: OMIE_APP_KEY,
        app_secret: OMIE_APP_SECRET,
        param: [{
          nPagina: page,
          nRegPorPagina: 50,
        }],
      };

      console.log('Chamando API Omie NFCe, página:', page);

      const response = await fetchWithRetry(`${OMIE_API_URL}/produtos/cupomfiscalconsultar/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const responseText = await response.text();
      console.log('Status HTTP:', response.status);
      console.log('Resposta Omie NFCe (primeiros 300 chars):', responseText.substring(0, 300));

      let data;
      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error(`Erro ao parsear resposta Omie: ${responseText.substring(0, 200)}`);
      }
      
      // Handle SOAP errors with more context
      if (data.faultstring) {
        if (data.faultstring.includes('SOAP-ERROR') || data.faultstring.includes('Unexpected')) {
          throw new Error(`API Omie temporariamente indisponível. Tente novamente em alguns segundos.`);
        }
        throw new Error(`Omie NFCe: ${data.faultstring}`);
      }

      result = {
        type: 'nfce',
        page: data.nPagina || page,
        totalPages: data.nTotPaginas || 1,
        totalRecords: data.nTotRegistros || 0,
        invoices: (data.cupons || []).map((cupom: any) => ({
          id: cupom.cabecalhoCupom?.nIdCupom || String(Math.random()),
          number: cupom.cabecalhoCupom?.nNumCupom,
          series: cupom.cabecalhoCupom?.nSerieCupom,
          emissionDate: cupom.cabecalhoCupom?.dDtEmissaoCupom,
          emissionTime: cupom.cabecalhoCupom?.cHrEmisaoCupom,
          clientId: cupom.cabecalhoCupom?.idCliente,
          clientName: cupom.cliente?.razao_social || cupom.cliente?.nome_fantasia,
          clientCpfCnpj: cupom.cliente?.cnpj_cpf,
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
          model: cupom.cabecalhoCupom?.cModeloCupom,
          accessKey: cupom.cabecalhoCupom?.cChaveCupom,
          sellerId: cupom.cabecalhoCupom?.idVendedor,
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
      JSON.stringify({ 
        error: errorMessage,
        isTemporary,
      }),
      { 
        status: isTemporary ? 503 : 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
