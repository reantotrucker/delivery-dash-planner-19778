import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileBase64, fileName, mimeType } = await req.json();

    if (!fileBase64) {
      return new Response(JSON.stringify({ error: 'Arquivo não enviado' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const isImage = mimeType?.startsWith('image/');
    const isPdf = mimeType === 'application/pdf';

    const systemPrompt = `Você é um assistente especializado em extrair dados de notas fiscais, pedidos de venda e documentos comerciais brasileiros.
Analise o documento enviado e extraia TODAS as informações possíveis no formato JSON abaixo.
Se um campo não for encontrado, use null.

Retorne APENAS o JSON válido, sem markdown, sem explicações:
{
  "client_name": "Nome do cliente/destinatário",
  "address": "Endereço completo (rua, número, complemento)",
  "neighborhood": "Bairro",
  "city": "Cidade",
  "state": "Estado (sigla)",
  "cep": "CEP",
  "invoice_number": "Número da NF/pedido",
  "total_value": 0.00,
  "payment_method": "Forma de pagamento detectada (DINHEIRO, PIX, BOLETO, CARTAO CREDITO, COLETA, etc)",
  "seller_name": "Nome do vendedor/consultor",
  "observation": "Observações encontradas no documento",
  "products": [
    {
      "name": "Nome do produto",
      "code": "Código do produto",
      "quantity": 1,
      "unit": "UN",
      "unit_value": 0.00,
      "total_value": 0.00
    }
  ]
}`;

    let messages: any[];

    if (isImage) {
      messages = [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: `Extraia os dados desta nota fiscal/pedido (arquivo: ${fileName})` },
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${fileBase64}` },
            },
          ],
        },
      ];
    } else {
      // For PDFs and other documents, send as text with base64
      // Gemini can handle PDF via base64 in image_url with proper mime
      if (isPdf) {
        messages = [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: `Extraia os dados desta nota fiscal/pedido em PDF (arquivo: ${fileName})` },
              {
                type: 'image_url',
                image_url: { url: `data:application/pdf;base64,${fileBase64}` },
              },
            ],
          },
        ];
      } else {
        // Try to decode as text
        const textContent = atob(fileBase64);
        messages = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Extraia os dados desta nota fiscal/pedido (arquivo: ${fileName}):\n\n${textContent}` },
        ];
      }
    }

    console.log(`Processing file: ${fileName} (${mimeType})`);

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages,
        temperature: 0.1,
        max_tokens: 4096,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error('AI Gateway error:', errText);
      throw new Error(`AI Gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || '';

    console.log('AI response:', content.substring(0, 500));

    // Parse JSON from response (handle potential markdown wrapping)
    let extractedData;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseErr) {
      console.error('Failed to parse AI response:', parseErr);
      return new Response(JSON.stringify({ 
        error: 'Não foi possível extrair dados do documento. Tente com uma imagem mais nítida.',
        rawResponse: content.substring(0, 500),
      }), {
        status: 422,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ data: extractedData }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
