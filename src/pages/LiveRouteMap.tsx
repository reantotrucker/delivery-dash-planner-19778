import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { manausToday } from "@/lib/manausTime";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Radio } from "lucide-react";

const CITIES: Record<string, { label: string; suffix: string; center: [number, number] }> = {
  uniprint_bv: {
    label: "Boa Vista",
    suffix: "Boa Vista, RR, Brasil",
    center: [2.8235, -60.6758],
  },
  default: {
    label: "Manaus",
    suffix: "Manaus, AM, Brasil",
    center: [-3.0889, -59.9856],
  },
};

interface RouteRow {
  id: string;
  client: string;
  address: string | null;
  neighborhood: string | null;
  status: string | null;
  period: string;
  urgent: boolean | null;
  order_number: number | null;
  location_link: string | null;
  driver: { name: string; color: string } | null;
}

interface Point extends RouteRow {
  lat: number;
  lng: number;
  seq: number;
}

const coordsFromLink = (link?: string | null): [number, number] | null => {
  if (!link) return null;
  const m = link.match(/(-?\d{1,3}\.\d{3,})[,\s/]+(-?\d{1,3}\.\d{3,})/);
  if (!m) return null;
  return [parseFloat(m[1]), parseFloat(m[2])];
};

const cacheGet = (key: string): [number, number] | null => {
  try {
    const raw = localStorage.getItem(`geo:${key}`);
    return raw ? (JSON.parse(raw) as [number, number]) : null;
  } catch {
    return null;
  }
};

const cacheSet = (key: string, v: [number, number]) => {
  try {
    localStorage.setItem(`geo:${key}`, JSON.stringify(v));
  } catch {
    /* ignore */
  }
};

