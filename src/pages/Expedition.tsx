import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { manausDateTime, manausShort, manausTimeSec } from "@/lib/manausTime";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  Calendar as CalendarIcon,
  FileText,
  Hash,
  Home,
  HandCoins,
  StickyNote,
  Pencil,
  Plus,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
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
  order_number: string | null;
  created_at: string | null;
  observation: string | null;
  extra_info?: string | null;
  delivered_at?: string | null;
}


interface ExpeditionItem {
  id: string;
  name: string;
  code: string | null;
  family: string | null;
  quantity: number;
  unit: string | null;
  unit_value: number | null;
  total_value: number | null;
  checked: boolean;
  checked_at: string | null;
  checked_by: string | null;
  checked2: boolean;
  checked2_at: string | null;
  checked2_by: string | null;
}

const formatBRL = (v?: number | null) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);

const todayStr = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

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
  const [dateFrom, setDateFrom] = useState(todayStr());
  const [dateTo, setDateTo] = useState(todayStr());
  const [autoSync, setAutoSync] = useState(
    () => localStorage.getItem("expedition-auto-sync") !== "0"
  );
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [confirmDeliver, setConfirmDeliver] = useState<ExpeditionOrder | null>(null);
  const [deliverLoading, setDeliverLoading] = useState(false);
  const [obsOrder, setObsOrder] = useState<ExpeditionOrder | null>(null);
  const [obsText, setObsText] = useState("");
  const [obsSaving, setObsSaving] = useState(false);
  const [infoOrder, setInfoOrder] = useState<ExpeditionOrder | null>(null);
  const canTagInfo = canOperate || role === "comercial";

  const { data: extraInfos = [] } = useQuery({
    queryKey: ["expedition-infos", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expedition_infos")
        .select("id, name")
        .eq("company_id", companyId)
        .order("name");
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
  });

  const setExtraInfo = async (order: ExpeditionOrder, value: string | null) => {
    const { error } = await supabase
      .from("expedition_orders")
      .update({ extra_info: value } as any)
      .eq("id", order.id);
    if (error) {
      toast.error("Erro ao salvar informação adicional");
      return;
    }
    toast.success(value ? `Marcado como ${value}` : "Informação removida");
    setInfoOrder(null);
    queryClient.invalidateQueries({ queryKey: ["expedition-orders"] });
    queryClient.invalidateQueries({ queryKey: ["tv-orders"] });
  };

  const openObsEditor = (order: ExpeditionOrder) => {
    setObsOrder(order);
    setObsText(order.observation || "");
  };


  const saveObservation = async () => {
    if (!obsOrder) return;
    setObsSaving(true);
    const { error } = await supabase
      .from("expedition_orders")
      .update({ observation: obsText.trim() || null } as any)
      .eq("id", obsOrder.id);
    setObsSaving(false);
    if (error) {
      toast.error("Erro ao salvar observação");
      return;
    }
    toast.success("Observação salva");
    setObsOrder(null);
    queryClient.invalidateQueries({ queryKey: ["expedition-orders"] });
    queryClient.invalidateQueries({ queryKey: ["tv-orders"] });
  };


  const markDelivered = async (order: ExpeditionOrder) => {
    setDeliverLoading(true);
    const { error } = await supabase
      .from("expedition_orders")
      .update({ delivered_at: new Date().toISOString(), delivered_by: user?.id ?? null } as any)
      .eq("id", order.id);
    setDeliverLoading(false);
    if (error) {
      toast.error("Erro ao confirmar entrega");
      return;
    }
    toast.success(`Entrega confirmada: ${order.client}`);
    setConfirmDeliver(null);
    queryClient.invalidateQueries({ queryKey: ["expedition-orders"] });
    queryClient.invalidateQueries({ queryKey: ["tv-orders"] });
  };


  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["expedition-orders", companyId, statusFilter, dateFrom, dateTo],
    enabled: !!companyId && hasExpedition,
    refetchInterval: 20000,
    queryFn: async () => {
      let q = supabase
        .from("expedition_orders")
        .select("*")
        .eq("company_id", companyId)
        // ordem de chegada: pedido mais antigo primeiro
        .order("created_at", { ascending: true })
        .limit(300);
      if (statusFilter !== "TODOS") q = q.eq("status", statusFilter);
      if (dateFrom) q = q.gte("created_at", `${dateFrom}T00:00:00`);
      if (dateTo) q = q.lte("created_at", `${dateTo}T23:59:59`);
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

  // Progresso da 2ª conferência dos pedidos de balcão
  const balcaoIds = orders.filter((o) => o.status === "BALCAO" && !o.delivered_at).map((o) => o.id);
  const { data: check2Counts = {} } = useQuery({
    queryKey: ["expedition-check2-counts", companyId, balcaoIds.join(",")],
    enabled: balcaoIds.length > 0,
    refetchInterval: 20000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expedition_order_items")
        .select("expedition_order_id, checked2")
        .in("expedition_order_id", balcaoIds);
      if (error) throw error;
      const acc: Record<string, { total: number; done: number }> = {};
      (data || []).forEach((r: any) => {
        const c = (acc[r.expedition_order_id] ||= { total: 0, done: 0 });
        c.total++;
        if (r.checked2) c.done++;
      });
      return acc;
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

  const syncFromOmie = async (silent = false) => {
    if (!canOperate) {
      if (!silent) toast.error("Acesso negado");
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
                family: p.family || null,
                quantity: p.quantity,
                unit: p.unit || "UN",
                unit_value: p.unitValue ?? null,
                total_value: p.totalValue ?? null,
              }))
            );
          }
        }
      }
      setLastSync(new Date());
      if (!silent || created > 0) {
        toast.success(created > 0 ? `${created} nova(s) venda(s) na expedição` : "Nenhuma venda nova");
      }
      queryClient.invalidateQueries({ queryKey: ["expedition-orders"] });
    } catch (e: any) {
      if (!silent) toast.error(e.message || "Erro ao buscar vendas");
    } finally {
      setSyncing(false);
    }
  };

  // Mantém o filtro sempre no dia atual (virada de dia / retorno à aba)
  const lastDayRef = useRef(todayStr());
  useEffect(() => {
    const sync = () => {
      const today = todayStr();
      if (today !== lastDayRef.current) {
        lastDayRef.current = today;
        setDateFrom(today);
        setDateTo(today);
      }
    };
    const id = setInterval(sync, 60000);
    const onFocus = () => sync();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);

  // Sincronização automática a cada 60s (intervalo ágil e seguro para a API Omie)
  const syncRef = useRef(syncFromOmie);
  syncRef.current = syncFromOmie;

  useEffect(() => {
    localStorage.setItem("expedition-auto-sync", autoSync ? "1" : "0");
    if (!autoSync || !hasExpedition || !companyId || !canOperate) return;
    syncRef.current(true);
    const id = setInterval(() => syncRef.current(true), 60000);
    return () => clearInterval(id);
  }, [autoSync, hasExpedition, companyId, canOperate]);

  // Ao abrir o card, marca que está em conferência (fica verde no painel de TV)
  const openConference = async (order: ExpeditionOrder) => {
    setOpenOrder(order);
    if (order.status === "AGUARDANDO" && !order.checked_by && user?.id) {
      await supabase
        .from("expedition_orders")
        .update({ checked_by: user.id })
        .eq("id", order.id);
      setOpenOrder({ ...order, checked_by: user.id });
      queryClient.invalidateQueries({ queryKey: ["expedition-orders"] });
    }
  };

  const toggleItem = async (item: ExpeditionItem) => {
    if (!canOperate) return;

    const { error } = await supabase
      .from("expedition_order_items")
      .update({
        checked: !item.checked,
        checked_at: !item.checked ? new Date().toISOString() : null,
        checked_by: !item.checked ? (user?.id ?? null) : null,
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

  // 2ª conferência: feita junto com o cliente no balcão
  const toggleItem2 = async (item: ExpeditionItem) => {
    if (!canOperate) return;
    const next = !item.checked2;
    const { error } = await supabase
      .from("expedition_order_items")
      .update({
        checked2: next,
        checked2_at: next ? new Date().toISOString() : null,
        checked2_by: next ? (user?.id ?? null) : null,
      } as any)
      .eq("id", item.id);
    if (error) {
      toast.error("Erro na 2ª conferência");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["expedition-items", openOrder?.id] });
    queryClient.invalidateQueries({ queryKey: ["expedition-check2-counts", companyId] });
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
              family: i.family,
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
        .update({ status: "AGUARDANDO", route_id: null, checked_at: null, checked_by: null, delivered_at: null, delivered_by: null } as any)
        .eq("id", openOrder.id);
      if (error) throw error;
      await supabase
        .from("expedition_order_items")
        .update({ checked: false, checked_at: null, checked2: false, checked2_at: null, checked2_by: null } as any)
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
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
            <Switch
              id="auto-sync"
              checked={autoSync}
              onCheckedChange={setAutoSync}
              disabled={!isAdmin}
            />
            <Label htmlFor="auto-sync" className="text-sm cursor-pointer">
              Automático (60s)
            </Label>
          </div>
          <Button variant="outline" asChild>
            <a href={`/tv?company=${companyId}`} target="_blank" rel="noopener noreferrer">
              <Tv className="w-4 h-4 mr-2" />
              Abrir painel de TV
            </a>
          </Button>
          <Button onClick={() => syncFromOmie(false)} disabled={syncing || !canOperate}>
            {syncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Buscar vendas
          </Button>
          {lastSync && (
            <span className="text-xs text-muted-foreground">
              Última: {manausTimeSec(lastSync)}
            </span>
          )}
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
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-4 h-4 text-muted-foreground" />
          <Input
            type="date"
            className="w-[150px]"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <span className="text-muted-foreground text-sm">até</span>
          <Input
            type="date"
            className="w-[150px]"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
          {(dateFrom !== todayStr() || dateTo !== todayStr()) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDateFrom(todayStr());
                setDateTo(todayStr());
              }}
            >
              Hoje
            </Button>
          )}
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

                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {o.order_number && (
                    <span className="flex items-center gap-1">
                      <Hash className="w-3 h-3" /> Pedido {o.order_number}
                    </span>
                  )}
                  {o.issued_at && (
                    <span className="flex items-center gap-1">
                      <FileText className="w-3 h-3" /> Faturado{" "}
                      {manausDateTime(o.issued_at)}

                    </span>
                  )}
                  {o.created_at && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Chegou{" "}
                      {manausDateTime(o.created_at)}
                    </span>
                  )}
                  {o.cep && (
                    <span className="flex items-center gap-1">
                      <Home className="w-3 h-3" /> CEP {o.cep}
                    </span>
                  )}
                </div>

                {o.neighborhood && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" /> {o.neighborhood}
                  </p>
                )}
                {o.address && (
                  <p className="text-xs text-muted-foreground leading-snug">{o.address}</p>
                )}
                {o.seller && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <User className="w-3.5 h-3.5" /> {o.seller}
                  </p>
                )}
                <p className="text-sm font-semibold">{formatBRL(o.total_value)}</p>
                {o.observation ? (
                  <div className="rounded-md border border-primary/40 bg-primary/10 p-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-primary flex items-center gap-1">
                        <StickyNote className="w-3 h-3" /> Observação do pedido
                      </p>
                      {canOperate && (
                        <button
                          type="button"
                          onClick={() => openObsEditor(o)}
                          className="text-primary hover:opacity-70"
                          aria-label="Editar observação"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-foreground/90 leading-snug whitespace-pre-wrap break-words mt-0.5">
                      {o.observation}
                    </p>
                  </div>
                ) : (
                  canOperate && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 justify-start px-1 text-xs text-muted-foreground"
                      onClick={() => openObsEditor(o)}
                    >
                      <Plus className="w-3 h-3 mr-1" /> Adicionar observação
                    </Button>
                  )
                )}

                {o.checked_at && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <PackageCheck className="w-3 h-3" /> Conferido{" "}
                    {manausDateTime(o.checked_at)}
                    {conferenteName(o.checked_by) && <> · {conferenteName(o.checked_by)}</>}
                  </p>
                )}
                {o.delivered_at && o.status !== "AGUARDANDO" && (
                  <p className="text-xs font-medium text-success flex items-center gap-1">
                    <HandCoins className="w-3 h-3" /> Entregue ao cliente{" "}
                    {manausDateTime(o.delivered_at)}
                  </p>
                )}

                <Button
                  size="sm"
                  variant={o.status === "AGUARDANDO" ? "default" : "outline"}
                  className="w-full"
                  onClick={() => openConference(o)}
                >
                  {o.status === "AGUARDANDO" ? "Conferir" : "Ver itens"}
                </Button>

                {o.status === "BALCAO" && !o.delivered_at && canOperate && (() => {
                  const c = check2Counts[o.id];
                  const ready = !!c && c.total > 0 && c.done === c.total;
                  return (
                    <div className="space-y-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full border-primary text-primary hover:bg-primary/10"
                        onClick={() => openConference(o)}
                      >
                        <PackageCheck className="w-4 h-4 mr-2" />
                        2ª conferência com o cliente
                        {c && c.total > 0 && (
                          <span className="ml-2 text-xs font-semibold">
                            {c.done}/{c.total}
                          </span>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        disabled={!ready}
                        className="w-full bg-success text-success-foreground hover:bg-success/90"
                        onClick={() => setConfirmDeliver(o)}
                      >
                        <HandCoins className="w-4 h-4 mr-2" />
                        Confirmar entrega ao cliente
                      </Button>
                      {!ready && (
                        <p className="text-[10px] text-muted-foreground text-center">
                          Faça a 2ª conferência com o cliente para liberar a entrega
                        </p>
                      )}
                    </div>
                  );
                })()}


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
                  <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                    {i.code && (
                      <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-muted text-foreground/80">
                        {i.code}
                      </span>
                    )}
                    {i.family && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                        {i.family}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {i.quantity} {i.unit || "UN"} · {formatBRL(i.total_value)}
                  </p>
                  {i.checked && i.checked_by && (
                    <p className="text-xs text-primary font-medium">
                      Conferido por {conferenteName(i.checked_by) || "—"}
                      {i.checked_at && ` · ${manausShort(i.checked_at)}`}
                    </p>
                  )}
                  {openOrder?.status === "BALCAO" && !openOrder?.delivered_at && (
                    <button
                      type="button"
                      disabled={!canOperate}
                      onClick={(e) => {
                        e.preventDefault();
                        toggleItem2(i);
                      }}
                      className={cn(
                        "mt-1.5 w-full flex items-center gap-2 p-1.5 rounded-md border text-xs font-medium transition-colors",
                        i.checked2
                          ? "border-success bg-success/15 text-success"
                          : "border-border bg-muted/30 text-muted-foreground hover:border-success"
                      )}
                    >
                      <PackageCheck className="w-3.5 h-3.5 shrink-0" />
                      <span className="text-left">
                        2ª conf. com o cliente
                        {i.checked2 && i.checked2_by && (
                          <span className="block font-normal">
                            {conferenteName(i.checked2_by) || "—"}
                            {i.checked2_at && ` · ${manausShort(i.checked2_at)}`}
                          </span>
                        )}
                      </span>
                    </button>
                  )}
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

          {openOrder?.status === "BALCAO" && !openOrder?.delivered_at && canOperate && (
            <Button
              disabled={items.length === 0 || items.some((i) => !i.checked2)}
              className="w-full bg-success text-success-foreground hover:bg-success/90"
              onClick={() => {
                setConfirmDeliver(openOrder);
                setOpenOrder(null);
              }}
            >
              <HandCoins className="w-4 h-4 mr-2" />
              Confirmar entrega ao cliente
            </Button>
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

      <Dialog open={!!obsOrder} onOpenChange={(open) => !open && setObsOrder(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Observação do pedido
              {obsOrder && (
                <span className="block text-sm font-normal text-muted-foreground mt-1">
                  {obsOrder.client} — {obsOrder.doc_type} {obsOrder.doc_number}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <Textarea
            value={obsText}
            onChange={(e) => setObsText(e.target.value)}
            rows={4}
            placeholder="Ex.: VEM BUSCAR / ROTA - levar brinde"
          />
          <DialogFooter className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setObsOrder(null)}>
              Cancelar
            </Button>
            <Button onClick={saveObservation} disabled={obsSaving}>
              {obsSaving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>



      <AlertDialog open={!!confirmDeliver} onOpenChange={(o) => !o && setConfirmDeliver(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Já foi entregue ao cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDeliver?.client} — {confirmDeliver?.doc_type} {confirmDeliver?.doc_number}. Ao
              confirmar, o pedido sai do painel de TV.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Ainda não</AlertDialogCancel>
            <AlertDialogAction
              disabled={deliverLoading}
              onClick={(e) => {
                e.preventDefault();
                if (confirmDeliver) markDelivered(confirmDeliver);
              }}
            >
              Sim, entregue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>

  );
}
