import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Printer } from "lucide-react";
import { manausToday } from "@/lib/manausTime";
import {
  interiorCall,
  InteriorAlteracao,
  InteriorPedido,
  brl,
  fmtDateTime,
} from "@/lib/interior";

const firstOfMonth = () => manausToday().slice(0, 8) + "01";

const isConferido = (p: InteriorPedido) =>
  !!p.interior_conferido_em || ["conferido", "enviado_omie", "faturado"].includes(p.status);
const isEnviado = (p: InteriorPedido) =>
  !!p.interior_enviado_omie_em || ["enviado_omie", "faturado"].includes(p.status);

const altPedido = (a: InteriorAlteracao) => String(a.numero_pedido ?? a.pedido_id ?? "—");
const altProduto = (a: InteriorAlteracao) => String(a.descricao ?? a.produto ?? a.produto_id ?? "—");
const altAntes = (a: InteriorAlteracao) => {
  const v = a.quantidade_anterior ?? a.antes;
  return v == null ? "—" : String(v);
};
const altDepois = (a: InteriorAlteracao) => {
  const v = "quantidade_nova" in a ? a.quantidade_nova : a.depois;
  return v == null ? "Excluído" : String(v);
};
const altQuem = (a: InteriorAlteracao) => String(a.usuario ?? a.quem ?? "—");
const altQuando = (a: InteriorAlteracao) => fmtDateTime((a.created_at ?? a.quando) as string | null);

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function InteriorReports() {
  const [de, setDe] = useState(firstOfMonth());
  const [ate, setAte] = useState(manausToday());

  const { data, isLoading, error } = useQuery({
    queryKey: ["interior-relatorio", de, ate],
    enabled: !!de && !!ate && de <= ate,
    queryFn: () =>
      interiorCall<{ pedidos: InteriorPedido[]; alteracoes: InteriorAlteracao[] }>({
        acao: "relatorio",
        de,
        ate,
      }),
  });

  const pedidos = data?.pedidos || [];
  const alteracoes = data?.alteracoes || [];

  const resumo = useMemo(
    () => ({
      recebidos: pedidos.length,
      conferidos: pedidos.filter(isConferido).length,
      enviados: pedidos.filter(isEnviado).length,
      faturados: pedidos.filter((p) => p.status === "faturado").length,
    }),
    [pedidos]
  );

  const group = (key: (p: InteriorPedido) => string) => {
    const m = new Map<string, { nome: string; qtd: number; valor: number }>();
    pedidos.forEach((p) => {
      const k = key(p) || "Não informado";
      const g = m.get(k) || { nome: k, qtd: 0, valor: 0 };
      g.qtd += 1;
      g.valor += Number(p.valor_total) || 0;
      m.set(k, g);
    });
    return [...m.values()].sort((a, b) => b.valor - a.valor);
  };
  const porVendedor = useMemo(() => group((p) => p.vendedor_nome || ""), [pedidos]);
  const porTransporte = useMemo(() => group((p) => p.transporte_interior || ""), [pedidos]);

  const imprimir = () => {
    const tbl = (head: string[], rows: (string | number)[][]) =>
      `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${
        rows.length
          ? rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")
          : `<tr><td colspan="${head.length}" class="empty">Sem dados no período</td></tr>`
      }</tbody></table>`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Entrega para interior</title>
<style>
@page{size:A4;margin:12mm}
*{box-sizing:border-box}
body{font-family:Arial,Helvetica,sans-serif;color:#1a1d23;font-size:11px;margin:0}
h1{font-size:18px;margin:0}
.sub{color:#555;margin:2px 0 14px}
h2{font-size:13px;margin:18px 0 6px;border-bottom:2px solid #1a1d23;padding-bottom:3px}
.kpis{display:flex;gap:8px}
.kpi{flex:1;border:1px solid #ccc;border-radius:6px;padding:8px;text-align:center}
.kpi b{display:block;font-size:20px}
table{width:100%;border-collapse:collapse}
th,td{border-bottom:1px solid #ddd;padding:4px 6px;text-align:left}
th{background:#f1f1f1;font-size:10px;text-transform:uppercase}
tbody tr:nth-child(even) td{background:#f7f7f7}
td.empty{text-align:center;color:#888}
section{break-inside:avoid}
</style></head><body>
<h1>Entrega para interior</h1>
<p class="sub">Período: ${esc(de.split("-").reverse().join("/"))} a ${esc(ate.split("-").reverse().join("/"))}</p>
<section><h2>Recebidos x faturados</h2><div class="kpis">
<div class="kpi">Recebidos<b>${resumo.recebidos}</b></div>
<div class="kpi">Conferidos<b>${resumo.conferidos}</b></div>
<div class="kpi">Enviados<b>${resumo.enviados}</b></div>
<div class="kpi">Faturados<b>${resumo.faturados}</b></div></div></section>
<section><h2>Por vendedor</h2>${tbl(["Vendedor", "Pedidos", "Valor"], porVendedor.map((g) => [g.nome, g.qtd, brl(g.valor)]))}</section>
<section><h2>Por transporte</h2>${tbl(["Transporte", "Pedidos", "Valor"], porTransporte.map((g) => [g.nome, g.qtd, brl(g.valor)]))}</section>
<section><h2>Itens alterados ou excluídos</h2>${tbl(
      ["Pedido", "Produto", "Antes", "Depois", "Quem", "Quando"],
      alteracoes.map((a) => [altPedido(a), altProduto(a), altAntes(a), altDepois(a), altQuem(a), altQuando(a)])
    )}</section>
<script>window.onload=function(){setTimeout(function(){window.print()},200)}</script>
</body></html>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">De</label>
          <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="h-9 w-[160px]" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Até</label>
          <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="h-9 w-[160px]" />
        </div>
        <Button onClick={imprimir} disabled={isLoading || !data} className="ml-auto">
          <Printer className="w-4 h-4 mr-1" /> Imprimir
        </Button>
      </div>

      {isLoading && (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      )}
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

      {data && (
        <>
          <Section title="Recebidos x faturados">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { l: "Recebidos", v: resumo.recebidos },
                { l: "Conferidos", v: resumo.conferidos },
                { l: "Enviados", v: resumo.enviados },
                { l: "Faturados", v: resumo.faturados },
              ].map((k) => (
                <div key={k.l} className="border border-border rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold tabular-nums">{k.v}</p>
                  <p className="text-[10px] uppercase text-muted-foreground">{k.l}</p>
                </div>
              ))}
            </div>
          </Section>

          <div className="grid lg:grid-cols-2 gap-4">
            <Section title="Por vendedor">
              <GroupTable label="Vendedor" rows={porVendedor} />
            </Section>
            <Section title="Por transporte">
              <GroupTable label="Transporte" rows={porTransporte} />
            </Section>
          </div>

          <Section title="Itens alterados ou excluídos">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="text-left p-2">Pedido</th>
                    <th className="text-left p-2">Produto</th>
                    <th className="text-right p-2">Antes</th>
                    <th className="text-right p-2">Depois</th>
                    <th className="text-left p-2">Quem</th>
                    <th className="text-left p-2">Quando</th>
                  </tr>
                </thead>
                <tbody>
                  {alteracoes.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-3 text-center text-muted-foreground">
                        Nenhuma alteração no período
                      </td>
                    </tr>
                  )}
                  {alteracoes.map((a, i) => (
                    <tr key={a.id || i} className={i % 2 ? "bg-muted/30" : ""}>
                      <td className="p-2">{altPedido(a)}</td>
                      <td className="p-2">{altProduto(a)}</td>
                      <td className="p-2 text-right tabular-nums">{altAntes(a)}</td>
                      <td
                        className={`p-2 text-right tabular-nums ${altDepois(a) === "Excluído" ? "text-destructive font-medium" : ""}`}
                      >
                        {altDepois(a)}
                      </td>
                      <td className="p-2">{altQuem(a)}</td>
                      <td className="p-2 whitespace-nowrap">{altQuando(a)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <h3 className="font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function GroupTable({ label, rows }: { label: string; rows: { nome: string; qtd: number; valor: number }[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="text-xs uppercase text-muted-foreground">
        <tr className="border-b border-border">
          <th className="text-left p-2">{label}</th>
          <th className="text-right p-2">Pedidos</th>
          <th className="text-right p-2">Valor</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr>
            <td colSpan={3} className="p-3 text-center text-muted-foreground">
              Sem dados no período
            </td>
          </tr>
        )}
        {rows.map((r, i) => (
          <tr key={r.nome} className={i % 2 ? "bg-muted/30" : ""}>
            <td className="p-2">{r.nome}</td>
            <td className="p-2 text-right tabular-nums">{r.qtd}</td>
            <td className="p-2 text-right tabular-nums">{brl(r.valor)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
