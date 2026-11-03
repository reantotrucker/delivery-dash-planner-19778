import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const UPSTREAM = "https://lrdiymbaladmmoczifnd.supabase.co/functions/v1/interior-pedidos";
const REABRIVEIS = new Set(["conferido", "enviado", "enviado_omie"]);
const ACOES = new Set(["listar", "detalhe", "salvar_conferencia", "enviar_omie", "relatorio", "excluir", "reabrir"]);

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

    // Volume é obrigatório na conferência
    if (acao === "salvar_conferencia") {
      const vol = Number(body.qtd_volumes);
      if (!Number.isInteger(vol) || vol < 1) {
        return json({ error: "Informe a quantidade de volumes" }, 400);
      }
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
      const { data: re } = await supabase
        .from("interior_reopened_orders")
        .select("pedido_id")
        .eq("pedido_id", String(body.pedido_id ?? ""))
        .maybeSingle();
      if (re) return json({ success: false, error: "Este pedido voltou para conferência. Salve a nova conferência antes de enviar." });
      try {
        const msg = await removerItensExcluidosNaOmie(callUpstream, String(body.pedido_id ?? ""));
        if (msg) return json({ success: false, error: msg });
      } catch (e) {
        return json({ success: false, error: (e as Error).message || "Erro ao preparar o pedido na Omie" });
      }
    }

    // Pedidos conferidos (ainda não enviados) que voltaram para conferir de novo
    const carregarReabertos = async () => {
      const { data } = await supabase
        .from("interior_reopened_orders")
        .select("pedido_id, reopened_by_name, reopened_at, motivo");
      return new Map((data || []).map((r: any) => [String(r.pedido_id), r]));
    };

    // Refazer conferência: só para pedido conferido que ainda não foi para a Omie
    if (acao === "reabrir") {
      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
      const { data: isComercial } = await supabase.rpc("has_role", { _user_id: userId, _role: "comercial" });
      if (isComercial && !isAdmin) return json({ error: "O comercial não pode refazer conferências" }, 403);
      const pedidoId = typeof body.pedido_id === "string" ? body.pedido_id.trim() : "";
      if (!/^[0-9a-f-]{36}$/i.test(pedidoId)) return json({ error: "Pedido inválido" }, 400);
      const det = await callUpstream({ acao: "detalhe", pedido_id: pedidoId });
      const dj = await det.json().catch(() => null);
      const p = dj?.pedido;
      if (!p) return json({ error: "Pedido não encontrado" }, 404);
      if (!REABRIVEIS.has(String(p.status))) {
        return json({ error: "Só dá para refazer a conferência de pedido conferido ou enviado à Omie" }, 409);
      }
      if (p.status !== "conferido" && p.numero_pedido_omie) {
        try {
          const fat = await consultarFaturamento(String(p.numero_pedido_omie));
          if (fat.faturado) {
            return json({ error: "Este pedido já foi faturado na Omie. A correção precisa ser feita direto na Omie." }, 409);
          }
        } catch (e) {
          return json({ error: `Não consegui confirmar na Omie se o pedido foi faturado. Tente de novo. [${(e as Error).message}]` }, 502);
        }
      }
      const str = (v: unknown, max: number) => (v == null ? null : String(v).slice(0, max) || null);
      const { error: insErr } = await supabase.from("interior_reopened_orders").upsert(
        {
          pedido_id: pedidoId,
          numero_pedido: str(p.numero_pedido, 50),
          motivo: str(body.motivo, 500),
          reopened_by: userId,
          reopened_by_name: String(usuario).slice(0, 200),
          reopened_at: new Date().toISOString(),
        },
        { onConflict: "pedido_id" },
      );
      if (insErr) return json({ error: insErr.message }, 400);
      return json({ success: true });
    }

    // Lista de "Recebidos" também traz os conferidos que voltaram para conferência
    let upstreamBody: Record<string, unknown> = body;
    let reabertos: Map<string, any> | null = null;
    if (acao === "listar" || acao === "detalhe") {
      reabertos = await carregarReabertos();
      const st = Array.isArray(body.status) ? body.status.map(String) : [];
      if (acao === "listar" && st.includes("aguardando_conferencia") && reabertos.size && !st.includes("conferido")) {
        upstreamBody = { ...body, status: [...new Set([...st, ...REABRIVEIS])] };
      }
    }

    const upstream = await callUpstream(upstreamBody);
    let text = await upstream.text();

    // Correção de pedido já enviado: o Stock360 Vendas ainda precisa aceitar salvar
    if (acao === "salvar_conferencia" && upstream.status === 409) {
      try {
        const j = JSON.parse(text || "{}");
        if (/não está aguardando conferência/i.test(String(j?.error || ""))) {
          j.error =
            "O Stock360 Vendas ainda não aceita salvar a correção de um pedido já enviado à Omie. Essa mudança precisa ser feita no Stock360 Vendas.";
          text = JSON.stringify(j);
        }
      } catch { /* mantém */ }
    }

    // Conferência salva de novo: sai da lista de refazer
    if (upstream.ok && acao === "salvar_conferencia" && typeof body.pedido_id === "string") {
      await supabase.from("interior_reopened_orders").delete().eq("pedido_id", body.pedido_id);
    }

    // Remove pedidos excluídos pelo admin da lista e dos relatórios; acrescenta o código do produto
    if (upstream.ok && (acao === "listar" || acao === "relatorio" || acao === "detalhe")) {
      try {
        const parsed = JSON.parse(text || "{}");
        if (reabertos && parsed && typeof parsed === "object") {
          const marcar = (p: any) => {
            const r = p && REABRIVEIS.has(String(p.status)) ? reabertos!.get(String(p.id)) : null;
            if (r) {
              p.reaberto = true;
              p.reaberto_por = r.reopened_by_name ?? null;
              p.reaberto_em = r.reopened_at ?? null;
              p.reaberto_motivo = r.motivo ?? null;
            }
            return !!r;
          };
          if (parsed.pedido) marcar(parsed.pedido);
          if (acao === "listar" && Array.isArray(parsed.pedidos)) {
            const st = Array.isArray(body.status) ? body.status.map(String) : [];
            const pedeAguardando = st.includes("aguardando_conferencia");
            const pediuConferido = st.includes("conferido");
            parsed.pedidos = parsed.pedidos.filter((p: any) => {
              const re = marcar(p);
              if (!REABRIVEIS.has(String(p?.status))) return true;
              // Recebidos: só os reabertos; Conferidos: tira os reabertos
              if (pedeAguardando && !pediuConferido) return re;
              if (!pedeAguardando) return !re;
              return true;
            });
          }
        }
        if (acao !== "detalhe") {
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
        }
        if (acao !== "relatorio") {
          try {
            const pedidos: any[] = [
              ...(Array.isArray(parsed?.pedidos) ? parsed.pedidos : []),
              ...(parsed?.pedido ? [parsed.pedido] : []),
            ];
            await preencherCodigosProduto(pedidos);
          } catch (e) {
            console.error("Código do produto:", (e as Error).message);
          }
          try {
            const pedidos: any[] = [
              ...(Array.isArray(parsed?.pedidos) ? parsed.pedidos : []),
              ...(parsed?.pedido ? [parsed.pedido] : []),
            ];
            await marcarFaturados(pedidos);
          } catch (e) {
            console.error("Faturamento Omie:", (e as Error).message);
          }
          // Reaberto que foi faturado nesse meio tempo não volta para Recebidos
          if (parsed?.pedido?.status === "faturado") parsed.pedido.reaberto = false;
          if (acao === "listar" && Array.isArray(parsed?.pedidos) && upstreamBody !== body) {
            parsed.pedidos = parsed.pedidos.filter((p: any) => p?.status !== "faturado");
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

// ---------------- Código do produto (catálogo Omie da Stock 360, em cache) ----------------
const CATALOGO_KEY = "stock360_interior_codigos_produto";
const CATALOGO_TTL_MS = 24 * 60 * 60 * 1000;
const CATALOGO_REFRESH_MIN_MS = 30 * 60 * 1000; // em caso de produto novo, recarrega no máx. a cada 30 min

async function carregarCatalogoOmie(): Promise<Record<string, string>> {
  const app_key = Deno.env.get("OMIE_APP_KEY");
  const app_secret = Deno.env.get("OMIE_APP_SECRET");
  if (!app_key || !app_secret) throw new Error("Chave da Omie da Stock 360 não configurada");
  const mapa: Record<string, string> = {};
  let pagina = 1;
  let total = 1;
  do {
    let j: any = null;
    for (let t = 0; t < 3; t++) {
      const r = await fetch("https://app.omie.com.br/api/v1/geral/produtos/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          call: "ListarProdutosResumido",
          app_key,
          app_secret,
          param: [{ pagina, registros_por_pagina: 500, apenas_importado_api: "N", filtrar_apenas_omiepdv: "N" }],
        }),
      });
      j = await r.json().catch(() => ({}));
      if (r.ok && !j?.faultstring) break;
      const msg = j?.faultstring || `Omie ${r.status}`;
      if (!/consumo redundante|bloqueada|tente novamente|limite/i.test(msg) || t === 2) throw new Error(msg);
      await new Promise((res) => setTimeout(res, 3000));
    }
    for (const p of j?.produto_servico_resumido ?? []) {
      if (p?.codigo_produto != null && p?.codigo) mapa[String(p.codigo_produto)] = String(p.codigo);
    }
    total = num(j?.total_de_paginas) || 1;
    pagina++;
  } while (pagina <= total && pagina <= 40);
  return mapa;
}

async function preencherCodigosProduto(pedidos: any[]) {
  const itens = pedidos.flatMap((p) => (Array.isArray(p?.itens) ? p.itens : []));
  const faltando = itens.filter((i) => !i?.codigo_sku && i?.codigo_produto_omie != null);
  if (!faltando.length) return;

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: cache } = await admin
    .from("omie_cache")
    .select("cache_value, created_at, expires_at")
    .eq("cache_key", CATALOGO_KEY)
    .maybeSingle();

  let mapa: Record<string, string> = (cache?.cache_value as any)?.mapa ?? {};
  const valido = cache && new Date(cache.expires_at).getTime() > Date.now();
  const temFalta = faltando.some((i) => !mapa[String(i.codigo_produto_omie)]);
  const podeRecarregar = !cache || Date.now() - new Date(cache.created_at).getTime() > CATALOGO_REFRESH_MIN_MS;

  if (!valido || (temFalta && podeRecarregar)) {
    try {
      mapa = await carregarCatalogoOmie();
      await admin.from("omie_cache").upsert({
        cache_key: CATALOGO_KEY,
        cache_value: { mapa },
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + CATALOGO_TTL_MS).toISOString(),
      });
    } catch (e) {
      console.error("Catálogo Omie:", (e as Error).message);
    }
  }

  for (const i of faltando) {
    const c = mapa[String(i.codigo_produto_omie)];
    if (c) i.codigo_sku = c;
  }
}

