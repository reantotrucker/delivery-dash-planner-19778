import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const UPSTREAM = "https://lrdiymbaladmmoczifnd.supabase.co/functions/v1/interior-pedidos";
const ACOES = new Set(["listar", "detalhe", "salvar_conferencia", "enviar_omie", "relatorio"]);

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

    const upstream = await fetch(UPSTREAM, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-interior-key": apiKey },
      body: JSON.stringify({ ...body, usuario }),
    });
    const text = await upstream.text();
    return new Response(text || "{}", {
      status: upstream.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return json({ error: (e as Error).message || "Erro inesperado" }, 500);
  }
});
