import { Home, Settings, BarChart3, Shield, LogOut, ChevronLeft, ChevronRight, Truck, AlertTriangle, FileDown } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";

const navItems = [
  { title: "Rotas", url: "/", icon: Home, adminOnly: false },
  { title: "Ocorrências", url: "/occurrences", icon: AlertTriangle, adminOnly: false },
  { title: "Importar Omie", url: "/omie-import", icon: FileDown, adminOnly: true },
  { title: "Relatórios", url: "/reports", icon: BarChart3, adminOnly: false },
  { title: "Configurações", url: "/settings", icon: Settings, adminOnly: true },
  { title: "Usuários", url: "/admin/users", icon: Shield, adminOnly: true },
];

export function AppSidebar() {
  const { user, role, isAdmin, isComercial, signOut } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  if (!user) return null;

  const filteredItems = navItems.filter(item => !item.adminOnly || isAdmin);

  const handleLogout = async () => {
    await signOut();
  };

  const getRoleLabel = () => {
    if (isAdmin) return "Admin";
    if (role === 'motorista') return "Motorista";
    if (isComercial) return "Comercial";
    return "Usuário";
  };

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col bg-card border-r border-border h-screen sticky top-0 transition-all duration-300",
        collapsed ? "w-16" : "w-56"
      )}
    >
      {/* Logo / Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Truck className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg text-foreground">Rotas</span>
          </div>
        )}
        {collapsed && (
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center mx-auto">
            <Truck className="w-5 h-5 text-primary-foreground" />
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1">
        {filteredItems.map((item) => {
          const isActive = location.pathname === item.url;
          return (
            <Link
              key={item.url}
              to={item.url}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
                isActive
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {!collapsed && <span className="font-medium">{item.title}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-border space-y-2">
        {!collapsed && (
          <Badge 
            variant="outline" 
            className="w-full justify-center py-1.5 text-xs"
          >
            {getRoleLabel()}
          </Badge>
        )}
        <ThemeToggle collapsed={collapsed} />
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className={cn(
            "w-full text-muted-foreground hover:text-destructive hover:bg-destructive/10",
            collapsed && "px-2"
          )}
        >
          <LogOut className="w-4 h-4" />
          {!collapsed && <span className="ml-2">Sair</span>}
        </Button>
      </div>

      {/* Collapse Toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-20 w-6 h-6 bg-card border border-border rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>
    </aside>
  );
}
