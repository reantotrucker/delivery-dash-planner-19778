export interface Route {
  id: string;
  client: string;
  neighborhood: string;
  observation: string | null;
  address: string | null;
  cep: string | null;
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

export const generateGoogleMapsLink = (address?: string | null, cep?: string | null, neighborhood?: string): string | null => {
  const parts: string[] = [];
  
  // Prioriza endereço completo + bairro (sem CEP, pois CEP pode confundir o Google Maps)
  if (address) parts.push(address);
  if (neighborhood) parts.push(`Bairro ${neighborhood}`);
  
  // Só usa CEP se não tiver endereço
  if (parts.length === 0 && cep) {
    parts.push(cep);
    if (neighborhood) parts.push(neighborhood);
  }
  
  if (parts.length === 0) return null;
  
  const query = encodeURIComponent(parts.join(", "));
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
};