// ---------------- Faturamento (Omie da Stock 360) ----------------
const FAT_OK_TTL_MS = 30 * 24 * 60 * 60 * 1000; // faturado não muda
const FAT_PENDENTE_TTL_MS = 3 * 60 * 1000; // ainda não faturado: confere de novo a cada 3 min

async function omieCallUrl(path: string, call: string, param: Record<string, unknown>) {
  const app_key = Deno.env.get("OMIE_APP_KEY");
  const app_secret = Deno.env.get("OMIE_APP_SECRET");
  if (!app_key || !app_secret) throw new Error("Chave da Omie da Stock 360 não configurada");
  let last = "";
  for (let i = 0; i < 3; i++) {
    const r = await fetch(`https://app.omie.com.br/api/v1/${path}`, {
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

type FatInfo = { faturado: boolean; numero_nfe?: string | null; faturado_em?: string | null };

const brDateTimeToIso = (d?: string, h?: string) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(d || ""));
  if (!m) return null;
  const hh = /^\d{2}:\d{2}(:\d{2})?$/.test(String(h || "")) ? String(h).padEnd(8, ":00").slice(0, 8) : "00:00:00";
  return `${m[3]}-${m[2]}-${m[1]}T${hh}-04:00`; // horário de Manaus
};

async function consultarFaturamento(numeroOmie: string): Promise<FatInfo> {
  const j = await omieCallUrl("produtos/pedido/", "ConsultarPedido", { numero_pedido: numeroOmie });
  const ped = j?.pedido_venda_produto;
  const cab = ped?.cabecalho ?? {};
  const info = ped?.infoCadastro ?? {};
  const cancelado = String(info.cancelado || "").toUpperCase() === "S";
  const faturado = !cancelado && (String(info.faturado || "").toUpperCase() === "S" || ["60", "70"].includes(String(cab.etapa)));
  if (!faturado) return { faturado: false };
  let numero_nfe: string | null = null;
  let faturado_em = brDateTimeToIso(info.dFat, info.hFat);
  try {
    if (cab.codigo_pedido) {
      const nf = await omieCallUrl("produtos/nfconsultar/", "ConsultarNF", { nCodPed: cab.codigo_pedido });
      numero_nfe = nf?.ide?.nNF ? String(Number(nf.ide.nNF)) : null;
      faturado_em = faturado_em || brDateTimeToIso(nf?.ide?.dEmi, nf?.ide?.hEmi);
    }
  } catch (e) {
    console.error(`NF do pedido ${numeroOmie}:`, (e as Error).message);
  }
  return { faturado: true, numero_nfe, faturado_em };
}

async function marcarFaturados(pedidos: any[]) {
  const alvo = pedidos.filter(
    (p) => p?.numero_pedido_omie && (p.interior_enviado_omie_em || String(p.status || "").startsWith("enviado")),
  );
  if (!alvo.length) return;
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const keys = alvo.map((p) => `stock360_interior_fat_${p.numero_pedido_omie}`);
  const { data: rows } = await admin
    .from("omie_cache")
    .select("cache_key, cache_value, expires_at")
    .in("cache_key", keys);
  const cache = new Map<string, FatInfo>();
  for (const r of rows || []) {
    if (new Date(r.expires_at).getTime() > Date.now()) cache.set(r.cache_key, r.cache_value as FatInfo);
  }

  const pendentes = alvo.filter((p) => !cache.has(`stock360_interior_fat_${p.numero_pedido_omie}`));
  // Consulta poucos por vez para não estourar o limite da Omie
  for (let i = 0; i < pendentes.length; i += 3) {
    await Promise.all(
      pendentes.slice(i, i + 3).map(async (p) => {
        const key = `stock360_interior_fat_${p.numero_pedido_omie}`;
        try {
          const info = await consultarFaturamento(String(p.numero_pedido_omie));
          cache.set(key, info);
          await admin.from("omie_cache").upsert({
            cache_key: key,
            cache_value: info,
            created_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + (info.faturado ? FAT_OK_TTL_MS : FAT_PENDENTE_TTL_MS)).toISOString(),
          });
        } catch (e) {
          console.error(`Pedido Omie ${p.numero_pedido_omie}:`, (e as Error).message);
        }
      }),
    );
  }

  for (const p of alvo) {
    const info = cache.get(`stock360_interior_fat_${p.numero_pedido_omie}`);
    if (!info?.faturado) continue;
    p.status = "faturado";
    if (info.numero_nfe && !p.numero_nfe) p.numero_nfe = info.numero_nfe;
    p.faturado_em = info.faturado_em ?? null;
  }
}
