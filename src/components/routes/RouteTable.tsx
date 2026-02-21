import { Route, generateGoogleMapsLink, generateWazeLink } from "./types";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Trash2, Pencil, FileText, Plus, Edit, X, MapPin, Navigation, Package, CheckCircle2, AlertCircle } from "lucide-react";
import { RouteOccurrenceDialog, Occurrence } from "./RouteOccurrenceDialog";
import { ProductChecklistDialog } from "./ProductChecklistDialog";
import { RouteEditDialog } from "./RouteEditDialog";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

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

  // Fetch product counts for routes that have products
  const { data: routeProductCounts = {} } = useQuery({
    queryKey: ["route-product-counts", routes.map(r => r.id)],
    queryFn: async () => {
      if (routes.length === 0) return {};
      const { data, error } = await supabase
        .from("route_products")
        .select("route_id, checked")
        .in("route_id", routes.map(r => r.id));
      if (error) throw error;
      const counts: Record<string, { total: number; checked: number }> = {};
      data?.forEach((p) => {
        if (!counts[p.route_id]) counts[p.route_id] = { total: 0, checked: 0 };
        counts[p.route_id].total++;
        if (p.checked) counts[p.route_id].checked++;
      });
      return counts;
    },
    enabled: routes.length > 0,
  });

  // Fetch all occurrences for the displayed routes
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

  return (
    <TooltipProvider>
      <div className="rounded-lg border border-border overflow-x-auto -mx-2 sm:mx-0 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-card/90 hover:bg-card/90 border-b-2 border-primary/20">
              <TableHead className="text-primary font-bold text-[10px] sm:text-xs w-8 sm:w-12 px-1 sm:px-4 uppercase tracking-wider">#</TableHead>
              <TableHead className="text-primary font-bold text-[10px] sm:text-xs px-1 sm:px-4 uppercase tracking-wider">Cliente</TableHead>
              <TableHead className="text-primary font-bold text-[10px] sm:text-xs px-1 sm:px-4 hidden sm:table-cell uppercase tracking-wider">Bairro</TableHead>
              <TableHead className="text-primary font-bold text-[10px] sm:text-xs px-1 sm:px-4 hidden md:table-cell uppercase tracking-wider">Endereço</TableHead>
              <TableHead className="text-primary font-bold text-[10px] sm:text-xs px-1 sm:px-4 hidden lg:table-cell uppercase tracking-wider">Consultor</TableHead>
              <TableHead className="text-primary font-bold text-[10px] sm:text-xs px-1 sm:px-4 uppercase tracking-wider">Motor.</TableHead>
              <TableHead className="text-primary font-bold text-[10px] sm:text-xs px-1 sm:px-4 hidden xl:table-cell uppercase tracking-wider">Veíc.</TableHead>
              <TableHead className="text-primary font-bold text-[10px] sm:text-xs px-1 sm:px-4 hidden xl:table-cell uppercase tracking-wider">Pgto</TableHead>
              <TableHead className="text-primary font-bold text-[10px] sm:text-xs px-1 sm:px-4 uppercase tracking-wider">Status</TableHead>
              <TableHead className="text-primary font-bold text-[10px] sm:text-xs w-20 sm:w-28 px-1 sm:px-4 uppercase tracking-wider">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {routes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-muted-foreground py-4 sm:py-8 text-xs sm:text-sm">
                  Nenhuma rota cadastrada
                </TableCell>
              </TableRow>
            ) : (
              routes.map((route, index) => (
                <TableRow
                  key={route.id}
                  className={`transition-colors hover:brightness-110 ${route.urgent ? "text-red-500" : ""}`}
                  style={{
                    backgroundColor: route.driver?.color
                      ? index % 2 === 0
                        ? `${route.driver.color}25`
                        : `${route.driver.color}12`
                      : index % 2 === 0
                        ? 'hsl(var(--muted) / 0.25)'
                        : undefined,
                  }}
                >
                  <TableCell className="text-[10px] sm:text-sm py-1.5 sm:py-2.5 text-muted-foreground font-bold px-1 sm:px-4">{index + 1}</TableCell>
                  <TableCell className="font-bold text-[10px] sm:text-sm py-1.5 sm:py-2.5 px-1 sm:px-4 max-w-[80px] sm:max-w-[180px] truncate text-foreground">{route.client}</TableCell>
                  <TableCell className="text-[10px] sm:text-sm py-1.5 sm:py-2.5 px-1 sm:px-4 hidden sm:table-cell">{route.neighborhood}</TableCell>
                  <TableCell className="text-[10px] sm:text-sm py-1.5 sm:py-2.5 px-1 sm:px-4 hidden md:table-cell">
                    {route.address ? (
                      <div className="flex items-center gap-1">
                        <span className="truncate max-w-[120px]">{route.address}</span>
                        {generateGoogleMapsLink(route.address, route.cep, route.neighborhood) && (
                          <a
                            href={generateGoogleMapsLink(route.address, route.cep, route.neighborhood)!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:text-primary/80 flex-shrink-0"
                            title="Ver no Google Maps"
                          >
                            <MapPin className="w-3 h-3" />
                          </a>
                        )}
                        {generateWazeLink(route.address, route.cep, route.neighborhood) && (
                          <a
                            href={generateWazeLink(route.address, route.cep, route.neighborhood)!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:text-blue-400 flex-shrink-0"
                            title="Navegar pelo Waze"
                          >
                            <Navigation className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell className="text-[10px] sm:text-sm py-1.5 sm:py-2.5 px-1 sm:px-4 hidden lg:table-cell">{route.consultant?.name || "-"}</TableCell>
                  <TableCell className="text-[10px] sm:text-sm py-1.5 sm:py-2.5 px-1 sm:px-4 font-medium">{route.driver?.name || "-"}</TableCell>
                  <TableCell className="text-[10px] sm:text-sm py-1.5 sm:py-2.5 px-1 sm:px-4 hidden xl:table-cell">{route.vehicle?.plate || "-"}</TableCell>
                  
                  {/* Payment Badge */}
                  <TableCell className="py-1.5 sm:py-2.5 px-1 sm:px-4 hidden xl:table-cell">
                    {(() => {
                      const style = getPaymentBadgeStyle(route.payment_method?.name);
                      return (
                        <Badge className={`${style.className} text-[9px] sm:text-[11px] font-semibold px-1.5 sm:px-2 py-0 sm:py-0.5 whitespace-nowrap`}>
                          {style.label}
                        </Badge>
                      );
                    })()}
                  </TableCell>

                  {/* Status Badge */}
                  <TableCell className="py-1.5 sm:py-2.5 px-1 sm:px-4">
                    <button
                      onClick={() => toggleStatus(route.id, route.status)}
                      disabled={!isAdmin && !canManageOccurrences}
                      className="focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {route.status === "ENTREGUE" ? (
                        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[9px] sm:text-[11px] font-bold px-1.5 sm:px-2.5 py-0.5 sm:py-1 gap-0.5 sm:gap-1 cursor-pointer hover:bg-emerald-500/30 transition-colors">
                          <CheckCircle2 className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5" />
                          OK
                        </Badge>
                      ) : (
                        <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[9px] sm:text-[11px] font-bold px-1.5 sm:px-2.5 py-0.5 sm:py-1 gap-0.5 sm:gap-1 cursor-pointer hover:bg-red-500/30 transition-colors">
                          <AlertCircle className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5" />
                          PEND
                        </Badge>
                      )}
                    </button>
                  </TableCell>

                  {/* Actions */}
                  <TableCell className="py-1.5 sm:py-2.5 px-1 sm:px-4">
                    {(isAdmin || canManageOccurrences) ? (
                      <div className="flex gap-0.5 sm:gap-1.5">
                        {/* Product checklist button */}
                        {routeProductCounts[route.id]?.total > 0 && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 sm:h-8 sm:w-8 hover:bg-accent rounded-md relative p-0"
                                onClick={() => setChecklistRoute(route)}
                              >
                                <Package className="w-3 h-3 sm:w-4 sm:h-4" />
                                {routeProductCounts[route.id] && (
                                  <span className={`absolute -top-0.5 -right-0.5 sm:-top-1 sm:-right-1 text-white text-[8px] sm:text-[10px] rounded-full w-3 h-3 sm:w-4 sm:h-4 flex items-center justify-center ${
                                    routeProductCounts[route.id].checked === routeProductCounts[route.id].total
                                      ? "bg-emerald-500"
                                      : "bg-orange-500"
                                  }`}>
                                    {routeProductCounts[route.id].checked}/{routeProductCounts[route.id].total}
                                  </span>
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Conferir Produtos</TooltipContent>
                          </Tooltip>
                        )}
                        <DropdownMenu>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 sm:h-8 sm:w-8 hover:bg-accent rounded-md relative p-0"
                                >
                                  <FileText className="w-3 h-3 sm:w-4 sm:h-4" />
                                  {occurrences.filter(o => o.route_id === route.id).length > 0 && (
                                    <span className="absolute -top-0.5 -right-0.5 sm:-top-1 sm:-right-1 bg-red-500 text-white text-[8px] sm:text-[10px] rounded-full w-3 h-3 sm:w-4 sm:h-4 flex items-center justify-center">
                                      {occurrences.filter(o => o.route_id === route.id).length}
                                    </span>
                                  )}
                                </Button>
                              </DropdownMenuTrigger>
                            </TooltipTrigger>
                            <TooltipContent>Ocorrências</TooltipContent>
                          </Tooltip>
                          <DropdownMenuContent align="end">
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
                            {occurrences.filter(o => o.route_id === route.id).length > 0 && (
                              <>
                                <DropdownMenuSeparator />
                                {occurrences
                                  .filter(o => o.route_id === route.id)
                                  .map((occ, idx) => (
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
                        {isAdmin && (
                          <>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    setEditingRoute(route);
                                    setEditDialogOpen(true);
                                  }}
                                  className="h-6 w-6 sm:h-8 sm:w-8 hover:bg-primary/10 rounded-md p-0"
                                >
                                  <Pencil className="w-3 h-3 sm:w-4 sm:h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Editar Rota</TooltipContent>
                            </Tooltip>
                            <AlertDialog>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 sm:h-8 sm:w-8 text-destructive hover:text-destructive hover:bg-destructive/10 rounded-md p-0"
                                      disabled={deletingId === route.id}
                                    >
                                      <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                </TooltipTrigger>
                                <TooltipContent>Excluir Rota</TooltipContent>
                              </Tooltip>
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
                    ) : (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 relative rounded-md"
                          title="Ocorrências (somente leitura)"
                          disabled
                        >
                          <FileText className="w-4 h-4" />
                          {occurrences.filter(o => o.route_id === route.id).length > 0 && (
                            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                              {occurrences.filter(o => o.route_id === route.id).length}
                            </span>
                          )}
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

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
      </div>
    </TooltipProvider>
  );
};
