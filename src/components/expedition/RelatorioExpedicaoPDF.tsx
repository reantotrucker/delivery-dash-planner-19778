/**
 * Componente de impressão do relatório de expedição.
 * NÃO reaproveita os widgets do dashboard: layout próprio para papel A4,
 * tema claro fixo, 4 páginas com cabeçalho/rodapé repetidos.
 * Recebe exatamente os mesmos dados/cálculos já usados na tela.
 */

const C = {
  bg: "#FAFAF7",
  ink: "#1A1D23",
  ink2: "#4B4F58",
  ink3: "#8A8D94",
  line: "#E4E1D8",
  accent: "#D63A2E",
};

const display = "'Space Grotesk', 'Inter', system-ui, sans-serif";
const body = "'Inter', system-ui, sans-serif";

export interface PdfGroup {
  name: string;
  total: number;
  valor: number;
}

export interface PdfData {
  companyName: string;
  periodo: string;
  geradoEm: string;
  kpis: { label: string; value: string }[];
  byDay: { day: string; total: number; balcao: number; rota: number }[];
  byHour: { hour: string; total: number }[];
  sellers: PdfGroup[];
  conferentes: { name: string; total: number; media: number | null }[];
  clients: PdfGroup[];
  docs: PdfGroup[];
  neighborhoods: PdfGroup[];
  distribution: { name: string; value: number }[];
  totalPedidos: number;
  aguardando: number;
  fmtMin: (m: number | null) => string;
  formatBRL: (v: number) => string;
}

/** Normaliza o bairro (uppercase, sem acento, trim) e agrega equivalentes. */
export const aggregateNeighborhoods = (rows: PdfGroup[]): PdfGroup[] => {
  const m = new Map<string, PdfGroup>();
  rows.forEach((r) => {
    const key =
      (r.name || "NÃO INFORMADO")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase() || "NAO INFORMADO";
    const e = m.get(key) || { name: key, total: 0, valor: 0 };
    e.total += r.total;
    e.valor += r.valor;
    m.set(key, e);
  });
  return [...m.values()].sort((a, b) => b.valor - a.valor);
};

const Page = ({
  n,
  data,
  title,
  children,
}: {
  n: number;
  data: PdfData;
  title: string;
  children: React.ReactNode;
}) => (
  <section
    style={{
      width: "190mm",
      minHeight: "277mm",
      margin: "0 auto",
      padding: "0 0 12mm",
      background: C.bg,
      color: C.ink,
      fontFamily: body,
      display: "flex",
      flexDirection: "column",
      pageBreakAfter: n < 4 ? "always" : "auto",
      breakAfter: n < 4 ? "page" : "auto",
    }}
  >
    <header style={{ borderBottom: `2px solid ${C.ink}`, paddingBottom: "4mm", marginBottom: "6mm" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h1 style={{ fontFamily: display, fontSize: 22, margin: 0, letterSpacing: "-0.4px" }}>
            Relatório de Expedição
          </h1>
          <p style={{ margin: "3px 0 0", fontSize: 10, color: C.ink2 }}>
            {data.companyName} · Período: {data.periodo} · Horário de Manaus
          </p>
        </div>
        <div style={{ textAlign: "right", fontSize: 9, color: C.ink3 }}>
          <div style={{ fontFamily: display, fontSize: 11, color: C.accent, fontWeight: 700 }}>{title}</div>
          <div>Gerado em {data.geradoEm}</div>
        </div>
      </div>
    </header>

    <div style={{ flex: 1 }}>{children}</div>

    <footer
      style={{
        borderTop: `1px solid ${C.line}`,
        marginTop: "6mm",
        paddingTop: "3mm",
        display: "flex",
        justifyContent: "space-between",
        fontSize: 9,
        color: C.ink3,
      }}
    >
      <span>{data.companyName}</span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>Página {n} de 4</span>
    </footer>
  </section>
);

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h2
    style={{
      fontFamily: display,
      fontSize: 12,
      textTransform: "uppercase",
      letterSpacing: "0.8px",
      margin: "0 0 3mm",
      paddingBottom: "1.5mm",
      borderBottom: `1px solid ${C.line}`,
      color: C.ink,
    }}
  >
    {children}
  </h2>
);

const Callout = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      border: `1px solid ${C.line}`,
      borderLeft: `3px solid ${C.accent}`,
      padding: "3mm 4mm",
      fontSize: 10,
      color: C.ink2,
      background: "#fff",
    }}
  >
    {children}
  </div>
);

