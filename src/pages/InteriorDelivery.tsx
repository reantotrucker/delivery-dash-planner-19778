import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Ship, RefreshCw, Package, MapPin, User, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { interiorCall, InteriorPedido, STATUS_LABEL, brl, clienteNome, fmtDateTime, recebidoDia } from "@/lib/interior";
import { InteriorConferenceDialog } from "@/components/interior/InteriorConferenceDialog";
import { InteriorReports } from "@/components/interior/InteriorReports";

const ALL = "__all__";

const statusClass = (s: string) =>
  s === "conferido"
    ? "bg-success/15 text-success border-success/40"
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

  const hasFilter = vendedor !== ALL || transporte !== ALL || !!data;

  return (
    <div className="p-3 sm:p-4 lg:p-6 space-y-3 sm:space-y-4 max-w-7xl mx-auto w-full min-w-0 overflow-x-hidden">
      <header className="min-w-0">
        <h1 className="text-lg sm:text-xl lg:text-2xl font-bold flex items-center gap-2">
          <Ship className="w-5 h-5 sm:w-6 sm:h-6 text-primary flex-shrink-0" />
          Entrega para interior
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground">Pedidos recebidos do Stock360 Vendas para conferência</p>
      </header>

      <Tabs defaultValue="recebidos" className="min-w-0">
        <TabsList className="grid grid-cols-2 w-full sm:inline-flex sm:w-auto">
          <TabsTrigger value="recebidos">Recebidos{pedidos.length ? ` (${pedidos.length})` : ""}</TabsTrigger>
          <TabsTrigger value="relatorios">Relatórios</TabsTrigger>
        </TabsList>

        <TabsContent value="recebidos" className="space-y-3 sm:space-y-4 mt-3 sm:mt-4 min-w-0">
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end sm:gap-3">
            <div className="space-y-1 min-w-0">
              <label className="text-xs text-muted-foreground">Vendedor</label>
              <Select value={vendedor} onValueChange={setVendedor}>
                <SelectTrigger className="h-9 w-full sm:w-[180px]">
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
            <div className="space-y-1 min-w-0">
              <label className="text-xs text-muted-foreground">Transporte</label>
              <Select value={transporte} onValueChange={setTransporte}>
                <SelectTrigger className="h-9 w-full sm:w-[160px]">
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
            <div className="space-y-1 min-w-0">
              <label className="text-xs text-muted-foreground">Recebido em</label>
              <Input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="h-9 w-full min-w-0 sm:w-[160px]"
              />
            </div>
            <div className="flex items-end gap-2 min-w-0 sm:ml-auto">
              {hasFilter && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 px-2 sm:px-3"
                  onClick={() => {
                    setVendedor(ALL);
                    setTransporte(ALL);
                    setData("");
                  }}
                >
                  Limpar
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-9 flex-1 sm:flex-none"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                <RefreshCw className={cn("w-4 h-4 mr-1", isFetching && "animate-spin")} /> Atualizar
              </Button>
            </div>
          </div>

          {!isLoading && !error && pedidos.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {filtrados.length} de {pedidos.length} pedidos
            </p>
          )}

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

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 min-w-0">
            {filtrados.map((p) => {
              const conferido = !!p.interior_conferido_em || p.status === "conferido";
              return (
              <button
                key={p.id}
                onClick={() => setOpen(p.id)}
                className={cn(
                  "w-full min-w-0 text-left border rounded-xl p-3 sm:p-4 space-y-2 hover:shadow-md active:scale-[0.99] transition-all",
                  conferido
                    ? "bg-success/10 border-success/60 border-l-4 border-l-success hover:border-success"
                    : "bg-card border-border hover:border-primary/60"
                )}
              >
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <p className="text-xs text-muted-foreground flex-shrink-0">Pedido #{p.numero_pedido ?? "—"}</p>
                  <Badge
                    variant="outline"
                    className={cn("text-[10px] sm:text-xs whitespace-nowrap min-w-0 truncate", statusClass(p.status))}
                  >
                    {STATUS_LABEL[p.status] || p.status}
                  </Badge>
                </div>
                <p className="font-semibold leading-snug line-clamp-2 break-words">{clienteNome(p)}</p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground min-w-0">
                  <span className="flex items-center gap-1 min-w-0">
                    <MapPin className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">
                      {[p.clientes?.cidade, p.clientes?.uf].filter(Boolean).join("/") || "—"}
                    </span>
                  </span>
                  <span className="flex items-center gap-1 min-w-0">
                    <User className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{p.vendedor_nome || "—"}</span>
                  </span>
                  <span className="flex items-center gap-1 min-w-0">
                    <Ship className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{p.transporte_interior || "—"}</span>
                  </span>
                  <span className="flex items-center gap-1 min-w-0">
                    <Package className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">
                      {p.qtd_volumes != null ? `${p.qtd_volumes} vol.` : "Sem volumes"}
                    </span>
                  </span>
                </div>
                {p.interior_conferido_por && (
                  <p className="flex items-center gap-1 text-xs text-success font-medium min-w-0">
                    <UserCheck className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">
                      Conferido por <b>{p.interior_conferido_por}</b>
                      {p.interior_conferido_em ? ` · ${fmtDateTime(p.interior_conferido_em)}` : ""}
                    </span>
                  </p>
                )}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
                  <span className="text-xs text-muted-foreground">{(p.itens || []).length} itens</span>
                  <span className="font-bold tabular-nums whitespace-nowrap">{brl(p.valor_total)}</span>
                </div>
                {p.erro_omie_mensagem && (
                  <p className="text-xs text-destructive line-clamp-2 break-words">Omie: {p.erro_omie_mensagem}</p>
                )}
              </button>
              );
            })}
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
