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

    const upstream = await fetch(UPSTREAM, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-interior-key": apiKey },
      body: JSON.stringify({ ...body, usuario }),
    });
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
