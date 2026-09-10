import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowDownToLine, ArrowUpFromLine, Boxes, RefreshCw, Search, TriangleAlert } from "lucide-react";
import { todayISO, prevDayISO } from "@/lib/manausTime";

interface StockProduct {
  code: string;
  name: string;
  family: string | null;
  unit: string | null;
  balance: number;
  physical: number;
  reserved: number;
  entries: number;
  exits: number;
}

interface StockResponse {
  products: StockProduct[];
  movementsAvailable: boolean;
  movementsError: string | null;
  dateFrom: string;
  dateTo: string;
  cachedAt?: string;
}

const fmtQty = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const normalize = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();

function periodStart(period: "hoje" | "7d" | "mes") {
  const today = todayISO();
  if (period === "hoje") return today;
  if (period === "7d") {
    let d = today;
    for (let i = 0; i < 6; i++) d = prevDayISO(d);
    return d;
  }
  return `${today.slice(0, 7)}-01`;
}

export default function Stock() {
  const { companyId, company, hasExpedition } = useCompany();
  const [period, setPeriod] = useState<"hoje" | "7d" | "mes">("hoje");
  const [search, setSearch] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);

  const dateFrom = periodStart(period);
  const dateTo = todayISO();

  const stockQuery = useQuery({
    queryKey: ["omie-stock", companyId, dateFrom, dateTo],
    enabled: !!companyId && hasExpedition,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("omie-stock", {
        body: { companyId, dateFrom, dateTo },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as StockResponse;
    },
  });

  // Demanda pendente na expedição (pedidos aguardando separação)
  const demandQuery = useQuery({
    queryKey: ["stock-pending-demand", companyId],
    enabled: !!companyId && hasExpedition,
    refetchInterval: 60000,
    queryFn: async () => {
      const { data: orders, error: ordersError } = await supabase
        .from("expedition_orders")
        .select("id")
        .eq("company_id", companyId)
        .eq("status", "AGUARDANDO");
      if (ordersError) throw ordersError;
      const ids = (orders ?? []).map((o) => o.id);
      if (!ids.length) return [] as { code: string; name: string; quantity: number; checked: boolean }[];

      const { data: items, error: itemsError } = await supabase
        .from("expedition_order_items")
        .select("code, name, quantity, checked")
        .in("expedition_order_id", ids);
      if (itemsError) throw itemsError;
      return (items ?? []) as { code: string; name: string; quantity: number; checked: boolean }[];
    },
  });

  const demandByKey = useMemo(() => {
    const map = new Map<string, { name: string; needed: number }>();
    for (const item of demandQuery.data ?? []) {
      if (item.checked) continue;
      const key = normalize(item.code || item.name || "");
      if (!key) continue;
      const prev = map.get(key);
      map.set(key, { name: item.name, needed: (prev?.needed ?? 0) + Number(item.quantity || 0) });
    }
    return map;
  }, [demandQuery.data]);

  const rows = useMemo(() => {
    const products = stockQuery.data?.products ?? [];
    const seen = new Set<string>();
    const merged = products.map((p) => {
      const byCode = demandByKey.get(normalize(p.code));
      const byName = demandByKey.get(normalize(p.name));
      if (byCode) seen.add(normalize(p.code));
      else if (byName) seen.add(normalize(p.name));
      const needed = byCode?.needed ?? byName?.needed ?? 0;
      return { ...p, needed, missing: Math.max(0, needed - p.balance) };
    });

    // Itens pedidos que não existem na posição de estoque da Omie
    demandByKey.forEach((value, key) => {
      if (seen.has(key)) return;
      merged.push({
        code: key,
        name: value.name,
        family: null,
        unit: null,
        balance: 0,
        physical: 0,
        reserved: 0,
        entries: 0,
        exits: 0,
        needed: value.needed,
        missing: value.needed,
      });
    });

    const term = normalize(search);
    return merged
      .filter((r) => (!onlyMissing || r.missing > 0))
      .filter((r) => !term || normalize(r.name).includes(term) || normalize(r.code).includes(term))
      .sort((a, b) => b.missing - a.missing || a.name.localeCompare(b.name, "pt-BR"));
  }, [stockQuery.data, demandByKey, search, onlyMissing]);

  const totals = useMemo(() => {
    const products = stockQuery.data?.products ?? [];
    return {
      products: products.length,
      entries: products.reduce((s, p) => s + p.entries, 0),
      exits: products.reduce((s, p) => s + p.exits, 0),
      balance: products.reduce((s, p) => s + p.balance, 0),
      missingItems: rows.filter((r) => r.missing > 0).length,
    };
  }, [stockQuery.data, rows]);

  if (!hasExpedition) {
    return (
      <div className="p-4 lg:p-6">
        <Alert>
          <TriangleAlert className="h-4 w-4" />
          <AlertDescription>
            O painel de estoque está disponível apenas nas lojas Uniprint.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-4 pb-24 lg:pb-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-foreground flex items-center gap-2">
            <Boxes className="w-6 h-6 text-primary" />
            Estoque
          </h1>
          <p className="text-sm text-muted-foreground">
            {company?.name} · entradas, saídas e saldo por produto (horário de Manaus)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
            <TabsList>
              <TabsTrigger value="hoje">Hoje</TabsTrigger>
              <TabsTrigger value="7d">7 dias</TabsTrigger>
              <TabsTrigger value="mes">Mês</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            variant="outline"
            size="icon"
            onClick={() => stockQuery.refetch()}
            disabled={stockQuery.isFetching}
            title="Atualizar"
          >
            <RefreshCw className={stockQuery.isFetching ? "w-4 h-4 animate-spin" : "w-4 h-4"} />
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Produtos</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold tabular-nums">{totals.products}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1">
              <ArrowDownToLine className="w-3 h-3" /> Entradas
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold tabular-nums text-success">{fmtQty(totals.entries)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1">
              <ArrowUpFromLine className="w-3 h-3" /> Saídas
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold tabular-nums text-destructive">{fmtQty(totals.exits)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Saldo total</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold tabular-nums">{fmtQty(totals.balance)}</CardContent>
        </Card>
        <Card className={totals.missingItems > 0 ? "border-destructive" : undefined}>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Falta p/ expedição</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold tabular-nums text-destructive">{totals.missingItems}</CardContent>
        </Card>
      </div>

      {stockQuery.isError && (
        <Alert variant="destructive">
          <TriangleAlert className="h-4 w-4" />
          <AlertDescription>
            {(stockQuery.error as Error)?.message || "Não foi possível carregar o estoque."}
          </AlertDescription>
        </Alert>
      )}

      {stockQuery.data && !stockQuery.data.movementsAvailable && (
        <Alert>
          <TriangleAlert className="h-4 w-4" />
          <AlertDescription>
            As movimentações detalhadas não foram liberadas pela Omie nesta loja, então entradas e saídas aparecem
            zeradas. O saldo por produto continua atualizado.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Produtos</CardTitle>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar produto ou código"
                className="pl-8 w-full sm:w-64"
              />
            </div>
            <Button
              variant={onlyMissing ? "default" : "outline"}
              size="sm"
              onClick={() => setOnlyMissing((v) => !v)}
            >
              Só o que falta
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {stockQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nenhum produto encontrado.</p>
          ) : (
            <>
              {/* Tabela (tablet/desktop) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border">
                      <th className="py-2 pr-3 font-medium">Produto</th>
                      <th className="py-2 px-2 font-medium text-right">Entradas</th>
                      <th className="py-2 px-2 font-medium text-right">Saídas</th>
                      <th className="py-2 px-2 font-medium text-right">Saldo</th>
                      <th className="py-2 px-2 font-medium text-right">Pedido</th>
                      <th className="py-2 pl-2 font-medium text-right">Falta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.code} className="border-b border-border/60 last:border-0">
                        <td className="py-2 pr-3">
                          <div className="font-medium text-foreground">{r.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {r.code}
                            {r.family ? ` · ${r.family}` : ""}
                            {r.unit ? ` · ${r.unit}` : ""}
                          </div>
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums text-success">{fmtQty(r.entries)}</td>
                        <td className="py-2 px-2 text-right tabular-nums text-destructive">{fmtQty(r.exits)}</td>
                        <td className="py-2 px-2 text-right tabular-nums font-semibold">{fmtQty(r.balance)}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{r.needed ? fmtQty(r.needed) : "-"}</td>
                        <td className="py-2 pl-2 text-right">
                          {r.missing > 0 ? (
                            <Badge variant="destructive" className="tabular-nums">{fmtQty(r.missing)}</Badge>
                          ) : (
                            <span className="text-muted-foreground">OK</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Cards (mobile) */}
              <div className="md:hidden space-y-2">
                {rows.map((r) => (
                  <div
                    key={r.code}
                    className={`rounded-lg border p-3 ${r.missing > 0 ? "border-destructive" : "border-border"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-foreground text-sm">{r.name}</p>
                        <p className="text-xs text-muted-foreground">{r.code}</p>
                      </div>
                      {r.missing > 0 && (
                        <Badge variant="destructive" className="tabular-nums">Falta {fmtQty(r.missing)}</Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-4 gap-2 mt-2 text-xs">
                      <div>
                        <p className="text-muted-foreground">Entradas</p>
                        <p className="tabular-nums text-success">{fmtQty(r.entries)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Saídas</p>
                        <p className="tabular-nums text-destructive">{fmtQty(r.exits)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Saldo</p>
                        <p className="tabular-nums font-semibold">{fmtQty(r.balance)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Pedido</p>
                        <p className="tabular-nums">{r.needed ? fmtQty(r.needed) : "-"}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
