export interface EtiquetaSender {
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

export interface EtiquetaData {
  sender: EtiquetaSender;
  clientName: string;
  address?: string | null;
  neighborhood?: string | null;
  city: string;
  state: string;
  cep?: string | null;
  nfeNumber?: string | null;
  date?: string | null;
  driver?: string | null;
  plate?: string | null;
  volumes: number;
}

const C = {
  bg: "#FFFFFF",
  ink: "#111111",
  gray: "#555555",
  line: "#111111",
};

const Row = ({ label, value }: { label: string; value?: string | null }) =>
  value ? (
    <div style={{ display: "flex", gap: 4, lineHeight: 1.15 }}>
      <span style={{ fontSize: 6.5, color: C.gray, textTransform: "uppercase", minWidth: 26 }}>{label}</span>
      <span style={{ fontSize: 7.5, color: C.ink, fontWeight: 600 }}>{value}</span>
    </div>
  ) : null;

const Etiqueta = ({ d, index }: { d: EtiquetaData; index: number }) => {
  const senderName = d.sender.legal_name || d.sender.name || "";
  const senderCity = [d.sender.city, d.sender.state].filter(Boolean).join(" - ");
  const destCity = [d.city, d.state].filter(Boolean).join(" - ");
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
        pageBreakAfter: "always",
        breakAfter: "page",
        overflow: "hidden",
      }}
    >
      {/* Remetente */}
      <div style={{ borderBottom: `1px solid ${C.line}`, paddingBottom: "1.5mm" }}>
        <div style={{ fontSize: 6.5, color: C.gray, textTransform: "uppercase", letterSpacing: 0.6 }}>Remetente</div>
        <div style={{ fontSize: 9, fontWeight: 700, lineHeight: 1.1 }}>{senderName}</div>
        <div style={{ fontSize: 6.8, color: C.gray, lineHeight: 1.2 }}>
          {[d.sender.address, d.sender.neighborhood, senderCity, d.sender.cep].filter(Boolean).join(" · ")}
        </div>
        <div style={{ fontSize: 6.8, color: C.gray }}>
          {[d.sender.cnpj ? `CNPJ ${d.sender.cnpj}` : null, d.sender.phone].filter(Boolean).join(" · ")}
        </div>
      </div>

      {/* Destinatário */}
      <div style={{ flex: 1, paddingTop: "1.5mm", display: "flex", gap: "2mm" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 6.5, color: C.gray, textTransform: "uppercase", letterSpacing: 0.6 }}>
            Destinatário
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, lineHeight: 1.1 }}>{d.clientName}</div>
          <div style={{ marginTop: "1mm", display: "flex", flexDirection: "column", gap: 1 }}>
            <Row label="End." value={d.address} />
            <Row label="Bairro" value={d.neighborhood} />
            <Row label="Cidade" value={destCity} />
            <Row label="CEP" value={d.cep} />
          </div>
        </div>

        {/* Volume */}
        <div
          style={{
            width: "26mm",
            border: `1.5px solid ${C.line}`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ fontSize: 6.5, color: C.gray, textTransform: "uppercase", letterSpacing: 0.8 }}>Volume</div>
          <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
            {index}/{d.volumes}
          </div>
        </div>
      </div>

      {/* Rodapé */}
      <div
        style={{
          borderTop: `1px solid ${C.line}`,
          paddingTop: "1mm",
          display: "flex",
          justifyContent: "space-between",
          fontSize: 7,
          color: C.gray,
        }}
      >
        <span style={{ color: C.ink, fontWeight: 700 }}>{d.nfeNumber ? `NF ${d.nfeNumber}` : "NF —"}</span>
        <span>{[d.driver, d.plate].filter(Boolean).join(" · ")}</span>
        <span>{d.date || ""}</span>
      </div>
    </div>
  );
};

export const EtiquetaVolumesPrint = ({ data }: { data: EtiquetaData }) => (
  <>
    {Array.from({ length: Math.max(1, data.volumes) }, (_, i) => (
      <Etiqueta key={i} d={data} index={i + 1} />
    ))}
  </>
);

export default EtiquetaVolumesPrint;
