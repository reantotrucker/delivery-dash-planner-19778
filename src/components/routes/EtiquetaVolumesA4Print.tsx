import type { EtiquetaData } from "./EtiquetaVolumesPrint";

const C = {
  bg: "#FFFFFF",
  ink: "#111111",
  gray: "#555555",
  line: "#111111",
};

const Field = ({ label, value, size = 20 }: { label: string; value?: string | null; size?: number }) =>
  value ? (
    <div style={{ display: "flex", alignItems: "baseline", gap: "4mm" }}>
      <span style={{ fontSize: 11, color: C.gray, textTransform: "uppercase", letterSpacing: 1, minWidth: "28mm" }}>
        {label}
      </span>
      <span style={{ fontSize: size, color: C.ink, fontWeight: 700, lineHeight: 1.15 }}>{value}</span>
    </div>
  ) : null;

const EtiquetaA4 = ({ d, index }: { d: EtiquetaData; index: number }) => {
  const senderName = d.sender.legal_name || d.sender.name || "";
  const senderCity = [d.sender.city, d.sender.state].filter(Boolean).join(" - ");
  const destCity = [d.city, d.state].filter(Boolean).join(" - ");
  return (
    <div
      style={{
        width: "297mm",
        height: "210mm",
        padding: "8mm",
        background: C.bg,
        color: C.ink,
        fontFamily: "Inter, Arial, Helvetica, sans-serif",
        display: "flex",
        flexDirection: "column",
        pageBreakAfter: "always",
        breakAfter: "page",
        overflow: "hidden",
      }}
    >
      {/* Remetente */}
      <div style={{ border: `2px solid ${C.line}`, padding: "4mm" }}>
        <div style={{ fontSize: 12, color: C.gray, textTransform: "uppercase", letterSpacing: 2 }}>Remetente</div>
        <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.1 }}>{senderName}</div>
        <div style={{ fontSize: 13, color: C.gray, marginTop: "1mm" }}>
          {[d.sender.address, d.sender.neighborhood, senderCity, d.sender.cep].filter(Boolean).join(" · ")}
        </div>
        <div style={{ fontSize: 13, color: C.gray }}>
          {[d.sender.cnpj ? `CNPJ ${d.sender.cnpj}` : null, d.sender.phone].filter(Boolean).join(" · ")}
        </div>
      </div>

      {/* Destinatário + volume */}
      <div style={{ flex: 1, display: "flex", gap: "6mm", marginTop: "5mm", minHeight: 0 }}>
        <div
          style={{
            flex: 1,
            border: `2px solid ${C.line}`,
            padding: "5mm",
            display: "flex",
            flexDirection: "column",
            gap: "3mm",
            minWidth: 0,
          }}
        >
          <div style={{ fontSize: 12, color: C.gray, textTransform: "uppercase", letterSpacing: 2 }}>Destinatário</div>
          <div style={{ fontSize: 34, fontWeight: 700, lineHeight: 1.05 }}>{d.clientName}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "2.5mm", marginTop: "2mm" }}>
            <Field label="Endereço" value={d.address} />
            <Field label="Bairro" value={d.neighborhood} />
            <Field label="Cidade" value={destCity} />
            <Field label="CEP" value={d.cep} />
            <Field label="NF-e" value={d.nfeNumber ? String(d.nfeNumber) : "—"} size={26} />
            <Field label="Motorista" value={d.driver || "—"} />
            <Field label="Veículo" value={d.plate || "—"} />
          </div>
        </div>

        <div
          style={{
            width: "95mm",
            border: `3px solid ${C.line}`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "2mm",
          }}
        >
          <div style={{ fontSize: 14, color: C.gray, textTransform: "uppercase", letterSpacing: 3 }}>Volume</div>
          <div style={{ fontSize: 120, fontWeight: 700, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
            {index}/{d.volumes}
          </div>
          <div style={{ fontSize: 16, color: C.gray, textTransform: "uppercase", letterSpacing: 2 }}>
            Total {d.volumes} volume(s)
          </div>
        </div>
      </div>

      {/* Rodapé */}
      <div
        style={{
          borderTop: `2px solid ${C.line}`,
          marginTop: "5mm",
          paddingTop: "2.5mm",
          display: "flex",
          justifyContent: "space-between",
          fontSize: 14,
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

export const EtiquetaVolumesA4Print = ({ data }: { data: EtiquetaData }) => (
  <>
    {Array.from({ length: Math.max(1, data.volumes) }, (_, i) => (
      <EtiquetaA4 key={i} d={data} index={i + 1} />
    ))}
  </>
);

export default EtiquetaVolumesA4Print;
