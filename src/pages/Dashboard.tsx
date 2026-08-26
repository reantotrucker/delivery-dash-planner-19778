import { useState } from "react";
import { RouteForm } from "@/components/routes/RouteForm";
import { RouteTable } from "@/components/routes/RouteTable";
import { RouteMap } from "@/components/routes/RouteMap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/company";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, Printer, Search, Sun, Sunset, ChevronDown, ChevronUp, Route, Loader2, MapPin } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { PerformanceCharts } from "@/components/dashboard/PerformanceCharts";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const Dashboard = () => {
  const { toast } = useToast();
  const { isAdmin, isMotorista, isComercial } = useAuth();
  const canManageRoutes = isAdmin;
  const canManageOccurrences = isAdmin || isMotorista || isComercial;
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedPeriod, setSelectedPeriod] = useState<"MANHA" | "TARDE">(new Date().getHours() >= 12 ? "TARDE" : "MANHA");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDriverFilter, setSelectedDriverFilter] = useState<string>("all");
  const [selectedDriverForPrint, setSelectedDriverForPrint] = useState<string>("all");
  const [printPeriod, setPrintPeriod] = useState<"MANHA" | "TARDE" | "COMPLETO">("MANHA");
  const [chartsOpen, setChartsOpen] = useState(true);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [isLoadingMap, setIsLoadingMap] = useState(false);
  const [mapData, setMapData] = useState<any>(null);

  const isSearching = searchTerm.trim().length > 0;

  const { data: routes = [], refetch } = useQuery({
    queryKey: ["routes", getActiveCompanyId(), selectedDate, selectedPeriod, isSearching],
    queryFn: async () => {
      let query = supabase
        .from("routes")
        .select(`
          *,
          driver:drivers(name, color),
          vehicle:vehicles(plate),
          consultant:consultants(name),
          payment_method:payment_methods(name)
        `)
        .eq("company_id", getActiveCompanyId());

      if (isSearching) {
        // Busca em todas as datas/períodos quando há termo de pesquisa
        query = query
          .order("date", { ascending: false })
          .order("order_number", { ascending: true })
          .limit(500);
      } else {
        query = query
          .eq("date", format(selectedDate, "yyyy-MM-dd"))
          .eq("period", selectedPeriod)
          .order("order_number", { ascending: true });
      }

      const { data, error } = await query;
      if (error) throw error;
      
      const sortedData = (data || []).sort((a, b) => {
        if (isSearching && a.date !== b.date) {
          return a.date < b.date ? 1 : -1;
        }
        const driverA = a.driver?.name || "";
        const driverB = b.driver?.name || "";
        return driverA.localeCompare(driverB);
      });
      
      return sortedData;
    },
  });

  const { data: drivers = [] } = useQuery({
    queryKey: ["drivers", getActiveCompanyId()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drivers")
        .select("*")
        .eq("company_id", getActiveCompanyId())
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const filteredRoutes = routes.filter((route) => {
    // Driver filter
    if (selectedDriverFilter !== "all" && route.driver?.name !== selectedDriverFilter) {
      return false;
    }
    const searchLower = searchTerm.toLowerCase();
    return (
      route.client.toLowerCase().includes(searchLower) ||
      route.neighborhood.toLowerCase().includes(searchLower) ||
      (route.address?.toLowerCase() || "").includes(searchLower) ||
      route.driver?.name.toLowerCase().includes(searchLower) ||
      route.consultant?.name.toLowerCase().includes(searchLower) ||
      route.vehicle?.plate.toLowerCase().includes(searchLower)
    );
  });

  const deliveredCount = filteredRoutes.filter(r => r.status === "ENTREGUE").length;
  const pendingCount = filteredRoutes.filter(r => r.status === "NAO_ENTREGUE").length;

  const handlePrint = async () => {
    let routesToPrint = filteredRoutes;

    if (printPeriod === "COMPLETO") {
      const { data: allRoutes, error } = await supabase
        .from("routes")
        .select(`
          *,
          driver:drivers(name, color),
          vehicle:vehicles(plate),
          consultant:consultants(name),
          payment_method:payment_methods(name)
        `)
        .eq("company_id", getActiveCompanyId())
        .eq("date", format(selectedDate, "yyyy-MM-dd"))
        .order("period", { ascending: true })
        .order("order_number", { ascending: true });

      if (error) {
        console.error("Error fetching routes:", error);
        return;
      }

      const sortedAllRoutes = (allRoutes || []).sort((a, b) => {
        if (a.period !== b.period) {
          return a.period === "MANHA" ? -1 : 1;
        }
        const driverA = a.driver?.name || "";
        const driverB = b.driver?.name || "";
        return driverA.localeCompare(driverB);
      });

      routesToPrint = selectedDriverForPrint === "all" 
        ? sortedAllRoutes 
        : sortedAllRoutes.filter(route => route.driver?.name === selectedDriverForPrint);
    } else {
      routesToPrint = selectedDriverForPrint === "all" 
        ? filteredRoutes 
        : filteredRoutes.filter(route => route.driver?.name === selectedDriverForPrint);
    }

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const driverTitle = selectedDriverForPrint === "all" 
      ? "Todos os Motoristas" 
      : selectedDriverForPrint;

    const periodTitle = printPeriod === "COMPLETO" 
      ? "MANHÃ E TARDE" 
      : printPeriod;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Rotas - ${format(selectedDate, "dd/MM/yyyy")} - ${selectedPeriod}</title>
          <style>
            @page { size: landscape; margin: 10mm; }
            body { font-family: Arial, sans-serif; font-size: 10px; }
            h1 { font-size: 16px; margin-bottom: 5px; }
            h2 { font-size: 12px; margin: 5px 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #000; padding: 4px; text-align: left; }
            th { background-color: #f0f0f0; font-weight: bold; }
            tr:nth-child(even) { background-color: #f9f9f9; }
          </style>
        </head>
        <body>
          <h1>Rotas Logísticas</h1>
          <h2>Data: ${format(selectedDate, "dd/MM/yyyy")} | Período: ${periodTitle} | ${driverTitle}</h2>
          <table>
            <thead>
              <tr>
                <th>#</th>
                ${printPeriod === "COMPLETO" ? "<th>Período</th>" : ""}
                <th>Cliente</th>
                <th>Bairro</th>
                <th>Endereço</th>
                <th>Consultor</th>
                <th>Motorista</th>
                <th>Veículo</th>
                <th>Pgto</th>
                <th>Observação</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${routesToPrint.map((route, index) => `
                <tr>
                  <td style="text-align: center; font-weight: bold;">${index + 1}</td>
                  ${printPeriod === "COMPLETO" ? `<td>${route.period}</td>` : ""}
                  <td>${route.client}</td>
                  <td>${route.neighborhood}</td>
                  <td>${route.address || "-"}${route.cep ? ` - ${route.cep}` : ""}</td>
                  <td>${route.consultant?.name || "-"}</td>
                  <td>${route.driver?.name || "-"}</td>
                  <td>${route.vehicle?.plate || "-"}</td>
                  <td>${route.payment_method?.name || "-"}</td>
                  <td>${route.observation || "-"}</td>
                  <td style="background-color: ${route.status === "ENTREGUE" ? "#16a34a" : "#dc2626"}; color: white; font-weight: bold; text-align: center;">
                    ${route.status === "ENTREGUE" ? "ENTREGUE" : "PENDENTE"}
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.print();
  };

  const handleOptimizeOrder = async () => {
    if (filteredRoutes.length < 2) {
      toast({ title: "Mínimo 2 rotas para otimizar", variant: "destructive" });
      return;
    }

    setIsOptimizing(true);
    try {
      const routeData = filteredRoutes.map(r => ({
        id: r.id,
        client: r.client,
        address: r.address || "",
        neighborhood: r.neighborhood,
        cep: r.cep || "",
      }));

      const { data, error } = await supabase.functions.invoke("optimize-route-order", {
        body: { routes: routeData },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const orderedIds: string[] = data.orderedIds;
      
      // Validate IDs against actual route IDs to handle AI returning malformed UUIDs
      const validRouteIds = new Set(filteredRoutes.map(r => r.id));
      const validOrderedIds = orderedIds.filter(id => validRouteIds.has(id));
      
      // If AI returned invalid IDs, fall back to matching by closest ID
      const finalIds = validOrderedIds.length === filteredRoutes.length
        ? validOrderedIds
        : filteredRoutes.map(r => r.id); // fallback to original order

      if (validOrderedIds.length !== filteredRoutes.length) {
        console.warn("AI returned invalid IDs, using original order", { orderedIds, validRouteIds: [...validRouteIds] });
      }

      // Batch update order_number
      for (let i = 0; i < finalIds.length; i++) {
        const { error: updateError } = await supabase
          .from("routes")
          .update({ order_number: i + 1 })
          .eq("id", finalIds[i]);
        if (updateError) throw updateError;
      }

      await refetch();
      toast({ title: "Ordem otimizada com sucesso! 🚀" });
    } catch (err: any) {
      console.error("Optimize error:", err);
      toast({ title: "Erro ao otimizar ordem", description: err.message, variant: "destructive" });
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleOpenMap = async () => {
    if (filteredRoutes.length === 0) {
      toast({ title: "Nenhuma rota para exibir no mapa", variant: "destructive" });
      return;
    }

    setMapOpen(true);
    setIsLoadingMap(true);

    try {
      const routeData = filteredRoutes.map(r => ({
        id: r.id,
        client: r.client,
        address: r.address || "",
        neighborhood: r.neighborhood,
        cep: r.cep || "",
      }));

      const { data, error } = await supabase.functions.invoke("optimize-route-order", {
        body: { routes: routeData, includeCoordinates: true },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Group by driver with coordinates
      const coordMap = new Map<string, { lat: number; lng: number }>();
      (data.coordinates || []).forEach((c: any) => coordMap.set(c.id, { lat: c.lat, lng: c.lng }));

      const orderedIds: string[] = data.orderedIds || [];
      const driverGroupsMap = new Map<string, any>();

      orderedIds.forEach((id, index) => {
        const route = filteredRoutes.find(r => r.id === id);
        if (!route) return;
        const coord = coordMap.get(id);
        if (!coord) return;

        const driverName = route.driver?.name || "Sem motorista";
        const color = route.driver?.color || "#6b7280";

        if (!driverGroupsMap.has(driverName)) {
          driverGroupsMap.set(driverName, { driverName, color, coordinates: [] });
        }

        const group = driverGroupsMap.get(driverName);
        group.coordinates.push({
          id,
          lat: coord.lat,
          lng: coord.lng,
          client: route.client,
          address: `${route.address || ""} - ${route.neighborhood}`,
          order: group.coordinates.length + 1,
        });
      });

      setMapData(Array.from(driverGroupsMap.values()));
    } catch (err: any) {
      console.error("Map error:", err);
      toast({ title: "Erro ao carregar mapa", description: err.message, variant: "destructive" });
      setMapOpen(false);
    } finally {
      setIsLoadingMap(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card/50 backdrop-blur-sm border-b border-border sticky top-0 z-40">
        <div className="px-4 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground">
                Painel de Rotas
              </h1>
              <p className="text-sm text-muted-foreground">
                {format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <input
                type="date"
                value={format(selectedDate, "yyyy-MM-dd")}
                onChange={(e) => {
                  const [year, month, day] = e.target.value.split('-').map(Number);
                  setSelectedDate(new Date(year, month - 1, day));
                }}
                className="bg-secondary text-foreground px-3 py-2 text-sm rounded-lg border border-border focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
          </div>
        </div>
      </header>

      <div className="px-4 py-4 space-y-4">
        {/* Stats Cards */}
        <StatsCards 
          total={filteredRoutes.length} 
          delivered={deliveredCount} 
          pending={pendingCount} 
        />

        {/* Performance Charts - Collapsible */}
        <Collapsible open={chartsOpen} onOpenChange={setChartsOpen}>
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full justify-between p-3 bg-card border border-border rounded-lg">
              <span>📊 Gráficos de Performance</span>
              {chartsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3">
            <PerformanceCharts date={selectedDate} period={selectedPeriod} />
          </CollapsibleContent>
        </Collapsible>

        {/* Period Tabs */}
        <Tabs value={selectedPeriod} onValueChange={(v) => setSelectedPeriod(v as "MANHA" | "TARDE")}>
          <div className="flex flex-col gap-4">
            {/* Controls Row */}
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
              <TabsList className="grid grid-cols-2 w-full sm:w-auto bg-secondary">
                <TabsTrigger value="MANHA" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <Sun className="w-4 h-4" />
                  Manhã
                </TabsTrigger>
                <TabsTrigger value="TARDE" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <Sunset className="w-4 h-4" />
                  Tarde
                </TabsTrigger>
              </TabsList>
              
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                <Select value={selectedDriverFilter} onValueChange={setSelectedDriverFilter}>
                  <SelectTrigger className="w-full sm:w-44 h-9 text-sm bg-secondary">
                    <SelectValue placeholder="Motorista" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos Motoristas</SelectItem>
                    {drivers.map((driver) => (
                      <SelectItem key={driver.id} value={driver.name}>
                        {driver.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="relative flex-1 sm:flex-initial">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Pesquisar rotas..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 bg-secondary border-border w-full sm:w-64"
                  />
                </div>
                {(canManageRoutes || isMotorista) && selectedDriverFilter !== "all" && (
                  <Button
                    onClick={handleOptimizeOrder}
                    disabled={isOptimizing || filteredRoutes.length < 2}
                    size="sm"
                    variant="outline"
                    className="gap-2 whitespace-nowrap"
                  >
                    {isOptimizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Route className="w-4 h-4" />}
                    Sugerir Ordem
                  </Button>
                )}
                <Button
                  onClick={handleOpenMap}
                  disabled={isLoadingMap || filteredRoutes.length === 0}
                  size="sm"
                  variant="outline"
                  className="gap-2 whitespace-nowrap"
                >
                  {isLoadingMap ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
                  Ver Mapa
                </Button>
              </div>
            </div>

            {/* Print Controls */}
            <div className="flex flex-wrap items-center gap-2 p-3 bg-card rounded-lg border border-border">
              <span className="text-sm text-muted-foreground font-medium">Imprimir:</span>
              <Select value={printPeriod} onValueChange={(v) => setPrintPeriod(v as "MANHA" | "TARDE" | "COMPLETO")}>
                <SelectTrigger className="w-32 h-9 text-sm bg-secondary">
                  <SelectValue placeholder="Período" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MANHA">Manhã</SelectItem>
                  <SelectItem value="TARDE">Tarde</SelectItem>
                  <SelectItem value="COMPLETO">Completo</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={selectedDriverForPrint} onValueChange={setSelectedDriverForPrint}>
                <SelectTrigger className="w-40 h-9 text-sm bg-secondary">
                  <SelectValue placeholder="Motorista" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos Motoristas</SelectItem>
                  {drivers.map((driver) => (
                    <SelectItem key={driver.id} value={driver.name}>
                      {driver.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Button onClick={handlePrint} size="sm" className="gap-2">
                <Printer className="w-4 h-4" />
                Imprimir
              </Button>
            </div>
          </div>

          <TabsContent value="MANHA" className="mt-4">
            <div className="space-y-4">
              {canManageRoutes && (
                <RouteForm 
                  period="MANHA" 
                  date={selectedDate} 
                  onSuccess={refetch}
                />
              )}
              <RouteTable 
                routes={filteredRoutes} 
                onUpdate={refetch}
                isAdmin={isAdmin}
                isMotorista={isMotorista}
                isComercial={isComercial}
                canManageOccurrences={canManageOccurrences}
              />
            </div>
          </TabsContent>

          <TabsContent value="TARDE" className="mt-4">
            <div className="space-y-4">
              {canManageRoutes && (
                <RouteForm 
                  period="TARDE" 
                  date={selectedDate} 
                  onSuccess={refetch}
                />
              )}
              <RouteTable 
                routes={filteredRoutes} 
                onUpdate={refetch}
                isAdmin={isAdmin}
                isMotorista={isMotorista}
                isComercial={isComercial}
                canManageOccurrences={canManageOccurrences}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Map Dialog */}
      <Dialog open={mapOpen} onOpenChange={(open) => { setMapOpen(open); if (!open) setMapData(null); }}>
        <DialogContent className="max-w-[95vw] w-full h-[85vh] p-0 gap-0">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-primary" />
              Mapa de Rotas - {format(selectedDate, "dd/MM/yyyy")} - {selectedPeriod}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 px-4 pb-4 min-h-0">
            {isLoadingMap ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center space-y-3">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
                  <p className="text-sm text-muted-foreground">Calculando coordenadas com IA...</p>
                </div>
              </div>
            ) : mapData ? (
              <RouteMap driverGroups={mapData} />
            ) : null}
          </div>
          {mapData && (
            <div className="px-4 pb-3 flex flex-wrap gap-3 border-t border-border pt-3">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-black rounded-full flex items-center justify-center text-[8px] text-white">🏠</div>
                <span className="text-xs text-muted-foreground">Base</span>
              </div>
              {mapData.map((g: any) => (
                <div key={g.driverName} className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: g.color }} />
                  <span className="text-xs text-muted-foreground">{g.driverName} ({g.coordinates.length})</span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dashboard;
