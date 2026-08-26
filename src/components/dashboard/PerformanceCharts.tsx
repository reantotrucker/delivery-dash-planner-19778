import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/company";
import { format } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { TrendingUp, Users } from "lucide-react";

interface PerformanceChartsProps {
  date: Date;
  period: "MANHA" | "TARDE";
}

const COLORS = {
  delivered: "#16a34a",
  pending: "#dc2626",
};

export function PerformanceCharts({ date, period }: PerformanceChartsProps) {
  const { data: driverStats = [] } = useQuery({
    queryKey: ["driver-stats", date, period],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("routes")
        .select(`
          driver_id,
          status,
          driver:drivers(name, color)
        `)
        .eq("company_id", getActiveCompanyId())
        .eq("date", format(date, "yyyy-MM-dd"))
        .eq("period", period);

      if (error) throw error;

      const stats = (data || []).reduce((acc: any[], route: any) => {
        if (!route.driver_id || !route.driver) return acc;

        const existing = acc.find((r) => r.driver_id === route.driver_id);
        if (existing) {
          existing.total++;
          if (route.status === "ENTREGUE") existing.delivered++;
        } else {
          acc.push({
            driver_id: route.driver_id,
            name: route.driver.name,
            color: route.driver.color,
            total: 1,
            delivered: route.status === "ENTREGUE" ? 1 : 0,
          });
        }
        return acc;
      }, []);

      return stats
        .map((s: any) => ({
          ...s,
          pending: s.total - s.delivered,
        }))
        .sort((a: any, b: any) => b.delivered - a.delivered);
    },
  });

  const totalDelivered = driverStats.reduce((sum, d) => sum + d.delivered, 0);
  const totalPending = driverStats.reduce((sum, d) => sum + d.pending, 0);
  const total = totalDelivered + totalPending;

  const pieData = [
    { name: "Entregues", value: totalDelivered },
    { name: "Pendentes", value: totalPending },
  ];

  if (driverStats.length === 0) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm">Por Motorista</h3>
          </div>
          <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
            Sem dados para exibir
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm">Distribuição</h3>
          </div>
          <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
            Sem dados para exibir
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Bar Chart - Entregas por Motorista */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">Por Motorista</h3>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={driverStats} layout="vertical" margin={{ left: 0, right: 10 }}>
            <XAxis type="number" hide />
            <YAxis 
              type="category" 
              dataKey="name" 
              width={70} 
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'hsl(var(--card))', 
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '12px'
              }}
              formatter={(value: number, name: string) => [
                value,
                name === 'delivered' ? 'Entregues' : 'Pendentes'
              ]}
            />
            <Bar 
              dataKey="delivered" 
              fill={COLORS.delivered} 
              radius={[0, 4, 4, 0]}
              name="delivered"
            />
            <Bar 
              dataKey="pending" 
              fill={COLORS.pending} 
              radius={[0, 4, 4, 0]}
              name="pending"
            />
          </BarChart>
        </ResponsiveContainer>
        <div className="flex justify-center gap-4 mt-2">
          <div className="flex items-center gap-1.5 text-xs">
            <div className="w-2.5 h-2.5 rounded-sm bg-green-600" />
            <span className="text-muted-foreground">Entregues</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <div className="w-2.5 h-2.5 rounded-sm bg-red-600" />
            <span className="text-muted-foreground">Pendentes</span>
          </div>
        </div>
      </div>

      {/* Pie Chart - Distribuição */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">Distribuição</h3>
        </div>
        <div className="flex items-center justify-center">
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={70}
                paddingAngle={2}
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={index === 0 ? COLORS.delivered : COLORS.pending} 
                  />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex justify-center gap-6 -mt-2">
          <div className="text-center">
            <div className="text-xl font-bold text-green-500">{totalDelivered}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Entregues</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-red-500">{totalPending}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Pendentes</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-primary">
              {total > 0 ? Math.round((totalDelivered / total) * 100) : 0}%
            </div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Taxa</div>
          </div>
        </div>
      </div>
    </div>
  );
}
