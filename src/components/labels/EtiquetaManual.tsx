export interface ManualLabelSender {
  legal_name?: string | null;
  name?: string | null;
  cnpj?: string | null;
  address?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  cep?: string | null;
  phone?: string | null;
}

export interface ManualLabelData {
  /** "modelo" = campos prontos; "livre" = etiqueta em branco, só texto livre */
  modo: "modelo" | "livre";
  texto: string;
  showSender: boolean;
  destinatario: string;
  endereco: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  telefone: string;
  referencia: string; // NF / pedido
  observacao: string;
  numerar: boolean;
  total: number;
  inicio: number;
  fim: number;
  /** Fonte da etiqueta (chave de LABEL_FONTS) */
  fonte: string;
  /** Em branco: tamanho da letra em pt; 0 = automático */
  tamanho: number;
  /** Em branco: letra em negrito */
  negrito: boolean;
  /** Com campos: tamanho das letras em % (100 = normal) */
  escala: number;
}

export const LABEL_FONTS: { key: string; label: string; css: string }[] = [
  { key: "inter", label: "Inter (padrão)", css: "Inter, Arial, Helvetica, sans-serif" },
  { key: "arial", label: "Arial", css: "Arial, Helvetica, sans-serif" },
  { key: "condensed", label: "Roboto Condensed (estreita)", css: "'Roboto Condensed', 'Arial Narrow', Arial, sans-serif" },
  { key: "oswald", label: "Oswald (alta)", css: "Oswald, 'Arial Narrow', Arial, sans-serif" },
  { key: "montserrat", label: "Montserrat (larga)", css: "Montserrat, Arial, sans-serif" },
  { key: "mono", label: "Roboto Mono (máquina)", css: "'Roboto Mono', 'Courier New', monospace" },
  { key: "serif", label: "Merriweather (serifa)", css: "Merriweather, Georgia, 'Times New Roman', serif" },
];

export const LABEL_FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Roboto+Condensed:wght@400;600;700&family=Oswald:wght@400;600;700&family=Montserrat:wght@400;600;700;800&family=Roboto+Mono:wght@400;600;700&family=Merriweather:wght@400;700&display=swap";

export const labelFontCss = (key?: string) =>
  (LABEL_FONTS.find((f) => f.key === key) || LABEL_FONTS[0]).css;

export const emptyManualLabel = (): ManualLabelData => ({
  modo: "modelo",
  texto: "",
  showSender: true,
  destinatario: "",
  endereco: "",
  bairro: "",
  cidade: "",
  uf: "",
  cep: "",
  telefone: "",
  referencia: "",
  observacao: "",
  numerar: true,
  total: 1,
  inicio: 1,
  fim: 1,
  fonte: "inter",
  tamanho: 0,
  negrito: true,
  escala: 100,
});

/** Lista de números a imprimir (ex.: 1..5 → [1,2,3,4,5]); sem numeração repete cópias. */
export function labelSequence(
  d: Pick<ManualLabelData, "total" | "inicio" | "fim" | "numerar"> & { modo?: ManualLabelData["modo"] }
): number[] {
  const total = Math.max(1, Math.floor(d.total || 1));
  const fontFamily = labelFontCss(d.fonte);
  const k = Math.min(1.6, Math.max(0.6, (d.escala || 100) / 100));
  if (!d.numerar || d.modo === "livre") return Array.from({ length: total }, (_, i) => i + 1);
  const ini = Math.min(Math.max(1, Math.floor(d.inicio || 1)), total);
  const fim = Math.min(Math.max(ini, Math.floor(d.fim || total)), total);
  return Array.from({ length: fim - ini + 1 }, (_, i) => ini + i);
}

const C = { bg: "#FFFFFF", ink: "#111111", gray: "#555555", line: "#111111" };

const Row = ({ label, value, k = 1 }: { label: string; value?: string | null; k?: number }) =>
  value ? (
    <div style={{ display: "flex", gap: 4, lineHeight: 1.15 }}>
      <span style={{ fontSize: 6.5 * k, color: C.gray, textTransform: "uppercase", minWidth: 26 * k }}>{label}</span>
      <span style={{ fontSize: 7.5 * k, color: C.ink, fontWeight: 600 }}>{value}</span>
    </div>
  ) : null;

