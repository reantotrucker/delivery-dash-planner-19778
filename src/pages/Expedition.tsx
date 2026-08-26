import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Loader2,
  RefreshCw,
  Search,
  Store,
  Truck,
  PackageCheck,
  MapPin,
  User,
  Clock,
  Tv,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Status = "AGUARDANDO" | "BALCAO" | "ROTA";

interface ExpeditionOrder {
  id: string;
  company_id: string;
  doc_type: string;
  doc_number: string | null;
  client: string;
  neighborhood: string | null;
  address: string | null;
  cep: string | null;
  seller: string | null;
  total_value: number | null;
  issued_at: string | null;
  status: Status;
  checked_at: string | null;
  checked_by: string | null;
  route_id: string | null;
}

interface ExpeditionItem {
  id: string;
  name: string;
  code: string | null;
  quantity: number;
  unit: string | null;
  unit_value: number | null;
  total_value: number | null;
  checked: boolean;
}

const formatBRL = (v?: number | null) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);

export default function Expedition() {
  const { isAdmin, role, user } = useAuth();
  const { companyId, company, hasExpedition } = useCompany();
  const queryClient = useQueryClient();
  const canOperate = isAdmin || role === "expedicao";

  const [statusFilter, setStatusFilter] = useState<Status | "TODOS">("AGUARDANDO");
  const [search, setSearch] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [openOrder, setOpenOrder] = useState<ExpeditionOrder | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["expedition-orders", companyId, statusFilter],
    enabled: !!companyId && hasExpedition,
    queryFn: async () => {
      let q = supabase
        .from("expedition_orders")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(300);
      if (statusFilter !== "TODOS") q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as ExpeditionOrder[];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["expedition-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, email");
      if (error) return [];
      return data || [];
    },
  });

  const conferenteName = (userId: string | null) => {
    if (!userId) return null;
    const p: any = profiles.find((x: any) => x.id === userId);
    return p?.full_name || p?.email || null;
  };

  const { data: items = [] } = useQuery({
    queryKey: ["expedition-items", openOrder?.id],
    enabled: !!openOrder,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expedition_order_items")
        .select("*")
        .eq("expedition_order_id", openOrder!.id)
        .order("name");
      if (error) throw error;
      return (data || []) as ExpeditionItem[];
    },
  });

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim();
    if (!s) return orders;
    return orders.filter(
      (o) =>
        o.client.toLowerCase().includes(s) ||
        (o.doc_number || "").toLowerCase().includes(s) ||
        (o.neighborhood || "").toLowerCase().includes(s)
    );
  }, [orders, search]);

  const syncFromOmie = async () => {
    if (!canOperate) {
      toast.error("Acesso negado");
      return;
    }
    setSyncing(true);
    try {
      let created = 0;
      for (const type of ["nfe", "nfce"] as const) {
        const { data, error } = await supabase.functions.invoke("omie-invoices", {
          body: { type, fetchLastPage: true, companyId },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        for (const inv of data.invoices || []) {
          if (inv.canceled) continue;
          const docNumber = String(inv.number);
          const { data: existing } = await supabase
            .from("expedition_orders")
            .select("id")
            .eq("company_id", companyId)
            .eq("doc_type", type.toUpperCase())
            .eq("doc_number", docNumber)
            .maybeSingle();
          if (existing) continue;

          const { data: inserted, error: insErr } = await supabase
            .from("expedition_orders")
            .insert({
              company_id: companyId,
              doc_type: type.toUpperCase(),
              doc_number: docNumber,
              client: inv.clientName || `Cliente ${inv.clientId}`,
              client_document: inv.clientCpfCnpj || null,
              neighborhood: inv.address?.neighborhood || null,
              address: inv.address
                ? `${inv.address.street}, ${inv.address.number}${inv.address.complement ? ` - ${inv.address.complement}` : ""}`
                : null,
              cep: inv.address?.cep || null,
              seller: inv.vendedorName || null,
              total_value: inv.totalValue ?? null,
              observation: inv.orderObservation || null,
              status: "AGUARDANDO",
            })
            .select("id")
            .single();
          if (insErr) throw insErr;
          created++;

          if (inv.products?.length) {
            await supabase.from("expedition_order_items").insert(
              inv.products.map((p: any) => ({
                expedition_order_id: inserted.id,
                name: p.name,
                code: p.code || null,
                quantity: p.quantity,
                unit: p.unit || "UN",
                unit_value: p.unitValue ?? null,
                total_value: p.totalValue ?? null,
              }))
            );
          }
        }
      }
      toast.success(created > 0 ? `${created} nova(s) venda(s) na expedição` : "Nenhuma venda nova");
      queryClient.invalidateQueries({ queryKey: ["expedition-orders"] });
    } catch (e: any) {
      toast.error(e.message || "Erro ao buscar vendas");
    } finally {
      setSyncing(false);
    }
  };

  const toggleItem = async (item: ExpeditionItem) => {
    if (!canOperate) return;
    const { error } = await supabase
      .from("expedition_order_items")
      .update({
        checked: !item.checked,
        checked_at: !item.checked ? new Date().toISOString() : null,
      })
      .eq("id", item.id);
    if (error) {
      toast.error("Erro ao conferir item");
      return;
    }
    if (!item.checked && openOrder && openOrder.status === "AGUARDANDO" && user?.id) {
      await supabase
        .from("expedition_orders")
        .update({ checked_by: user.id })
        .eq("id", openOrder.id);
      setOpenOrder({ ...openOrder, checked_by: user.id });
      queryClient.invalidateQueries({ queryKey: ["expedition-orders"] });
    }
    queryClient.invalidateQueries({ queryKey: ["expedition-items", openOrder?.id] });
  };

  // Se fechar sem confirmar Balcão ou Rota, desmarca toda a conferência
  const cancelConference = async (order: ExpeditionOrder) => {
    if (order.status !== "AGUARDANDO") return;
    await supabase
      .from("expedition_order_items")
      .update({ checked: false, checked_at: null })
      .eq("expedition_order_id", order.id);
    await supabase
      .from("expedition_orders")
      .update({ checked_by: null })
      .eq("id", order.id);
    queryClient.invalidateQueries({ queryKey: ["expedition-items", order.id] });
    queryClient.invalidateQueries({ queryKey: ["expedition-orders"] });
  };

  const finish = async (destination: "BALCAO" | "ROTA") => {
    if (!openOrder || !canOperate) return;
    setSaving(true);
    try {
      let routeId: string | null = null;

      if (destination === "ROTA") {
        const now = new Date();
        const { data: route, error: routeErr } = await supabase
          .from("routes")
          .insert({
            company_id: companyId,
            client: openOrder.client,
            neighborhood: openOrder.neighborhood || "N/A",
            address: openOrder.address,
            cep: openOrder.cep,
            observation: `${openOrder.doc_type} ${openOrder.doc_number || ""}`.trim(),
            date: format(now, "yyyy-MM-dd"),
            period: now.getHours() >= 12 ? "TARDE" : "MANHA",
            order_number: 1,
            status: "NAO_ENTREGUE" as const,
          })
          .select("id")
          .single();
        if (routeErr) throw routeErr;
        routeId = route.id;

        if (items.length) {
          await supabase.from("route_products").insert(
            items.map((i) => ({
              route_id: route.id,
              name: i.name,
              code: i.code,
              quantity: i.quantity,
              unit: i.unit || "UN",
              unit_value: i.unit_value,
              total_value: i.total_value,
            }))
          );
        }
      }

      const { error } = await supabase
        .from("expedition_orders")
        .update({
          status: destination,
          route_id: routeId,
          checked_at: new Date().toISOString(),
          checked_by: user?.id ?? null,
        })
        .eq("id", openOrder.id);
      if (error) throw error;

      toast.success(destination === "BALCAO" ? "Marcado como venda balcão" : "Enviado para rota");
      setOpenOrder(null);
      queryClient.invalidateQueries({ queryKey: ["expedition-orders"] });
      queryClient.invalidateQueries({ queryKey: ["routes"] });
    } catch (e: any) {
      toast.error(e.message || "Erro ao finalizar");
    } finally {
      setSaving(false);
    }
  };

  const reopen = async () => {
    if (!openOrder || !canOperate) return;
    setSaving(true);
    try {
      if (openOrder.route_id) {
        await supabase.from("route_products").delete().eq("route_id", openOrder.route_id);
        await supabase.from("routes").delete().eq("id", openOrder.route_id);
      }
      const { error } = await supabase
        .from("expedition_orders")
        .update({ status: "AGUARDANDO", route_id: null, checked_at: null, checked_by: null })
        .eq("id", openOrder.id);
      if (error) throw error;
      await supabase
        .from("expedition_order_items")
        .update({ checked: false, checked_at: null })
        .eq("expedition_order_id", openOrder.id);

      toast.success("Pedido retornou para Aguardando");
      setOpenOrder(null);
      queryClient.invalidateQueries({ queryKey: ["expedition-orders"] });
      queryClient.invalidateQueries({ queryKey: ["routes"] });
    } catch (e: any) {
      toast.error(e.message || "Erro ao retornar pedido");
    } finally {
      setSaving(false);
    }
  };

  if (!hasExpedition) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            A empresa <strong>{company?.name}</strong> não utiliza a etapa de Expedição.
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusStyle = (s: Status) =>
    s === "BALCAO"
      ? "border-l-4 border-l-success bg-success/5"
      : s === "ROTA"
        ? "border-l-4 border-l-primary bg-primary/5"
        : "border-l-4 border-l-muted-foreground";

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <PackageCheck className="w-6 h-6 text-primary" />
            Expedição
          </h1>
          <p className="text-sm text-muted-foreground">{company?.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <a href="/tv" target="_blank" rel="noopener noreferrer">
              <Tv className="w-4 h-4 mr-2" />
              Abrir painel de TV
            </a>
          </Button>
          <Button onClick={syncFromOmie} disabled={syncing || !canOperate}>
            {syncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Buscar vendas
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as Status | "TODOS")}>
          <TabsList>
            <TabsTrigger value="AGUARDANDO">Aguardando</TabsTrigger>
            <TabsTrigger value="BALCAO">Balcão</TabsTrigger>
            <TabsTrigger value="ROTA">Rota</TabsTrigger>
            <TabsTrigger value="TODOS">Todos</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Cliente, nota ou bairro..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Nenhum pedido nesta situação.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((o) => (
            <Card key={o.id} className={cn("overflow-hidden", statusStyle(o.status))}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold leading-tight">{o.client}</p>
                    <p className="text-xs text-muted-foreground">
                      {o.doc_type} {o.doc_number}
                    </p>
                  </div>
                  <Badge
                    variant={o.status === "AGUARDANDO" ? "outline" : "secondary"}
                    className={cn(
                      "whitespace-nowrap",
                      o.status === "BALCAO" && "bg-success text-success-foreground",
                      o.status === "ROTA" && "bg-primary text-primary-foreground"
                    )}
                  >
                    {o.status === "AGUARDANDO" ? "Aguardando" : o.status === "BALCAO" ? "Venda balcão" : "Em rota"}
                  </Badge>
                </div>

                {o.neighborhood && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" /> {o.neighborhood}
                  </p>
                )}
                {o.seller && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <User className="w-3.5 h-3.5" /> {o.seller}
                  </p>
                )}
                <p className="text-sm font-semibold">{formatBRL(o.total_value)}</p>
                {o.checked_at && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {format(new Date(o.checked_at), "dd/MM HH:mm")}
                    {conferenteName(o.checked_by) && <> · Conferente: {conferenteName(o.checked_by)}</>}
                  </p>
                )}

                <Button
                  size="sm"
                  variant={o.status === "AGUARDANDO" ? "default" : "outline"}
                  className="w-full"
                  onClick={() => setOpenOrder(o)}
                >
                  {o.status === "AGUARDANDO" ? "Conferir" : "Ver itens"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={!!openOrder}
        onOpenChange={(v) => {
          if (!v && openOrder) {
            const order = openOrder;
            setOpenOrder(null);
            cancelConference(order);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {openOrder?.client} — {openOrder?.doc_type} {openOrder?.doc_number}
            </DialogTitle>
          </DialogHeader>

          {openOrder?.checked_by && (
            <p className="text-sm text-muted-foreground">
              Conferente:{" "}
              <strong className="text-foreground">
                {conferenteName(openOrder.checked_by) || "—"}
              </strong>
            </p>
          )}

          <div className="max-h-[45vh] overflow-y-auto space-y-2">
            {items.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum item registrado nesta venda.</p>
            )}
            {items.map((i) => (
              <label
                key={i.id}
                className="flex items-start gap-3 p-2 rounded-md border border-border cursor-pointer"
              >
                <Checkbox
                  checked={i.checked}
                  onCheckedChange={() => toggleItem(i)}
                  disabled={!canOperate || openOrder?.status !== "AGUARDANDO"}
                />
                <div className="flex-1">
                  <p className={cn("text-sm font-medium", i.checked && "line-through text-muted-foreground")}>
                    {i.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {i.quantity} {i.unit || "UN"} · {formatBRL(i.total_value)}
                  </p>
                </div>
              </label>
            ))}
          </div>

          {openOrder?.status === "AGUARDANDO" && canOperate && (
            <DialogFooter className="grid grid-cols-2 gap-2">
              <Button
                onClick={() => finish("BALCAO")}
                disabled={saving}
                className="bg-success text-success-foreground hover:bg-success/90"
              >
                <Store className="w-4 h-4 mr-2" />
                Venda balcão
              </Button>
              <Button onClick={() => finish("ROTA")} disabled={saving}>
                <Truck className="w-4 h-4 mr-2" />
                Enviar para rota
              </Button>
            </DialogFooter>
          )}

          {openOrder?.status !== "AGUARDANDO" && canOperate && (
            <DialogFooter>
              <Button variant="outline" onClick={reopen} disabled={saving} className="w-full">
                <RotateCcw className="w-4 h-4 mr-2" />
                Retornar para aguardando
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
