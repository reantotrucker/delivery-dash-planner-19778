import type { InteriorPedido } from "./interior";

export interface InteriorDraft {
  qty: Record<string, string>;
  removed: string[];
  volumes: string;
  updatedAt: string;
}

export function interiorDraftVersion(pedido: InteriorPedido) {
  return JSON.stringify([pedido.status, pedido.reaberto_em, pedido.interior_conferido_em,
    pedido.interior_enviado_omie_em, pedido.qtd_volumes,
    pedido.itens.map(i => [i.produto_id, i.quantidade])]);
}

export function restoreInteriorDraft(pedido: InteriorPedido, draft?: InteriorDraft | null) {
  const ids = new Set(pedido.itens.map(i => i.produto_id));
  return {
    qty: Object.fromEntries(pedido.itens.map(i => [i.produto_id, draft?.qty[i.produto_id] ?? String(i.quantidade ?? "")])),
    removed: new Set((draft?.removed ?? []).filter(id => ids.has(id))),
    volumes: draft?.volumes ?? String(pedido.qtd_volumes ?? ""),
  };
}