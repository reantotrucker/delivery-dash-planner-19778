import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip as LTooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPinned } from "lucide-react";

// Coordenadas aproximadas dos bairros de Manaus (AM)
const BAIRROS: Record<string, [number, number]> = {
  "adrianopolis": [-3.1027, -60.0089],
  "aleixo": [-3.0946, -59.9846],
  "alvorada": [-3.0693, -60.0399],
  "armando mendes": [-3.0698, -59.9309],
  "betania": [-3.1352, -60.0072],
  "cachoeirinha": [-3.1268, -60.0122],
  "centro": [-3.1319, -60.0233],
  "chapada": [-3.0885, -60.0165],
  "cidade de deus": [-3.0186, -59.9752],
  "cidade nova": [-3.0334, -59.9856],
  "colonia antonio aleixo": [-3.0868, -59.8886],
  "colonia oliveira machado": [-3.1373, -59.9968],
  "colonia santo antonio": [-3.0304, -60.0246],
  "colonia terra nova": [-3.0175, -60.0161],
  "compensa": [-3.1104, -60.0499],
  "coroado": [-3.0873, -59.9714],
  "crespo": [-3.1281, -59.9834],
  "da paz": [-3.0568, -60.0313],
  "distrito industrial": [-3.1416, -59.9705],
  "dom pedro": [-3.0865, -60.0341],
  "educandos": [-3.1436, -60.0125],
  "flores": [-3.0665, -60.0027],
  "gloria": [-3.1148, -60.0349],
  "japiim": [-3.1085, -59.9931],
  "jorge teixeira": [-3.0227, -59.9297],
  "lago azul": [-2.9942, -60.0322],
  "lirio do vale": [-3.0824, -60.0447],
  "mauazinho": [-3.1289, -59.9407],
  "monte das oliveiras": [-3.0223, -60.0281],
  "morro da liberdade": [-3.1401, -60.0041],
  "nossa senhora aparecida": [-3.1263, -60.0284],
  "nossa senhora das gracas": [-3.1113, -60.0184],
  "novo aleixo": [-3.0295, -59.9564],
  "novo israel": [-3.0219, -60.0006],
  "parque 10 de novembro": [-3.0876, -60.0059],
  "petropolis": [-3.1214, -59.9915],
  "planalto": [-3.0682, -60.0511],
  "praca 14 de janeiro": [-3.1268, -60.0075],
  "presidente vargas": [-3.1349, -60.0169],
  "puraquequara": [-3.0407, -59.8578],
  "raiz": [-3.1211, -60.0011],
  "redencao": [-3.0761, -60.0295],
  "santa etelvina": [-2.9987, -59.9541],
  "santa luzia": [-3.1401, -60.0088],
  "santo agostinho": [-3.1015, -60.0533],
  "santo antonio": [-3.1123, -60.0399],
  "sao francisco": [-3.1093, -60.0043],
  "sao geraldo": [-3.1092, -60.0134],
  "sao jorge": [-3.1046, -60.0432],
  "sao jose operario": [-3.0533, -59.9524],
  "sao lazaro": [-3.1355, -59.9926],
  "sao raimundo": [-3.1225, -60.0345],
  "tancredo neves": [-3.0587, -59.9629],
  "taruma": [-3.0714, -60.0679],
  "tarumazinho": [-3.0511, -60.0672],
  "vila buriti": [-3.1315, -59.9603],
  "vila da prata": [-3.1194, -60.0453],
  "zumbi dos palmares": [-3.0764, -59.9509],
  "ponta negra": [-3.0836, -60.0932],
  "dom pedro i": [-3.0865, -60.0341],
  "nova cidade": [-3.0111, -59.9689],
  "gilberto mestrinho": [-3.0392, -59.9269],
  "manoa": [-3.0068, -59.9612],
};

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(bairro|br|conj\.?|conjunto|res\.?|residencial)\b/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const findCoord = (name: string): [number, number] | null => {
  const n = norm(name);
  if (!n) return null;
  if (BAIRROS[n]) return BAIRROS[n];
  const keys = Object.keys(BAIRROS);
  const hit = keys.find((k) => n.includes(k) || k.includes(n));
  return hit ? BAIRROS[hit] : null;
};

