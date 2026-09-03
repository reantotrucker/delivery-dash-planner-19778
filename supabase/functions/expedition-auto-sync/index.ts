import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(
  type: "nfe" | "nfce",
  companyId: string,
  opts: { fetchLastPage?: boolean; page?: number },
) {
  let lastErr = "";
  // Omie recusa chamadas muito próximas ("Consumo redundante"): tenta de novo com pausa
  for (let attempt = 0; attempt < 6; attempt++) {
    if (attempt > 0) await sleep(5000 + Math.random() * 5000);
    const res = await fetch(`${SUPABASE_URL}/functions/v1/omie-invoices`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE}`,
        apikey: SERVICE_ROLE,
      },
      // forceRefresh: ignora o cache de 10 min, senão o job encontra vendas atrasadas
      body: JSON.stringify({
        type,
        fetchLastPage: opts.fetchLastPage ?? false,
        page: opts.page ?? 1,
        forceRefresh: true,
        companyId,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && !data?.error) return data;
    lastErr = data?.error || `omie-invoices ${res.status}`;
    if (!/redundante|REDUNDANT|temporariamente|SOAP-ERROR|504|timeout/i.test(lastErr)) break;
  }
  throw new Error(lastErr);
}

// Busca a última página e também a anterior: cancelamentos de notas um pouco
// mais antigas (que já saíram da última página) precisam ser detectados.
async function fetchInvoices(type: "nfe" | "nfce", companyId: string) {
  const last = await fetchPage(type, companyId, { fetchLastPage: true });
  const invoices: any[] = last.invoices || [];
  const currentPage = Number(last.page) || 1;
  if (currentPage > 1) {
    try {
      await sleep(5000);
      const prev = await fetchPage(type, companyId, { page: currentPage - 1 });
      invoices.push(...(prev.invoices || []));
    } catch (e) {
      console.error(`falha página anterior ${type}`, (e as Error).message);
    }
  }
  return invoices;
}

// Converte dd/MM/yyyy + HH:mm(:ss) da Omie (horário de Manaus, UTC-4) em ISO
function toIsoIssuedAt(date?: string | null, time?: string | null, tz = "-04:00") {
  if (!date) return null;
  const [d, m, y] = date.split("/");
  if (!d || !m || !y) return null;
  const [hh = "00", mi = "00", ss = "00"] = (time || "").split(":");
  const pad = (v: string) => v.padStart(2, "0");
  return `${y}-${pad(m)}-${pad(d)}T${pad(hh)}:${pad(mi)}:${pad(ss)}${tz}`;
}

async function syncCompany(companyId: string, types: readonly ("nfe" | "nfce")[]) {

  let created = 0;
  const errors: string[] = [];
  // NFC-e (cupom balcão) primeiro: é a venda mais urgente para a separação
  for (const type of types) {
    let invoices: any[] = [];
    try {
      invoices = await fetchInvoices(type, companyId);
    } catch (e) {
      console.error(`falha ${type}`, (e as Error).message);
      errors.push(`${type}: ${(e as Error).message}`);
      continue;
    }
    for (const inv of invoices) {
      const docNumber = String(inv.number);
      const { data: existing } = await sb
        .from("expedition_orders")
        .select("id")
        .eq("company_id", companyId)
        .eq("doc_type", type.toUpperCase())
        .eq("doc_number", docNumber)
        .maybeSingle();

      // Nota/cupom cancelado: sai da expedição (e do painel de TV)
      if (inv.canceled) {
        if (existing) {
          await sb.from("expedition_order_items").delete().eq("expedition_order_id", existing.id);
          await sb.from("route_signatures").delete().eq("expedition_order_id", existing.id);
          await sb.from("expedition_orders").delete().eq("id", existing.id);
          console.log(`Cancelado removido: ${type.toUpperCase()} ${docNumber}`);
        }
        continue;
      }
      if (existing) continue;


      const { data: inserted, error: insErr } = await sb
        .from("expedition_orders")
        .insert({
          company_id: companyId,
          doc_type: type.toUpperCase(),
          doc_number: docNumber,
          order_number: inv.orderNumber || null,

          client: inv.clientName || `Cliente ${inv.clientId}`,
          client_document: inv.clientCpfCnpj || null,
          neighborhood: inv.address?.neighborhood || null,
          address: inv.address
            ? `${inv.address.street}, ${inv.address.number}${inv.address.complement ? ` - ${inv.address.complement}` : ""}`
            : null,
          cep: inv.address?.cep || null,
          seller: inv.vendedorName || null,
          total_value: inv.totalValue ?? null,
          // NF-e traz a hora no fuso de Brasília (UTC-3); o cupom já vem em Manaus
          issued_at: toIsoIssuedAt(inv.emissionDate, inv.emissionTime, type === "nfe" ? "-03:00" : "-04:00"),
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
            family: p.family || null,
            quantity: p.quantity,
            unit: p.unit || "UN",
            unit_value: p.unitValue ?? null,
            total_value: p.totalValue ?? null,
          }))
        );
      }
    }
  }
  if (errors.length) return `${created} criados (falhas: ${errors.join(" | ")})`;
  return created;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // NF-e é caro (paginação enorme) e sufoca a chave da Omie -> só a cada 5 min.
    // NFC-e (cupom) roda em todo ciclo para o balcão não atrasar.
    const body = await req.json().catch(() => ({} as any));
    const minute = new Date().getUTCMinutes();
    const types: readonly ("nfe" | "nfce")[] =
      body?.types ?? (minute % 5 === 0 ? (["nfce", "nfe"] as const) : (["nfce"] as const));

    const { data: companies, error } = await sb
      .from("companies")
      .select("id, name, has_expedition")
      .eq("has_expedition", true);
    if (error) throw error;

    const results: Record<string, unknown> = {};
    for (const c of companies || []) {
      try {
        results[c.name] = await syncCompany(c.id, types);
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
