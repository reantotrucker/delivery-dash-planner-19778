import { Route, generateGoogleMapsLink } from "./types";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Trash2, Pencil, FileText, Plus, Edit, X, MapPin } from "lucide-react";
import { RouteOccurrenceDialog, Occurrence } from "./RouteOccurrenceDialog";
import { RouteEditDialog } from "./RouteEditDialog";
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
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

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
      toast({
        title: "Erro ao atualizar status",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Status atualizado",
      });
      onUpdate();
    }
  };

  const deleteRoute = async (routeId: string) => {
    try {
      setDeletingId(routeId);
      const { error } = await supabase.from("routes").delete().eq("id", routeId);

      if (error) throw error;

      toast({
        title: "Rota excluída com sucesso!",
      });

      onUpdate();
    } catch (error) {
      console.error("Error deleting route:", error);
      toast({
        title: "Erro ao excluir rota",
        variant: "destructive",
      });
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

      toast({
        title: "Ocorrência excluída com sucesso!",
      });

      refetchOccurrences();
      onUpdate();
      setDeleteOccurrenceId(null);
    } catch (error) {
      console.error("Error deleting occurrence:", error);
      toast({
        title: "Erro ao excluir ocorrência",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="rounded-md border border-border overflow-x-auto -mx-2 sm:mx-0">
      <Table>
        <TableHeader>
          <TableRow className="bg-card hover:bg-card">
            <TableHead className="text-primary font-semibold text-[10px] sm:text-xs w-8 sm:w-12 px-1 sm:px-4">#</TableHead>
            <TableHead className="text-primary font-semibold text-[10px] sm:text-xs px-1 sm:px-4">CLIENTE</TableHead>
            <TableHead className="text-primary font-semibold text-[10px] sm:text-xs px-1 sm:px-4 hidden sm:table-cell">BAIRRO</TableHead>
            <TableHead className="text-primary font-semibold text-[10px] sm:text-xs px-1 sm:px-4 hidden md:table-cell">ENDEREÇO</TableHead>
            <TableHead className="text-primary font-semibold text-[10px] sm:text-xs px-1 sm:px-4 hidden lg:table-cell">CONSULTOR</TableHead>
            <TableHead className="text-primary font-semibold text-[10px] sm:text-xs px-1 sm:px-4">MOTOR.</TableHead>
            <TableHead className="text-primary font-semibold text-[10px] sm:text-xs px-1 sm:px-4 hidden xl:table-cell">VEÍC.</TableHead>
            <TableHead className="text-primary font-semibold text-[10px] sm:text-xs px-1 sm:px-4 hidden xl:table-cell">PGTO</TableHead>
            <TableHead className="text-primary font-semibold text-[10px] sm:text-xs px-1 sm:px-4">STATUS</TableHead>
            <TableHead className="text-primary font-semibold text-[10px] sm:text-xs w-16 sm:w-24 px-1 sm:px-4">AÇÕES</TableHead>
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
                className={index % 2 === 0 ? "bg-muted/30" : "bg-background"}
                style={{
                  backgroundColor: route.driver?.color
                    ? index % 2 === 0
                      ? `${route.driver.color}30`
                      : `${route.driver.color}15`
                    : undefined,
                }}
              >
                <TableCell className="text-[10px] sm:text-sm py-1 sm:py-2 text-muted-foreground font-semibold px-1 sm:px-4">{index + 1}</TableCell>
                <TableCell className="font-medium text-[10px] sm:text-sm py-1 sm:py-2 px-1 sm:px-4 max-w-[80px] sm:max-w-none truncate">{route.client}</TableCell>
                <TableCell className="text-[10px] sm:text-sm py-1 sm:py-2 px-1 sm:px-4 hidden sm:table-cell">{route.neighborhood}</TableCell>
                <TableCell className="text-[10px] sm:text-sm py-1 sm:py-2 px-1 sm:px-4 hidden md:table-cell">
                  {route.address ? (
                    <div className="flex items-center gap-1">
                      <span className="truncate max-w-[120px]">{route.address}</span>
                      {generateGoogleMapsLink(route.address, route.cep, route.neighborhood) && (
                        <a
                          href={generateGoogleMapsLink(route.address, route.cep, route.neighborhood)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-primary hover:text-primary/80 flex-shrink-0"
                          title="Ver no Google Maps"
                        >
                          <MapPin className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  ) : (
                    "-"
                  )}
                </TableCell>
                <TableCell className="text-[10px] sm:text-sm py-1 sm:py-2 px-1 sm:px-4 hidden lg:table-cell">{route.consultant?.name || "-"}</TableCell>
                <TableCell className="text-[10px] sm:text-sm py-1 sm:py-2 px-1 sm:px-4">{route.driver?.name || "-"}</TableCell>
                <TableCell className="text-[10px] sm:text-sm py-1 sm:py-2 px-1 sm:px-4 hidden xl:table-cell">{route.vehicle?.plate || "-"}</TableCell>
                <TableCell className="text-[10px] sm:text-sm py-1 sm:py-2 px-1 sm:px-4 hidden xl:table-cell">{route.payment_method?.name || "-"}</TableCell>
                <TableCell className="py-1 sm:py-2 px-1 sm:px-4">
                  <Button
                    onClick={() => toggleStatus(route.id, route.status)}
                    variant="ghost"
                    size="sm"
                    className="h-5 sm:h-7 text-[10px] sm:text-xs px-1 sm:px-2"
                    disabled={!isAdmin && !canManageOccurrences}
                  >
                    <span
                      className={`inline-block w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full mr-0.5 sm:mr-1 ${
                        route.status === "ENTREGUE"
                          ? "bg-green-500"
                          : "bg-red-500"
                      }`}
                    />
                    {route.status === "ENTREGUE" ? "OK" : "PEND"}
                  </Button>
                </TableCell>
                <TableCell className="py-1 sm:py-2 px-1 sm:px-4">
                  {(isAdmin || canManageOccurrences) ? (
                    <div className="flex gap-0.5 sm:gap-1">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 sm:h-7 sm:w-7 hover:bg-accent relative p-0"
                            title="Ocorrências"
                          >
                            <FileText className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                            {occurrences.filter(o => o.route_id === route.id).length > 0 && (
                              <span className="absolute -top-0.5 -right-0.5 sm:-top-1 sm:-right-1 bg-red-500 text-white text-[8px] sm:text-[10px] rounded-full w-2.5 h-2.5 sm:w-4 sm:h-4 flex items-center justify-center">
                                {occurrences.filter(o => o.route_id === route.id).length}
                              </span>
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
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
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditingRoute(route);
                              setEditDialogOpen(true);
                            }}
                            className="h-5 w-5 sm:h-7 sm:w-7 hover:bg-primary/10 p-0"
                          >
                            <Pencil className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 sm:h-7 sm:w-7 text-destructive hover:text-destructive hover:bg-destructive/10 p-0"
                                disabled={deletingId === route.id}
                              >
                                <Trash2 className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
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
                  ) : (
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 relative"
                        title="Ocorrências (somente leitura)"
                        disabled
                      >
                        <FileText className="w-3 h-3" />
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
    </div>
  );
};