async function geocode(query: string): Promise<[number, number] | null> {
  const cached = cacheGet(query);
  if (cached) return cached;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`
    );
    const json = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!json?.length) return null;
    const out: [number, number] = [parseFloat(json[0].lat), parseFloat(json[0].lon)];
    cacheSet(query, out);
    return out;
  } catch {
    return null;
  }
}

const statusColor = (s: string | null) =>
  s === "ENTREGUE" ? "#10b981" : s === "NAO_ENTREGUE" ? "#ef4444" : "#f59e0b";

function pinIcon(seq: number, status: string | null, driverColor: string) {
  const fill = statusColor(status);
  return L.divIcon({
    className: "live-marker",
    html: `<div style="
      background:${fill};
      color:#fff;width:30px;height:30px;border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      font-weight:700;font-size:12px;
      border:3px solid ${driverColor};
      box-shadow:0 2px 6px rgba(0,0,0,.45);
    ">${seq}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

const baseIcon = L.divIcon({
  className: "live-marker",
  html: `<div style="background:#111;color:#fff;width:34px;height:34px;border-radius:50%;
    display:flex;align-items:center;justify-content:center;font-size:16px;
    border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.5);">🏠</div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

function FitBounds({ points, center }: { points: Point[]; center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    const all: [number, number][] = [center, ...points.map((p) => [p.lat, p.lng] as [number, number])];
    if (all.length > 1) {
      try {
        map.fitBounds(all as L.LatLngBoundsExpression, { padding: [40, 40] });
      } catch {
        /* mapa desmontado */
      }
    }
  }, [points, center, map]);
  return null;
}

export default function LiveRouteMap() {
  const { companyId, company } = useCompany();
  const city = CITIES[company?.slug || "default"] || CITIES.default;
  const [date, setDate] = useState(manausToday());
  const [driverFilter, setDriverFilter] = useState<string>("all");
  const [periodFilter, setPeriodFilter] = useState<string>("all");
  const [points, setPoints] = useState<Point[]>([]);
  const [resolving, setResolving] = useState(false);
  const runId = useRef(0);

  const { data: routes = [], isLoading } = useQuery({
    queryKey: ["live-map-routes", companyId, date],
    enabled: !!companyId,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("routes")
        .select(
          "id, client, address, neighborhood, status, period, urgent, order_number, location_link, driver:drivers(name, color)"
        )
        .eq("company_id", companyId)
        .eq("date", date)
        .order("order_number", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as RouteRow[];
    },
  });

  const drivers = useMemo(() => {
    const map = new Map<string, string>();
    routes.forEach((r) => r.driver && map.set(r.driver.name, r.driver.color));
    return [...map.entries()];
  }, [routes]);

  const visible = useMemo(
    () =>
      routes.filter((r) => {
        const okDriver =
          driverFilter === "all" || (r.driver?.name || "Sem motorista") === driverFilter;
        const p = (r.period || "").toUpperCase();
        const okPeriod =
          periodFilter === "all" ||
          (periodFilter === "MANHA" ? p.startsWith("MANH") : p.startsWith("TARDE"));
        return okDriver && okPeriod;
      }),
    [routes, driverFilter, periodFilter]
  );

  // Resolve coordenadas: link exato primeiro, depois busca pelo endereço
  useEffect(() => {
    const id = ++runId.current;
    let cancelled = false;
    const run = async () => {
      setResolving(true);
      const resolved: Point[] = [];
      const seqByDriver = new Map<string, number>();
      for (const r of visible) {
        let coord = coordsFromLink(r.location_link);
        if (!coord) {
          const q = [r.address, r.neighborhood, city.suffix].filter(Boolean).join(", ");
          if (r.address) {
            coord = await geocode(q);
            if (!cacheGet(q)) await new Promise((res) => setTimeout(res, 1100));
          }
        }
        if (cancelled || id !== runId.current) return;
        if (coord) {
          const key = r.driver?.name || "Sem motorista";
          const next = (seqByDriver.get(key) ?? 0) + 1;
          seqByDriver.set(key, next);
          resolved.push({ ...r, lat: coord[0], lng: coord[1], seq: next });
          setPoints([...resolved]);
        }
      }
      if (!cancelled && id === runId.current) {
        setPoints(resolved);
        setResolving(false);
      }
    };
    setPoints([]);
    if (visible.length) run();
    else setResolving(false);
    return () => {
      cancelled = true;
    };
  }, [visible, city.suffix]);

  const groups = useMemo(() => {
    const map = new Map<string, { name: string; color: string; pts: Point[] }>();
    points.forEach((p) => {
      const name = p.driver?.name || "Sem motorista";
      const g = map.get(name) || { name, color: p.driver?.color || "#94a3b8", pts: [] };
      g.pts.push(p);
      map.set(name, g);
    });
    return [...map.values()];
  }, [points]);

  const done = visible.filter((r) => r.status === "ENTREGUE").length;
  const failed = visible.filter((r) => r.status === "NAO_ENTREGUE").length;
  const pending = visible.length - done - failed;

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-6xl mx-auto">
      <header className="space-y-1">
        <h1 className="text-xl lg:text-2xl font-bold flex items-center gap-2">
          <Radio className="w-6 h-6 text-primary" />
          Rota ao vivo
        </h1>
        <p className="text-sm text-muted-foreground">
          Sequência da rota e o que já foi entregue — {city.label}
          {company?.name ? ` · ${company.name}` : ""}
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3 bg-card border border-border rounded-xl p-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Dia</label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-9 w-[150px]"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Motorista</label>
          <select
            value={driverFilter}
            onChange={(e) => setDriverFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">Todos</option>
            {drivers.map(([name]) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            <option value="Sem motorista">Sem motorista</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Período</label>
          <select
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">Todos</option>
            <option value="MANHA">Manhã</option>
            <option value="TARDE">Tarde</option>
          </select>
        </div>
        <div className="flex flex-wrap gap-2 ml-auto">
          <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">{done} entregues</Badge>
          <Badge className="bg-amber-500 text-white hover:bg-amber-500">{pending} a entregar</Badge>
          {failed > 0 && <Badge variant="destructive">{failed} não entregues</Badge>}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="h-[520px] w-full">
          <MapContainer
            key={city.label}
            center={city.center}
            zoom={12}
            style={{ height: "100%", width: "100%" }}
            className="z-0"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitBounds points={points} center={city.center} />
            <Marker position={city.center} icon={baseIcon}>
              <Popup>Base / Loja</Popup>
            </Marker>
            {groups.map((g) => (
              <Polyline
                key={g.name}
                positions={[city.center, ...g.pts.map((p) => [p.lat, p.lng] as [number, number])]}
                pathOptions={{ color: g.color, weight: 4, opacity: 0.75, dashArray: "8 5" }}
              />
            ))}
            {points.map((p) => (
              <Marker
                key={p.id}
                position={[p.lat, p.lng]}
                icon={pinIcon(p.seq, p.status, p.driver?.color || "#ffffff")}
              >
                <Popup>
                  <strong>
                    #{p.seq} — {p.client}
                  </strong>
                  <br />
                  {p.address || "Sem endereço"}
                  <br />
                  {p.driver?.name || "Sem motorista"} ·{" "}
                  {p.status === "ENTREGUE"
                    ? "Entregue"
                    : p.status === "NAO_ENTREGUE"
                      ? "Não entregue"
                      : "A entregar"}
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {isLoading
          ? "Carregando entregas…"
          : resolving
            ? `Localizando endereços no mapa… (${points.length}/${visible.length})`
            : `${points.length} de ${visible.length} entrega(s) posicionadas no mapa.`}{" "}
        Verde = entregue, amarelo = a entregar, vermelho = não entregue; a borda mostra a cor do
        motorista.
      </p>

      {groups.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {groups.map((g) => (
            <span
              key={g.name}
              className="text-xs px-2 py-1 rounded-full border border-border flex items-center gap-1.5"
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: g.color }} />
              {g.name}
              <span className="text-muted-foreground tabular-nums">{g.pts.length}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
