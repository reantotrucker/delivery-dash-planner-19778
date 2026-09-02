// Formata datas sempre no horário de Manaus (UTC-4), independente do fuso do dispositivo.
const TZ = "America/Manaus";

const pad = (n: number) => String(n).padStart(2, "0");

function parts(value: string | Date) {
  const d = typeof value === "string" ? new Date(value) : value;
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) out[p.type] = p.value;
  return out;
}

/** dd/MM/yyyy HH:mm no horário de Manaus */
export const manausDateTime = (value: string | Date) => {
  const p = parts(value);
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
};

/** dd/MM HH:mm no horário de Manaus */
export const manausShort = (value: string | Date) => {
  const p = parts(value);
  return `${p.day}/${p.month} ${p.hour}:${p.minute}`;
};

/** HH:mm no horário de Manaus */
export const manausTime = (value: string | Date) => {
  const p = parts(value);
  return `${p.hour}:${p.minute}`;
};

/** HH:mm:ss no horário de Manaus */
export const manausTimeSec = (value: string | Date) => {
  const p = parts(value);
  return `${p.hour}:${p.minute}:${p.second}`;
};

/** yyyy-MM-dd de uma data no fuso de Manaus */
export const manausDateISO = (value: string | Date) => {
  const p = parts(value);
  return `${p.year}-${p.month}-${p.day}`;
};

/** yyyy-MM-dd do dia atual em Manaus */
export const manausToday = () => manausDateISO(new Date());


export { pad };
