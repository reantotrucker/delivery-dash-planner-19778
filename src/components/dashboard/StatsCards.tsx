import { Package, CheckCircle, Clock, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatsCardsProps {
  total: number;
  delivered: number;
  pending: number;
}

export function StatsCards({ total, delivered, pending }: StatsCardsProps) {
  const deliveryRate = total > 0 ? Math.round((delivered / total) * 100) : 0;

  const stats = [
    {
      title: "Total Rotas",
      value: total,
      icon: Package,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: "Entregues",
      value: delivered,
      icon: CheckCircle,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
    {
      title: "Pendentes",
      value: pending,
      icon: Clock,
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
    },
    {
      title: "Taxa Entrega",
      value: `${deliveryRate}%`,
      icon: TrendingUp,
      color: deliveryRate >= 80 ? "text-green-500" : deliveryRate >= 50 ? "text-orange-500" : "text-red-500",
      bgColor: deliveryRate >= 80 ? "bg-green-500/10" : deliveryRate >= 50 ? "bg-orange-500/10" : "bg-red-500/10",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {stats.map((stat) => (
        <div
          key={stat.title}
          className="bg-card border border-border rounded-xl p-4 transition-all hover:border-primary/30"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              {stat.title}
            </span>
            <div className={cn("p-2 rounded-lg", stat.bgColor)}>
              <stat.icon className={cn("w-4 h-4", stat.color)} />
            </div>
          </div>
          <p className={cn("text-2xl font-bold", stat.color)}>{stat.value}</p>
        </div>
      ))}
    </div>
  );
}
