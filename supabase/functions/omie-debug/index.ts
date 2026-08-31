// TEMPORÁRIO: ferramenta de investigação da API Omie (será removida)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { endpoint, call, param, company } = await req.json();
    const appKey = company === "uniprint"
      ? Deno.env.get("OMIE_APP_KEY_UNIPRINT")!
      : Deno.env.get("OMIE_APP_KEY")!;
    const appSecret = company === "uniprint"
      ? Deno.env.get("OMIE_APP_SECRET_UNIPRINT")!
      : Deno.env.get("OMIE_APP_SECRET")!;

    const res = await fetch(`https://app.omie.com.br/api/v1/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call, app_key: appKey, app_secret: appSecret, param }),
    });
    const text = await res.text();
    return new Response(text, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
