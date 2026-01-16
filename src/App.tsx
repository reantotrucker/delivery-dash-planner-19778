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
import ResetPassword from "./pages/ResetPassword";
import UserManagement from "./pages/UserManagement";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { useAuth } from "./hooks/useAuth";
import { Button } from "./components/ui/button";
import { Badge } from "./components/ui/badge";
import { Settings as SettingsIcon, BarChart3, Home, LogOut, Shield, ShieldCheck } from "lucide-react";

const queryClient = new QueryClient();

const Navigation = () => {
  const { user, role, isAdmin, isComercial, signOut } = useAuth();

  const handleLogout = async () => {
    await signOut();
  };

  if (!user) return null;

  return (
    <nav className="bg-card border-b border-border sticky top-0 z-50">
      <div className="w-full px-2 sm:px-4">
        <div className="flex items-center justify-between py-2 sm:py-3 gap-2">
          {/* Mobile: Icon-only navigation */}
          <div className="flex items-center gap-1 sm:gap-2 md:gap-4 overflow-x-auto flex-1 min-w-0">
            <Link
              to="/"
              className="flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 rounded hover:bg-secondary transition-colors whitespace-nowrap flex-shrink-0"
            >
              <Home className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
              <span className="hidden sm:inline font-medium text-sm sm:text-base">Rotas</span>
            </Link>
            {isAdmin && (
              <Link
                to="/settings"
                className="flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 rounded hover:bg-secondary transition-colors whitespace-nowrap flex-shrink-0"
              >
                <SettingsIcon className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                <span className="hidden sm:inline font-medium text-sm sm:text-base">Config</span>
              </Link>
            )}
            <Link
              to="/reports"
              className="flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 rounded hover:bg-secondary transition-colors whitespace-nowrap flex-shrink-0"
            >
              <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
              <span className="hidden sm:inline font-medium text-sm sm:text-base">Relatórios</span>
            </Link>
            {isAdmin && (
              <Link
                to="/admin/users"
                className="flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 rounded hover:bg-secondary transition-colors whitespace-nowrap flex-shrink-0"
              >
                <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                <span className="hidden sm:inline font-medium text-sm sm:text-base">Usuários</span>
              </Link>
            )}
          </div>
            
          {/* Mobile: Compact badge and logout */}
          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            <Badge 
              variant={isAdmin ? "default" : (role === 'motorista' || isComercial) ? "outline" : "secondary"}
              className="flex items-center gap-1 px-1.5 sm:px-3 py-0.5 sm:py-1 text-xs sm:text-sm"
            >
              {isAdmin ? (
                <>
                  <ShieldCheck className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  <span className="hidden md:inline font-semibold">Admin</span>
                </>
              ) : role === 'motorista' ? (
                <>
                  <Shield className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  <span className="hidden md:inline font-semibold">Motorista</span>
                </>
              ) : isComercial ? (
                <>
                  <Shield className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  <span className="hidden md:inline font-semibold">Comercial</span>
                </>
              ) : (
                <>
                  <Shield className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  <span className="hidden md:inline font-semibold">Usuário</span>
                </>
              )}
            </Badge>
            <Button variant="outline" size="sm" onClick={handleLogout} className="px-2 sm:px-4">
              <LogOut className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
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
              <Route path="/reset-password" element={<ResetPassword />} />
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
