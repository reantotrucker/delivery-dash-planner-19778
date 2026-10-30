import { supabase } from "@/integrations/supabase/client";

export type InteriorStatus = "aguardando_conferencia" | "conferido" | "enviado_omie" | "faturado" | string;

export interface InteriorItem {
  produto_id: string;
  descricao: string;
  quantidade: number;
  preco_unitario: number | null;
  codigo_sku: string | null;
  imagem_url?: string | null;
}

export interface InteriorCliente {
  razao_social: string | null;
  nome_fantasia: string | null;
  cnpj_cpf: string | null;
  cidade: string | null;
  uf: string | null;
  telefone: string | null;
}

export interface InteriorPedido {
  id: string;
  numero_pedido: string | number | null;
  numero_pedido_omie: string | number | null;
  numero_nfe: string | null;
  status: InteriorStatus;
  itens: InteriorItem[];
  valor_total: number | null;
  forma_pagamento: string | null;
  observacao: string | null;
  qtd_volumes: number | null;
  transporte_interior: string | null;
  vendedor_nome: string | null;
  clientes: InteriorCliente | null;
  interior_recebido_em: string | null;
  interior_conferido_em: string | null;
  interior_conferido_por?: string | null;
  interior_enviado_omie_em: string | null;
  erro_omie_mensagem: string | null;
  created_at?: string | null;
}

export interface InteriorAlteracao {
  id?: string;
  pedido_id?: string;
  numero_pedido?: string | number | null;
  produto_id?: string | null;
  descricao?: string | null;
  produto?: string | null;
  quantidade_anterior?: number | null;
  quantidade_nova?: number | null;
  quantidade_antes?: number | null;
  quantidade_depois?: number | null;
  antes?: number | string | null;
  depois?: number | string | null;
  usuario?: string | null;
  quem?: string | null;
  created_at?: string | null;
  quando?: string | null;
  [k: string]: unknown;
}

export async function interiorCall<T = any>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("interior-proxy", { body });
  if (error) {
    let msg = error.message;
    try {
      const ctx = (error as any).context;
      if (ctx && typeof ctx.json === "function") {
        const j = await ctx.json();
        msg = j?.error || j?.message || msg;
      }
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  if (data && typeof data === "object" && (data as any).error && (data as any).success !== false) {
    throw new Error((data as any).error);
  }
  return data as T;
}

export const STATUS_LABEL: Record<string, string> = {
  aguardando_conferencia: "Aguardando conferência",
  conferido: "Conferido",
  enviado_omie: "Enviado à Omie",
  enviado: "Enviado à Omie",
  faturado: "Faturado",
};

export const brl = (v: number | null | undefined) =>
  (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const fmtDateTime = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Manaus",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/** Data (AAAA-MM-DD, Manaus) de recebimento do pedido */
export const recebidoDia = (p: InteriorPedido) => {
  const iso = p.interior_recebido_em || p.created_at;
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-CA", { timeZone: "America/Manaus" });
};

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
/** Converte textos vindos com códigos HTML (ex.: "B&amp;L") para o texto normal */
export const decodeHtml = (s: string | null | undefined) =>
  String(s ?? "").replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, c: string) => {
    if (c[0] === "#") {
      const n = c[1].toLowerCase() === "x" ? parseInt(c.slice(2), 16) : parseInt(c.slice(1), 10);
      return isNaN(n) ? m : String.fromCodePoint(n);
    }
    return ENTITIES[c.toLowerCase()] ?? m;
  });

export const clienteNome = (p: InteriorPedido) =>
  decodeHtml(p.clientes?.nome_fantasia || p.clientes?.razao_social || "Cliente");
