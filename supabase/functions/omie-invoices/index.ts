import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const OMIE_API_URL = 'https://app.omie.com.br/api/v1';

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
      // Listar NF-e usando API ListarNF - estrutura simplificada
      const response = await fetch(`${OMIE_API_URL}/produtos/nfconsultar/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          call: 'ListarNF',
          app_key: OMIE_APP_KEY,
          app_secret: OMIE_APP_SECRET,
          param: [{
            pagina: page,
            registros_por_pagina: 50,
            apenas_importado_api: 'N',
          }],
        }),
      });

      const responseText = await response.text();
      console.log('Resposta Omie NFe:', responseText.substring(0, 500));

      let data;
      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error(`Erro ao parsear resposta Omie: ${responseText.substring(0, 200)}`);
      }
      
      if (data.faultstring) {
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
      const response = await fetch(`${OMIE_API_URL}/produtos/cupomfiscalconsultar/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          call: 'ListarCupom',
          app_key: OMIE_APP_KEY,
          app_secret: OMIE_APP_SECRET,
          param: [{
            nPagina: page,
            nRegPorPagina: 50,
          }],
        }),
      });

      const responseText = await response.text();
      console.log('Resposta Omie NFCe:', responseText.substring(0, 500));

      let data;
      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error(`Erro ao parsear resposta Omie: ${responseText.substring(0, 200)}`);
      }
      
      if (data.faultstring) {
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
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
