import { Home, BarChart3, Settings, Shield, LogOut, AlertTriangle, MapPin } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

const navItems = [
  { title: "Rotas", url: "/", icon: Home, adminOnly: false },
  { title: "Ocorr.", url: "/occurrences", icon: AlertTriangle, adminOnly: false },
  { title: "Locais", url: "/locations", icon: MapPin, adminOnly: false },
  { title: "Relatórios", url: "/reports", icon: BarChart3, adminOnly: false },
  { title: "Config", url: "/settings", icon: Settings, adminOnly: true },
  { title: "Usuários", url: "/admin/users", icon: Shield, adminOnly: true },
];

export function MobileNav() {
  const { user, isAdmin, signOut } = useAuth();
  const location = useLocation();

  if (!user) return null;

  const filteredItems = navItems.filter(item => !item.adminOnly || isAdmin);

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50 safe-area-pb">
      <div className="flex items-center justify-around py-2">
        {filteredItems.map((item) => {
          const isActive = location.pathname === item.url;
          return (
            <Link
              key={item.url}
              to={item.url}
              className={cn(
                "flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-all min-w-[60px]",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground"
              )}
            >
              <item.icon className={cn("w-5 h-5", isActive && "scale-110")} />
              <span className="text-[10px] font-medium">{item.title}</span>
            </Link>
          );
        })}
        <button
          onClick={signOut}
          className="flex flex-col items-center gap-1 px-3 py-2 rounded-lg text-muted-foreground min-w-[60px]"
        >
          <LogOut className="w-5 h-5" />
          <span className="text-[10px] font-medium">Sair</span>
        </button>
      </div>
    </nav>
  );
}
