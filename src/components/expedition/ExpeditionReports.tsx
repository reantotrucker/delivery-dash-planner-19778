import { useMemo, useRef, useState } from "react";
import autoTable from "jspdf-autotable";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { manausShort } from "@/lib/manausTime";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";
import {
  BarChart3,
  Loader2,
  Store,
  Truck,
  Clock,
  PackageCheck,
  Download,
  TrendingUp,
  Users,
  Timer,
} from "lucide-react";
import NeighborhoodHeatMap from "./NeighborhoodHeatMap";

type Range = "dia" | "semana" | "mes" | "custom";

interface Props {
  companyId: string | null;
  companyName?: string;
}

const formatBRL = (v?: number | null) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);

const iso = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const rangeDates = (r: Range) => {
  const now = new Date();
  if (r === "dia") return { from: iso(now), to: iso(now) };
  if (r === "semana") {
    const from = new Date(now);
    from.setDate(now.getDate() - 6);
    return { from: iso(from), to: iso(now) };
  }
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: iso(from), to: iso(now) };
};

const minutesBetween = (a?: string | null, b?: string | null) => {
  if (!a || !b) return null;
  const diff = (new Date(b).getTime() - new Date(a).getTime()) / 60000;
  if (!isFinite(diff) || diff < 0) return null;
  return diff;
};

const fmtMin = (m: number | null) => {
  if (m === null) return "—";
  if (m < 60) return `${Math.round(m)} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${Math.round(m % 60)}min`;
};

const manausDayKey = (d: string) =>
  new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Manaus", day: "2-digit", month: "2-digit" });

const manausHour = (d: string) =>
  new Date(d).toLocaleString("pt-BR", { timeZone: "America/Manaus", hour: "2-digit", hour12: false });

