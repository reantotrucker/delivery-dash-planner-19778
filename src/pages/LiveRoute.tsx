import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { RouteMap, type LiveVehicleMarker } from "@/components/routes/RouteMap";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Radio, MapPin } from "lucide-react";

type Period = "MANHA" | "TARDE";
const PERIOD_TIMES: Record<Period, [string, string]> = { MANHA: ["06:00", "12:00"], TARDE: ["12:00", "19:00"] };
const LIVE_REFRESH_MS = 45_000;

/** Extrai "lat,lng" de um link de mapa (Google Maps / coordenadas coladas). */
export function coordsFromLink(link?: string | null): [number, number] | null {
  if (!link) return null;
  const m = link.match(/(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/);
  if (!m) return null;
  const lat = Number(m[1]), lng = Number(m[2]);
  return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
}

async function callProxy(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("smartgps-proxy", { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export default function LiveRoute() {
  const { company } = useCompany();
  const companyId = company?.id;
  const [vehicleId, setVehicleId] = useState<string>("todos");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [period, setPeriod] = useState<Period>(new Date().getHours() < 12 ? "MANHA" : "TARDE");

  const live = useQuery({
    queryKey: ["smartgps-live", companyId],
    enabled: !!companyId,
    refetchInterval: LIVE_REFRESH_MS,
    staleTime: 30_000,
    queryFn: () => callProxy({ action: "ao_vivo", company_id: companyId }),
  });

  const vehicles: any[] = live.data?.vehicles ?? [];
  const selected = vehicleId !== "todos" ? vehicles.find((v) => v.vehicle_id === vehicleId) : null;

  const history = useQuery({
    queryKey: ["smartgps-history", vehicleId, date, period],
    enabled: !!selected,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    queryFn: () =>
      callProxy({
        action: "historico",
        vehicle_id: vehicleId,
        from_date: date,
        to_date: date,
        from_time: PERIOD_TIMES[period][0],
        to_time: PERIOD_TIMES[period][1],
      }),
  });

  const routes = useQuery({
    queryKey: ["live-routes", companyId, vehicleId, date, period],
    enabled: !!companyId && !!selected,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("routes")
        .select("id, client, client_trade_name, address, neighborhood, status, location_link, order_number, latitude, longitude, geocode_attempted_at")
        .eq("company_id", companyId!)
        .eq("vehicle_id", vehicleId)
        .eq("date", date)
        .eq("period", period)
        .order("order_number", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const queryClient = useQueryClient();
  // Geocodifica (em segundo plano) rotas sem coordenadas; falhas são silenciosas
  useEffect(() => {
    const dayAgo = Date.now() - 24 * 3600_000;
    const pend = (routes.data ?? [])
      .filter((r) => r.latitude == null && !coordsFromLink(r.location_link) && (r.address || r.neighborhood))
      .filter((r) => !r.geocode_attempted_at || new Date(r.geocode_attempted_at).getTime() < dayAgo)
      .map((r) => r.id);
    if (!pend.length) return;
    let cancel = false;
    supabase.functions
      .invoke("smartgps-proxy", { body: { action: "geocodificar", route_ids: pend.slice(0, 15) } })
      .then(({ data }) => {
        if (!cancel && data?.updated) queryClient.invalidateQueries({ queryKey: ["live-routes", companyId, vehicleId, date, period] });
      })
      .catch(() => {});
    return () => { cancel = true; };
  }, [routes.data, companyId, vehicleId, date, period, queryClient]);

  const markers: LiveVehicleMarker[] = useMemo(
    () =>
      vehicles
        .filter((v) => v.lat != null && v.lng != null && (vehicleId === "todos" || v.vehicle_id === vehicleId))
        .map((v) => ({
          id: v.vehicle_id,
          lat: Number(v.lat),
          lng: Number(v.lng),
          label: v.plate,
          kind: v.vehicle_type === "moto" ? "moto" : "carro",
          color: Number(v.speed) > 0 ? "#16a34a" : "#64748b",
          detail: `${Number(v.speed) || 0} km/h${v.time ? ` · ${v.time}` : ""}`,
        })),
    [vehicles, vehicleId],
  );

  const trail: [number, number][] = useMemo(
    () => (history.data?.points ?? []).map((p: any[]) => [Number(p[0]), Number(p[1])] as [number, number]),
    [history.data],
  );

  const driverGroups = useMemo(() => {
    const coords = (routes.data ?? [])
      .map((r, i) => {
        const c = coordsFromLink(r.location_link) ?? (r.latitude != null && r.longitude != null ? [r.latitude, r.longitude] as [number, number] : null);
        return c ? { id: r.id, lat: c[0], lng: c[1], client: r.client_trade_name || r.client, address: r.address ?? r.neighborhood, order: i + 1 } : null;
      })
      .filter(Boolean) as any[];
    return coords.length ? [{ driverName: selected?.plate ?? "", color: "#f97316", coordinates: coords }] : [];
  }, [routes.data, selected]);

  const statusBadge = (s: string | null) =>
    s === "ENTREGUE" ? <Badge className="bg-green-600">Entregue</Badge>
    : s === "NAO_ENTREGUE" ? <Badge variant="destructive">Não entregue</Badge>
    : <Badge variant="secondary">Pendente</Badge>;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Radio className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-bold">Rota ao vivo</h1>
        {live.dataUpdatedAt > 0 && (
          <span className="text-xs text-muted-foreground">atualizado {format(live.dataUpdatedAt, "HH:mm:ss")}</span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label>Veículo</Label>
          <Select value={vehicleId} onValueChange={setVehicleId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {vehicles.map((v) => (
                <SelectItem key={v.vehicle_id} value={v.vehicle_id}>{v.plate}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="live-date">Data</Label>
          <Input id="live-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={!selected} />
        </div>
        <div className="space-y-1">
          <Label>Período</Label>
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)} disabled={!selected}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="MANHA">MANHÃ</SelectItem>
              <SelectItem value="TARDE">TARDE</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {live.error && <p className="text-sm text-destructive">Não foi possível buscar as posições: {(live.error as Error).message}</p>}
      {history.error && <p className="text-sm text-destructive">Não foi possível buscar o trajeto: {(history.error as Error).message}</p>}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card className="h-[60vh] min-h-[400px] overflow-hidden p-0">
          <RouteMap driverGroups={driverGroups} trail={selected ? trail : undefined} vehicles={markers} connectOrigin={false} />
        </Card>

        <Card className="max-h-[60vh] overflow-y-auto p-3">
          {!selected ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold">Veículos ({vehicles.length})</p>
              {vehicles.map((v) => (
                <button key={v.vehicle_id} onClick={() => setVehicleId(v.vehicle_id)} className="flex w-full items-center justify-between rounded border p-2 text-left text-sm hover:bg-muted">
                  <span className="font-mono font-bold">{v.vehicle_type === "moto" ? "🏍️" : "🚗"} {v.plate}</span>
                  <span className="text-xs text-muted-foreground">{v.lat == null ? "sem posição" : `${Number(v.speed) || 0} km/h`}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-semibold">
                Rotas de {selected.plate} · {period === "MANHA" ? "MANHÃ" : "TARDE"} ({routes.data?.length ?? 0})
              </p>
              {history.isFetching && <p className="text-xs text-muted-foreground">Carregando trajeto…</p>}
              {routes.data?.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma rota neste período.</p>}
              {routes.data?.map((r, i) => (
                <div key={r.id} className="rounded border p-2 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold">#{i + 1} {r.client_trade_name || r.client}</span>
                    {statusBadge(r.status)}
                  </div>
                  <p className="text-xs text-muted-foreground">{[r.address, r.neighborhood].filter(Boolean).join(" · ")}</p>
                  {(coordsFromLink(r.location_link) || r.latitude != null) && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-primary"><MapPin className="h-3 w-3" /> no mapa</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
