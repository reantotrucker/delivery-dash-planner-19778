import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";
import Reports from "./pages/Reports";
import NotFound from "./pages/NotFound";
import Auth from "./pages/Auth";
import UserManagement from "./pages/UserManagement";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { useAuth } from "./hooks/useAuth";
import { Button } from "./components/ui/button";
import { Badge } from "./components/ui/badge";
import { Settings as SettingsIcon, BarChart3, Home, LogOut, Shield, ShieldCheck } from "lucide-react";

const queryClient = new QueryClient();

const Navigation = () => {
  const { user, isAdmin, signOut } = useAuth();

  const handleLogout = async () => {
    await signOut();
  };

  if (!user) return null;

  return (
    <nav className="bg-card border-b border-border">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-6">
            <div className="flex gap-4">
            <Link
              to="/"
              className="flex items-center gap-2 px-4 py-2 rounded hover:bg-secondary transition-colors"
            >
              <Home className="w-5 h-5 text-primary" />
              <span className="font-medium">Rotas</span>
            </Link>
              {isAdmin && (
                <Link
                  to="/settings"
                  className="flex items-center gap-2 px-4 py-2 rounded hover:bg-secondary transition-colors"
                >
                  <SettingsIcon className="w-5 h-5 text-primary" />
                  <span className="font-medium">Configurações</span>
                </Link>
              )}
              <Link
                to="/reports"
                className="flex items-center gap-2 px-4 py-2 rounded hover:bg-secondary transition-colors"
              >
                <BarChart3 className="w-5 h-5 text-primary" />
                <span className="font-medium">Relatórios</span>
              </Link>
              {isAdmin && (
                <Link
                  to="/admin/users"
                  className="flex items-center gap-2 px-4 py-2 rounded hover:bg-secondary transition-colors"
                >
                  <Shield className="w-5 h-5 text-primary" />
                  <span className="font-medium">Usuários</span>
                </Link>
              )}
            </div>
            
            <Badge 
              variant={isAdmin ? "default" : "secondary"}
              className="flex items-center gap-1.5 px-3 py-1"
            >
              {isAdmin ? (
                <>
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span className="font-semibold">Administrador</span>
                </>
              ) : (
                <>
                  <Shield className="w-3.5 h-3.5" />
                  <span className="font-semibold">Usuário</span>
                </>
              )}
            </Badge>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </Button>
        </div>
      </div>
    </nav>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <div className="flex flex-col min-h-screen">
          <Navigation />
          <div className="flex-1">
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <ProtectedRoute requireAdmin>
                    <Settings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reports"
                element={
                  <ProtectedRoute>
                    <Reports />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/users"
                element={
                  <ProtectedRoute requireAdmin>
                    <UserManagement />
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </div>
        </div>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
