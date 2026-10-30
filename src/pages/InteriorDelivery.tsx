import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Ship, RefreshCw, Package, MapPin, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { interiorCall, InteriorPedido, STATUS_LABEL, brl, clienteNome, recebidoDia } from "@/lib/interior";
import { InteriorConferenceDialog } from "@/components/interior/InteriorConferenceDialog";
import { InteriorReports } from "@/components/interior/InteriorReports";

const ALL = "__all__";

const statusClass = (s: string) =>
  s === "conferido"
    ? "bg-primary/15 text-primary border-primary/30"
    : s === "aguardando_conferencia"
      ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
      : "bg-muted text-muted-foreground border-border";

export default function InteriorDelivery() {
  const [vendedor, setVendedor] = useState(ALL);
  const [transporte, setTransporte] = useState(ALL);
  const [data, setData] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const { data: lista, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["interior-lista"],
    refetchInterval: 60000,
    queryFn: () => interiorCall<{ pedidos: InteriorPedido[] }>({ acao: "listar" }),
  });

  const pedidos = lista?.pedidos || [];
  const vendedores = useMemo(
    () => [...new Set(pedidos.map((p) => p.vendedor_nome).filter(Boolean) as string[])].sort(),
    [pedidos]
  );
  const transportes = useMemo(
    () => [...new Set(pedidos.map((p) => p.transporte_interior).filter(Boolean) as string[])].sort(),
    [pedidos]
  );

  const filtrados = useMemo(
    () =>
      pedidos.filter(
        (p) =>
          (vendedor === ALL || p.vendedor_nome === vendedor) &&
          (transporte === ALL || p.transporte_interior === transporte) &&
          (!data || recebidoDia(p) === data)
      ),
    [pedidos, vendedor, transporte, data]
  );

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-7xl mx-auto">
      <header>
        <h1 className="text-xl lg:text-2xl font-bold flex items-center gap-2">
          <Ship className="w-6 h-6 text-primary" />
          Entrega para interior
        </h1>
        <p className="text-sm text-muted-foreground">Pedidos recebidos do Stock360 Vendas para conferência</p>
      </header>

      <Tabs defaultValue="recebidos">
        <TabsList>
          <TabsTrigger value="recebidos">Recebidos</TabsTrigger>
          <TabsTrigger value="relatorios">Relatórios</TabsTrigger>
        </TabsList>

        <TabsContent value="recebidos" className="space-y-4 mt-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Vendedor</label>
              <Select value={vendedor} onValueChange={setVendedor}>
                <SelectTrigger className="h-9 w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos</SelectItem>
                  {vendedores.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Transporte</label>
              <Select value={transporte} onValueChange={setTransporte}>
                <SelectTrigger className="h-9 w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos</SelectItem>
                  {transportes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Data de recebimento</label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} className="h-9 w-[160px]" />
            </div>
            {(vendedor !== ALL || transporte !== ALL || data) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setVendedor(ALL);
                  setTransporte(ALL);
                  setData("");
                }}
              >
                Limpar
              </Button>
            )}
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={cn("w-4 h-4 mr-1", isFetching && "animate-spin")} /> Atualizar
            </Button>
          </div>

          {isLoading && (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          )}
          {error && (
            <p className="text-sm text-destructive">Não foi possível carregar os pedidos: {(error as Error).message}</p>
          )}
          {!isLoading && !error && filtrados.length === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center">Nenhum pedido encontrado.</p>
          )}

          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtrados.map((p) => (
              <button
                key={p.id}
                onClick={() => setOpen(p.id)}
                className="text-left bg-card border border-border rounded-xl p-4 space-y-2 hover:border-primary/60 hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Pedido #{p.numero_pedido ?? "—"}</p>
                    <p className="font-semibold truncate">{clienteNome(p)}</p>
                  </div>
                  <Badge variant="outline" className={cn("flex-shrink-0", statusClass(p.status))}>
                    {STATUS_LABEL[p.status] || p.status}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1 truncate">
                    <MapPin className="w-3 h-3 flex-shrink-0" />
                    {[p.clientes?.cidade, p.clientes?.uf].filter(Boolean).join("/") || "—"}
                  </span>
                  <span className="flex items-center gap-1 truncate">
                    <User className="w-3 h-3 flex-shrink-0" />
                    {p.vendedor_nome || "—"}
                  </span>
                  <span className="flex items-center gap-1 truncate">
                    <Ship className="w-3 h-3 flex-shrink-0" />
                    {p.transporte_interior || "—"}
                  </span>
                  <span className="flex items-center gap-1">
                    <Package className="w-3 h-3 flex-shrink-0" />
                    {p.qtd_volumes != null ? `${p.qtd_volumes} vol.` : "Sem volumes"}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-border">
                  <span className="text-xs text-muted-foreground">{(p.itens || []).length} itens</span>
                  <span className="font-bold tabular-nums">{brl(p.valor_total)}</span>
                </div>
                {p.erro_omie_mensagem && (
                  <p className="text-xs text-destructive line-clamp-2">Omie: {p.erro_omie_mensagem}</p>
                )}
              </button>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="relatorios" className="mt-4">
          <InteriorReports />
        </TabsContent>
      </Tabs>

      <InteriorConferenceDialog pedidoId={open} onClose={() => setOpen(null)} />
    </div>
  );
}
