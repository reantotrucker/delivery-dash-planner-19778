import { Truck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { CompanySwitcher } from "@/components/layout/CompanySwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";

export function MobileTopBar() {
  const { user } = useAuth();
  const { companies } = useCompany();

  if (!user || companies.length < 2) return null;

  return (
    <header className="lg:hidden sticky top-0 z-40 flex items-center gap-2 border-b border-border bg-card/95 px-3 py-2 backdrop-blur safe-area-pt">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary">
        <Truck className="h-4 w-4 text-primary-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <CompanySwitcher />
      </div>
      <div className="flex-shrink-0">
        <ThemeToggle collapsed />
      </div>
    </header>
  );
}
