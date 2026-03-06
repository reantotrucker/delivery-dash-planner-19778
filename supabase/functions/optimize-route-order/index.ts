import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { routes } = await req.json();
    
    if (!routes || !Array.isArray(routes) || routes.length === 0) {
      return new Response(JSON.stringify({ error: "Nenhuma rota fornecida" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const routesList = routes.map((r: any, i: number) => 
      `${i + 1}. ID: ${r.id} | Cliente: ${r.client} | Bairro: ${r.neighborhood} | Endereço: ${r.address || "não informado"} | CEP: ${r.cep || "não informado"}`
    ).join("\n");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Você é um especialista em logística de entregas na cidade de Manaus, Amazonas, Brasil. 
Sua tarefa é ordenar uma lista de entregas para minimizar o deslocamento total do motorista.
Considere a proximidade geográfica dos bairros e endereços em Manaus.
Responda APENAS com os IDs na ordem otimizada, sem explicação.`,
          },
          {
            role: "user",
            content: `Ordene estas entregas para minimizar o deslocamento do motorista em Manaus. Retorne APENAS os IDs separados por vírgula, na ordem otimizada de entrega:\n\n${routesList}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_optimized_order",
              description: "Retorna os IDs das rotas na ordem otimizada de entrega",
              parameters: {
                type: "object",
                properties: {
                  orderedIds: {
                    type: "array",
                    items: { type: "string" },
                    description: "Array de IDs das rotas na ordem otimizada",
                  },
                },
                required: ["orderedIds"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_optimized_order" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns minutos." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes para usar IA." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("Erro ao chamar IA");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      return new Response(JSON.stringify({ orderedIds: parsed.orderedIds }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fallback: try to parse from content
    const content = data.choices?.[0]?.message?.content || "";
    const ids = routes.map((r: any) => r.id);
    const foundIds = ids.filter((id: string) => content.includes(id));
    
    if (foundIds.length === routes.length) {
      return new Response(JSON.stringify({ orderedIds: foundIds }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Return original order if parsing fails
    return new Response(JSON.stringify({ orderedIds: ids }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("optimize-route-order error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
