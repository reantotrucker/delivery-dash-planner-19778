import type { EtiquetaSender } from "@/components/routes/EtiquetaVolumesPrint";

export interface EtiquetaPedidoData {
  sender: EtiquetaSender;
  numeroPedido: string;
  numeroOmie?: string | null;
  numeroNfe?: string | null;
  cliente: string;
  razaoSocial?: string | null;
  cidadeUf?: string | null;
  telefone?: string | null;
  vendedor?: string | null;
  transporte?: string | null;
  volumes?: number | null;
  itens: number;
  data?: string | null;
}

const C = { ink: "#111111", gray: "#555555", line: "#111111" };

const Small = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: 6.3, color: C.gray, textTransform: "uppercase", letterSpacing: 0.6, lineHeight: 1.1 }}>
    {children}
  </div>
);

/** Etiqueta 100x50 mm de identificação do pedido (Entrega para interior) */
export const EtiquetaPedidoInterior = ({ data: d }: { data: EtiquetaPedidoData }) => {
  const senderName = d.sender.legal_name || d.sender.name || "";
  return (
    <div
      style={{
        width: "100mm",
        height: "50mm",
        padding: "2.5mm 3mm",
        background: "#FFFFFF",
        color: C.ink,
        fontFamily: "Inter, Arial, Helvetica, sans-serif",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Topo: pedido + remetente */}
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          gap: "2mm",
          borderBottom: `1px solid ${C.line}`,
          paddingBottom: "1.2mm",
        }}
      >
        <div
          style={{
            background: C.ink,
            color: "#FFFFFF",
            padding: "0.8mm 2mm",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            minWidth: "28mm",
          }}
        >
          <div style={{ fontSize: 6.3, letterSpacing: 0.8, textTransform: "uppercase", opacity: 0.85 }}>Pedido</div>
          <div style={{ fontSize: 19, fontWeight: 800, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
            #{d.numeroPedido}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <Small>Remetente</Small>
          <div
            style={{
              fontSize: 8,
              fontWeight: 700,
              lineHeight: 1.1,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {senderName}
          </div>
          <div style={{ fontSize: 6.5, color: C.gray, lineHeight: 1.15 }}>
            {[d.numeroOmie ? `Omie ${d.numeroOmie}` : null, d.numeroNfe ? `NF-e ${d.numeroNfe}` : null, d.data]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
      </div>

      {/* Cliente */}
      <div style={{ flex: 1, display: "flex", gap: "2mm", paddingTop: "1.2mm", minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Small>Destinatário</Small>
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              lineHeight: 1.08,
              textTransform: "uppercase",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {d.cliente}
          </div>
          {d.razaoSocial && d.razaoSocial !== d.cliente && (
            <div
              style={{
                fontSize: 6.5,
                color: C.gray,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {d.razaoSocial}
            </div>
          )}
          <div style={{ fontSize: 10, fontWeight: 700, marginTop: "0.8mm", lineHeight: 1.1 }}>{d.cidadeUf || "—"}</div>
          {d.transporte && (
            <div style={{ fontSize: 7.5, fontWeight: 700, marginTop: "0.5mm", textTransform: "uppercase" }}>
              Transporte: {d.transporte}
            </div>
          )}
        </div>

        <div
          style={{
            width: "22mm",
            border: `1.5px solid ${C.line}`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
          }}
        >
          <Small>Volumes</Small>
          <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
            {d.volumes != null && d.volumes > 0 ? d.volumes : "—"}
          </div>
          <div style={{ fontSize: 6.3, color: C.gray, marginTop: "0.6mm" }}>{d.itens} itens</div>
        </div>
      </div>

      {/* Rodapé */}
      <div
        style={{
          borderTop: `1px solid ${C.line}`,
          paddingTop: "0.8mm",
          display: "flex",
          justifyContent: "space-between",
          gap: "2mm",
          fontSize: 6.8,
          color: C.gray,
        }}
      >
        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          Vendedor: <b style={{ color: C.ink }}>{d.vendedor || "—"}</b>
        </span>
        <span style={{ whiteSpace: "nowrap" }}>{d.telefone || ""}</span>
      </div>
    </div>
  );
};

export default EtiquetaPedidoInterior;
