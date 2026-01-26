import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";
import Reports from "./pages/Reports";
import Occurrences from "./pages/Occurrences";
import NotFound from "./pages/NotFound";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import UserManagement from "./pages/UserManagement";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AppLayout } from "./components/layout/AppLayout";
import { useAuth } from "./hooks/useAuth";

const queryClient = new QueryClient();

const ProtectedWithLayout = ({ children, requireAdmin = false }: { children: React.ReactNode; requireAdmin?: boolean }) => {
  const { user } = useAuth();
  
  if (!user) {
    return <ProtectedRoute requireAdmin={requireAdmin}>{children}</ProtectedRoute>;
  }
  
  return (
    <ProtectedRoute requireAdmin={requireAdmin}>
      <AppLayout>{children}</AppLayout>
    </ProtectedRoute>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route
            path="/"
            element={
              <ProtectedWithLayout>
                <Dashboard />
              </ProtectedWithLayout>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedWithLayout requireAdmin>
                <Settings />
              </ProtectedWithLayout>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedWithLayout>
                <Reports />
              </ProtectedWithLayout>
            }
          />
          <Route
            path="/occurrences"
            element={
              <ProtectedWithLayout>
                <Occurrences />
              </ProtectedWithLayout>
            }
          />
          <Route
            path="/admin/users"
            element={
              <ProtectedWithLayout requireAdmin>
                <UserManagement />
              </ProtectedWithLayout>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
