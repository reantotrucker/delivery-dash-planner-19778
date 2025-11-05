import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { format } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useMemo } from "react";

interface Route {
  id: string;
  client: string;
  neighborhood: string;
  observation: string | null;
  status: string;
  driver: { name: string; color: string } | null;
  vehicle: { plate: string } | null;
  consultant: { name: string } | null;
  payment_method: { name: string } | null;
}

interface RouteSidebarProps {
  routes: Route[];
  period: string;
  date: Date;
}

export const RouteSidebar = ({ routes, period, date }: RouteSidebarProps) => {
  const [selectedDriverForPrint, setSelectedDriverForPrint] = useState<string>("all");

  // Sort routes alphabetically by driver name
  const sortedRoutes = useMemo(() => {
    return [...routes].sort((a, b) => {
      const driverA = a.driver?.name || "Sem motorista";
      const driverB = b.driver?.name || "Sem motorista";
      return driverA.localeCompare(driverB);
    });
  }, [routes]);

  // Get unique drivers for the select
  const uniqueDrivers = useMemo(() => {
    const drivers = routes
      .filter(r => r.driver)
      .map(r => ({ id: r.driver!.name, name: r.driver!.name }))
      .filter((driver, index, self) => 
        index === self.findIndex(d => d.id === driver.id)
      );
    return drivers.sort((a, b) => a.name.localeCompare(b.name));
  }, [routes]);

  const handlePrint = () => {
    const routesToPrint = selectedDriverForPrint === "all" 
      ? sortedRoutes 
      : sortedRoutes.filter(r => r.driver?.name === selectedDriverForPrint);
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const driverName = selectedDriverForPrint === "all" ? "Todos os Motoristas" : selectedDriverForPrint;
    
    const content = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Rota - ${format(date, "dd/MM/yyyy")} - ${period === "MANHA" ? "Manhã" : "Tarde"} - ${driverName}</title>
        <style>
          @page { size: A4; margin: 20mm; }
          body { font-family: Arial, sans-serif; font-size: 10pt; }
          h1 { text-align: center; font-size: 14pt; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #000; padding: 5px; text-align: left; }
          th { background-color: #FF6B00; color: white; }
          .delivered { background-color: #4CAF50; color: white; }
          .not-delivered { background-color: #f44336; color: white; }
        </style>
      </head>
      <body>
        <h1>Rota Logística - ${format(date, "dd/MM/yyyy")} - ${period === "MANHA" ? "Manhã" : "Tarde"} - ${driverName}</h1>
        <table>
          <thead>
            <tr>
              <th>Nº</th>
              <th>Cliente</th>
              <th>Bairro</th>
              <th>Consultor</th>
              <th>Entregador</th>
              <th>Veículo</th>
              <th>Pagamento</th>
              <th>Observação</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${routesToPrint.map((route, index) => `
              <tr>
                <td>${index + 1}</td>
                <td>${route.client}</td>
                <td>${route.neighborhood}</td>
                <td>${route.consultant?.name || "-"}</td>
                <td>${route.driver?.name || "-"}</td>
                <td>${route.vehicle?.plate || "-"}</td>
                <td>${route.payment_method?.name || "-"}</td>
                <td>${route.observation || "-"}</td>
                <td class="${route.status === "ENTREGUE" ? "delivered" : "not-delivered"}">
                  ${route.status === "ENTREGUE" ? "ENTREGUE" : "NÃO ENTREGUE"}
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </body>
      </html>
    `;

    printWindow.document.write(content);
    printWindow.document.close();
    printWindow.print();
  };

  const deliveredCount = sortedRoutes.filter((r) => r.status === "ENTREGUE").length;
  const totalCount = sortedRoutes.length;

  return (
    <div className="space-y-4">
      <Card className="p-4 bg-card border-border">
        <h3 className="text-lg font-bold text-primary mb-4">Resumo do Período</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total de Rotas:</span>
            <span className="font-bold text-foreground">{totalCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Entregas:</span>
            <span className="font-bold text-success">{deliveredCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Pendentes:</span>
            <span className="font-bold text-destructive">{totalCount - deliveredCount}</span>
          </div>
        </div>
        
        <div className="space-y-2 mt-4">
          <label className="text-sm text-muted-foreground">Imprimir por motorista:</label>
          <Select value={selectedDriverForPrint} onValueChange={setSelectedDriverForPrint}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Motoristas</SelectItem>
              {uniqueDrivers.map((driver) => (
                <SelectItem key={driver.id} value={driver.name}>
                  {driver.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button onClick={handlePrint} className="w-full mt-4">
          <Printer className="w-4 h-4 mr-2" />
          Imprimir Rota
        </Button>
      </Card>

      <Card className="p-4 bg-card border-border">
        <h3 className="text-lg font-bold text-primary mb-4">Rotas Criadas</h3>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {sortedRoutes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhuma rota criada
            </p>
          ) : (
            sortedRoutes.map((route, index) => (
              <div
                key={route.id}
                className="p-3 rounded border border-border"
                style={{
                  backgroundColor: route.driver?.color ? `${route.driver.color}15` : undefined,
                }}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-sm">{index + 1}. {route.client}</p>
                    <p className="text-xs text-muted-foreground">{route.neighborhood}</p>
                    {route.driver && (
                      <p className="text-xs mt-1" style={{ color: route.driver.color }}>
                        {route.driver.name} - {route.vehicle?.plate}
                      </p>
                    )}
                  </div>
                  <div
                    className={`text-xs px-2 py-1 rounded ${
                      route.status === "ENTREGUE"
                        ? "bg-success text-success-foreground"
                        : "bg-destructive text-destructive-foreground"
                    }`}
                  >
                    {route.status === "ENTREGUE" ? "OK" : "Pendente"}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
};
