import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trophy, BarChart3, PieChart, AlertTriangle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell, LineChart, Line } from "recharts";

const Reports = () => {
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));

  const { data: deliveryRanking = [] } = useQuery({
    queryKey: ["delivery-ranking", startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("routes")
        .select(`
          driver_id,
          status,
          order_number,
          driver:drivers(name, color)
        `)
        .gte("date", startDate)
        .lte("date", endDate);

      if (error) throw error;

      const ranking = data.reduce((acc: any[], route: any) => {
        if (!route.driver_id) return acc;

        const existing = acc.find((r) => r.driver_id === route.driver_id);
        if (existing) {
          existing.total++;
          if (route.status === "ENTREGUE") existing.delivered++;
        } else {
          acc.push({
            driver_id: route.driver_id,
            driver_name: route.driver.name,
            driver_color: route.driver.color,
            total: 1,
            delivered: route.status === "ENTREGUE" ? 1 : 0,
          });
        }
        return acc;
      }, []);

      return ranking
        .map((r: any) => ({
          ...r,
          pending: r.total - r.delivered,
          percentage: r.total > 0 ? ((r.delivered / r.total) * 100).toFixed(1) : "0.0",
        }))
        .sort((a: any, b: any) => {
          if (b.delivered !== a.delivered) {
            return b.delivered - a.delivered;
          }
          return a.driver_name.localeCompare(b.driver_name);
        });
    },
  });

  const { data: occurrencesByDriver = [] } = useQuery({
    queryKey: ["occurrences-by-driver", startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("route_occurrences")
        .select(`
          id,
          motorista,
          vendedor,
          description,
          created_at,
          route:routes!inner(
            driver_id,
            date,
            order_number,
            driver:drivers(name, color)
          )
        `)
        .gte("route.date", startDate)
        .lte("route.date", endDate);

      if (error) throw error;

      const byDriver = data.reduce((acc: any[], occurrence: any) => {
        if (!occurrence.route?.driver_id) return acc;

        const existing = acc.find((d) => d.driver_id === occurrence.route.driver_id);
        if (existing) {
          existing.total++;
          if (occurrence.motorista) existing.motorista++;
          if (occurrence.vendedor) existing.vendedor++;
          if (occurrence.cliente) existing.cliente++;
          existing.occurrences.push({
            id: occurrence.id,
            description: occurrence.description,
            motorista: occurrence.motorista,
            vendedor: occurrence.vendedor,
            cliente: occurrence.cliente,
            order_number: occurrence.route.order_number,
            created_at: occurrence.created_at,
          });
        } else {
          acc.push({
            driver_id: occurrence.route.driver_id,
            driver_name: occurrence.route.driver.name,
            driver_color: occurrence.route.driver.color,
            total: 1,
            motorista: occurrence.motorista ? 1 : 0,
            vendedor: occurrence.vendedor ? 1 : 0,
            cliente: occurrence.cliente ? 1 : 0,
            occurrences: [{
              id: occurrence.id,
              description: occurrence.description,
              motorista: occurrence.motorista,
              vendedor: occurrence.vendedor,
              cliente: occurrence.cliente,
              order_number: occurrence.route.order_number,
              created_at: occurrence.created_at,
            }],
          });
        }
        return acc;
      }, []);

      return byDriver.sort((a: any, b: any) => {
        if (b.motorista !== a.motorista) {
          return b.motorista - a.motorista;
        }
        return a.driver_name.localeCompare(b.driver_name);
      });
    },
  });

  const COLORS = ['#16a34a', '#dc2626'];
  const OCCURRENCE_COLORS = ['#f59e0b', '#3b82f6', '#a855f7'];
  
  const totalDelivered = deliveryRanking.reduce((sum, driver) => sum + driver.delivered, 0);
  const totalPending = deliveryRanking.reduce((sum, driver) => sum + driver.pending, 0);
  
  const pieData = [
    { name: 'Entregues', value: totalDelivered },
    { name: 'Pendentes', value: totalPending }
  ];

  const totalMotorista = occurrencesByDriver.reduce((sum, driver) => sum + driver.motorista, 0);
  const totalVendedor = occurrencesByDriver.reduce((sum, driver) => sum + driver.vendedor, 0);
  const totalCliente = occurrencesByDriver.reduce((sum, driver) => sum + driver.cliente, 0);
  
  const occurrencePieData = [
    { name: 'Motorista', value: totalMotorista },
    { name: 'Vendedor', value: totalVendedor },
    { name: 'Cliente', value: totalCliente }
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-primary">Relatórios</h1>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <Card className="p-6 bg-card border-border">
            <h2 className="text-xl font-bold text-primary mb-4 flex items-center gap-2">
              <BarChart3 className="w-6 h-6" />
              Entregas por Motorista
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="space-y-2">
                <Label>Data Início</Label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-secondary text-foreground px-3 py-2 rounded border border-border"
                />
              </div>
              <div className="space-y-2">
                <Label>Data Fim</Label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-secondary text-foreground px-3 py-2 rounded border border-border"
                />
              </div>
            </div>

            {deliveryRanking.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhuma entrega encontrada no período selecionado
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={deliveryRanking}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="driver_name" angle={-45} textAnchor="end" height={100} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="delivered" fill="#16a34a" name="Entregues" />
                  <Bar dataKey="pending" fill="#dc2626" name="Pendentes" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          <Card className="p-6 bg-card border-border">
            <h2 className="text-xl font-bold text-primary mb-4 flex items-center gap-2">
              <PieChart className="w-6 h-6" />
              Distribuição Total
            </h2>
            
            {deliveryRanking.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhuma entrega encontrada no período selecionado
              </p>
            ) : (
              <div className="flex flex-col items-center">
                <ResponsiveContainer width="100%" height={300}>
                  <RechartsPieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </RechartsPieChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-2 gap-6 mt-4">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-green-600">{totalDelivered}</div>
                    <div className="text-sm text-muted-foreground">Entregas Realizadas</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-red-600">{totalPending}</div>
                    <div className="text-sm text-muted-foreground">Entregas Pendentes</div>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>

        <Card className="p-6 bg-card border-border">
          <h2 className="text-xl font-bold text-primary mb-4 flex items-center gap-2">
            <Trophy className="w-6 h-6" />
            Ranking de Entregas por Motorista
          </h2>

          {deliveryRanking.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhuma entrega encontrada no período selecionado
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-border">
                    <TableHead className="text-foreground">Posição</TableHead>
                    <TableHead className="text-foreground">Motorista</TableHead>
                    <TableHead className="text-foreground">Total de Rotas</TableHead>
                    <TableHead className="text-foreground">Entregas Realizadas</TableHead>
                    <TableHead className="text-foreground">Taxa de Sucesso</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveryRanking.map((driver: any, index: number) => (
                    <TableRow
                      key={driver.driver_id}
                      className="border-b border-border"
                      style={{
                        backgroundColor: `${driver.driver_color}15`,
                      }}
                    >
                      <TableCell className="font-bold text-lg">
                        {index === 0 && <Trophy className="w-5 h-5 inline text-primary mr-2" />}
                        {index + 1}º
                      </TableCell>
                      <TableCell>
                        <span style={{ color: driver.driver_color }} className="font-semibold">
                          {driver.driver_name}
                        </span>
                      </TableCell>
                      <TableCell>{driver.total}</TableCell>
                      <TableCell className="font-semibold text-success">
                        {driver.delivered}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                            <div
                              className="h-full bg-primary"
                              style={{ width: `${driver.percentage}%` }}
                            />
                          </div>
                          <span className="font-semibold">{driver.percentage}%</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>

        <Card className="p-6 bg-card border-border mt-6">
          <h2 className="text-xl font-bold text-primary mb-4 flex items-center gap-2">
            <PieChart className="w-6 h-6" />
            Distribuição de Ocorrências por Tipo
          </h2>
          
          {occurrencesByDriver.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhuma ocorrência encontrada no período selecionado
            </p>
          ) : (
            <div className="flex flex-col items-center">
              <ResponsiveContainer width="100%" height={300}>
                <RechartsPieChart>
                  <Pie
                    data={occurrencePieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {occurrencePieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={OCCURRENCE_COLORS[index % OCCURRENCE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </RechartsPieChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-3 gap-6 mt-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-amber-600">{totalMotorista}</div>
                  <div className="text-sm text-muted-foreground">Motorista</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600">{totalVendedor}</div>
                  <div className="text-sm text-muted-foreground">Vendedor</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-purple-600">{totalCliente}</div>
                  <div className="text-sm text-muted-foreground">Cliente</div>
                </div>
              </div>
            </div>
          )}
        </Card>

        <Card className="p-6 bg-card border-border mt-6">
          <h2 className="text-xl font-bold text-primary mb-6 flex items-center gap-2">
            <AlertTriangle className="w-6 h-6" />
            Ocorrências por Motorista
          </h2>

          {occurrencesByDriver.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhuma ocorrência encontrada no período selecionado
            </p>
          ) : (
            <>
              <div className="mb-8">
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={occurrencesByDriver}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis 
                      dataKey="driver_name" 
                      angle={-45} 
                      textAnchor="end" 
                      height={100}
                      stroke="hsl(var(--muted-foreground))"
                    />
                    <YAxis stroke="hsl(var(--muted-foreground))" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '6px',
                        color: 'hsl(var(--foreground))'
                      }}
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="total" 
                      stroke="#ef4444" 
                      strokeWidth={3}
                      name="Total de Ocorrências"
                      dot={{ fill: '#ef4444', r: 6 }}
                      activeDot={{ r: 8 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="mb-8">
                <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                  <Trophy className="w-5 h-5" />
                  Ranking de Ocorrências
                </h3>
                <div className="space-y-3">
                  {occurrencesByDriver.map((driver: any, index: number) => (
                    <div
                      key={driver.driver_id}
                      className="flex items-center gap-4 p-4 rounded-lg border border-border bg-card hover:bg-muted/20 transition-colors"
                    >
                      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-muted font-bold text-lg">
                        {index === 0 && <Trophy className="w-6 h-6 text-primary" />}
                        {index > 0 && `${index + 1}º`}
                      </div>
                      <div className="flex-1">
                        <div className="font-bold text-lg" style={{ color: driver.driver_color }}>
                          {driver.driver_name}
                        </div>
                        <div className="flex gap-2 mt-1">
                          <span className="text-xs px-2 py-1 bg-amber-500/10 text-amber-700 rounded-full font-medium">
                            {driver.motorista} Motorista
                          </span>
                          <span className="text-xs px-2 py-1 bg-blue-500/10 text-blue-700 rounded-full font-medium">
                            {driver.vendedor} Vendedor
                          </span>
                          <span className="text-xs px-2 py-1 bg-purple-500/10 text-purple-700 rounded-full font-medium">
                            {driver.cliente} Cliente
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-3xl font-bold text-amber-600">
                          {driver.motorista}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {driver.motorista === 1 ? 'ocorrência' : 'ocorrências'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <h3 className="text-lg font-bold text-foreground mb-4">Detalhes das Ocorrências</h3>
              <div className="grid gap-4">
                {occurrencesByDriver.map((driver: any) => (
                  <div
                    key={driver.driver_id}
                    className="border border-border rounded-lg overflow-hidden"
                    style={{
                      borderLeftWidth: '4px',
                      borderLeftColor: driver.driver_color,
                    }}
                  >
                    <div className="bg-muted/30 px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span 
                          className="font-bold text-lg"
                          style={{ color: driver.driver_color }}
                        >
                          {driver.driver_name}
                        </span>
                        <span className="px-3 py-1 bg-destructive/10 text-destructive rounded-full text-sm font-semibold">
                          {driver.total} {driver.total === 1 ? 'ocorrência' : 'ocorrências'}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <div className="px-3 py-1 bg-amber-500/10 text-amber-700 rounded text-sm">
                          <span className="font-semibold">{driver.motorista}</span> Motorista
                        </div>
                        <div className="px-3 py-1 bg-blue-500/10 text-blue-700 rounded text-sm">
                          <span className="font-semibold">{driver.vendedor}</span> Vendedor
                        </div>
                        <div className="px-3 py-1 bg-purple-500/10 text-purple-700 rounded text-sm">
                          <span className="font-semibold">{driver.cliente}</span> Cliente
                        </div>
                      </div>
                    </div>
                    
                    <div className="divide-y divide-border">
                      {driver.occurrences.map((occ: any, idx: number) => (
                        <div key={occ.id} className="px-4 py-3 hover:bg-muted/20 transition-colors">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                 <span className="font-semibold text-foreground">Rota #{occ.order_number}</span>
                                 <div className="flex gap-1">
                                   {occ.motorista && (
                                     <span className="text-xs px-2 py-0.5 bg-amber-500 text-white rounded-full font-medium">
                                       Motorista
                                     </span>
                                   )}
                                   {occ.vendedor && (
                                     <span className="text-xs px-2 py-0.5 bg-blue-500 text-white rounded-full font-medium">
                                       Vendedor
                                     </span>
                                   )}
                                   {occ.cliente && (
                                     <span className="text-xs px-2 py-0.5 bg-purple-500 text-white rounded-full font-medium">
                                       Cliente
                                     </span>
                                   )}
                                 </div>
                               </div>
                              <p className="text-sm text-muted-foreground leading-relaxed">
                                {occ.description}
                              </p>
                            </div>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {format(new Date(occ.created_at), "dd/MM/yyyy HH:mm")}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
};

export default Reports;
