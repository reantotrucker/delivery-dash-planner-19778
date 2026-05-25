import { Route, generateGoogleMapsLink, generateWazeLink } from "./types";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Trash2, Pencil, FileText, Plus, Edit, X, MapPin, Navigation, Package, CheckCircle2, AlertCircle, Truck, Car, User, RotateCcw, Loader2, Camera, ClipboardPaste, Crosshair, ExternalLink } from "lucide-react";
import { RouteReceiptDialog } from "./RouteReceiptDialog";
import { Textarea } from "@/components/ui/textarea";
import { RouteOccurrenceDialog, Occurrence } from "./RouteOccurrenceDialog";
import { ProductChecklistDialog } from "./ProductChecklistDialog";
import { RouteEditDialog } from "./RouteEditDialog";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const getPaymentBadgeStyle = (name: string | undefined) => {
  if (!name) return { className: "bg-muted text-muted-foreground border-muted", label: "-" };
  const upper = name.toUpperCase();
  if (upper.includes("PIX")) return { className: "bg-blue-500/20 text-blue-400 border-blue-500/30", label: "PIX" };
  if (upper.includes("BOLETO")) return { className: "bg-amber-500/20 text-amber-400 border-amber-500/30", label: "BOLETO" };
  if (upper.includes("CARTAO") || upper.includes("CARTÃO") || upper.includes("CREDITO") || upper.includes("CRÉDITO")) return { className: "bg-purple-500/20 text-purple-400 border-purple-500/30", label: name };
  if (upper.includes("DINHEIRO")) return { className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", label: "DINHEIRO" };
  if (upper.includes("SOMENTE") || upper.includes("ENTREGAR")) return { className: "bg-muted text-muted-foreground border-border", label: "SÓ ENTREGA" };
  return { className: "bg-muted text-muted-foreground border-border", label: name };
};

interface RouteTableProps {
  routes: Route[];
  onUpdate: () => void;
  isAdmin: boolean;
  isMotorista?: boolean;
  isComercial?: boolean;
  canManageOccurrences?: boolean;
}

export const RouteTable = ({ routes, onUpdate, isAdmin, isMotorista = false, isComercial = false, canManageOccurrences = false }: RouteTableProps) => {
  const [receiptRoute, setReceiptRoute] = useState<Route | null>(null);
  const [locationDrafts, setLocationDrafts] = useState<Record<string, string>>({});
  const [savingLocationId, setSavingLocationId] = useState<string | null>(null);
  const canEditLocation = isAdmin || isComercial;
  const canUploadReceipts = isAdmin || isMotorista;
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [occurrenceRoute, setOccurrenceRoute] = useState<Route | null>(null);
  const [editingOccurrence, setEditingOccurrence] = useState<Occurrence | null>(null);
  const [occurrenceDialogOpen, setOccurrenceDialogOpen] = useState(false);
  const [deleteOccurrenceId, setDeleteOccurrenceId] = useState<string | null>(null);
  const [editingRoute, setEditingRoute] = useState<Route | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [checklistRoute, setChecklistRoute] = useState<Route | null>(null);
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState(new Date().toISOString().split("T")[0]);
  const [reschedulePeriod, setReschedulePeriod] = useState<"MANHA" | "TARDE">("MANHA");

  const { data: routeProductCounts = {} } = useQuery({
    queryKey: ["route-product-counts"],
    queryFn: async () => {
      if (routes.length === 0) return {};
      const { data, error } = await supabase
        .from("route_products")
        .select("route_id, checked, checked2")
        .in("route_id", routes.map(r => r.id));
      if (error) throw error;
      const counts: Record<string, { total: number; checked: number; checked2: number }> = {};
      (data as any[])?.forEach((p) => {
        if (!counts[p.route_id]) counts[p.route_id] = { total: 0, checked: 0, checked2: 0 };
        counts[p.route_id].total++;
        if (p.checked) counts[p.route_id].checked++;
        if (p.checked2) counts[p.route_id].checked2++;
      });
      return counts;
    },
    enabled: routes.length > 0,
  });

  const { data: occurrences = [], refetch: refetchOccurrences } = useQuery({
    queryKey: ["route-occurrences", routes.map(r => r.id)],
    queryFn: async () => {
      if (routes.length === 0) return [];
      const { data, error } = await supabase
        .from("route_occurrences")
        .select("*")
        .in("route_id", routes.map(r => r.id));
      if (error) throw error;
      return data as Occurrence[];
    },
    enabled: routes.length > 0,
  });

  const { data: receiptCounts = {}, refetch: refetchReceipts } = useQuery({
    queryKey: ["route-receipt-counts", routes.map(r => r.id)],
    queryFn: async () => {
      if (routes.length === 0) return {} as Record<string, number>;
      const { data, error } = await supabase
        .from("route_receipts")
        .select("route_id")
        .in("route_id", routes.map(r => r.id));
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data as any[])?.forEach((r) => {
        counts[r.route_id] = (counts[r.route_id] || 0) + 1;
      });
      return counts;
    },
    enabled: routes.length > 0,
  });

  const saveLocation = async (routeId: string) => {
    const value = (locationDrafts[routeId] || "").trim();
    if (!value) {
      toast({ title: "Cole um link ou coordenadas", variant: "destructive" });
      return;
    }
    setSavingLocationId(routeId);
    const { error } = await supabase
      .from("routes")
      .update({ location_link: value })
      .eq("id", routeId);
    setSavingLocationId(null);
    if (error) {
      toast({ title: "Erro ao salvar localização", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Localização salva!" });
      setLocationDrafts((p) => ({ ...p, [routeId]: "" }));
      onUpdate();
    }
  };

  const clearLocation = async (routeId: string) => {
    const { error } = await supabase
      .from("routes")
      .update({ location_link: null })
      .eq("id", routeId);
    if (error) {
      toast({ title: "Erro ao remover", variant: "destructive" });
    } else {
      toast({ title: "Localização removida" });
      onUpdate();
    }
  };

  const pasteFromClipboard = async (routeId: string) => {
    try {
      const text = await navigator.clipboard.readText();
      setLocationDrafts((p) => ({ ...p, [routeId]: text }));
    } catch {
      toast({ title: "Não foi possível acessar a área de transferência", variant: "destructive" });
    }
  };

  // Build maps/waze links preferring saved exact location
  const buildLocationLinks = (route: Route) => {
    const loc = route.location_link?.trim();
    if (loc) {
      // If full URL, use it for Google Maps; build Waze from coords if possible
      const coordsMatch = loc.match(/(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/);
      if (loc.startsWith("http")) {
        // If it's already a waze link, swap; else use as google maps
        const isWaze = /waze\./i.test(loc);
        const maps = isWaze ? (coordsMatch ? `https://www.google.com/maps/search/?api=1&query=${coordsMatch[1]},${coordsMatch[2]}` : null) : loc;
        const waze = isWaze ? loc : (coordsMatch ? `https://waze.com/ul?ll=${coordsMatch[1]},${coordsMatch[2]}&navigate=yes` : null);
        return { maps, waze };
      }
      if (coordsMatch) {
        return {
          maps: `https://www.google.com/maps/search/?api=1&query=${coordsMatch[1]},${coordsMatch[2]}`,
          waze: `https://waze.com/ul?ll=${coordsMatch[1]},${coordsMatch[2]}&navigate=yes`,
        };
      }
    }
    return {
      maps: generateGoogleMapsLink(route.address, route.cep, route.neighborhood),
      waze: generateWazeLink(route.address, route.cep, route.neighborhood),
    };
  };


  const toggleStatus = async (routeId: string, currentStatus: string) => {
    const newStatus = currentStatus === "ENTREGUE" ? "NAO_ENTREGUE" : "ENTREGUE";
    const { error } = await supabase
      .from("routes")
      .update({ status: newStatus })
      .eq("id", routeId);
    if (error) {
      toast({ title: "Erro ao atualizar status", variant: "destructive" });
    } else {
      toast({ title: "Status atualizado" });
      onUpdate();
    }
  };

  const deleteRoute = async (routeId: string) => {
    try {
      setDeletingId(routeId);
      const { error } = await supabase.from("routes").delete().eq("id", routeId);
      if (error) throw error;
      toast({ title: "Rota excluída com sucesso!" });
      onUpdate();
    } catch (error) {
      console.error("Error deleting route:", error);
      toast({ title: "Erro ao excluir rota", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  const deleteOccurrence = async (occurrenceId: string) => {
    try {
      const { error } = await supabase
        .from("route_occurrences")
        .delete()
        .eq("id", occurrenceId);
      if (error) throw error;
      toast({ title: "Ocorrência excluída com sucesso!" });
      refetchOccurrences();
      onUpdate();
      setDeleteOccurrenceId(null);
    } catch (error) {
      console.error("Error deleting occurrence:", error);
      toast({ title: "Erro ao excluir ocorrência", variant: "destructive" });
    }
  };

  const rescheduleRoute = async (route: Route) => {
    if (!rescheduleDate) {
      toast({ title: "Selecione uma data", variant: "destructive" });
      return;
    }
    try {
      setReschedulingId(route.id);
      const { error } = await supabase.from("routes").insert({
        client: route.client,
        neighborhood: route.neighborhood,
        address: route.address,
        cep: route.cep,
        observation: route.observation,
        consultant_id: route.consultant_id,
        driver_id: route.driver_id,
        vehicle_id: route.vehicle_id,
        payment_method_id: route.payment_method_id,
        date: rescheduleDate,
        period: reschedulePeriod,
        urgent: route.urgent || false,
        status: "NAO_ENTREGUE",
      });
      if (error) throw error;
      toast({ title: "Rota reagendada com sucesso!" });
      onUpdate();
    } catch (error) {
      console.error("Error rescheduling route:", error);
      toast({ title: "Erro ao reagendar rota", variant: "destructive" });
    } finally {
      setReschedulingId(null);
    }
  };

  if (routes.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
        Nenhuma rota cadastrada
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {routes.map((route, index) => {
          const routeOccurrences = occurrences.filter(o => o.route_id === route.id);
          const productCount = routeProductCounts[route.id];
          const paymentStyle = getPaymentBadgeStyle(route.payment_method?.name);
          const driverColor = route.driver?.color;
          const { maps: mapsLink, waze: wazeLink } = buildLocationLinks(route);
          const hasExactLocation = !!route.location_link?.trim();
          const receiptCount = receiptCounts[route.id] || 0;

          return (
            <Card
              key={route.id}
              className={`relative overflow-hidden flex transition-all hover:border-border/80 ${route.urgent ? "ring-2 ring-red-500/50" : ""}`}
            >
              {/* Driver color accent bar */}
              <div
                className="w-2 shrink-0"
                style={{ backgroundColor: driverColor || 'hsl(var(--border))' }}
              />

              {/* Urgent indicator */}
              {route.urgent && (
                <div className="absolute top-0 right-0 bg-red-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-bl-md z-10">
                  URGENTE
                </div>
              )}

              <div className="flex flex-col md:flex-row flex-1 min-w-0">
                {/* LEFT: Routing Info */}
                <div className="p-4 flex-1 min-w-0 flex flex-col justify-between md:border-r border-dashed border-border">
                  <div className="flex justify-between items-start gap-2 mb-3">
                    <div className="min-w-0">
                      <span className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">
                        Rota
                      </span>
                      <h2 className="text-2xl font-black text-foreground leading-none tracking-tight font-mono">
                        #{index + 1}
                      </h2>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <button
                        onClick={() => toggleStatus(route.id, route.status)}
                        disabled={!isAdmin && !canManageOccurrences}
                        className="focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {route.status === "ENTREGUE" ? (
                          <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider gap-1 cursor-pointer hover:bg-emerald-500/20 transition-colors">
                            <CheckCircle2 className="w-3 h-3" />
                            OK
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider gap-1 cursor-pointer hover:bg-amber-500/20 transition-colors">
                            <AlertCircle className="w-3 h-3" />
                            PEND
                          </Badge>
                        )}
                      </button>
                      {route.consultant?.name && (
                        <div className="text-right">
                          <span className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            Consultor
                          </span>
                          <span className="text-xs text-foreground/80 font-medium">{route.consultant.name}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1 mb-4">
                    <h3 className="text-base font-extrabold text-foreground uppercase break-words leading-tight">
                      {route.client}
                    </h3>
                    <p
                      className="text-xs font-bold uppercase tracking-wide"
                      style={{ color: driverColor || 'hsl(var(--primary))' }}
                    >
                      Bairro: {route.neighborhood}
                    </p>
                    {route.address && (
                      <p className="text-sm text-muted-foreground leading-snug italic break-words">
                        {route.address}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center flex-wrap gap-x-4 gap-y-2 border-t border-border pt-3 mt-auto">
                    {mapsLink && (
                      <a
                        href={mapsLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`flex items-center gap-1.5 text-[10px] font-bold transition-colors uppercase tracking-wider ${hasExactLocation ? "text-emerald-500 hover:text-emerald-400" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        {hasExactLocation ? <Crosshair className="w-3.5 h-3.5" /> : <MapPin className="w-3.5 h-3.5" />}
                        {hasExactLocation ? "Local Exato" : "Google Maps"}
                      </a>
                    )}
                    {wazeLink && (
                      <a
                        href={wazeLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wider"
                      >
                        <Navigation className="w-3.5 h-3.5" />
                        Waze
                      </a>
                    )}
                    {canEditLocation && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            className={`flex items-center gap-1.5 text-[10px] font-bold transition-colors uppercase tracking-wider ${hasExactLocation ? "text-emerald-500 hover:text-emerald-400" : "text-primary hover:text-primary/80"}`}
                          >
                            <Crosshair className="w-3.5 h-3.5" />
                            {hasExactLocation ? "Editar Local" : "Colar Localização"}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80 p-3 space-y-2" align="start">
                          <p className="text-xs font-semibold">Localização exata do cliente</p>
                          <p className="text-[10px] text-muted-foreground">
                            Cole o link do Google Maps, Waze ou coordenadas (ex: -3.1019,-60.0250)
                          </p>
                          <Textarea
                            rows={3}
                            placeholder="https://maps.google.com/... ou -3.1019,-60.0250"
                            value={locationDrafts[route.id] ?? route.location_link ?? ""}
                            onChange={(e) => setLocationDrafts((p) => ({ ...p, [route.id]: e.target.value }))}
                            className="text-xs"
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 h-8 text-[11px] gap-1"
                              onClick={() => pasteFromClipboard(route.id)}
                            >
                              <ClipboardPaste className="w-3 h-3" /> Colar
                            </Button>
                            <Button
                              size="sm"
                              className="flex-1 h-8 text-[11px]"
                              onClick={() => saveLocation(route.id)}
                              disabled={savingLocationId === route.id}
                            >
                              {savingLocationId === route.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Salvar"}
                            </Button>
                          </div>
                          {hasExactLocation && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="w-full h-7 text-[10px] text-destructive hover:text-destructive"
                              onClick={() => clearLocation(route.id)}
                            >
                              Remover localização salva
                            </Button>
                          )}
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                </div>


                {/* RIGHT: Logistics Details */}
                <div className="p-4 bg-muted/20 md:w-72 shrink-0 flex flex-col justify-between gap-4">
                  <div className="grid grid-cols-2 gap-y-3 gap-x-2">
                    {route.driver?.name && (
                      <div className="min-w-0">
                        <span className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                          Motorista
                        </span>
                        <span className="text-xs text-foreground font-semibold truncate block">
                          {route.driver.name}
                        </span>
                      </div>
                    )}
                    {route.vehicle?.plate && (
                      <div className="min-w-0">
                        <span className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                          Placa
                        </span>
                        <span
                          className="text-xs font-bold tracking-tight font-mono truncate block"
                          style={{ color: driverColor || 'hsl(var(--primary))' }}
                        >
                          {route.vehicle.plate}
                        </span>
                      </div>
                    )}
                    <div className="min-w-0">
                      <span className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        Pagamento
                      </span>
                      <Badge className={`${paymentStyle.className} text-[10px] font-bold px-1.5 py-0 mt-0.5`}>
                        {paymentStyle.label}
                      </Badge>
                    </div>
                    {productCount?.total > 0 && (
                      <div className="min-w-0">
                        <span className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                          Produtos
                        </span>
                        <span className="text-xs font-bold">
                          <span className={productCount.checked === productCount.total ? "text-green-500" : "text-orange-400"}>
                            {productCount.checked}/{productCount.total}
                          </span>
                          {" · "}
                          <span className={productCount.checked2 === productCount.total ? "text-blue-500" : "text-orange-400"}>
                            {productCount.checked2}/{productCount.total}
                          </span>
                        </span>
                      </div>
                    )}
                    {route.observation && (
                      <div className="col-span-2 bg-background/40 p-2 rounded border border-border/50">
                        <span className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">
                          Observação
                        </span>
                        <p className="text-[11px] text-foreground/80 leading-relaxed italic break-words">
                          {route.observation}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Action Bar: Primary + Secondary */}
                  <div className="space-y-2">
                    {/* Primary row: Produtos + Canhoto */}
                    <div className="grid grid-cols-2 gap-2">
                      {productCount?.total > 0 ? (
                        <Button
                          className="flex items-center justify-center gap-2 h-10 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-[11px] uppercase tracking-wider shadow-md shadow-blue-900/20 active:scale-95 transition-all"
                          onClick={() => setChecklistRoute(route)}
                        >
                          <Package className="w-4 h-4" />
                          Produtos
                        </Button>
                      ) : (
                        <div />
                      )}

                      <Button
                        variant="secondary"
                        className="relative flex items-center justify-center gap-2 h-10 px-3 rounded-xl font-bold text-[11px] uppercase tracking-wider active:scale-95 transition-all"
                        onClick={() => setReceiptRoute(route)}
                      >
                        <Camera className={`w-4 h-4 ${receiptCount > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
                        Canhoto
                        {receiptCount > 0 && (
                          <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center border-2 border-card shadow-lg">
                            {receiptCount}
                          </span>
                        )}
                      </Button>
                    </div>

                    {/* Secondary row: Ocorrência + Reagendar */}
                    <div className="flex items-center gap-2">
                      {(isAdmin || canManageOccurrences) ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              className="relative flex-1 flex items-center justify-center gap-2 h-9 px-3 rounded-lg font-semibold text-[11px] uppercase tracking-wider text-foreground/80 active:scale-95 transition-all"
                            >
                              <FileText className="w-4 h-4 text-muted-foreground" />
                              Ocorrência
                              {routeOccurrences.length > 0 && (
                                <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center border-2 border-card shadow-lg">
                                  {routeOccurrences.length}
                                </span>
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {(mapsLink || wazeLink) && (
                              <>
                                {mapsLink && (
                                  <DropdownMenuItem asChild>
                                    <a href={mapsLink} target="_blank" rel="noopener noreferrer">
                                      <MapPin className="w-4 h-4 mr-2" />
                                      Google Maps
                                    </a>
                                  </DropdownMenuItem>
                                )}
                                {wazeLink && (
                                  <DropdownMenuItem asChild>
                                    <a href={wazeLink} target="_blank" rel="noopener noreferrer">
                                      <Navigation className="w-4 h-4 mr-2" />
                                      Waze
                                    </a>
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                              </>
                            )}
                            <DropdownMenuItem
                              onClick={() => {
                                setOccurrenceRoute(route);
                                setEditingOccurrence(null);
                                setOccurrenceDialogOpen(true);
                              }}
                            >
                              <Plus className="w-4 h-4 mr-2" />
                              Nova Ocorrência
                            </DropdownMenuItem>
                            {routeOccurrences.length > 0 && (
                              <>
                                <DropdownMenuSeparator />
                                {routeOccurrences.map((occ, idx) => (
                                  <div key={occ.id}>
                                    <DropdownMenuItem
                                      onClick={() => {
                                        setOccurrenceRoute(route);
                                        setEditingOccurrence(occ);
                                        setOccurrenceDialogOpen(true);
                                      }}
                                    >
                                      <Edit className="w-4 h-4 mr-2" />
                                      Editar Ocorrência {idx + 1}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => setDeleteOccurrenceId(occ.id)}
                                      className="text-destructive focus:text-destructive"
                                    >
                                      <X className="w-4 h-4 mr-2" />
                                      Excluir Ocorrência {idx + 1}
                                    </DropdownMenuItem>
                                  </div>
                                ))}
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        routeOccurrences.length > 0 && (
                          <Badge variant="outline" className="text-[10px] gap-1 h-9 px-2 flex-1 justify-center">
                            <FileText className="w-3 h-3" />
                            {routeOccurrences.length}
                          </Badge>
                        )
                      )}

                      {(isAdmin || canManageOccurrences) && route.status !== "ENTREGUE" && (
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              className="flex-1 flex items-center justify-center gap-2 h-9 px-3 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-500 rounded-lg font-semibold text-[11px] uppercase tracking-wider active:scale-95 transition-all"
                              disabled={reschedulingId === route.id}
                            >
                              {reschedulingId === route.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <RotateCcw className="w-4 h-4" />
                              )}
                              Reagendar
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-64 p-3 space-y-3" align="end">

                          <p className="text-xs font-medium text-foreground">Reagendar rota para:</p>
                          <div className="space-y-2">
                            <div>
                              <Label className="text-[10px]">Data</Label>
                              <Input
                                type="date"
                                className="h-8 text-xs"
                                value={rescheduleDate}
                                onChange={(e) => setRescheduleDate(e.target.value)}
                              />
                            </div>
                            <div>
                              <Label className="text-[10px]">Período</Label>
                              <Select value={reschedulePeriod} onValueChange={(v) => setReschedulePeriod(v as "MANHA" | "TARDE")}>
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="MANHA">MANHÃ</SelectItem>
                                  <SelectItem value="TARDE">TARDE</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            className="w-full h-8 text-xs"
                            onClick={() => rescheduleRoute(route)}
                            disabled={reschedulingId === route.id}
                          >
                            Confirmar
                          </Button>
                        </PopoverContent>
                      </Popover>
                    )}
                    </div>



                    {isAdmin && (
                      <div className="flex w-full gap-1.5 mt-0.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 h-8 p-0"
                          onClick={() => {
                            setEditingRoute(route);
                            setEditDialogOpen(true);
                          }}
                          title="Editar"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 h-8 p-0 border-red-900/30 text-red-500/80 hover:text-red-500 hover:bg-red-500/10"
                              disabled={deletingId === route.id}
                              title="Excluir"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                              <AlertDialogDescription>
                                Tem certeza que deseja excluir a rota de {route.client}? Esta ação não pode ser desfeita.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteRoute(route.id)} className="bg-destructive hover:bg-destructive/90">
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Dialogs */}
      {occurrenceRoute && (
        <RouteOccurrenceDialog
          route={occurrenceRoute}
          occurrence={editingOccurrence}
          open={occurrenceDialogOpen}
          onOpenChange={(open) => {
            setOccurrenceDialogOpen(open);
            if (!open) {
              setOccurrenceRoute(null);
              setEditingOccurrence(null);
            }
          }}
          onSaved={() => {
            refetchOccurrences();
            onUpdate();
          }}
        />
      )}

      <AlertDialog open={!!deleteOccurrenceId} onOpenChange={(open) => !open && setDeleteOccurrenceId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta ocorrência? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteOccurrenceId && deleteOccurrence(deleteOccurrenceId)}
              className="bg-destructive hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RouteEditDialog
        route={editingRoute}
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) setEditingRoute(null);
        }}
        onSuccess={onUpdate}
      />

      {checklistRoute && (
        <ProductChecklistDialog
          routeId={checklistRoute.id}
          clientName={checklistRoute.client}
          open={!!checklistRoute}
          onOpenChange={(open) => {
            if (!open) setChecklistRoute(null);
          }}
        />
      )}

      {receiptRoute && (
        <RouteReceiptDialog
          routeId={receiptRoute.id}
          clientName={receiptRoute.client}
          open={!!receiptRoute}
          onOpenChange={(open) => {
            if (!open) setReceiptRoute(null);
          }}
          canManage={canUploadReceipts}
          onChange={refetchReceipts}
        />
      )}
    </>
  );
};
