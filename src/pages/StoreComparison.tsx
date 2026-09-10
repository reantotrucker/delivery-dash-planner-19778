import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { manausToday } from "@/lib/manausTime";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { GitCompare, Trophy } from "lucide-react";

interface Row {
  company_id: string;
  status: string | null;
  urgent: boolean | null;
  driver_id: string | null;
  neighborhood: string | null;
}

interface Stat {
  total: number;
  entregue: number;
  naoEntregue: number;
  pendente: number;
  urgentes: number;
  motoristas: Set<string>;
  bairros: Set<string>;
}

const emptyStat = (): Stat => ({
  total: 0,
  entregue: 0,
  naoEntregue: 0,
  pendente: 0,
  urgentes: 0,
  motoristas: new Set(),
  bairros: new Set(),
});

export default function StoreComparison() {
  const [from, setFrom] = useState(manausToday());
  const [to, setTo] = useState(manausToday());

  const { data: companies = [] } = useQuery({
    queryKey: ["comparison-companies"],
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
    queryKey: ["store-comparison", from, to],
    refetchInterval: 60000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("routes")
        .select("company_id, status, urgent, driver_id, neighborhood")
        .gte("date", from)
        .lte("date", to);
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
      if (r.driver_id) s.motoristas.add(r.driver_id);
      if (r.neighborhood) s.bairros.add(r.neighborhood.trim().toUpperCase());
      map.set(r.company_id, s);
    });
    return map;
  }, [rows]);

  const cards = companies.map((c) => {
    const s = stats.get(c.id) || emptyStat();
    return {
      id: c.id,
      name: c.name,
      s,
      pct: s.total ? Math.round((s.entregue / s.total) * 100) : 0,
    };
  });

  const maxTotal = Math.max(1, ...cards.map((c) => c.s.total));
  const best = [...cards].sort((a, b) => b.pct - a.pct || b.s.total - a.s.total)[0];

  const linhas = [
    { l: "Pedidos", get: (s: Stat) => s.total },
    { l: "Entregues", get: (s: Stat) => s.entregue },
    { l: "Não entregues", get: (s: Stat) => s.naoEntregue },
    { l: "Pendentes", get: (s: Stat) => s.pendente },
    { l: "Urgentes", get: (s: Stat) => s.urgentes },
    { l: "Motoristas ativos", get: (s: Stat) => s.motoristas.size },
    { l: "Bairros atendidos", get: (s: Stat) => s.bairros.size },
  ];

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-6xl mx-auto">
      <header className="space-y-1">
        <h1 className="text-xl lg:text-2xl font-bold flex items-center gap-2">
          <GitCompare className="w-6 h-6 text-primary" />
          Comparativo entre lojas
        </h1>
        <p className="text-sm text-muted-foreground">
          Desempenho das lojas lado a lado no período escolhido
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3 bg-card border border-border rounded-xl p-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">De</label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-[150px]" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Até</label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-[150px]" />
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <>
          {best && best.s.total > 0 && (
            <div className="bg-card border border-border rounded-xl p-3 flex items-center gap-2 text-sm">
              <Trophy className="w-4 h-4 text-amber-500" />
              <span>
                Melhor taxa de entrega no período: <strong>{best.name}</strong> com {best.pct}%
              </span>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-3">
            {cards.map((c) => (
              <div key={c.id} className="bg-card border border-border rounded-xl p-4 space-y-3">
                <div>
                  <p className="font-semibold">{c.name}</p>
                  <p className="text-3xl font-bold tabular-nums">{c.s.total}</p>
                  <p className="text-xs text-muted-foreground">pedidos no período</p>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Taxa de entrega</span>
                    <span className="tabular-nums">{c.pct}%</span>
                  </div>
                  <Progress value={c.pct} className="h-2" />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Volume relativo</span>
                    <span className="tabular-nums">
                      {Math.round((c.s.total / maxTotal) * 100)}%
                    </span>
                  </div>
                  <Progress value={(c.s.total / maxTotal) * 100} className="h-2" />
                </div>
                <div className="grid grid-cols-3 gap-2 text-center pt-1">
                  <div>
                    <p className="text-lg font-bold text-emerald-500 tabular-nums">{c.s.entregue}</p>
                    <p className="text-[10px] uppercase text-muted-foreground">Entregues</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-amber-500 tabular-nums">{c.s.pendente}</p>
                    <p className="text-[10px] uppercase text-muted-foreground">Pendentes</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-destructive tabular-nums">{c.s.naoEntregue}</p>
                    <p className="text-[10px] uppercase text-muted-foreground">Não entr.</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-card border border-border rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3 font-medium text-muted-foreground">Indicador</th>
                  {cards.map((c) => (
                    <th key={c.id} className="text-right p-3 font-medium">
                      {c.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.map((row) => (
                  <tr key={row.l} className="border-b border-border last:border-0">
                    <td className="p-3 text-muted-foreground">{row.l}</td>
                    {cards.map((c) => (
                      <td key={c.id} className="p-3 text-right tabular-nums font-medium">
                        {row.get(c.s)}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <td className="p-3 text-muted-foreground">Taxa de entrega</td>
                  {cards.map((c) => (
                    <td key={c.id} className="p-3 text-right tabular-nums font-medium">
                      {c.pct}%
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
