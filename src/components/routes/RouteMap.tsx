import { useEffect } from "react";
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const ORIGIN = { lat: -3.0889, lng: -59.9856 };

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

interface RouteMapProps {
  driverGroups: DriverGroup[];
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

function FitBounds({ driverGroups }: { driverGroups: DriverGroup[] }) {
  const map = useMap();
  useEffect(() => {
    const allPoints: [number, number][] = [[ORIGIN.lat, ORIGIN.lng]];
    driverGroups.forEach((g) =>
      g.coordinates.forEach((c) => allPoints.push([c.lat, c.lng]))
    );
    if (allPoints.length > 1) {
      map.fitBounds(allPoints as L.LatLngBoundsExpression, { padding: [40, 40] });
    }
  }, [driverGroups, map]);
  return null;
}

export function RouteMap({ driverGroups }: RouteMapProps) {
  return (
    <MapContainer
      center={[ORIGIN.lat, ORIGIN.lng]}
      zoom={12}
      style={{ height: "100%", width: "100%", minHeight: "400px" }}
      className="rounded-lg z-0"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds driverGroups={driverGroups} />

      {/* Origin marker */}
      <Marker position={[ORIGIN.lat, ORIGIN.lng]} icon={originIcon}>
        <Popup>
          <strong>Base / Depósito</strong>
          <br />
          R. Santa Rosa I B Mendes, 168 - Cidade de Deus
        </Popup>
      </Marker>

      {driverGroups.map((group) => {
        const positions: [number, number][] = [
          [ORIGIN.lat, ORIGIN.lng],
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
