import { useEffect } from "react";
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useCompany } from "@/hooks/useCompany";

const ORIGIN_MANAUS = {
  lat: -3.0235401,
  lng: -59.9430326,
  label: "Base / Depósito",
  address: "R. Santa Rosa I B Mendes, 168 - Cidade de Deus, Manaus - AM",
};

const ORIGIN_BOA_VISTA = {
  lat: 2.8108491,
  lng: -60.7278665,
  label: "Uniprint Distribuidora (Boa Vista)",
  address: "Av. São Sebastião, 311 - Cambará, Boa Vista - RR, 69313-438",
};

interface RouteCoordinate {
  id: string;
  lat: number;
  lng: number;
  client: string;
  address: string;
  order: number;
}

interface DriverGroup {
  driverName: string;
  color: string;
  coordinates: RouteCoordinate[];
}

export interface LiveVehicleMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  detail?: string;
  color?: string;
  kind?: "carro" | "moto";
}

interface RouteMapProps {
  driverGroups: DriverGroup[];
  /** Trajeto real (histórico) a desenhar */
  trail?: [number, number][];
  /** Veículos ao vivo */
  vehicles?: LiveVehicleMarker[];
  /** Liga a linha da base até os pontos (padrão: true) */
  connectOrigin?: boolean;
}

function createVehicleIcon(label: string, color: string, kind: "carro" | "moto" = "carro") {
  const emoji = kind === "moto" ? "🏍️" : "🚗";
  return L.divIcon({
    className: "custom-marker",
    html: `<div style="display:flex;flex-direction:column;align-items:center;transform:translateY(-6px)">
      <div style="background:${color};color:#fff;border:2px solid #fff;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 2px 6px rgba(0,0,0,.45)">${emoji}</div>
      <div style="margin-top:2px;background:#fff;color:#111;font:700 10px/1.2 sans-serif;padding:1px 4px;border-radius:4px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.35)">${label}</div>
    </div>`,
    iconSize: [30, 46],
    iconAnchor: [15, 23],
  });
}

function createNumberedIcon(number: number, color: string) {
  return L.divIcon({
    className: "custom-marker",
    html: `<div style="
      background-color: ${color};
      color: white;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 12px;
      border: 2px solid white;
      box-shadow: 0 2px 6px rgba(0,0,0,0.4);
    ">${number}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

const originIcon = L.divIcon({
  className: "custom-marker",
  html: `<div style="
    background-color: #000;
    color: white;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    border: 3px solid white;
    box-shadow: 0 2px 8px rgba(0,0,0,0.5);
  ">🏠</div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

function FitBounds({
  driverGroups,
  origin,
  extra = [],
}: {
  driverGroups: DriverGroup[];
  origin: { lat: number; lng: number };
  extra?: [number, number][];
}) {
  const map = useMap();
  const key = `${driverGroups.map((g) => g.coordinates.length).join(",")}|${extra.length}`;
  useEffect(() => {
    const allPoints: [number, number][] = [[origin.lat, origin.lng], ...extra];
    driverGroups.forEach((g) =>
      g.coordinates.forEach((c) => allPoints.push([c.lat, c.lng]))
    );
    if (allPoints.length > 1) {
      map.fitBounds(allPoints as L.LatLngBoundsExpression, { padding: [40, 40] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map, origin]);
  return null;
}

export function RouteMap({ driverGroups, trail, vehicles, connectOrigin = true }: RouteMapProps) {
  const { company } = useCompany();
  const ORIGIN = company?.slug === "uniprint_bv" ? ORIGIN_BOA_VISTA : ORIGIN_MANAUS;

  return (
    <MapContainer
      key={ORIGIN.label}
      center={[ORIGIN.lat, ORIGIN.lng]}
      zoom={12}
      style={{ height: "100%", width: "100%", minHeight: "400px" }}
      className="rounded-lg z-0"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds
        driverGroups={driverGroups}
        origin={ORIGIN}
        extra={[...(trail ?? []), ...(vehicles ?? []).map((v) => [v.lat, v.lng] as [number, number])]}
      />

      {trail && trail.length > 1 && (
        <Polyline positions={trail} pathOptions={{ color: "#2563eb", weight: 5, opacity: 0.85 }} />
      )}

      {vehicles?.map((v) => (
        <Marker key={v.id} position={[v.lat, v.lng]} icon={createVehicleIcon(v.label, v.color ?? "#16a34a", v.kind)}>
          <Popup>
            <strong>{v.label}</strong>
            {v.detail && (<><br />{v.detail}</>)}
          </Popup>
        </Marker>
      ))}

      {/* Origin marker */}
      <Marker position={[ORIGIN.lat, ORIGIN.lng]} icon={originIcon}>
        <Popup>
          <strong>{ORIGIN.label}</strong>
          <br />
          {ORIGIN.address}
        </Popup>
      </Marker>

      {driverGroups.map((group) => {
        const positions: [number, number][] = [
          ...(connectOrigin ? [[ORIGIN.lat, ORIGIN.lng] as [number, number]] : []),
          ...group.coordinates.map((c) => [c.lat, c.lng] as [number, number]),
        ];

        return (
          <div key={group.driverName}>
            {/* Polyline for the route */}
            <Polyline
              positions={positions}
              pathOptions={{
                color: group.color,
                weight: 4,
                opacity: 0.8,
                dashArray: "8 4",
              }}
            />

            {/* Numbered markers */}
            {group.coordinates.map((coord) => (
              <Marker
                key={coord.id}
                position={[coord.lat, coord.lng]}
                icon={createNumberedIcon(coord.order, group.color)}
              >
                <Popup>
                  <strong>
                    #{coord.order} - {coord.client}
                  </strong>
                  <br />
                  {coord.address}
                  <br />
                  <span style={{ color: group.color, fontWeight: "bold" }}>
                    {group.driverName}
                  </span>
                </Popup>
              </Marker>
            ))}
          </div>
        );
      })}
    </MapContainer>
  );
}
