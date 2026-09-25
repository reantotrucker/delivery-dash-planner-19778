import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  Truck,
  MapPin,
  PackageCheck,
  Download,
  AlertTriangle,
  Clock,
  Zap,
} from "lucide-react";

type Range = "dia" | "semana" | "mes" | "custom";

interface Props {
  companyId: string | null;
  companyName?: string;
}

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

const br = (d: string) => d.split("-").reverse().join("/");
const shortDay = (d: string) => d.slice(8, 10) + "/" + d.slice(5, 7);

export function RouteReports({ companyId, companyName }: Props) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<Range>("mes");
  const [custom, setCustom] = useState(rangeDates("mes"));

  const { from, to } = range === "custom" ? custom : rangeDates(range);

  const { data: routes = [], isLoading } = useQuery({
    queryKey: ["route-report", companyId, from, to],
    enabled: open && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("routes")
        .select(
          "id, date, period, client, neighborhood, address, status, urgent, order_number, observation, driver:drivers(name, color), consultant:consultants(name), payment_method:payment_methods(name)"
        )
        .eq("company_id", companyId)
        .gte("date", from)
        .lte("date", to)
        .order("date", { ascending: true });
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const { data: occurrences = [] } = useQuery({
    queryKey: ["route-report-occ", companyId, from, to],
    enabled: open && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("route_occurrences")
        .select("id, motorista, vendedor, cliente, route:routes!inner(date, company_id, driver:drivers(name))")
        .eq("route.company_id", companyId)
        .gte("route.date", from)
        .lte("route.date", to);
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const stats = useMemo(() => {
    const total = routes.length;
    const entregues = routes.filter((r) => r.status === "ENTREGUE").length;
    const naoEntregues = routes.filter((r) => r.status === "NAO_ENTREGUE").length;
    const pendentes = total - entregues - naoEntregues;
    const urgentes = routes.filter((r) => r.urgent).length;
    const manha = routes.filter((r) => r.period === "MANHA").length;
    const tarde = routes.filter((r) => r.period === "TARDE").length;

    const byDayMap = new Map<string, any>();
    routes.forEach((r) => {
      const k = shortDay(r.date);
      const e = byDayMap.get(k) || { day: k, total: 0, entregues: 0, pendentes: 0 };
      e.total++;
      if (r.status === "ENTREGUE") e.entregues++;
      else e.pendentes++;
      byDayMap.set(k, e);
    });

    const group = (fn: (r: any) => string) => {
      const m = new Map<string, { name: string; total: number; entregues: number }>();
      routes.forEach((r) => {
        const k = fn(r) || "Não informado";
        const e = m.get(k) || { name: k, total: 0, entregues: 0 };
        e.total++;
        if (r.status === "ENTREGUE") e.entregues++;
        m.set(k, e);
      });
      return [...m.values()].sort((a, b) => b.total - a.total);
    };

    const drivers = group((r) => r.driver?.name).map((d) => ({
      ...d,
      taxa: d.total ? Math.round((d.entregues / d.total) * 100) : 0,
    }));

    const occByDriver = (() => {
      const m = new Map<string, { name: string; motorista: number; vendedor: number; cliente: number; total: number }>();
      occurrences.forEach((o: any) => {
        const k = o.route?.driver?.name || "Não informado";
        const e = m.get(k) || { name: k, motorista: 0, vendedor: 0, cliente: 0, total: 0 };
        e.total++;
        if (o.motorista) e.motorista++;
        if (o.vendedor) e.vendedor++;
        if (o.cliente) e.cliente++;
        m.set(k, e);
      });
      return [...m.values()].sort((a, b) => b.total - a.total);
    })();

    return {
      total,
      entregues,
      naoEntregues,
      pendentes,
      urgentes,
      manha,
      tarde,
      taxa: total ? Math.round((entregues / total) * 100) : 0,
      byDay: [...byDayMap.values()],
      drivers,
      neighborhoods: group((r) => r.neighborhood),
      consultants: group((r) => r.consultant?.name),
      payments: group((r) => r.payment_method?.name),
      occTotal: occurrences.length,
      occByDriver,
    };
  }, [routes, occurrences]);

  const kpis = [
    { label: "Rotas", value: stats.total, icon: MapPin, color: "text-primary", bg: "bg-primary/10" },
    { label: "Entregues", value: stats.entregues, icon: PackageCheck, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: "Não entregues", value: stats.naoEntregues, icon: AlertTriangle, color: "text-red-500", bg: "bg-red-500/10" },
    { label: "Pendentes", value: stats.pendentes, icon: Clock, color: "text-orange-500", bg: "bg-orange-500/10" },
    { label: "Taxa de entrega", value: `${stats.taxa}%`, icon: Truck, color: "text-blue-500", bg: "bg-blue-500/10" },
    { label: "Urgentes", value: stats.urgentes, icon: Zap, color: "text-yellow-500", bg: "bg-yellow-500/10" },
    { label: "Manhã / Tarde", value: `${stats.manha} / ${stats.tarde}`, icon: Clock, color: "text-purple-500", bg: "bg-purple-500/10" },
    { label: "Ocorrências", value: stats.occTotal, icon: AlertTriangle, color: "text-pink-500", bg: "bg-pink-500/10" },
  ];

  const pieData = [
    { name: "Entregues", value: stats.entregues },
    { name: "Não entregues", value: stats.naoEntregues },
    { name: "Pendentes", value: stats.pendentes },
  ].filter((d) => d.value > 0);
  const pieColors = ["#16a34a", "#dc2626", "#f97316"];

  const tooltipStyle = {
    backgroundColor: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "8px",
    fontSize: "12px",
    color: "hsl(var(--foreground))",
  };

  const periodo = from === to ? br(from) : `${br(from)} — ${br(to)}`;

  const exportCsv = () => {
    const head = ["Data", "Período", "Nº", "Cliente", "Bairro", "Endereço", "Motorista", "Consultor", "Pagamento", "Status", "Urgente", "Observação"];
    const rows = routes.map((r) => [
      br(r.date),
      r.period === "MANHA" ? "Manhã" : "Tarde",
      r.order_number ?? "",
      r.client,
      r.neighborhood || "",
      r.address || "",
      r.driver?.name || "",
      r.consultant?.name || "",
      r.payment_method?.name || "",
      r.status === "ENTREGUE" ? "Entregue" : r.status === "NAO_ENTREGUE" ? "Não entregue" : "Pendente",
      r.urgent ? "Sim" : "Não",
      r.observation || "",
    ]);
    const csv = [head, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `rotas-${from}-a-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    const esc = (s: any) =>
      String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const kpiCells = kpis
      .map(
        (k) =>
          `<div class="kpi"><span class="kpi-l">${esc(k.label)}</span><strong class="kpi-v">${esc(k.value)}</strong></div>`
      )
      .join("");

    const bar = (v: number, max: number) =>
      `<div class="bar"><i style="width:${max ? Math.max(2, Math.round((v / max) * 100)) : 0}%"></i></div>`;

    const table = (
      title: string,
      cols: string[],
      rows: (string | number)[][],
      barCol?: number
    ) => {
      const max = barCol !== undefined ? Math.max(...rows.map((r) => Number(r[barCol]) || 0), 0) : 0;
      return `<h2>${esc(title)}</h2><table><thead><tr>${cols
        .map((c) => `<th>${esc(c)}</th>`)
        .join("")}${barCol !== undefined ? "<th></th>" : ""}</tr></thead><tbody>${rows
        .map(
          (r) =>
            `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}${
              barCol !== undefined ? `<td class="barcell">${bar(Number(r[barCol]) || 0, max)}</td>` : ""
            }</tr>`
        )
        .join("")}</tbody></table>`;
    };

    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Relatório de Rotas — ${esc(companyName || "Empresa")} — ${esc(periodo)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;600&display=swap" rel="stylesheet">
<style>
@page { size: A4 portrait; margin: 12mm; }
* { box-sizing: border-box; }
body { margin:0; background:#FAFAF7; color:#1A1D23; font-family:'Inter',system-ui,sans-serif; font-size:10pt; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
header.top { border-bottom:2px solid #1A1D23; padding-bottom:4mm; margin-bottom:6mm; display:flex; justify-content:space-between; align-items:flex-end; }
h1 { font-family:'Space Grotesk',sans-serif; font-size:20pt; margin:0; letter-spacing:-.4px; }
.sub { font-size:9pt; color:#4B4F58; margin:2mm 0 0; }
.gen { font-size:8pt; color:#8A8D94; text-align:right; }
h2 { font-family:'Space Grotesk',sans-serif; font-size:11pt; margin:7mm 0 2mm; color:#D63A2E; text-transform:uppercase; letter-spacing:.4px; }
.kpis { display:grid; grid-template-columns:repeat(4,1fr); border:1px solid #E4E1D8; }
.kpi { border-right:1px solid #E4E1D8; border-bottom:1px solid #E4E1D8; padding:3mm; }
.kpi-l { display:block; font-size:7.5pt; text-transform:uppercase; letter-spacing:.5px; color:#8A8D94; }
.kpi-v { font-family:'Space Grotesk',sans-serif; font-size:15pt; font-variant-numeric:tabular-nums; }
table { width:100%; border-collapse:collapse; font-variant-numeric:tabular-nums; }
th { text-align:left; font-size:8pt; text-transform:uppercase; color:#8A8D94; border-bottom:1px solid #1A1D23; padding:1.5mm 2mm; }
td { font-size:9pt; border-bottom:1px solid #E4E1D8; padding:1.5mm 2mm; }
.barcell { width:26mm; }
.bar { background:#E4E1D8; height:2.4mm; }
.bar i { display:block; height:100%; background:#D63A2E; }
footer { margin-top:8mm; border-top:1px solid #E4E1D8; padding-top:2mm; font-size:8pt; color:#8A8D94; display:flex; justify-content:space-between; }
</style></head><body>
<header class="top">
  <div>
    <h1>Relatório de Rotas</h1>
    <p class="sub">${esc(companyName || "Empresa")} · Período: ${esc(periodo)} · Horário de Manaus</p>
  </div>
  <div class="gen">Gerado em ${esc(new Date().toLocaleString("pt-BR", { timeZone: "America/Manaus" }))}</div>
</header>
<div class="kpis">${kpiCells}</div>
${table("Desempenho por motorista", ["Motorista", "Rotas", "Entregues", "Taxa"], stats.drivers.map((d) => [d.name, d.total, d.entregues, `${d.taxa}%`]), 1)}
${table("Rotas por dia", ["Dia", "Rotas", "Entregues", "Pendentes"], stats.byDay.map((d: any) => [d.day, d.total, d.entregues, d.pendentes]), 1)}
${table("Bairros atendidos (top 15)", ["Bairro", "Rotas", "Entregues"], stats.neighborhoods.slice(0, 15).map((n) => [n.name, n.total, n.entregues]), 1)}
${table("Consultores", ["Consultor", "Rotas", "Entregues"], stats.consultants.slice(0, 15).map((c) => [c.name, c.total, c.entregues]), 1)}
${table("Formas de pagamento", ["Pagamento", "Rotas"], stats.payments.map((p) => [p.name, p.total]), 1)}
${
  stats.occByDriver.length
    ? table("Ocorrências por motorista", ["Motorista", "Total", "Motorista", "Vendedor", "Cliente"], stats.occByDriver.map((o) => [o.name, o.total, o.motorista, o.vendedor, o.cliente]), 1)
    : ""
}
<footer><span>${esc(companyName || "Empresa")}</span><span>Relatório de Rotas · ${esc(periodo)}</span></footer>
</body></html>`;

    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    document.body.appendChild(iframe);
    const idoc = iframe.contentDocument!;
    idoc.open();
    idoc.write(html);
    idoc.close();
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => iframe.remove(), 1500);
    }, 500);
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <BarChart3 className="w-4 h-4 mr-2" />
        Relatório dinâmico
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              Relatório de Rotas
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
            <Badge variant="secondary">{periodo}</Badge>
            <Button variant="outline" size="sm" className="ml-auto" onClick={exportCsv} disabled={!routes.length}>
              <Download className="w-4 h-4 mr-2" />
              Exportar CSV
            </Button>
            <Button variant="outline" size="sm" onClick={exportPdf} disabled={!routes.length}>
              <Download className="w-4 h-4 mr-2" />
              Exportar PDF
            </Button>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : routes.length === 0 ? (
            <Card>
              <CardContent className="py-14 text-center text-muted-foreground">
                Nenhuma rota no período selecionado.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4 p-1">
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
                <div className="bg-card border border-border rounded-xl p-4">
                  <h3 className="font-semibold text-sm mb-3">Evolução por dia</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={stats.byDay}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="day" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Line type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2} name="Rotas" />
                      <Line type="monotone" dataKey="entregues" stroke="#16a34a" strokeWidth={2} name="Entregues" />
                      <Line type="monotone" dataKey="pendentes" stroke="#f97316" strokeWidth={2} name="Pendentes" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="bg-card border border-border rounded-xl p-4">
                  <h3 className="font-semibold text-sm mb-3">Situação das entregas</h3>
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

                <div className="bg-card border border-border rounded-xl p-4">
                  <h3 className="font-semibold text-sm mb-3">Rotas por motorista</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={stats.drivers.slice(0, 10)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} interval={0} angle={-20} height={50} textAnchor="end" />
                      <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="entregues" name="Entregues" fill="#16a34a" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="total" name="Rotas" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="bg-card border border-border rounded-xl p-4">
                  <h3 className="font-semibold text-sm mb-3">Top bairros</h3>
                  <div className="space-y-2">
                    {stats.neighborhoods.slice(0, 8).map((n) => (
                      <div key={n.name} className="flex items-center gap-2 text-sm">
                        <span className="flex-1 truncate">{n.name}</span>
                        <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary"
                            style={{
                              width: `${Math.round((n.total / (stats.neighborhoods[0]?.total || 1)) * 100)}%`,
                            }}
                          />
                        </div>
                        <strong className="w-8 text-right">{n.total}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-card border border-border rounded-xl p-4">
                  <h3 className="font-semibold text-sm mb-3">Consultores</h3>
                  <div className="space-y-2 text-sm">
                    {stats.consultants.slice(0, 10).map((c) => (
                      <div key={c.name} className="flex justify-between border-b border-border/60 pb-1">
                        <span className="truncate">{c.name}</span>
                        <span className="text-muted-foreground">
                          {c.total} rotas · <strong className="text-foreground">{c.entregues}</strong> entregues
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-card border border-border rounded-xl p-4">
                  <h3 className="font-semibold text-sm mb-3">Ocorrências por motorista</h3>
                  {stats.occByDriver.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma ocorrência no período.</p>
                  ) : (
                    <div className="space-y-2 text-sm">
                      {stats.occByDriver.map((o) => (
                        <div key={o.name} className="flex justify-between border-b border-border/60 pb-1">
                          <span className="truncate">{o.name}</span>
                          <span className="text-muted-foreground">
                            {o.total} · M {o.motorista} / V {o.vendedor} / C {o.cliente}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <RouteListing routes={routes} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function RouteListing({ routes }: { routes: any[] }) {
  const [by, setBy] = useState<"consultant" | "driver">("consultant");
  const [sel, setSel] = useState("__all");
  const keyOf = (r: any) => (by === "driver" ? r.driver?.name : r.consultant?.name) || "Não informado";
  const names = useMemo(() => Array.from(new Set(routes.map(keyOf))).sort(), [routes, by]);
  const filtered = routes.filter((r) => sel === "__all" || keyOf(r) === sel);
  const groups = useMemo(() => {
    const m = new Map<string, any[]>();
    filtered.forEach((r) => {
      const k = keyOf(r);
      m.set(k, [...(m.get(k) || []), r]);
    });
    return Array.from(m.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [filtered, by]);
  const statusLabel = (s: string) =>
    s === "ENTREGUE" ? "Entregue" : s === "NAO_ENTREGUE" ? "Não entregue" : "Pendente";
  const statusCls = (s: string) =>
    s === "ENTREGUE" ? "text-success" : s === "NAO_ENTREGUE" ? "text-destructive" : "text-muted-foreground";

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="font-semibold text-sm">Lista de rotas no período ({filtered.length})</h3>
        <div className="flex flex-wrap gap-2">
          <Tabs value={by} onValueChange={(v) => { setBy(v as any); setSel("__all"); }}>
            <TabsList>
              <TabsTrigger value="consultant">Por vendedor</TabsTrigger>
              <TabsTrigger value="driver">Por motorista</TabsTrigger>
            </TabsList>
          </Tabs>
          <select
            value={sel}
            onChange={(e) => setSel(e.target.value)}
            className="bg-secondary text-foreground text-sm px-2 py-1 rounded border border-border"
          >
            <option value="__all">Todos</option>
            {names.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      </div>
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma rota no período.</p>
      ) : (
        <div className="space-y-4">
          {groups.map(([name, list]) => (
            <div key={name}>
              <div className="font-semibold text-sm mb-1 flex justify-between">
                <span>{name}</span>
                <span className="text-muted-foreground font-normal">
                  {list.length} rotas · {list.filter((r) => r.status === "ENTREGUE").length} entregues
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr className="border-b border-border text-left">
                      <th className="py-1 pr-2">Data</th>
                      <th className="pr-2">Período</th>
                      <th className="pr-2">Cliente</th>
                      <th className="pr-2">Bairro</th>
                      <th className="pr-2">{by === "driver" ? "Vendedor" : "Motorista"}</th>
                      <th className="pr-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r) => (
                      <tr key={r.id} className="border-b border-border/50">
                        <td className="py-1 pr-2 whitespace-nowrap">{br(r.date)}</td>
                        <td className="pr-2">{r.period === "MANHA" ? "Manhã" : "Tarde"}</td>
                        <td className="pr-2">{r.client}</td>
                        <td className="pr-2">{r.neighborhood}</td>
                        <td className="pr-2">{(by === "driver" ? r.consultant?.name : r.driver?.name) || "—"}</td>
                        <td className={`pr-2 ${statusCls(r.status)}`}>{statusLabel(r.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default RouteReports;