export function ExpeditionReports({ companyId, companyName }: Props) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<Range>("dia");
  const [custom, setCustom] = useState(rangeDates("dia"));

  const { from, to } = range === "custom" ? custom : rangeDates(range);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["expedition-report", companyId, from, to],
    enabled: open && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expedition_orders")
        .select(
          "id, doc_type, doc_number, client, neighborhood, seller, total_value, status, extra_info, created_at, issued_at, checked_at, checked_by, delivered_at, route_id"
        )
        .eq("company_id", companyId)
        .gte("created_at", `${from}T00:00:00`)
        .lte("created_at", `${to}T23:59:59`)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["expedition-report-profiles"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, email");
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const nameOf = (id?: string | null) => {
    if (!id) return "—";
    const p = profiles.find((x: any) => x.id === id);
    return p?.full_name || p?.email || "Usuário";
  };

  const stats = useMemo(() => {
    const total = orders.length;
    const balcao = orders.filter((o) => o.status === "BALCAO").length;
    const rota = orders.filter((o) => o.status === "ROTA").length;
    const aguardando = orders.filter((o) => o.status === "AGUARDANDO").length;
    const entregues = orders.filter((o) => !!o.delivered_at).length;
    const valor = orders.reduce((s, o) => s + (Number(o.total_value) || 0), 0);

    const sepTimes = orders
      .map((o) => minutesBetween(o.created_at, o.checked_at))
      .filter((v): v is number => v !== null);
    const delTimes = orders
      .map((o) => minutesBetween(o.checked_at, o.delivered_at))
      .filter((v): v is number => v !== null);

    const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

    // por dia
    const byDayMap = new Map<string, any>();
    orders.forEach((o) => {
      const k = manausDayKey(o.created_at);
      const e = byDayMap.get(k) || { day: k, total: 0, balcao: 0, rota: 0, valor: 0 };
      e.total++;
      if (o.status === "BALCAO") e.balcao++;
      if (o.status === "ROTA") e.rota++;
      e.valor += Number(o.total_value) || 0;
      byDayMap.set(k, e);
    });

    // por hora
    const byHourMap = new Map<string, number>();
    orders.forEach((o) => {
      const k = `${manausHour(o.created_at)}h`;
      byHourMap.set(k, (byHourMap.get(k) || 0) + 1);
    });
    const byHour = [...byHourMap.entries()]
      .map(([hour, total]) => ({ hour, total }))
      .sort((a, b) => a.hour.localeCompare(b.hour));

    const group = (key: string) => {
      const m = new Map<string, { name: string; total: number; valor: number }>();
      orders.forEach((o) => {
        const k = (o as any)[key] || "Não informado";
        const e = m.get(k) || { name: k, total: 0, valor: 0 };
        e.total++;
        e.valor += Number(o.total_value) || 0;
        m.set(k, e);
      });
      return [...m.values()].sort((a, b) => b.total - a.total);
    };

    const conferentes = (() => {
      const m = new Map<string, { name: string; total: number; tempo: number[] }>();
      orders
        .filter((o) => o.checked_by)
        .forEach((o) => {
          const k = o.checked_by as string;
          const e = m.get(k) || { name: nameOf(k), total: 0, tempo: [] as number[] };
          e.total++;
          const t = minutesBetween(o.created_at, o.checked_at);
          if (t !== null) e.tempo.push(t);
          m.set(k, e);
        });
      return [...m.values()]
        .map((c) => ({ name: c.name, total: c.total, media: avg(c.tempo) }))
        .sort((a, b) => b.total - a.total);
    })();

    return {
      total,
      balcao,
      rota,
      aguardando,
      entregues,
      valor,
      mediaSeparacao: avg(sepTimes),
      mediaEntrega: avg(delTimes),
      byDay: [...byDayMap.values()],
      byHour,
      sellers: group("seller").slice(0, 8),
      neighborhoods: group("neighborhood").slice(0, 8),
      neighborhoodsAll: group("neighborhood"),
      clients: group("client").slice(0, 8),
      extras: group("extra_info"),
      docs: group("doc_type"),
      conferentes,
    };
  }, [orders, profiles]);

  const exportCsv = () => {
    const head = [
      "Documento",
      "Numero",
      "Cliente",
      "Bairro",
      "Vendedor",
      "Valor",
      "Status",
      "Info",
      "Recebido",
      "Conferido",
      "Conferente",
      "Entregue",
    ];
    const rows = orders.map((o) => [
      o.doc_type,
      o.doc_number || "",
      o.client,
      o.neighborhood || "",
      o.seller || "",
      String(Number(o.total_value) || 0).replace(".", ","),
      o.status,
      o.extra_info || "",
      o.created_at ? manausShort(o.created_at) : "",
      o.checked_at ? manausShort(o.checked_at) : "",
      nameOf(o.checked_by),
      o.delivered_at ? manausShort(o.delivered_at) : "",
    ]);
    const csv = [head, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `expedicao-${from}-a-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const [pdfLoading, setPdfLoading] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const exportPdf = async () => {
    setPdfLoading(true);
    try {
      const [{ createRoot }, { default: RelatorioExpedicaoPDF }, { aggregateNeighborhoods }] =
        await Promise.all([
          import("react-dom/client"),
          import("./RelatorioExpedicaoPDF"),
          import("./RelatorioExpedicaoPDF"),
        ]);

      const periodo =
        from === to
          ? from.split("-").reverse().join("/")
          : `${from.split("-").reverse().join("/")} — ${to.split("-").reverse().join("/")}`;

      const data = {
        companyName: companyName || "Empresa",
        periodo,
        geradoEm: manausShort(new Date()),
        kpis: kpis.map((k) => ({ label: k.label, value: String(k.value) })),
        byDay: stats.byDay,
        byHour: stats.byHour,
        sellers: stats.sellers,
        conferentes: stats.conferentes,
        clients: stats.clients,
        docs: stats.docs,
        neighborhoods: aggregateNeighborhoods(stats.neighborhoodsAll),
        distribution: pieData,
        totalPedidos: stats.total,
        aguardando: stats.aguardando,
        fmtMin,
        formatBRL: (v: number) => formatBRL(v),
      };

      const iframe = document.createElement("iframe");
      iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
      document.body.appendChild(iframe);
      const idoc = iframe.contentDocument!;
      idoc.open();
      idoc.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Relatório de Expedição — ${companyName || "Empresa"} — ${periodo}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;600&display=swap" rel="stylesheet">
<style>
  @page { size: A4 portrait; margin: 10mm; }
  html, body { margin: 0; padding: 0; background: #FAFAF7; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  * { box-sizing: border-box; }
</style></head><body><div id="print-root"></div></body></html>`);
      idoc.close();

      const root = createRoot(idoc.getElementById("print-root")!);
      root.render(<RelatorioExpedicaoPDF data={data} />);

      await new Promise((r) => setTimeout(r, 600));
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
    } finally {
      setPdfLoading(false);
    }
  };




  const kpis = [
    { label: "Pedidos", value: stats.total, icon: PackageCheck, color: "text-primary", bg: "bg-primary/10" },
    { label: "Balcão", value: stats.balcao, icon: Store, color: "text-green-500", bg: "bg-green-500/10" },
    { label: "Rota", value: stats.rota, icon: Truck, color: "text-blue-500", bg: "bg-blue-500/10" },
    { label: "Aguardando", value: stats.aguardando, icon: Clock, color: "text-orange-500", bg: "bg-orange-500/10" },
    { label: "Entregues", value: stats.entregues, icon: PackageCheck, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: "Valor total", value: formatBRL(stats.valor), icon: TrendingUp, color: "text-primary", bg: "bg-primary/10" },
    { label: "Média separação", value: fmtMin(stats.mediaSeparacao), icon: Timer, color: "text-purple-500", bg: "bg-purple-500/10" },
    { label: "Média entrega", value: fmtMin(stats.mediaEntrega), icon: Timer, color: "text-pink-500", bg: "bg-pink-500/10" },
  ];

  const pieData = [
    { name: "Balcão", value: stats.balcao },
    { name: "Rota", value: stats.rota },
    { name: "Aguardando", value: stats.aguardando },
  ].filter((d) => d.value > 0);
  const pieColors = ["#16a34a", "#2563eb", "#f97316"];

  const tooltipStyle = {
    backgroundColor: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "8px",
    fontSize: "12px",
    color: "hsl(var(--foreground))",
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <BarChart3 className="w-4 h-4 mr-2" />
        Relatórios
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              Relatórios de Expedição
              {companyName && <span className="text-sm font-normal text-muted-foreground">· {companyName}</span>}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-3">
            <Tabs
              value={range}
              onValueChange={(v) => {
                setRange(v as Range);
                if (v === "custom") setCustom(rangeDates("semana"));
              }}
            >
              <TabsList>
                <TabsTrigger value="dia">Hoje</TabsTrigger>
                <TabsTrigger value="semana">7 dias</TabsTrigger>
                <TabsTrigger value="mes">Mês</TabsTrigger>
                <TabsTrigger value="custom">Período</TabsTrigger>
              </TabsList>
            </Tabs>
            {range === "custom" && (
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  className="w-[150px]"
                  value={custom.from}
                  onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
                />
                <span className="text-sm text-muted-foreground">até</span>
                <Input
                  type="date"
                  className="w-[150px]"
                  value={custom.to}
                  onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
                />
              </div>
            )}
            <Badge variant="secondary">
              {from === to ? from.split("-").reverse().join("/") : `${from.split("-").reverse().join("/")} — ${to.split("-").reverse().join("/")}`}
            </Badge>
            <Button variant="outline" size="sm" className="ml-auto" onClick={exportCsv} disabled={!orders.length}>
              <Download className="w-4 h-4 mr-2" />
              Exportar CSV
            </Button>
            <Button variant="outline" size="sm" onClick={exportPdf} disabled={!orders.length || pdfLoading}>
              {pdfLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
              Exportar PDF
            </Button>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : orders.length === 0 ? (
            <Card>
              <CardContent className="py-14 text-center text-muted-foreground">
                Nenhum pedido no período selecionado.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4 p-1" ref={reportRef}>
              {/* KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {kpis.map((k) => (
                  <div key={k.label} className="bg-card border border-border rounded-xl p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
                        {k.label}
                      </span>
                      <div className={`p-1.5 rounded-lg ${k.bg}`}>
                        <k.icon className={`w-3.5 h-3.5 ${k.color}`} />
                      </div>
                    </div>
                    <p className={`text-lg font-bold ${k.color}`}>{k.value}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Evolução por dia */}
                <div data-pdf-visual="chart" className="bg-card border border-border rounded-xl p-4">
                  <h3 className="font-semibold text-sm mb-3">Evolução por dia</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={stats.byDay}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="day" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Line type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2} name="Pedidos" />
                      <Line type="monotone" dataKey="balcao" stroke="#16a34a" strokeWidth={2} name="Balcão" />
                      <Line type="monotone" dataKey="rota" stroke="#2563eb" strokeWidth={2} name="Rota" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Distribuição */}
                <div data-pdf-visual="chart" className="bg-card border border-border rounded-xl p-4">
                  <h3 className="font-semibold text-sm mb-3">Distribuição por destino</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={78} paddingAngle={2} dataKey="value">
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={pieColors[i % pieColors.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex justify-center gap-4 text-xs">
                    {pieData.map((d, i) => (
                      <div key={d.name} className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-sm" style={{ background: pieColors[i % pieColors.length] }} />
                        <span className="text-muted-foreground">
                          {d.name}: <strong className="text-foreground">{d.value}</strong>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Faturamento por hora */}
                <div data-pdf-visual="chart" className="bg-card border border-border rounded-xl p-4">
                  <h3 className="font-semibold text-sm mb-3">Pedidos por hora (Manaus)</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={stats.byHour}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="hour" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Pedidos" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Vendedores */}
                <div data-pdf-visual="chart" className="bg-card border border-border rounded-xl p-4">
                  <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                    <Users className="w-4 h-4 text-primary" /> Top vendedores
                  </h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={stats.sellers} layout="vertical" margin={{ left: 0, right: 12 }}>
                      <XAxis type="number" hide />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={110}
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="total" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="Pedidos" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <NeighborhoodHeatMap data={stats.neighborhoodsAll} rows={orders} />

              {/* Rankings */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <RankTable
                  title="Conferentes"
                  rows={stats.conferentes.map((c) => ({
                    name: c.name,
                    value: `${c.total}`,
                    extra: fmtMin(c.media),
                  }))}
                  cols={["Pedidos", "Média"]}
                />
                <RankTable
                  title="Bairros"
                  rows={stats.neighborhoods.map((n) => ({ name: n.name, value: `${n.total}`, extra: formatBRL(n.valor) }))}
                  cols={["Pedidos", "Valor"]}
                />
                <RankTable
                  title="Clientes"
                  rows={stats.clients.map((c) => ({ name: c.name, value: `${c.total}`, extra: formatBRL(c.valor) }))}
                  cols={["Pedidos", "Valor"]}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <RankTable
                  title="Tipo de documento"
                  rows={stats.docs.map((d) => ({ name: d.name, value: `${d.total}`, extra: formatBRL(d.valor) }))}
                  cols={["Pedidos", "Valor"]}
                />
                <RankTable
                  title="Informações adicionais"
                  rows={stats.extras.map((d) => ({ name: d.name, value: `${d.total}`, extra: formatBRL(d.valor) }))}
                  cols={["Pedidos", "Valor"]}
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function RankTable({
  title,
  rows,
  cols,
}: {
  title: string;
  rows: { name: string; value: string; extra: string }[];
  cols: [string, string] | string[];
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <h3 className="font-semibold text-sm mb-3">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sem dados</p>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center text-[10px] uppercase tracking-wide text-muted-foreground">
            <span className="flex-1">Nome</span>
            <span className="w-16 text-right">{cols[0]}</span>
            <span className="w-24 text-right">{cols[1]}</span>
          </div>
          {rows.map((r) => (
            <div key={r.name} className="flex items-center text-xs border-t border-border/50 pt-1.5">
              <span className="flex-1 truncate pr-2" title={r.name}>
                {r.name}
              </span>
              <span className="w-16 text-right font-semibold">{r.value}</span>
              <span className="w-24 text-right text-muted-foreground">{r.extra}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