const Table = ({
  head,
  rows,
  align = [],
}: {
  head: string[];
  rows: (string | React.ReactNode)[][];
  align?: ("left" | "right")[];
}) => (
  <table
    style={{
      width: "100%",
      borderCollapse: "collapse",
      fontSize: 9.5,
      fontVariantNumeric: "tabular-nums",
    }}
  >
    <thead>
      <tr>
        {head.map((h, i) => (
          <th
            key={h}
            style={{
              textAlign: align[i] || "left",
              fontSize: 8,
              textTransform: "uppercase",
              letterSpacing: "0.6px",
              color: C.ink3,
              padding: "2mm 1.5mm",
              borderBottom: `1px solid ${C.ink}`,
              fontWeight: 600,
            }}
          >
            {h}
          </th>
        ))}
      </tr>
    </thead>
    <tbody>
      {rows.length ? (
        rows.map((r, ri) => (
          <tr key={ri}>
            {r.map((c, ci) => (
              <td
                key={ci}
                style={{
                  textAlign: align[ci] || "left",
                  padding: "1.8mm 1.5mm",
                  borderBottom: `1px solid ${C.line}`,
                  color: ci === 0 ? C.ink : C.ink2,
                }}
              >
                {c}
              </td>
            ))}
          </tr>
        ))
      ) : (
        <tr>
          <td colSpan={head.length} style={{ padding: "3mm", color: C.ink3 }}>
            Sem dados no período.
          </td>
        </tr>
      )}
    </tbody>
  </table>
);

/* ---------- gráficos em SVG, tema claro do relatório ---------- */

