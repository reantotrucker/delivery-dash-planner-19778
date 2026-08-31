// Função temporária de diagnóstico: procura a pré-venda / pedido de um cupom NFC-e
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OMIE_API_URL = "https://app.omie.com.br/api/v1";
const APP_KEY = Deno.env.get("OMIE_APP_KEY_UNIPRINT")!;
const APP_SECRET = Deno.env.get("OMIE_APP_SECRET_UNIPRINT")!;

async function omie(path: string, call: string, param: unknown) {
  const res = await fetch(`${OMIE_API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ call, app_key: APP_KEY, app_secret: APP_SECRET, param: [param] }),
  });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 500) }; }
  return { status: res.status, json };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const body = await req.json().catch(() => ({}));
  const date = body.date || "31/08/2026";
  const out: Record<string, unknown> = {};

  // 1) Pedidos de venda do dia (pré-vendas do PDV podem aparecer aqui)
  const pedidos = await omie("/produtos/pedido/", "ListarPedidos", {
    pagina: 1,
    registros_por_pagina: 50,
    apenas_importado_api: "N",
    filtrar_por_data_de: date,
    filtrar_por_data_ate: date,
  });
  out.pedidos_status = pedidos.status;
  out.pedidos_fault = pedidos.json?.faultstring || null;
  out.pedidos = (pedidos.json?.pedido_venda_produto || []).map((p: any) => ({
    numero: p?.cabecalho?.numero_pedido,
    codigo: p?.cabecalho?.codigo_pedido,
    etapa: p?.cabecalho?.etapa,
    cliente: p?.cabecalho?.codigo_cliente,
    total: p?.total_pedido?.valor_total_pedido,
    obs: p?.observacoes?.obs_venda || p?.informacoes_adicionais?.obs_venda || "",
  }));

  // 2) Consulta direta de um número de pré-venda informado
  if (body.numero) {
    const cons = await omie("/produtos/pedido/", "ConsultarPedido", { numero_pedido: String(body.numero) });
    out.consulta_numero_fault = cons.json?.faultstring || null;
    out.consulta_numero = cons.json?.pedido_venda_produto
      ? {
          numero: cons.json.pedido_venda_produto?.cabecalho?.numero_pedido,
          etapa: cons.json.pedido_venda_produto?.cabecalho?.etapa,
          total: cons.json.pedido_venda_produto?.total_pedido?.valor_total_pedido,
          obs: cons.json.pedido_venda_produto?.observacoes?.obs_venda || "",
        }
      : null;
  }

  return new Response(JSON.stringify(out, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
