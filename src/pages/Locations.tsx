import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/company";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MapPin, Search, ExternalLink, Navigation } from "lucide-react";
import { toast } from "sonner";

interface LocationEntry {
  client: string;
  address: string | null;
  neighborhood: string | null;
  location_link: string;
}

export default function Locations() {
  const [items, setItems] = useState<LocationEntry[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("routes")
        .select("client, address, neighborhood, location_link")
        .eq("company_id", getActiveCompanyId())
        .not("location_link", "is", null)
        .order("client", { ascending: true });

      if (error) {
        toast.error("Erro ao carregar localizações");
        setLoading(false);
        return;
      }

      const seen = new Set<string>();
      const unique: LocationEntry[] = [];
      for (const r of data || []) {
        const link = (r.location_link || "").trim();
        if (!link) continue;
        const key = `${(r.client || "").trim().toLowerCase()}|${link}`;
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push({
          client: r.client,
          address: r.address,
          neighborhood: r.neighborhood,
          location_link: link,
        });
      }
      unique.sort((a, b) => a.client.localeCompare(b.client, "pt-BR"));
      setItems(unique);
      setLoading(false);
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.client.toLowerCase().includes(q) ||
        (i.address || "").toLowerCase().includes(q) ||
        (i.neighborhood || "").toLowerCase().includes(q)
    );
  }, [items, search]);

  const buildWaze = (link: string) => {
    const coords = link.match(/(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/);
    if (coords) return `https://waze.com/ul?ll=${coords[1]},${coords[2]}&navigate=yes`;
    return `https://waze.com/ul?q=${encodeURIComponent(link)}`;
  };

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-black text-foreground flex items-center gap-2">
          <MapPin className="w-7 h-7 text-primary" />
          Localizações Salvas
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Localizações exatas já coladas pelo comercial (sem duplicidades)
        </p>
      </div>

      <div className="relative mb-4">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Pesquisar por cliente, endereço ou bairro..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="text-xs text-muted-foreground mb-3">
        {filtered.length} {filtered.length === 1 ? "localização" : "localizações"}
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          Nenhuma localização encontrada
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item, i) => (
            <Card key={i} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-bold text-sm text-foreground truncate">
                  {item.client}
                </div>
                {(item.address || item.neighborhood) && (
                  <div className="text-xs text-muted-foreground truncate">
                    {[item.address, item.neighborhood].filter(Boolean).join(" — ")}
                  </div>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2"
                  asChild
                >
                  <a href={item.location_link} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2"
                  asChild
                >
                  <a href={buildWaze(item.location_link)} target="_blank" rel="noopener noreferrer">
                    <Navigation className="w-3.5 h-3.5" />
                  </a>
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
