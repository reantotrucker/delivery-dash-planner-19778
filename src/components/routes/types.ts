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
  urgent?: boolean;
  location_link?: string | null;
}

export const generateGoogleMapsLink = (address?: string | null, cep?: string | null, neighborhood?: string): string | null => {
  const query = buildAddressQuery(address, cep, neighborhood);
  if (!query) return null;
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
};

export const generateWazeLink = (address?: string | null, cep?: string | null, neighborhood?: string): string | null => {
  const query = buildAddressQuery(address, cep, neighborhood);
  if (!query) return null;
  return `https://waze.com/ul?q=${query}&navigate=yes`;
};

const buildAddressQuery = (address?: string | null, cep?: string | null, neighborhood?: string): string | null => {
  // Formato otimizado: "Endereço - Bairro, Manaus - AM, CEP"
  // Este formato é mais reconhecido pelo Google Maps e Waze
  
  const parts: string[] = [];
  
  // Endereço completo é a prioridade principal
  if (address && address.trim()) {
    // Remove espaços extras e formata
    const cleanAddress = address.trim().replace(/\s+/g, ' ');
    parts.push(cleanAddress);
  }
  
  // Adiciona bairro se disponível
  if (neighborhood && neighborhood.trim()) {
    parts.push(neighborhood.trim());
  }
  
  // Sempre adiciona cidade e estado para contexto
  parts.push("Manaus");
  parts.push("AM");
  
  // Adiciona CEP no final para precisão extra (formato brasileiro)
  if (cep && cep.trim()) {
    // Remove caracteres não numéricos do CEP
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length === 8) {
      parts.push(cleanCep);
    }
  }
  
  // Se não tem nem endereço nem bairro, não gera link
  if (!address?.trim() && !neighborhood?.trim()) {
    return null;
  }
  
  // Junta com vírgula e espaço, formato padrão para geocoding
  return encodeURIComponent(parts.join(", "));
};
