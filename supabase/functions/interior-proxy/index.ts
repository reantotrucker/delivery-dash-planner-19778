import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const UPSTREAM = "https://lrdiymbaladmmoczifnd.supabase.co/functions/v1/interior-pedidos";
const ACOES = new Set(["listar", "detalhe", "salvar_conferencia", "enviar_omie", "relatorio", "excluir"]);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Não autenticado" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) return json({ error: "Não autenticado" }, 401);
    const userId = claimsData.claims.sub as string;
    const email = (claimsData.claims.email as string) || "";

    // Somente usuários com acesso à Stock 360
    const { data: stock } = await supabase
      .from("companies")
      .select("id")
      .eq("slug", "stock360")
      .maybeSingle();
    if (!stock?.id) return json({ error: "Acesso permitido somente para a Stock 360" }, 403);
    const { data: allowed } = await supabase.rpc("has_company_access", {
      _user_id: userId,
      _company_id: stock.id,
    });
    if (!allowed) return json({ error: "Acesso permitido somente para a Stock 360" }, 403);

    const apiKey = Deno.env.get("INTERIOR_API_KEY");
    if (!apiKey) return json({ error: "Chave de integração não configurada" }, 500);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Corpo inválido" }, 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return json({ error: "Corpo inválido" }, 400);
    }
    const acao = body.acao;
    if (typeof acao !== "string" || !ACOES.has(acao)) {
      return json({ error: "Ação inválida" }, 400);
    }

    // Nome do usuário logado (perfil) ou e-mail
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", userId)
      .maybeSingle();
    const usuario = (profile?.full_name && profile.full_name.trim()) || profile?.email || email || userId;

    // Exclusão (somente admin): o pedido sai da lista e dos relatórios deste app
    if (acao === "excluir") {
      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
      if (!isAdmin) return json({ error: "Somente o administrador pode excluir pedidos" }, 403);
      const pedidoId = typeof body.pedido_id === "string" ? body.pedido_id.trim() : "";
      if (!pedidoId || pedidoId.length > 100) return json({ error: "Pedido inválido" }, 400);
      const str = (v: unknown, max: number) =>
        v == null ? null : String(v).slice(0, max) || null;
      const { error: insErr } = await supabase.from("interior_excluded_orders").upsert(
        {
          pedido_id: pedidoId,
          numero_pedido: str(body.numero_pedido, 50),
          cliente: str(body.cliente, 200),
          motivo: str(body.motivo, 500),
          excluded_by: userId,
          excluded_by_name: String(usuario).slice(0, 200),
        },
        { onConflict: "pedido_id", ignoreDuplicates: true },
      );
      if (insErr) return json({ error: insErr.message }, 400);
      return json({ success: true });
    }

    const callUpstream = (b: Record<string, unknown>) =>
      fetch(UPSTREAM, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-interior-key": apiKey },
        body: JSON.stringify({ ...b, usuario }),
      });

    // Antes de enviar: a Omie recusa itens excluídos sem quantidade quando o Stock360 Vendas
    // altera o pedido. Aqui apagamos na Omie os itens retirados na conferência; depois o
    // envio normal só ajusta quantidades e volumes.
    if (acao === "enviar_omie") {
      try {
        const msg = await removerItensExcluidosNaOmie(callUpstream, String(body.pedido_id ?? ""));
        if (msg) return json({ success: false, error: msg });
      } catch (e) {
        return json({ success: false, error: (e as Error).message || "Erro ao preparar o pedido na Omie" });
      }
    }

    const upstream = await callUpstream(body);
    const text = await upstream.text();

    // Remove pedidos excluídos pelo admin da lista e dos relatórios
    if (upstream.ok && (acao === "listar" || acao === "relatorio")) {
      try {
        const parsed = JSON.parse(text || "{}");
        const { data: excl } = await supabase.from("interior_excluded_orders").select("pedido_id");
        const ids = new Set((excl || []).map((e: { pedido_id: string }) => String(e.pedido_id)));
        if (ids.size && parsed && typeof parsed === "object") {
          if (Array.isArray(parsed.pedidos)) {
            parsed.pedidos = parsed.pedidos.filter((p: { id?: unknown }) => !ids.has(String(p?.id)));
          }
          if (Array.isArray(parsed.alteracoes)) {
            parsed.alteracoes = parsed.alteracoes.filter(
              (a: { pedido_id?: unknown }) => !a?.pedido_id || !ids.has(String(a.pedido_id)),
            );
          }
        }
        return json(parsed, upstream.status);
      } catch {
        /* resposta não-JSON: repassa como veio */
      }
    }

    return new Response(text || "{}", {
      status: upstream.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return json({ error: (e as Error).message || "Erro inesperado" }, 500);
  }
});

