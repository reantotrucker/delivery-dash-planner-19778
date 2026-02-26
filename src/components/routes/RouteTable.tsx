import { Route, generateGoogleMapsLink, generateWazeLink } from "./types";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Trash2, Pencil, FileText, Plus, Edit, X, MapPin, Navigation, Package, CheckCircle2, AlertCircle, Truck, Car, User, RotateCcw, Loader2 } from "lucide-react";
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
  canManageOccurrences?: boolean;
}

export const RouteTable = ({ routes, onUpdate, isAdmin, canManageOccurrences = false }: RouteTableProps) => {
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {routes.map((route, index) => {
          const routeOccurrences = occurrences.filter(o => o.route_id === route.id);
          const productCount = routeProductCounts[route.id];
          const paymentStyle = getPaymentBadgeStyle(route.payment_method?.name);
          const driverColor = route.driver?.color;

          return (
            <Card
              key={route.id}
              className={`relative overflow-hidden transition-all hover:shadow-md ${route.urgent ? "ring-2 ring-red-500/50" : ""}`}
              style={{
                borderLeft: `5px solid ${driverColor || 'hsl(var(--border))'}`,
                backgroundColor: driverColor ? `${driverColor}08` : undefined,
              }}
            >
              {/* Urgent indicator */}
              {route.urgent && (
                <div className="absolute top-0 right-0 bg-red-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-bl-md">
                  URGENTE
                </div>
              )}

              {/* Header: # + Client + Status */}
              <div className="flex items-start justify-between p-3 pb-1.5">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-xs font-bold text-muted-foreground shrink-0">#{index + 1}</span>
                  <h3 className="font-bold text-sm sm:text-base text-foreground truncate">{route.client}</h3>
                </div>
                <button
                  onClick={() => toggleStatus(route.id, route.status)}
                  disabled={!isAdmin && !canManageOccurrences}
                  className="focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed shrink-0 ml-2"
                >
                  {route.status === "ENTREGUE" ? (
                    <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px] sm:text-xs font-bold px-2 py-1 gap-1 cursor-pointer hover:bg-emerald-500/30 transition-colors">
                      <CheckCircle2 className="w-3 h-3" />
                      OK
                    </Badge>
                  ) : (
                    <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px] sm:text-xs font-bold px-2 py-1 gap-1 cursor-pointer hover:bg-red-500/30 transition-colors">
                      <AlertCircle className="w-3 h-3" />
                      PEND
                    </Badge>
                  )}
                </button>
              </div>

              {/* Info rows */}
              <div className="px-3 pb-2 space-y-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  <span><span className="font-medium">Bairro:</span> {route.neighborhood}</span>
                  {route.consultant?.name && (
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {route.consultant.name}
                    </span>
                  )}
                </div>

                {route.address && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="truncate">{route.address}</span>
                    {generateGoogleMapsLink(route.address, route.cep, route.neighborhood) && (
                      <a
                        href={generateGoogleMapsLink(route.address, route.cep, route.neighborhood)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-[10px] font-medium text-primary hover:text-primary/80 bg-primary/10 rounded px-1.5 py-0.5"
                      >
                        Maps
                      </a>
                    )}
                    {generateWazeLink(route.address, route.cep, route.neighborhood) && (
                      <a
                        href={generateWazeLink(route.address, route.cep, route.neighborhood)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-[10px] font-medium text-blue-400 hover:text-blue-300 bg-blue-500/10 rounded px-1.5 py-0.5"
                      >
                        Waze
                      </a>
                    )}
                  </div>
                )}

                {route.observation && (
                  <p className="text-[10px] text-muted-foreground/70 italic break-words">Obs: {route.observation}</p>
                )}
              </div>

              <Separator className="opacity-50" />

              {/* Driver / Vehicle / Payment */}
              <div className="px-3 py-2 flex flex-wrap items-center gap-1.5">
                {route.driver?.name && (
                  <Badge variant="outline" className="text-[10px] sm:text-xs gap-1 font-normal">
                    <Truck className="w-3 h-3" />
                    {route.driver.name}
                  </Badge>
                )}
                {route.vehicle?.plate && (
                  <Badge variant="outline" className="text-[10px] sm:text-xs gap-1 font-normal">
                    <Car className="w-3 h-3" />
                    {route.vehicle.plate}
                  </Badge>
                )}
                <Badge className={`${paymentStyle.className} text-[10px] sm:text-xs font-semibold px-2 py-0.5`}>
                  {paymentStyle.label}
                </Badge>
              </div>

              <Separator className="opacity-50" />

              {/* Actions */}
              <div className="px-3 py-2 flex flex-wrap items-center gap-1.5">
                {/* Products */}
                {productCount?.total > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[10px] sm:text-xs gap-1 px-2"
                    onClick={() => setChecklistRoute(route)}
                  >
                    <Package className="w-3 h-3" />
                    Produtos
                    <span className={`ml-0.5 text-[9px] font-bold ${productCount.checked === productCount.total ? "text-green-500" : "text-orange-400"}`}>
                      {productCount.checked}/{productCount.total}
                    </span>
                    <span className={`text-[9px] font-bold ${productCount.checked2 === productCount.total ? "text-blue-500" : "text-orange-400"}`}>
                      {productCount.checked2}/{productCount.total}
                    </span>
                  </Button>
                )}

                {/* Occurrences */}
                {(isAdmin || canManageOccurrences) ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[10px] sm:text-xs gap-1 px-2 relative"
                      >
                        <FileText className="w-3 h-3" />
                        Ocorr.
                        {routeOccurrences.length > 0 && (
                          <span className="bg-red-500 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center ml-0.5">
                            {routeOccurrences.length}
                          </span>
                        )}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {(generateGoogleMapsLink(route.address, route.cep, route.neighborhood) || generateWazeLink(route.address, route.cep, route.neighborhood)) && (
                        <>
                          {generateGoogleMapsLink(route.address, route.cep, route.neighborhood) && (
                            <DropdownMenuItem asChild>
                              <a href={generateGoogleMapsLink(route.address, route.cep, route.neighborhood)!} target="_blank" rel="noopener noreferrer">
                                <MapPin className="w-4 h-4 mr-2" />
                                Google Maps
                              </a>
                            </DropdownMenuItem>
                          )}
                          {generateWazeLink(route.address, route.cep, route.neighborhood) && (
                            <DropdownMenuItem asChild>
                              <a href={generateWazeLink(route.address, route.cep, route.neighborhood)!} target="_blank" rel="noopener noreferrer">
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
                    <Badge variant="outline" className="text-[10px] sm:text-xs gap-1">
                      <FileText className="w-3 h-3" />
                      {routeOccurrences.length} ocorr.
                    </Badge>
                  )
                )}

                {/* Spacer */}
                <div className="flex-1" />

                {/* Reschedule (for pending routes) */}
                {(isAdmin || canManageOccurrences) && route.status !== "ENTREGUE" && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[10px] sm:text-xs gap-1 px-2 text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
                        disabled={reschedulingId === route.id}
                      >
                        {reschedulingId === route.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <RotateCcw className="w-3 h-3" />
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

                {/* Edit & Delete */}
                {isAdmin && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[10px] sm:text-xs gap-1 px-2 hover:bg-primary/10"
                      onClick={() => {
                        setEditingRoute(route);
                        setEditDialogOpen(true);
                      }}
                    >
                      <Pencil className="w-3 h-3" />
                      Editar
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-[10px] sm:text-xs gap-1 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                          disabled={deletingId === route.id}
                        >
                          <Trash2 className="w-3 h-3" />
                          Excluir
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
                  </>
                )}
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
    </>
  );
};