export const EtiquetaManual = ({
  d,
  sender,
  index,
  print = true,
}: {
  d: ManualLabelData;
  sender: ManualLabelSender | null;
  index: number;
  print?: boolean;
}) => {
  const senderName = sender?.legal_name || sender?.name || "";
  const senderCity = [sender?.city, sender?.state].filter(Boolean).join(" - ");
  const destCity = [d.cidade, d.uf].filter(Boolean).join(" - ");
  const total = Math.max(1, Math.floor(d.total || 1));

  if (d.modo === "livre") {
    const text = d.texto || "";
    const lines = Math.max(1, text.split("\n").length);
    const longest = Math.max(1, ...text.split("\n").map((l) => l.length));
    // Ajusta a fonte para caber em 94x44 mm (pt aproximado)
    const byWidth = 500 / longest;
    const byHeight = 140 / lines;
    const auto = Math.max(7, Math.min(64, byWidth, byHeight));
    const fontSize = d.tamanho && d.tamanho > 0 ? d.tamanho : auto;
    return (
      <div
        style={{
          width: "100mm",
          height: "50mm",
          padding: "3mm",
          background: C.bg,
          color: C.ink,
          fontFamily,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          overflow: "hidden",
          boxSizing: "border-box",
          ...(print ? { pageBreakAfter: "always" as const, breakAfter: "page" as const } : {}),
        }}
      >
        <div style={{ fontSize, fontWeight: d.negrito === false ? 400 : 700, lineHeight: 1.15, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {text}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100mm",
        height: "50mm",
        padding: "3mm",
        background: C.bg,
        color: C.ink,
        fontFamily,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        overflow: "hidden",
        boxSizing: "border-box",
        ...(print ? { pageBreakAfter: "always" as const, breakAfter: "page" as const } : {}),
      }}
    >
      {d.showSender && sender && (
        <div style={{ borderBottom: `1px solid ${C.line}`, paddingBottom: "1.5mm" }}>
          <div style={{ fontSize: 6.5 * k, color: C.gray, textTransform: "uppercase", letterSpacing: 0.6 }}>Remetente</div>
          <div style={{ fontSize: 9 * k, fontWeight: 700, lineHeight: 1.1 }}>{senderName}</div>
          <div style={{ fontSize: 6.8 * k, color: C.gray, lineHeight: 1.2 }}>
            {[sender.address, sender.neighborhood, senderCity, sender.cep].filter(Boolean).join(" · ")}
          </div>
          <div style={{ fontSize: 6.8 * k, color: C.gray }}>
            {[sender.cnpj ? `CNPJ ${sender.cnpj}` : null, sender.phone].filter(Boolean).join(" · ")}
          </div>
        </div>
      )}

      <div style={{ flex: 1, paddingTop: "1.5mm", display: "flex", gap: "2mm", minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 6.5 * k, color: C.gray, textTransform: "uppercase", letterSpacing: 0.6 }}>
            Destinatário
          </div>
          <div style={{ fontSize: (d.showSender ? 11 : 14) * k, fontWeight: 700, lineHeight: 1.1, wordBreak: "break-word" }}>
            {d.destinatario || "—"}
          </div>
          <div style={{ marginTop: "1mm", display: "flex", flexDirection: "column", gap: 1 }}>
            <Row k={k} label="End." value={d.endereco} />
            <Row k={k} label="Bairro" value={d.bairro} />
            <Row k={k} label="Cidade" value={destCity} />
            <Row k={k} label="CEP" value={d.cep} />
            <Row k={k} label="Tel." value={d.telefone} />
          </div>
          {d.observacao && (
            <div
              style={{
                marginTop: "1mm",
                border: `1px solid ${C.line}`,
                padding: "0.6mm 1.2mm",
                fontSize: 7 * k,
                lineHeight: 1.15,
                fontWeight: 600,
                maxHeight: "9mm",
                overflow: "hidden",
                whiteSpace: "pre-wrap",
              }}
            >
              {d.observacao}
            </div>
          )}
        </div>

        {d.numerar && (
          <div
            style={{
              width: "26mm",
              border: `1.5px solid ${C.line}`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <div style={{ fontSize: 6.5 * k, color: C.gray, textTransform: "uppercase", letterSpacing: 0.8 }}>Volume</div>
            <div style={{ fontSize: 20 * k, fontWeight: 700, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
              {index}/{total}
            </div>
          </div>
        )}
      </div>

      {d.referencia && (
        <div
          style={{
            borderTop: `1px solid ${C.line}`,
            paddingTop: "1mm",
            fontSize: 8 * k,
            fontWeight: 700,
          }}
        >
          {d.referencia}
        </div>
      )}
    </div>
  );
};

export const EtiquetaManualPrint = ({ d, sender }: { d: ManualLabelData; sender: ManualLabelSender | null }) => (
  <>
    {labelSequence(d).map((n, i) => (
      <EtiquetaManual key={i} d={d} sender={sender} index={n} />
    ))}
  </>
);

export default EtiquetaManualPrint;
