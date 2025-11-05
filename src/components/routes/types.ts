export interface Route {
  id: string;
  client: string;
  neighborhood: string;
  observation: string | null;
  status: string;
  consultant_id: string | null;
  driver_id: string | null;
  vehicle_id: string | null;
  payment_method_id: string | null;
  driver: { name: string; color: string } | null;
  vehicle: { plate: string } | null;
  consultant: { name: string } | null;
  payment_method: { name: string } | null;
  date: string;
  period: "MANHA" | "TARDE";
  order_number: number;
}
