import { Lightbulb, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { suggestDrivers, type DriverDayStats, type Turno } from "@/lib/driverSuggestion";

interface Props {
  stats: DriverDayStats[];
  bairro?: string | null;
  zona: string | null;
  turno: Turno;
  selectedId?: string;
  onPick: (driverId: string) => void;
}

export function DriverSuggestionBox({ stats, bairro, zona, turno, selectedId, onPick }: Props) {
  if (stats.length === 0) return null;
  const list = suggestDrivers(stats, bairro, zona, turno);
  if (list.length === 0) return null;
  const turnoLabel = turno === "MANHA" ? "de manhã" : "à tarde";
  const hasMatch = list[0].match;
  const local = [bairro?.trim(), zona ? (zona === "Rural" ? "Zona Rural" : `Zona ${zona}`) : null].filter(Boolean).join(" · ");

  return (
    <div className="rounded-md border border-primary/40 bg-primary/5 p-2.5 space-y-1.5">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <Lightbulb className="w-3.5 h-3.5 text-primary" />
        {hasMatch ? `Sugestão para ${local || "esta entrega"}` : `Ninguém vai para ${local || "esse bairro"} ${turnoLabel} ainda`}
      </p>
      {!hasMatch && <p className="text-[11px] text-muted-foreground">Motoristas com menos rotas {turnoLabel}:</p>}
      <div className="flex flex-col gap-1">
        {list.map((d) => {
          const parts: string[] = [];
          if (d.sameBairro) parts.push(`${d.sameBairro} no mesmo bairro`);
          if (d.sameZona) parts.push(`${d.sameZona} na mesma zona`);
          parts.push(`${d.turnoTotal} ${d.turnoTotal === 1 ? "rota" : "rotas"} ${turnoLabel}`);
          const active = selectedId === d.id;
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => onPick(d.id)}
              className={cn(
                "flex items-center gap-2 rounded border bg-background px-2 py-1.5 text-left text-xs transition-colors hover:border-primary",
                active ? "border-primary ring-1 ring-primary" : "border-border",
              )}
              style={{ borderLeft: `4px solid ${d.color}` }}
            >
              <span className="font-semibold">{d.name}</span>
              <span className="text-muted-foreground truncate">{parts.join(" · ")}</span>
              {active ? <Check className="ml-auto w-3.5 h-3.5 text-primary shrink-0" /> : <span className="ml-auto text-[10px] font-semibold text-primary shrink-0">Usar</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
