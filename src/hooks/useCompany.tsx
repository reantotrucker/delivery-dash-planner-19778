import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getActiveCompanyId, setActiveCompanyId } from "@/lib/company";

export interface Company {
  id: string;
  name: string;
  slug: string;
  has_expedition: boolean;
}

interface CompanyContextValue {
  companies: Company[];
  company: Company | null;
  companyId: string;
  hasExpedition: boolean;
  loading: boolean;
  selectCompany: (id: string) => void;
}

const CompanyContext = createContext<CompanyContextValue>({
  companies: [],
  company: null,
  companyId: "",
  hasExpedition: false,
  loading: true,
  selectCompany: () => {},
});

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [companyId, setCompanyId] = useState<string>(getActiveCompanyId());

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ["my-companies", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name, slug, has_expedition")
        .order("name");
      if (error) throw error;
      return (data || []) as Company[];
    },
  });

  // Guarantee a valid active company
  useEffect(() => {
    if (!companies.length) return;
    const valid = companies.some((c) => c.id === companyId);
    if (!valid) {
      const next = companies[0].id;
      setActiveCompanyId(next);
      setCompanyId(next);
    } else if (getActiveCompanyId() !== companyId) {
      setActiveCompanyId(companyId);
    }
  }, [companies, companyId]);

  const selectCompany = (id: string) => {
    if (id === companyId) return;
    setActiveCompanyId(id);
    setCompanyId(id);
    queryClient.invalidateQueries();
  };

  const company = useMemo(
    () => companies.find((c) => c.id === companyId) || null,
    [companies, companyId]
  );

  return (
    <CompanyContext.Provider
      value={{
        companies,
        company,
        companyId,
        hasExpedition: !!company?.has_expedition,
        loading: isLoading,
        selectCompany,
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
}

export const useCompany = () => useContext(CompanyContext);