const heatColor = (t: number) => {
  // t entre 0 e 1 -> azul -> verde -> amarelo -> vermelho
  if (t < 0.25) return "#2563eb";
  if (t < 0.5) return "#16a34a";
  if (t < 0.75) return "#f59e0b";
  return "#dc2626";
};

const formatBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

function FitPoints({ points, resizeKey }: { points: [number, number][]; resizeKey?: unknown }) {
  const map = useMap();
  useEffect(() => {
    setTimeout(() => {
      map.invalidateSize();
      if (points.length) {
        map.fitBounds(points as L.LatLngBoundsExpression, { padding: [60, 60], maxZoom: 12 });
      }
    }, 250);
  }, [points, map, resizeKey]);
  return null;
}

interface Item {
  name: string;
  total: number;
  valor: number;
}

export default function NeighborhoodHeatMap({ data }: { data: Item[] }) {
  const [metric, setMetric] = useState<"total" | "valor">("total");
  const [expanded, setExpanded] = useState(false);
  const [labels, setLabels] = useState(true);


  const { points, unmapped, max } = useMemo(() => {
    const points: (Item & { lat: number; lng: number })[] = [];
    const unmapped: Item[] = [];
    data.forEach((d) => {
      if (!d.name || d.name === "—") return;
      const c = findCoord(d.name);
      if (c) points.push({ ...d, lat: c[0], lng: c[1] });
      else unmapped.push(d);
    });
    const max = Math.max(1, ...points.map((p) => (metric === "total" ? p.total : p.valor)));
    return { points, unmapped, max };
  }, [data, metric]);

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <MapPinned className="w-4 h-4 text-primary" /> Mapa de calor de vendas por bairro
        </h3>
        <div className="flex gap-1">
          {(["total", "valor"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                metric === m
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:bg-muted"
              }`}
            >
              {m === "total" ? "Pedidos" : "Valor"}
            </button>
          ))}
        </div>
      </div>

      <div className="h-[360px] rounded-lg overflow-hidden border border-border">
        <MapContainer
          center={[-3.1019, -60.0251]}
          zoom={11}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom
        >
          <TileLayer
            attribution="&copy; OpenStreetMap"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitPoints points={points.map((p) => [p.lat, p.lng] as [number, number])} />
          {points.map((p) => {
            const v = metric === "total" ? p.total : p.valor;
            const t = v / max;
            const color = heatColor(t);
            return (
              <CircleMarker
                key={p.name}
                center={[p.lat, p.lng]}
                radius={10 + t * 26}
                pathOptions={{ color, fillColor: color, fillOpacity: 0.45, weight: 2 }}
              >
                <LTooltip direction="top">
                  <div className="text-xs">
                    <strong>{p.name}</strong>
                    <br />
                    {p.total} pedido(s)
                    <br />
                    {formatBRL(p.valor)}
                  </div>
                </LTooltip>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>

      <div className="flex items-center gap-3 mt-3 flex-wrap text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full" style={{ background: "#2563eb" }} /> Baixo
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full" style={{ background: "#16a34a" }} /> Médio
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full" style={{ background: "#f59e0b" }} /> Alto
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full" style={{ background: "#dc2626" }} /> Muito alto
        </span>
        <span>· {points.length} bairro(s) no mapa</span>
      </div>

      {unmapped.length > 0 && (
        <p className="text-[11px] text-muted-foreground mt-2">
          Sem coordenada: {unmapped.slice(0, 6).map((u) => u.name).join(", ")}
          {unmapped.length > 6 ? ` +${unmapped.length - 6}` : ""}
        </p>
      )}
    </div>
  );
}
