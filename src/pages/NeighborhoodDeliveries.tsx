import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { manausToday } from "@/lib/manausTime";
import { MapPinned, PackageCheck, Clock, XCircle, Search, ChevronDown, ChevronUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

interface RouteRow {
  id: string;
  client: string;
  neighborhood: string | null;
  address: string | null;
  status: string | null;
  period: string;
  urgent: boolean | null;
  date: string;
  order_number: number | null;
  driver: { name: string; color: string } | null;
}

const normalizeName = (s?: string | null) =>
  (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase() || "SEM BAIRRO";

interface Group {
  name: string;
  total: number;
  entregue: number;
  naoEntregue: number;
  pendente: number;
  urgentes: number;
  rows: RouteRow[];
}

export default function NeighborhoodDeliveries() {
  const { companyId, company } = useCompany();
  const [from, setFrom] = useState(manausToday());
  const [to, setTo] = useState(manausToday());
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const { data: routes = [], isLoading } = useQuery({
    queryKey: ["neighborhood-deliveries", companyId, from, to],
    enabled: !!companyId,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("routes")
        .select(
          "id, client, neighborhood, address, status, period, urgent, date, order_number, driver:drivers(name, color)"
        )
        .eq("company_id", companyId)
        .gte("date", from)
        .lte("date", to)
        .order("order_number", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as RouteRow[];
    },
  });

  const groups = useMemo(() => {
    const map = new Map<string, Group>();
    routes.forEach((r) => {
      const name = normalizeName(r.neighborhood);
      const g =
        map.get(name) ||
        { name, total: 0, entregue: 0, naoEntregue: 0, pendente: 0, urgentes: 0, rows: [] };
      g.total += 1;
      if (r.status === "ENTREGUE") g.entregue += 1;
      else if (r.status === "NAO_ENTREGUE") g.naoEntregue += 1;
      else g.pendente += 1;
      if (r.urgent) g.urgentes += 1;
      g.rows.push(r);
      map.set(name, g);
    });
    const list = [...map.values()];
    const q = normalizeName(search);
    const filtered = search.trim() ? list.filter((g) => g.name.includes(q)) : list;
    return filtered.sort(
      (a, b) => b.pendente - a.pendente || b.total - a.total || a.name.localeCompare(b.name)
    );
  }, [routes, search]);

  const totals = useMemo(
    () =>
      groups.reduce(
        (acc, g) => ({
          total: acc.total + g.total,
          entregue: acc.entregue + g.entregue,
          naoEntregue: acc.naoEntregue + g.naoEntregue,
          pendente: acc.pendente + g.pendente,
        }),
        { total: 0, entregue: 0, naoEntregue: 0, pendente: 0 }
      ),
    [groups]
  );

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-6xl mx-auto">
      <header className="space-y-1">
        <h1 className="text-xl lg:text-2xl font-bold flex items-center gap-2">
          <MapPinned className="w-6 h-6 text-primary" />
          Entregas por bairro
        </h1>
        <p className="text-sm text-muted-foreground">
          {company?.name ? `${company.name} · ` : ""}o que falta entregar em cada região
        </p>
      </header>

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3 bg-card border border-border rounded-xl p-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">De</label>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 w-[150px]"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Até</label>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 w-[150px]"
          />
        </div>
        <div className="space-y-1 flex-1 min-w-[180px]">
          <label className="text-xs text-muted-foreground">Buscar bairro</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ex.: Cidade Nova"
              className="h-9 pl-8"
            />
          </div>
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Pedidos", value: totals.total, icon: PackageCheck, cls: "text-foreground" },
          { label: "A entregar", value: totals.pendente, icon: Clock, cls: "text-amber-500" },
          { label: "Entregues", value: totals.entregue, icon: PackageCheck, cls: "text-emerald-500" },
          { label: "Não entregues", value: totals.naoEntregue, icon: XCircle, cls: "text-destructive" },
        ].map((k) => (
          <div key={k.label} className="bg-card border border-border rounded-xl p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase">
              <k.icon className="w-3.5 h-3.5" /> {k.label}
            </div>
            <p className={`text-2xl font-bold tabular-nums ${k.cls}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Lista por bairro */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma entrega no período selecionado.</p>
      ) : (
        <div className="space-y-2">
          {groups.map((g) => {
            const done = g.total ? Math.round((g.entregue / g.total) * 100) : 0;
            const isOpen = open === g.name;
            return (
              <div key={g.name} className="bg-card border border-border rounded-xl overflow-hidden">
                <button
                  onClick={() => setOpen(isOpen ? null : g.name)}
                  className="w-full text-left p-3 lg:p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{g.name}</span>
                        {g.pendente > 0 ? (
                          <Badge className="bg-amber-500 text-white hover:bg-amber-500">
                            {g.pendente} a entregar
                          </Badge>
                        ) : (
                          <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                            Concluído
                          </Badge>
                        )}
                        {g.urgentes > 0 && (
                          <Badge variant="destructive">{g.urgentes} urgente(s)</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 tabular-nums">
                        {g.total} pedido(s) · {g.entregue} entregue(s) · {g.naoEntregue} não
                        entregue(s)
                      </p>
                    </div>
                    <div className="flex items-center gap-3 min-w-[160px] flex-1 max-w-[260px]">
                      <Progress value={done} className="h-2 flex-1" />
                      <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">
                        {done}%
                      </span>
                      {isOpen ? (
                        <ChevronUp className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-border divide-y divide-border">
                    {g.rows.map((r) => (
                      <div key={r.id} className="p-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{r.client}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {r.address || "Sem endereço"}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {r.date.split("-").reverse().join("/")} ·{" "}
                            {r.period === "MANHA" ? "Manhã" : "Tarde"}
                            {r.driver ? ` · ${r.driver.name}` : " · sem motorista"}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className={
                            r.status === "ENTREGUE"
                              ? "border-emerald-500 text-emerald-500"
                              : r.status === "NAO_ENTREGUE"
                                ? "border-destructive text-destructive"
                                : "border-amber-500 text-amber-500"
                          }
                        >
                          {r.status === "ENTREGUE"
                            ? "Entregue"
                            : r.status === "NAO_ENTREGUE"
                              ? "Não entregue"
                              : "A entregar"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
