import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Search, Calendar, User, Truck, Users, Eye, Image } from "lucide-react";
import { RouteOccurrenceDialog, Occurrence } from "@/components/routes/RouteOccurrenceDialog";
import { Route } from "@/components/routes/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface OccurrenceWithRoute extends Occurrence {
  route: {
    id: string;
    client: string;
    neighborhood: string;
    address: string | null;
    date: string;
    period: "MANHA" | "TARDE";
    order_number: number;
    driver: { name: string; color: string } | null;
    consultant: { name: string } | null;
  };
  photos?: {
    id: string;
    file_path: string;
    file_name: string;
  }[];
}

const Occurrences = () => {
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedOccurrence, setSelectedOccurrence] = useState<OccurrenceWithRoute | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const { data: occurrences = [], isLoading, refetch } = useQuery({
    queryKey: ["all-occurrences", startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("route_occurrences")
        .select(`
          *,
          route:routes!inner(
            id,
            client,
            neighborhood,
            address,
            date,
            period,
            order_number,
            driver:drivers(name, color),
            consultant:consultants(name)
          )
        `)
        .gte("route.date", startDate)
        .lte("route.date", endDate)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch photos for each occurrence
      const occurrencesWithPhotos = await Promise.all(
        (data || []).map(async (occ: any) => {
          const { data: photos } = await supabase
            .from("route_occurrence_photos")
            .select("id, file_path, file_name")
            .eq("occurrence_id", occ.id);
          
          return { ...occ, photos: photos || [] };
        })
      );

      return occurrencesWithPhotos as OccurrenceWithRoute[];
    },
  });

  const filteredOccurrences = occurrences.filter((occ) => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      occ.route.client.toLowerCase().includes(search) ||
      occ.route.neighborhood.toLowerCase().includes(search) ||
      occ.description.toLowerCase().includes(search) ||
      occ.route.driver?.name.toLowerCase().includes(search) ||
      occ.route.consultant?.name.toLowerCase().includes(search)
    );
  });

  const getResponsibleBadges = (occ: OccurrenceWithRoute) => {
    const badges = [];
    if (occ.motorista) badges.push({ label: "Motorista", color: "bg-amber-500/20 text-amber-600" });
    if (occ.vendedor) badges.push({ label: "Vendedor", color: "bg-blue-500/20 text-blue-600" });
    if (occ.cliente) badges.push({ label: "Cliente", color: "bg-purple-500/20 text-purple-600" });
    return badges;
  };

  const handleView = (occ: OccurrenceWithRoute) => {
    setSelectedOccurrence(occ);
    setViewDialogOpen(true);
  };

  const handleEdit = (occ: OccurrenceWithRoute) => {
    setSelectedOccurrence(occ);
    setEditDialogOpen(true);
  };

  const getRouteForDialog = (occ: OccurrenceWithRoute): Route => ({
    id: occ.route.id,
    client: occ.route.client,
    neighborhood: occ.route.neighborhood,
    address: occ.route.address,
    observation: null,
    cep: null,
    status: "NAO_ENTREGUE",
    consultant_id: null,
    driver_id: null,
    vehicle_id: null,
    payment_method_id: null,
    driver: occ.route.driver,
    vehicle: null,
    consultant: occ.route.consultant,
    payment_method: null,
    date: occ.route.date,
    period: occ.route.period,
    order_number: occ.route.order_number,
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
            <AlertTriangle className="w-6 h-6" />
            Ocorrências
          </h1>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Filters */}
        <Card className="p-4 mb-6 bg-card border-border">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-1 text-sm">
                <Calendar className="w-4 h-4" />
                Data Início
              </Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1 text-sm">
                <Calendar className="w-4 h-4" />
                Data Fim
              </Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label className="flex items-center gap-1 text-sm">
                <Search className="w-4 h-4" />
                Buscar
              </Label>
              <Input
                placeholder="Cliente, bairro, motorista..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </Card>

        {/* Stats Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="p-4 bg-card border-border">
            <div className="text-2xl font-bold text-foreground">{filteredOccurrences.length}</div>
            <div className="text-sm text-muted-foreground">Total</div>
          </Card>
          <Card className="p-4 bg-amber-500/10 border-amber-500/30">
            <div className="text-2xl font-bold text-amber-600">
              {filteredOccurrences.filter(o => o.motorista).length}
            </div>
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <Truck className="w-3 h-3" /> Motorista
            </div>
          </Card>
          <Card className="p-4 bg-blue-500/10 border-blue-500/30">
            <div className="text-2xl font-bold text-blue-600">
              {filteredOccurrences.filter(o => o.vendedor).length}
            </div>
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <User className="w-3 h-3" /> Vendedor
            </div>
          </Card>
          <Card className="p-4 bg-purple-500/10 border-purple-500/30">
            <div className="text-2xl font-bold text-purple-600">
              {filteredOccurrences.filter(o => o.cliente).length}
            </div>
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <Users className="w-3 h-3" /> Cliente
            </div>
          </Card>
        </div>

        {/* Occurrences Table */}
        <Card className="p-4 bg-card border-border">
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">Carregando...</p>
          ) : filteredOccurrences.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhuma ocorrência encontrada no período selecionado
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-border">
                    <TableHead className="text-foreground">Data</TableHead>
                    <TableHead className="text-foreground">Cliente</TableHead>
                    <TableHead className="text-foreground hidden md:table-cell">Motorista</TableHead>
                    <TableHead className="text-foreground">Responsável</TableHead>
                    <TableHead className="text-foreground hidden lg:table-cell">Descrição</TableHead>
                    <TableHead className="text-foreground text-center">Fotos</TableHead>
                    <TableHead className="text-foreground text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOccurrences.map((occ) => (
                    <TableRow key={occ.id} className="border-b border-border hover:bg-muted/50">
                      <TableCell className="whitespace-nowrap">
                        <div className="text-sm font-medium">
                          {format(new Date(occ.route.date), "dd/MM", { locale: ptBR })}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {occ.route.period === "MANHA" ? "Manhã" : "Tarde"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-foreground truncate max-w-[150px]">
                          {occ.route.client}
                        </div>
                        <div className="text-xs text-muted-foreground truncate max-w-[150px]">
                          {occ.route.neighborhood}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {occ.route.driver && (
                          <span 
                            className="font-medium"
                            style={{ color: occ.route.driver.color }}
                          >
                            {occ.route.driver.name}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {getResponsibleBadges(occ).map((badge, i) => (
                            <Badge key={i} className={`${badge.color} text-xs`}>
                              {badge.label}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <span className="text-sm text-muted-foreground line-clamp-2 max-w-[200px]">
                          {occ.description}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        {occ.photos && occ.photos.length > 0 && (
                          <Badge variant="outline" className="gap-1">
                            <Image className="w-3 h-3" />
                            {occ.photos.length}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleView(occ)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(occ)}
                          >
                            Editar
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      </div>

      {/* View Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Detalhes da Ocorrência</DialogTitle>
          </DialogHeader>
          {selectedOccurrence && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground text-xs">Cliente</Label>
                  <p className="font-medium">{selectedOccurrence.route.client}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Bairro</Label>
                  <p className="font-medium">{selectedOccurrence.route.neighborhood}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Data</Label>
                  <p className="font-medium">
                    {format(new Date(selectedOccurrence.route.date), "dd/MM/yyyy", { locale: ptBR })}
                    {" - "}
                    {selectedOccurrence.route.period === "MANHA" ? "Manhã" : "Tarde"}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Motorista</Label>
                  <p 
                    className="font-medium"
                    style={{ color: selectedOccurrence.route.driver?.color }}
                  >
                    {selectedOccurrence.route.driver?.name || "-"}
                  </p>
                </div>
              </div>

              <div>
                <Label className="text-muted-foreground text-xs">Responsável(eis)</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {getResponsibleBadges(selectedOccurrence).map((badge, i) => (
                    <Badge key={i} className={`${badge.color}`}>
                      {badge.label}
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-muted-foreground text-xs">Descrição</Label>
                <p className="mt-1 p-3 bg-muted rounded-md text-sm whitespace-pre-wrap">
                  {selectedOccurrence.description}
                </p>
              </div>

              {selectedOccurrence.photos && selectedOccurrence.photos.length > 0 && (
                <div>
                  <Label className="text-muted-foreground text-xs">Fotos</Label>
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    {selectedOccurrence.photos.map((photo) => {
                      const photoUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/authenticated/route-occurrences/${photo.file_path}`;
                      return (
                        <a
                          key={photo.id}
                          href={photoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block"
                        >
                          <img
                            src={photoUrl}
                            alt={photo.file_name}
                            className="w-full h-24 object-cover rounded border hover:opacity-80 transition-opacity"
                          />
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="text-xs text-muted-foreground">
                Registrado em: {format(new Date(selectedOccurrence.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      {selectedOccurrence && (
        <RouteOccurrenceDialog
          route={getRouteForDialog(selectedOccurrence)}
          occurrence={selectedOccurrence}
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          onSaved={() => {
            refetch();
            setEditDialogOpen(false);
          }}
        />
      )}
    </div>
  );
};

export default Occurrences;
