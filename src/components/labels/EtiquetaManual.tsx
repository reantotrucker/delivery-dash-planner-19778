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
}

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
});

/** Lista de números a imprimir (ex.: 1..5 → [1,2,3,4,5]); sem numeração repete cópias. */
export function labelSequence(
  d: Pick<ManualLabelData, "total" | "inicio" | "fim" | "numerar"> & { modo?: ManualLabelData["modo"] }
): number[] {
  const total = Math.max(1, Math.floor(d.total || 1));
  if (!d.numerar || d.modo === "livre") return Array.from({ length: total }, (_, i) => i + 1);
  const ini = Math.min(Math.max(1, Math.floor(d.inicio || 1)), total);
  const fim = Math.min(Math.max(ini, Math.floor(d.fim || total)), total);
  return Array.from({ length: fim - ini + 1 }, (_, i) => ini + i);
}

const C = { bg: "#FFFFFF", ink: "#111111", gray: "#555555", line: "#111111" };

const Row = ({ label, value }: { label: string; value?: string | null }) =>
  value ? (
    <div style={{ display: "flex", gap: 4, lineHeight: 1.15 }}>
      <span style={{ fontSize: 6.5, color: C.gray, textTransform: "uppercase", minWidth: 26 }}>{label}</span>
      <span style={{ fontSize: 7.5, color: C.ink, fontWeight: 600 }}>{value}</span>
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
    const byWidth = 300 / longest;
    const byHeight = 110 / lines;
    const fontSize = Math.max(7, Math.min(40, byWidth, byHeight));
    return (
      <div
        style={{
          width: "100mm",
          height: "50mm",
          padding: "3mm",
          background: C.bg,
          color: C.ink,
          fontFamily: "Inter, Arial, Helvetica, sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          overflow: "hidden",
          boxSizing: "border-box",
          ...(print ? { pageBreakAfter: "always" as const, breakAfter: "page" as const } : {}),
        }}
      >
        <div style={{ fontSize, fontWeight: 700, lineHeight: 1.15, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
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
        fontFamily: "Inter, Arial, Helvetica, sans-serif",
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
          <div style={{ fontSize: 6.5, color: C.gray, textTransform: "uppercase", letterSpacing: 0.6 }}>Remetente</div>
          <div style={{ fontSize: 9, fontWeight: 700, lineHeight: 1.1 }}>{senderName}</div>
          <div style={{ fontSize: 6.8, color: C.gray, lineHeight: 1.2 }}>
            {[sender.address, sender.neighborhood, senderCity, sender.cep].filter(Boolean).join(" · ")}
          </div>
          <div style={{ fontSize: 6.8, color: C.gray }}>
            {[sender.cnpj ? `CNPJ ${sender.cnpj}` : null, sender.phone].filter(Boolean).join(" · ")}
          </div>
        </div>
      )}

      <div style={{ flex: 1, paddingTop: "1.5mm", display: "flex", gap: "2mm", minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 6.5, color: C.gray, textTransform: "uppercase", letterSpacing: 0.6 }}>
            Destinatário
          </div>
          <div style={{ fontSize: d.showSender ? 11 : 14, fontWeight: 700, lineHeight: 1.1, wordBreak: "break-word" }}>
            {d.destinatario || "—"}
          </div>
          <div style={{ marginTop: "1mm", display: "flex", flexDirection: "column", gap: 1 }}>
            <Row label="End." value={d.endereco} />
            <Row label="Bairro" value={d.bairro} />
            <Row label="Cidade" value={destCity} />
            <Row label="CEP" value={d.cep} />
            <Row label="Tel." value={d.telefone} />
          </div>
          {d.observacao && (
            <div
              style={{
                marginTop: "1mm",
                border: `1px solid ${C.line}`,
                padding: "0.6mm 1.2mm",
                fontSize: 7,
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
            <div style={{ fontSize: 6.5, color: C.gray, textTransform: "uppercase", letterSpacing: 0.8 }}>Volume</div>
            <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
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
            fontSize: 8,
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