function LineChartSVG({ data }: { data: PdfData["byDay"] }) {
  const w = 330;
  const h = 170;
  const pad = { t: 12, r: 8, b: 24, l: 28 };
  const max = Math.max(1, ...data.map((d) => d.total));
  const n = Math.max(1, data.length - 1);
  const x = (i: number) => pad.l + (i / n) * (w - pad.l - pad.r);
  const y = (v: number) => h - pad.b - (v / max) * (h - pad.t - pad.b);
  const series: { key: "total" | "balcao" | "rota"; color: string; label: string }[] = [
    { key: "total", color: C.accent, label: "Total" },
    { key: "balcao", color: C.ink, label: "Balcão" },
    { key: "rota", color: C.ink3, label: "Rota" },
  ];
  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={w - pad.r} y1={y(max * f)} y2={y(max * f)} stroke={C.line} strokeWidth="1" />
            <text x={pad.l - 4} y={y(max * f) + 3} textAnchor="end" fontSize="7" fill={C.ink3}>
              {Math.round(max * f)}
            </text>
          </g>
        ))}
        {series.map((s) => (
          <polyline
            key={s.key}
            fill="none"
            stroke={s.color}
            strokeWidth={s.key === "total" ? 1.8 : 1.1}
            strokeDasharray={s.key === "rota" ? "3 2" : undefined}
            points={data.map((d, i) => `${x(i)},${y(d[s.key])}`).join(" ")}
          />
        ))}
        {data.map((d, i) => (
          <circle key={i} cx={x(i)} cy={y(d.total)} r="2" fill={C.accent} />
        ))}
        {data.map((d, i) =>
          data.length <= 12 || i % Math.ceil(data.length / 10) === 0 ? (
            <text key={`l${i}`} x={x(i)} y={h - 8} textAnchor="middle" fontSize="7" fill={C.ink3}>
              {d.day}
            </text>
          ) : null
        )}
      </svg>
      <div style={{ display: "flex", gap: 10, fontSize: 8, color: C.ink2, marginTop: 2 }}>
        {series.map((s) => (
          <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
            <span style={{ width: 8, height: 2, background: s.color, display: "inline-block" }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function DonutSVG({ data }: { data: { name: string; value: number }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const colors = [C.accent, C.ink, C.ink3];
  const r = 52;
  const cx = 70;
  const cy = 70;
  let acc = 0;
  const arcs = data.map((d, i) => {
    const start = (acc / total) * Math.PI * 2 - Math.PI / 2;
    acc += d.value;
    const end = (acc / total) * Math.PI * 2 - Math.PI / 2;
    const large = end - start > Math.PI ? 1 : 0;
    const p = (ang: number, rad: number) => `${cx + Math.cos(ang) * rad},${cy + Math.sin(ang) * rad}`;
    return {
      d: `M ${p(start, r)} A ${r} ${r} 0 ${large} 1 ${p(end, r)} L ${p(end, r * 0.58)} A ${r * 0.58} ${
        r * 0.58
      } 0 ${large} 0 ${p(start, r * 0.58)} Z`,
      color: colors[i % colors.length],
      item: d,
    };
  });
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <svg width="140" height="140" viewBox="0 0 140 140">
        {arcs.map((a, i) => (
          <path key={i} d={a.d} fill={a.color} stroke="#fff" strokeWidth="1" />
        ))}
      </svg>
      <div style={{ fontSize: 9, color: C.ink2, fontVariantNumeric: "tabular-nums" }}>
        {arcs.map((a, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
            <span style={{ width: 8, height: 8, background: a.color, display: "inline-block" }} />
            <strong style={{ color: C.ink, fontWeight: 600 }}>{a.item.name}</strong>
            <span>
              {a.item.value} · {Math.round((a.item.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BarsSVG({ data }: { data: { hour: string; total: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.total));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 150 }}>
      {data.map((d) => (
        <div key={d.hour} style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontSize: 7, color: C.ink2, fontVariantNumeric: "tabular-nums" }}>{d.total}</div>
          <div
            style={{
              height: `${Math.max(2, (d.total / max) * 110)}px`,
              background: C.accent,
              border: `1px solid ${C.accent}`,
            }}
          />
          <div style={{ fontSize: 7, color: C.ink3, marginTop: 2 }}>{d.hour.replace("h", "")}</div>
        </div>
      ))}
    </div>
  );
}

/* --------------------------------- páginas -------------------------------- */

export default function RelatorioExpedicaoPDF({ data }: { data: PdfData }) {
  const {
    kpis,
    byDay,
    byHour,
    sellers,
    conferentes,
    clients,
    docs,
    neighborhoods,
    distribution,
    totalPedidos,
    aguardando,
    fmtMin,
    formatBRL,
  } = data;

  const pctAguardando = totalPedidos ? Math.round((aguardando / totalPedidos) * 100) : 0;

  const medias = conferentes.map((c) => c.media).filter((m): m is number => m !== null);
  const mediaGrupo = medias.length ? medias.reduce((a, b) => a + b, 0) / medias.length : null;
  const foraDaCurva =
    mediaGrupo !== null ? conferentes.filter((c) => c.media !== null && c.media > mediaGrupo * 1.5) : [];

  const top = neighborhoods.slice(0, 15);
  const resto = neighborhoods.slice(15);
  const restoTotal = resto.reduce((s, r) => s + r.total, 0);
  const restoValor = resto.reduce((s, r) => s + r.valor, 0);
  const maxValor = Math.max(1, ...top.map((t) => t.valor));

  return (
    <div style={{ background: C.bg }}>
      {/* Página 1 — Resumo */}
      <Page n={1} data={data} title="Resumo">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            border: `1px solid ${C.line}`,
            marginBottom: "6mm",
          }}
        >
          {kpis.map((k, i) => (
            <div
              key={k.label}
              style={{
                padding: "3.5mm 4mm",
                borderRight: (i + 1) % 4 === 0 ? "none" : `1px solid ${C.line}`,
                borderBottom: i < 4 ? `1px solid ${C.line}` : "none",
                background: "#fff",
              }}
            >
              <div style={{ fontSize: 7.5, textTransform: "uppercase", letterSpacing: "0.7px", color: C.ink3 }}>
                {k.label}
              </div>
              <div
                style={{
                  fontFamily: display,
                  fontSize: 17,
                  fontWeight: 700,
                  marginTop: 2,
                  color: C.ink,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {k.value}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6mm", marginBottom: "6mm" }}>
          <div>
            <SectionTitle>Evolução por dia</SectionTitle>
            <LineChartSVG data={byDay} />
          </div>
          <div>
            <SectionTitle>Distribuição por destino</SectionTitle>
            <DonutSVG data={distribution} />
          </div>
        </div>

        <Callout>
          <strong style={{ color: C.ink }}>Insight do período:</strong> {pctAguardando}% dos {totalPedidos}{" "}
          pedidos ({aguardando}) seguem aguardando expedição
          {pctAguardando > 20
            ? " — volume acima do aceitável, priorize a fila de separação."
            : " — fila sob controle."}
        </Callout>
      </Page>

      {/* Página 2 — Operação */}
      <Page n={2} data={data} title="Operação">
        <div style={{ display: "grid", gridTemplateColumns: "1.25fr 1fr", gap: "6mm", marginBottom: "6mm" }}>
          <div>
            <SectionTitle>Pedidos por hora</SectionTitle>
            <BarsSVG data={byHour} />
          </div>
          <div>
            <SectionTitle>Top vendedores</SectionTitle>
            <Table
              head={["Vendedor", "Pedidos", "Valor"]}
              align={["left", "right", "right"]}
              rows={sellers.map((s) => [s.name, String(s.total), formatBRL(s.valor)])}
            />
          </div>
        </div>

        <div style={{ marginBottom: "6mm" }}>
          <SectionTitle>Desempenho dos conferentes</SectionTitle>
          <Table
            head={["Conferente", "Pedidos", "Tempo médio"]}
            align={["left", "right", "right"]}
            rows={conferentes.map((c) => [c.name, String(c.total), fmtMin(c.media)])}
          />
        </div>

        <Callout>
          {foraDaCurva.length ? (
            <>
              <strong style={{ color: C.ink }}>Atenção:</strong>{" "}
              {foraDaCurva.map((c) => `${c.name} (${fmtMin(c.media)})`).join(", ")} com tempo médio muito acima
              da média do grupo ({fmtMin(mediaGrupo)}). Normalmente indica pedido parado na fila, e não tempo
              real de conferência.
            </>
          ) : (
            <>
              <strong style={{ color: C.ink }}>Tempos equilibrados:</strong> nenhum conferente com tempo médio
              muito acima da média do grupo ({fmtMin(mediaGrupo)}).
            </>
          )}
        </Callout>
      </Page>

      {/* Página 3 — Vendas por bairro */}
      <Page n={3} data={data} title="Vendas por bairro">
        <SectionTitle>Ranking de bairros por valor</SectionTitle>
        <table
          style={{ width: "100%", borderCollapse: "collapse", fontSize: 9.5, fontVariantNumeric: "tabular-nums" }}
        >
          <thead>
            <tr>
              {["#", "Bairro", "Pedidos", "Valor", "Participação"].map((h, i) => (
                <th
                  key={h}
                  style={{
                    textAlign: i === 2 || i === 3 ? "right" : "left",
                    fontSize: 8,
                    textTransform: "uppercase",
                    letterSpacing: "0.6px",
                    color: C.ink3,
                    padding: "2mm 1.5mm",
                    borderBottom: `1px solid ${C.ink}`,
                    fontWeight: 600,
                    width: i === 4 ? "32%" : undefined,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {top.map((b, i) => (
              <tr key={b.name}>
                <td style={{ padding: "1.8mm 1.5mm", borderBottom: `1px solid ${C.line}`, color: C.ink3 }}>
                  {i + 1}
                </td>
                <td style={{ padding: "1.8mm 1.5mm", borderBottom: `1px solid ${C.line}`, color: C.ink }}>
                  {b.name}
                </td>
                <td
                  style={{
                    padding: "1.8mm 1.5mm",
                    borderBottom: `1px solid ${C.line}`,
                    textAlign: "right",
                    color: C.ink2,
                  }}
                >
                  {b.total}
                </td>
                <td
                  style={{
                    padding: "1.8mm 1.5mm",
                    borderBottom: `1px solid ${C.line}`,
                    textAlign: "right",
                    color: C.ink2,
                  }}
                >
                  {formatBRL(b.valor)}
                </td>
                <td style={{ padding: "1.8mm 1.5mm", borderBottom: `1px solid ${C.line}` }}>
                  <div style={{ background: C.line, height: 6 }}>
                    <div style={{ width: `${(b.valor / maxValor) * 100}%`, height: 6, background: C.accent }} />
                  </div>
                </td>
              </tr>
            ))}
            {resto.length > 0 && (
              <tr>
                <td style={{ padding: "1.8mm 1.5mm", borderBottom: `1px solid ${C.line}`, color: C.ink3 }}>—</td>
                <td
                  style={{
                    padding: "1.8mm 1.5mm",
                    borderBottom: `1px solid ${C.line}`,
                    color: C.ink,
                    fontWeight: 600,
                  }}
                >
                  Outros {resto.length} bairros
                </td>
                <td
                  style={{
                    padding: "1.8mm 1.5mm",
                    borderBottom: `1px solid ${C.line}`,
                    textAlign: "right",
                    color: C.ink2,
                  }}
                >
                  {restoTotal}
                </td>
                <td
                  style={{
                    padding: "1.8mm 1.5mm",
                    borderBottom: `1px solid ${C.line}`,
                    textAlign: "right",
                    color: C.ink2,
                  }}
                >
                  {formatBRL(restoValor)}
                </td>
                <td style={{ borderBottom: `1px solid ${C.line}` }} />
              </tr>
            )}
          </tbody>
        </table>
        <p style={{ fontSize: 8.5, color: C.ink3, marginTop: "3mm" }}>
          Nomes de bairro normalizados (maiúsculas, sem acento) e agregados, evitando linhas duplicadas.
        </p>
      </Page>

      {/* Página 4 — Clientes e documentos */}
      <Page n={4} data={data} title="Clientes e documentos">
        <div style={{ marginBottom: "6mm" }}>
          <SectionTitle>Principais clientes</SectionTitle>
          <Table
            head={["Cliente", "Pedidos", "Valor"]}
            align={["left", "right", "right"]}
            rows={clients.map((c) => [c.name, String(c.total), formatBRL(c.valor)])}
          />
        </div>
        <div>
          <SectionTitle>Tipo de documento</SectionTitle>
          <Table
            head={["Documento", "Pedidos", "Valor"]}
            align={["left", "right", "right"]}
            rows={docs.map((d) => [d.name, String(d.total), formatBRL(d.valor)])}
          />
        </div>
      </Page>
    </div>
  );
}