// ---------------- Omie (Stock 360) ----------------
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

async function omieCall(call: string, param: Record<string, unknown>) {
  const app_key = Deno.env.get("OMIE_APP_KEY");
  const app_secret = Deno.env.get("OMIE_APP_SECRET");
  if (!app_key || !app_secret) throw new Error("Chave da Omie da Stock 360 não configurada");
  let last = "";
  for (let i = 0; i < 3; i++) {
    const r = await fetch("https://app.omie.com.br/api/v1/produtos/pedido/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call, app_key, app_secret, param: [param] }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok && !j?.faultstring) return j;
    last = j?.faultstring || `Omie ${r.status}`;
    if (!/consumo redundante|bloqueada|tente novamente|limite/i.test(last)) break;
    await new Promise((res) => setTimeout(res, 3000));
  }
  throw new Error(last);
}

/** Retorna mensagem de erro para o usuário, ou null se pode seguir com o envio. */
async function removerItensExcluidosNaOmie(
  callUpstream: (b: Record<string, unknown>) => Promise<Response>,
  pedidoId: string,
): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/i.test(pedidoId)) return null;
  const det = await callUpstream({ acao: "detalhe", pedido_id: pedidoId });
  const dj = await det.json().catch(() => null);
  const pedido = dj?.pedido;
  if (!pedido?.numero_pedido_omie || pedido.status !== "conferido") return null;
  const itens: any[] = Array.isArray(pedido.itens) ? pedido.itens : [];
  if (!itens.length || itens.some((i) => i?.omie_codigo_item == null)) return null;
  const mantidos = new Set(itens.map((i) => String(i.omie_codigo_item)));

  const atual = (await omieCall("ConsultarPedido", { numero_pedido: String(pedido.numero_pedido_omie) }))
    ?.pedido_venda_produto;
  const cab = atual?.cabecalho;
  const detOmie: any[] = Array.isArray(atual?.det) ? atual.det : [];
  if (!cab?.codigo_pedido || !detOmie.length) return null;

  // Segurança: o pedido da Omie precisa ser o mesmo (mesmos itens) do app
  const codigosOmie = new Set(detOmie.map((d) => String(d?.ide?.codigo_item ?? "")));
  if (![...mantidos].every((c) => codigosOmie.has(c))) return null;
  if (num(cab.etapa) >= 60) return null; // faturado: o envio normal já avisa

  const excluir = detOmie.filter((d) => !mantidos.has(String(d?.ide?.codigo_item ?? "")));
  if (!excluir.length) return null;

  const detAlt = detOmie.map((d) => {
    const prod = d?.produto ?? {};
    const produto: Record<string, unknown> = {
      codigo_produto: prod.codigo_produto,
      quantidade: num(prod.quantidade),
      valor_unitario: num(prod.valor_unitario),
    };
    if (prod.cfop) produto.cfop = prod.cfop;
    if (String(prod.tipo_desconto).toUpperCase() === "P" && num(prod.percentual_desconto) > 0) {
      produto.tipo_desconto = "P";
      produto.percentual_desconto = num(prod.percentual_desconto);
    } else if (num(prod.valor_desconto) > 0) {
      produto.tipo_desconto = "V";
      produto.valor_desconto = num(prod.valor_desconto);
    }
    const sai = !mantidos.has(String(d?.ide?.codigo_item ?? ""));
    return { ide: sai ? { codigo_item: d.ide.codigo_item, acao_item: "E" } : { codigo_item: d.ide.codigo_item }, produto };
  });

  console.log(`Excluindo ${excluir.length} item(ns) do pedido Omie ${cab.numero_pedido}`);
  try {
    await omieCall("AlterarPedidoVenda", {
      cabecalho: {
        codigo_pedido: cab.codigo_pedido,
        codigo_cliente: cab.codigo_cliente,
        data_previsao: cab.data_previsao,
        etapa: cab.etapa,
        codigo_parcela: cab.codigo_parcela,
        quantidade_itens: detAlt.length - excluir.length,
      },
      det: detAlt,
    });
  } catch (e) {
    return `A Omie não aceitou excluir os itens retirados do pedido ${cab.numero_pedido}. [detalhe: ${(e as Error).message}]`;
  }
  return null;
}
