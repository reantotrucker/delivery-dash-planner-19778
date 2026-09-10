import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { manausToday } from "@/lib/manausTime";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ClipboardList, Truck, CheckCircle2, XCircle, Clock } from "lucide-react";

interface Row {
  id: string;
  company_id: string;
  client: string;
  status: string | null;
  urgent: boolean | null;
  driver_id: string | null;
  driver: { name: string; color: string } | null;
}

interface Stat {
  total: number;
  entregue: number;
  naoEntregue: number;
  pendente: number;
  urgentes: number;
  comMotorista: number;
  drivers: Map<string, { name: string; color: string; total: number; entregue: number }>;
}

const emptyStat = (): Stat => ({
  total: 0,
  entregue: 0,
  naoEntregue: 0,
  pendente: 0,
  urgentes: 0,
  comMotorista: 0,
  drivers: new Map(),
});

export default function DailySummary() {
  const [date, setDate] = useState(manausToday());

  const { data: companies = [] } = useQuery({
    queryKey: ["summary-companies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name, slug")
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["daily-summary", date],
    refetchInterval: 60000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("routes")
        .select("id, company_id, client, status, urgent, driver_id, driver:drivers(name, color)")
        .eq("date", date);
      if (error) throw error;
      return (data || []) as unknown as Row[];
    },
  });

  const stats = useMemo(() => {
    const map = new Map<string, Stat>();
    rows.forEach((r) => {
      const s = map.get(r.company_id) || emptyStat();
      s.total += 1;
      if (r.status === "ENTREGUE") s.entregue += 1;
      else if (r.status === "NAO_ENTREGUE") s.naoEntregue += 1;
      else s.pendente += 1;
      if (r.urgent) s.urgentes += 1;
      if (r.driver_id) s.comMotorista += 1;
      if (r.driver) {
        const d =
          s.drivers.get(r.driver.name) || {
            name: r.driver.name,
            color: r.driver.color,
            total: 0,
            entregue: 0,
          };
        d.total += 1;
        if (r.status === "ENTREGUE") d.entregue += 1;
        s.drivers.set(r.driver.name, d);
      }
      map.set(r.company_id, s);
    });
    return map;
  }, [rows]);

  const geral = useMemo(() => {
    const acc = emptyStat();
    stats.forEach((s) => {
      acc.total += s.total;
      acc.entregue += s.entregue;
      acc.naoEntregue += s.naoEntregue;
      acc.pendente += s.pendente;
      acc.urgentes += s.urgentes;
      acc.comMotorista += s.comMotorista;
    });
    return acc;
  }, [stats]);

  const kpis = [
    { label: "Pedidos do dia", value: geral.total, icon: ClipboardList, cls: "text-foreground" },
    { label: "Saíram para rota", value: geral.comMotorista, icon: Truck, cls: "text-primary" },
    { label: "Entregues", value: geral.entregue, icon: CheckCircle2, cls: "text-emerald-500" },
    { label: "Sobraram", value: geral.pendente, icon: Clock, cls: "text-amber-500" },
    { label: "Não entregues", value: geral.naoEntregue, icon: XCircle, cls: "text-destructive" },
  ];

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-6xl mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-primary" />
            Resumo do dia
          </h1>
          <p className="text-sm text-muted-foreground">
            Quantos saíram, entregaram e sobraram — loja por loja (horário de Manaus)
          </p>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Dia</label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-9 w-[160px]"
          />
        </div>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className="bg-card border border-border rounded-xl p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase">
              <k.icon className="w-3.5 h-3.5" /> {k.label}
            </div>
            <p className={`text-2xl font-bold tabular-nums ${k.cls}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <div className="space-y-3">
          {companies.map((c) => {
            const s = stats.get(c.id) || emptyStat();
            const pct = s.total ? Math.round((s.entregue / s.total) * 100) : 0;
            const drivers = [...s.drivers.values()].sort((a, b) => b.total - a.total);
            return (
              <div key={c.id} className="bg-card border border-border rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{c.name}</span>
                    {s.urgentes > 0 && (
                      <Badge variant="destructive">{s.urgentes} urgente(s)</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 min-w-[180px] flex-1 max-w-[280px]">
                    <Progress value={pct} className="h-2 flex-1" />
                    <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">
                      {pct}%
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
                  {[
                    { l: "Pedidos", v: s.total, c: "text-foreground" },
                    { l: "Saíram", v: s.comMotorista, c: "text-primary" },
                    { l: "Entregues", v: s.entregue, c: "text-emerald-500" },
                    { l: "Sobraram", v: s.pendente, c: "text-amber-500" },
                    { l: "Não entregues", v: s.naoEntregue, c: "text-destructive" },
                  ].map((b) => (
                    <div key={b.l} className="border border-border rounded-lg py-2">
                      <p className={`text-lg font-bold tabular-nums ${b.c}`}>{b.v}</p>
                      <p className="text-[10px] uppercase text-muted-foreground">{b.l}</p>
                    </div>
                  ))}
                </div>

                {drivers.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {drivers.map((d) => (
                      <span
                        key={d.name}
                        className="text-xs px-2 py-1 rounded-full border border-border flex items-center gap-1.5"
                      >
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: d.color }}
                        />
                        {d.name}
                        <span className="text-muted-foreground tabular-nums">
                          {d.entregue}/{d.total}
                        </span>
                      </span>
                    ))}
                  </div>
                )}

                {s.total === 0 && (
                  <p className="text-xs text-muted-foreground">Nenhum pedido nesse dia.</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
