import { useState } from "react";
import { RouteForm } from "@/components/routes/RouteForm";
import { RouteTable } from "@/components/routes/RouteTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, Printer, Search, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Route } from "@/components/routes/types";
import { useAuth } from "@/hooks/useAuth";

const Dashboard = () => {
  const { isAdmin, isMotorista, isComercial } = useAuth();
  const canManageRoutes = isAdmin;
  const canManageOccurrences = isAdmin || isMotorista || isComercial;
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedPeriod, setSelectedPeriod] = useState<"MANHA" | "TARDE">("MANHA");
  const [searchTerm, setSearchTerm] = useState("");
  const [editingRoute, setEditingRoute] = useState<Route | null>(null);
  const [selectedDriverForPrint, setSelectedDriverForPrint] = useState<string>("all");
  const [printPeriod, setPrintPeriod] = useState<"MANHA" | "TARDE" | "COMPLETO">("MANHA");

  const { data: routes = [], refetch } = useQuery({
    queryKey: ["routes", selectedDate, selectedPeriod],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("routes")
        .select(`
          *,
          driver:drivers(name, color),
          vehicle:vehicles(plate),
          consultant:consultants(name),
          payment_method:payment_methods(name)
        `)
        .eq("date", format(selectedDate, "yyyy-MM-dd"))
        .eq("period", selectedPeriod)
        .order("order_number", { ascending: true });

      if (error) throw error;
      
      const sortedData = (data || []).sort((a, b) => {
        const driverA = a.driver?.name || "";
        const driverB = b.driver?.name || "";
        return driverA.localeCompare(driverB);
      });
      
      return sortedData;
    },
  });

  const { data: drivers = [] } = useQuery({
    queryKey: ["drivers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drivers")
        .select("*")
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const filteredRoutes = routes.filter((route) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      route.client.toLowerCase().includes(searchLower) ||
      route.neighborhood.toLowerCase().includes(searchLower) ||
      route.driver?.name.toLowerCase().includes(searchLower) ||
      route.consultant?.name.toLowerCase().includes(searchLower) ||
      route.vehicle?.plate.toLowerCase().includes(searchLower)
    );
  });

  const handlePrint = async () => {
    let routesToPrint = filteredRoutes;

    // Se período completo, buscar manhã e tarde
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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="w-full px-2 sm:px-4 py-2 sm:py-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h1 className="text-base sm:text-xl font-bold text-primary">Sistema de Rotas</h1>
            <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
              <div className="flex items-center gap-1 sm:gap-2">
                <Calendar className="w-3 h-3 sm:w-4 sm:h-4 text-primary" />
                <input
                  type="date"
                  value={format(selectedDate, "yyyy-MM-dd")}
                  onChange={(e) => {
                    const [year, month, day] = e.target.value.split('-').map(Number);
                    setSelectedDate(new Date(year, month - 1, day));
                  }}
                  className="bg-secondary text-foreground px-1.5 sm:px-2 py-1 text-xs sm:text-sm rounded border border-border"
                />
              </div>
              {isAdmin && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => navigate('/settings')}
                  className="px-2 sm:px-3 text-xs sm:text-sm"
                >
                  <Settings className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Config</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="w-full px-2 sm:px-4 py-2 sm:py-4">
        <Tabs value={selectedPeriod} onValueChange={(v) => setSelectedPeriod(v as "MANHA" | "TARDE")}>
          <div className="flex flex-col gap-2 sm:gap-3 mb-3 sm:mb-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <TabsList className="grid grid-cols-2 w-full sm:w-auto">
                <TabsTrigger value="MANHA" className="text-xs sm:text-sm">MANHÃ</TabsTrigger>
                <TabsTrigger value="TARDE" className="text-xs sm:text-sm">TARDE</TabsTrigger>
              </TabsList>
              
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs sm:text-sm px-2 sm:px-4 py-1 sm:py-1.5 bg-muted rounded-md w-full sm:w-auto justify-center">
                <span className="text-muted-foreground">
                  Total: <span className="font-semibold text-foreground">{filteredRoutes.length}</span>
                </span>
                <span className="text-muted-foreground">|</span>
                <span className="text-muted-foreground">
                  OK: <span className="font-semibold text-green-600">{filteredRoutes.filter(r => r.status === "ENTREGUE").length}</span>
                </span>
                <span className="text-muted-foreground">|</span>
                <span className="text-muted-foreground">
                  Pend: <span className="font-semibold text-orange-600">{filteredRoutes.filter(r => r.status === "NAO_ENTREGUE").length}</span>
                </span>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:flex-initial">
                <Search className="absolute left-2 top-2.5 h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-7 sm:pl-8 text-xs sm:text-sm w-full sm:w-48"
                />
              </div>
              
              <div className="grid grid-cols-2 sm:flex gap-2">
                <Select value={printPeriod} onValueChange={(v) => setPrintPeriod(v as "MANHA" | "TARDE" | "COMPLETO")}>
                  <SelectTrigger className="text-xs sm:text-sm h-9">
                    <SelectValue placeholder="Período" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MANHA">Manhã</SelectItem>
                    <SelectItem value="TARDE">Tarde</SelectItem>
                    <SelectItem value="COMPLETO">Completo</SelectItem>
                  </SelectContent>
                </Select>
                
                <Select value={selectedDriverForPrint} onValueChange={setSelectedDriverForPrint}>
                  <SelectTrigger className="text-xs sm:text-sm h-9">
                    <SelectValue placeholder="Motorista" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {drivers.map((driver) => (
                      <SelectItem key={driver.id} value={driver.name}>
                        {driver.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <Button onClick={handlePrint} size="sm" variant="outline" className="px-2 sm:px-3 text-xs sm:text-sm">
                <Printer className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-2" />
                <span className="sm:inline">Imprimir</span>
              </Button>
            </div>
          </div>

          <TabsContent value="MANHA" className="mt-0">
            <div className="space-y-4">
              {canManageRoutes && (
                <RouteForm 
                  period="MANHA" 
                  date={selectedDate} 
                  onSuccess={refetch}
                  editingRoute={editingRoute}
                  onCancelEdit={() => setEditingRoute(null)}
                />
              )}
              <RouteTable 
                routes={filteredRoutes} 
                onUpdate={refetch}
                onEdit={(route) => setEditingRoute(route)}
                isAdmin={isAdmin}
                canManageOccurrences={canManageOccurrences}
              />
            </div>
          </TabsContent>

          <TabsContent value="TARDE" className="mt-0">
            <div className="space-y-4">
              {canManageRoutes && (
                <RouteForm 
                  period="TARDE" 
                  date={selectedDate} 
                  onSuccess={refetch}
                  editingRoute={editingRoute}
                  onCancelEdit={() => setEditingRoute(null)}
                />
              )}
              <RouteTable 
                routes={filteredRoutes} 
                onUpdate={refetch}
                onEdit={(route) => setEditingRoute(route)}
                isAdmin={isAdmin}
                canManageOccurrences={canManageOccurrences}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Dashboard;
