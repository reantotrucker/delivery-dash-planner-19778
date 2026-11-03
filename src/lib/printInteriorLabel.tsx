import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/company";
import { InteriorPedido, clienteNome, decodeHtml, recebidoDia } from "@/lib/interior";

/** Imprime a etiqueta 100x50 mm de identificação de um pedido da Entrega para interior */
export async function printInteriorLabel(p: InteriorPedido, volumesOverride?: number | null) {
  const [{ createRoot }, mod] = await Promise.all([
    import("react-dom/client"),
    import("@/components/interior/EtiquetaPedidoInterior"),
  ]);
  const PrintView = mod.default;

  const { data: company } = await supabase
    .from("companies")
    .select("name, legal_name, cnpj, address, neighborhood, city, state, cep, phone")
    .eq("id", getActiveCompanyId())
    .maybeSingle();

  const dia = recebidoDia(p);
  const nome = clienteNome(p);
  const razao = p.clientes?.razao_social ? decodeHtml(p.clientes.razao_social) : null;
  const data = {
    sender: (company || {}) as any,
    numeroPedido: String(p.numero_pedido ?? "—"),
    numeroOmie: p.numero_pedido_omie != null ? String(p.numero_pedido_omie) : null,
    numeroNfe: p.numero_nfe || null,
    cliente: nome,
    razaoSocial: razao,
    cidadeUf: [p.clientes?.cidade, p.clientes?.uf].filter(Boolean).join("/") || null,
    telefone: p.clientes?.telefone || null,
    vendedor: p.vendedor_nome || null,
    transporte: p.transporte_interior || null,
    volumes: volumesOverride ?? p.qtd_volumes ?? null,
    itens: (p.itens || []).length,
    data: dia ? dia.split("-").reverse().join("/") : null,
  };

  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(iframe);
  const idoc = iframe.contentDocument!;
  idoc.open();
  idoc.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Etiqueta pedido #${data.numeroPedido}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  @page { size: 100mm 50mm; margin: 0; }
  html, body { margin: 0; padding: 0; background: #FFFFFF; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  * { box-sizing: border-box; }
</style></head><body><div id="print-root"></div></body></html>`);
  idoc.close();

  const root = createRoot(idoc.getElementById("print-root")!);
  root.render(<PrintView data={data} />);

  await new Promise((r) => setTimeout(r, 500));
  try {
    await (idoc as any).fonts?.ready;
  } catch {
    /* fontes opcionais */
  }
  iframe.contentWindow?.focus();
  iframe.contentWindow?.print();
  setTimeout(() => {
    root.unmount();
    iframe.remove();
  }, 1500);
}
