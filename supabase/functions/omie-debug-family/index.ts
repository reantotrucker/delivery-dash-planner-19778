const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const key = Deno.env.get("OMIE_APP_KEY_UNIPRINT")!;
  const secret = Deno.env.get("OMIE_APP_SECRET_UNIPRINT")!;
  const out: Record<string, unknown> = {};
  const call = async (url: string, body: unknown) => {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const t = await r.text();
    return t.substring(0, 1200);
  };
  out.consulta = await call("https://app.omie.com.br/api/v1/geral/produtos/", { call: "ConsultarProduto", app_key: key, app_secret: secret, param: [{ codigo: "001-I" }] });
  return new Response(JSON.stringify(out, null, 1), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
