import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

async function fetchInvoices(type: "nfe" | "nfce", companyId: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/omie-invoices`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE}`,
      apikey: SERVICE_ROLE,
    },
    // forceRefresh: ignora o cache de 10 min, senão o job encontra vendas atrasadas
    body: JSON.stringify({ type, fetchLastPage: true, forceRefresh: true, companyId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) throw new Error(data?.error || `omie-invoices ${res.status}`);
  return data.invoices || [];
}

// Converte dd/MM/yyyy + HH:mm(:ss) da Omie (horário de Manaus, UTC-4) em ISO
function toIsoIssuedAt(date?: string | null, time?: string | null) {
  if (!date) return null;
  const [d, m, y] = date.split("/");
  if (!d || !m || !y) return null;
  const [hh = "00", mi = "00", ss = "00"] = (time || "").split(":");
  const pad = (v: string) => v.padStart(2, "0");
  return `${y}-${pad(m)}-${pad(d)}T${pad(hh)}:${pad(mi)}:${pad(ss)}-04:00`;
}

async function syncCompany(companyId: string) {

  let created = 0;
  for (const type of ["nfe", "nfce"] as const) {
    const invoices = await fetchInvoices(type, companyId);
    for (const inv of invoices) {
      if (inv.canceled) continue;
      const docNumber = String(inv.number);
      const { data: existing } = await sb
        .from("expedition_orders")
        .select("id")
        .eq("company_id", companyId)
        .eq("doc_type", type.toUpperCase())
        .eq("doc_number", docNumber)
        .maybeSingle();
      if (existing) continue;

      const { data: inserted, error: insErr } = await sb
        .from("expedition_orders")
        .insert({
          company_id: companyId,
          doc_type: type.toUpperCase(),
          doc_number: docNumber,
          client: inv.clientName || `Cliente ${inv.clientId}`,
          client_document: inv.clientCpfCnpj || null,
          neighborhood: inv.address?.neighborhood || null,
          address: inv.address
            ? `${inv.address.street}, ${inv.address.number}${inv.address.complement ? ` - ${inv.address.complement}` : ""}`
            : null,
          cep: inv.address?.cep || null,
          seller: inv.vendedorName || null,
          total_value: inv.totalValue ?? null,
          issued_at: toIsoIssuedAt(inv.emissionDate, inv.emissionTime),
          observation: inv.orderObservation || null,
          status: "AGUARDANDO",
        })

        .select("id")
        .single();
      if (insErr) throw insErr;
      created++;

      if (inv.products?.length) {
        await sb.from("expedition_order_items").insert(
          inv.products.map((p: any) => ({
            expedition_order_id: inserted.id,
            name: p.name,
            code: p.code || null,
            quantity: p.quantity,
            unit: p.unit || "UN",
            unit_value: p.unitValue ?? null,
            total_value: p.totalValue ?? null,
          }))
        );
      }
    }
  }
  return created;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { data: companies, error } = await sb
      .from("companies")
      .select("id, name, has_expedition")
      .eq("has_expedition", true);
    if (error) throw error;

    const results: Record<string, unknown> = {};
    for (const c of companies || []) {
      try {
        results[c.name] = await syncCompany(c.id);
      } catch (e) {
        console.error("sync error", c.name, e);
        results[c.name] = `erro: ${(e as Error).message}`;
      }
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
