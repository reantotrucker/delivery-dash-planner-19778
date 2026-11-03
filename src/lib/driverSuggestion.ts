import { normalizeBairro } from "@/lib/manausZones";

export type Turno = "MANHA" | "TARDE";

export interface DriverDayStats {
  id: string;
  name: string;
  color: string;
  turnos: Array<{
    key: Turno;
    total: number;
    bairros: Array<{ name: string; zona: string | null; count: number }>;
  }>;
}

export interface DriverSuggestion {
  id: string;
  name: string;
  color: string;
  sameBairro: number;
  sameZona: number;
  turnoTotal: number;
  score: number;
  match: boolean; // false = só sugestão por ter menos rotas
}

/**
 * Sugere motoristas para uma nova rota com base nas rotas já criadas hoje
 * no mesmo turno: mesmo bairro pesa 3, mesma zona pesa 1; empate vai para quem tem menos rotas no turno.
 * Se ninguém estiver indo para o bairro/zona, sugere quem tem menos rotas no turno.
 */
export function suggestDrivers(
  stats: DriverDayStats[],
  bairro: string | null | undefined,
  zona: string | null,
  turno: Turno,
  limit = 3,
): DriverSuggestion[] {
  const target = normalizeBairro(bairro);
  const all = stats.map((d) => {
    const t = d.turnos.find((x) => x.key === turno);
    let sameBairro = 0;
    let sameZona = 0;
    for (const b of t?.bairros || []) {
      if (target && normalizeBairro(b.name) === target) sameBairro += b.count;
      else if (zona && b.zona === zona) sameZona += b.count;
    }
    const turnoTotal = t?.total || 0;
    const score = sameBairro * 3 + sameZona;
    return { id: d.id, name: d.name, color: d.color, sameBairro, sameZona, turnoTotal, score, match: score > 0 };
  });

  const matches = all
    .filter((d) => d.match)
    .sort((a, b) => b.score - a.score || a.turnoTotal - b.turnoTotal || a.name.localeCompare(b.name));
  if (matches.length > 0) return matches.slice(0, limit);

  return all
    .sort((a, b) => a.turnoTotal - b.turnoTotal || a.name.localeCompare(b.name))
    .slice(0, Math.min(2, limit));
}
