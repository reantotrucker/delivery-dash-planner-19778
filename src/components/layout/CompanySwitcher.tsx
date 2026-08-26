import { Building2 } from "lucide-react";
import { useCompany } from "@/hooks/useCompany";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function CompanySwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const { companies, companyId, selectCompany } = useCompany();

  if (companies.length === 0) return null;

  if (collapsed) {
    return (
      <div className="flex justify-center py-2" title={companies.find((c) => c.id === companyId)?.name}>
        <Building2 className="w-5 h-5 text-muted-foreground" />
      </div>
    );
  }

  return (
    <Select value={companyId} onValueChange={selectCompany}>
      <SelectTrigger className={cn("h-9 text-sm")} aria-label="Empresa">
        <Building2 className="w-4 h-4 mr-1 flex-shrink-0 text-muted-foreground" />
        <SelectValue placeholder="Empresa" />
      </SelectTrigger>
      <SelectContent>
        {companies.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
