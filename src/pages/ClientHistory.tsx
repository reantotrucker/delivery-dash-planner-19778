import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Users, Search, Camera, PenLine, ChevronLeft } from "lucide-react";

interface RouteRow {
  id: string;
  date: string;
  period: string;
  client: string;
  address: string | null;
  neighborhood: string | null;
  status: string | null;
  urgent: boolean | null;
  observation: string | null;
  driver: { name: string; color: string } | null;
}

interface Receipt {
  id: string;
  route_id: string;
  file_path: string;
  file_name: string;
  created_at: string;
}

interface Signature {
  id: string;
  route_id: string | null;
  file_path: string;
  signer_name: string;
  signer_document: string | null;
  signed_at: string;
}

const statusLabel = (s: string | null) =>
  s === "ENTREGUE" ? "Entregue" : s === "NAO_ENTREGUE" ? "Não entregue" : "A entregar";

const statusCls = (s: string | null) =>
  s === "ENTREGUE"
    ? "border-emerald-500 text-emerald-500"
    : s === "NAO_ENTREGUE"
      ? "border-destructive text-destructive"
      : "border-amber-500 text-amber-500";

export default function ClientHistory() {
  const { companyId, company } = useCompany();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const { data: clients = [], isLoading: loadingClients } = useQuery({
    queryKey: ["client-history-list", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("routes")
        .select("client, status, date")
        .eq("company_id", companyId)
        .order("date", { ascending: false })
        .range(0, 4999);
      if (error) throw error;
      const map = new Map<string, { name: string; total: number; entregue: number; last: string }>();
      (data || []).forEach((r) => {
        const name = (r.client || "").trim();
        if (!name) return;
        const key = name.toUpperCase();
        const c = map.get(key) || { name, total: 0, entregue: 0, last: r.date };
        c.total += 1;
        if (r.status === "ENTREGUE") c.entregue += 1;
        if (r.date > c.last) c.last = r.date;
        map.set(key, c);
      });
      return [...map.values()].sort((a, b) => b.total - a.total);
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase();
    if (!q) return clients.slice(0, 60);
    return clients.filter((c) => c.name.toUpperCase().includes(q)).slice(0, 60);
  }, [clients, search]);

  const { data: detail, isLoading: loadingDetail } = useQuery({
    queryKey: ["client-history-detail", companyId, selected],
    enabled: !!companyId && !!selected,
    queryFn: async () => {
      const { data: routes, error } = await supabase
        .from("routes")
        .select(
          "id, date, period, client, address, neighborhood, status, urgent, observation, driver:drivers(name, color)"
        )
        .eq("company_id", companyId)
        .ilike("client", selected as string)
        .order("date", { ascending: false });
      if (error) throw error;
      const list = (routes || []) as unknown as RouteRow[];
      const ids = list.map((r) => r.id);
      if (!ids.length) return { routes: list, receipts: [] as Receipt[], signatures: [] as Signature[] };

      const [rec, sig] = await Promise.all([
        supabase
          .from("route_receipts")
          .select("id, route_id, file_path, file_name, created_at")
          .in("route_id", ids),
        supabase
          .from("route_signatures")
          .select("id, route_id, file_path, signer_name, signer_document, signed_at")
          .in("route_id", ids),
      ]);

      return {
        routes: list,
        receipts: (rec.data || []) as Receipt[],
        signatures: (sig.data || []) as Signature[],
      };
    },
  });

  const openFile = async (bucket: string, path: string) => {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 5);
    if (error || !data?.signedUrl) {
      toast.error("Não foi possível abrir o arquivo");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  if (selected) {
    const routes = detail?.routes || [];
    const entregues = routes.filter((r) => r.status === "ENTREGUE").length;
    return (
      <div className="p-4 lg:p-6 space-y-4 max-w-4xl mx-auto">
        <Button variant="ghost" size="sm" onClick={() => setSelected(null)} className="-ml-2">
          <ChevronLeft className="w-4 h-4 mr-1" /> Voltar
        </Button>

        <header className="space-y-1">
          <h1 className="text-xl lg:text-2xl font-bold">{selected}</h1>
          <p className="text-sm text-muted-foreground">
            {routes.length} entrega(s) · {entregues} concluída(s)
            {company?.name ? ` · ${company.name}` : ""}
          </p>
        </header>

        {loadingDetail ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <div className="space-y-2">
            {routes.map((r) => {
              const recs = (detail?.receipts || []).filter((x) => x.route_id === r.id);
              const sigs = (detail?.signatures || []).filter((x) => x.route_id === r.id);
              return (
                <div key={r.id} className="bg-card border border-border rounded-xl p-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {r.date.split("-").reverse().join("/")} ·{" "}
                        {r.period === "MANHA" ? "Manhã" : "Tarde"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {r.address || "Sem endereço"}
                        {r.neighborhood ? ` — ${r.neighborhood}` : ""}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {r.driver ? r.driver.name : "sem motorista"}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant="outline" className={statusCls(r.status)}>
                        {statusLabel(r.status)}
                      </Badge>
                      {r.urgent && <Badge variant="destructive">Urgente</Badge>}
                    </div>
                  </div>

                  {r.observation && (
                    <p className="text-xs bg-muted/50 rounded-lg p-2">{r.observation}</p>
                  )}

                  {(recs.length > 0 || sigs.length > 0) && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {recs.map((x) => (
                        <Button
                          key={x.id}
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => openFile("route-receipts", x.file_path)}
                        >
                          <Camera className="w-3.5 h-3.5 mr-1" /> Canhoto
                        </Button>
                      ))}
                      {sigs.map((x) => (
                        <Button
                          key={x.id}
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => openFile("route-signatures", x.file_path)}
                        >
                          <PenLine className="w-3.5 h-3.5 mr-1" /> {x.signer_name}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {routes.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma entrega encontrada.</p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-4xl mx-auto">
      <header className="space-y-1">
        <h1 className="text-xl lg:text-2xl font-bold flex items-center gap-2">
          <Users className="w-6 h-6 text-primary" />
          Histórico por cliente
        </h1>
        <p className="text-sm text-muted-foreground">
          Busque um cliente e veja todas as entregas, canhotos e assinaturas dele
        </p>
      </header>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Nome do cliente…"
          className="pl-9"
        />
      </div>

      {loadingClients ? (
        <p className="text-sm text-muted-foreground">Carregando clientes…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum cliente encontrado.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <button
              key={c.name}
              onClick={() => setSelected(c.name)}
              className="w-full text-left bg-card border border-border rounded-xl p-3 hover:bg-muted/50 transition-colors flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{c.name}</p>
                <p className="text-xs text-muted-foreground">
                  última em {c.last.split("-").reverse().join("/")}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold tabular-nums">{c.total}</p>
                <p className="text-[10px] uppercase text-muted-foreground">
                  {c.entregue} entregue(s)
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
