import React, { forwardRef } from "react";
import { formatDate, formatCurrency } from "../../shared/formatters";

const STATUS_LABELS = {
  aktivno: "Aktivno",
  na_isteku: "Na isteku",
  istekao: "Istekao",
  raskinuto: "Raskinuto",
  arhivirano: "Arhivirano",
};

const STATUS_DOT = {
  aktivno: "#16a34a",
  na_isteku: "#d97706",
  istekao: "#dc2626",
  raskinuto: "#6b7280",
  arhivirano: "#94a3b8",
};

const ContractPrintTemplate = forwardRef(
  ({ contracts, nekretnine, zakupnici }, ref) => {
    if (!contracts || contracts.length === 0) return null;

    const reportDate = new Date().toLocaleDateString("hr-HR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

    // --- Computed metrics ---
    const activeContracts = contracts.filter((c) => c.status === "aktivno");
    const expiringContracts = contracts.filter((c) => c.status === "na_isteku");
    const totalMonthly = activeContracts.reduce(
      (sum, c) => sum + (Number(c.osnovna_zakupnina) || 0),
      0,
    );
    const totalCam = activeContracts.reduce(
      (sum, c) => sum + (Number(c.cam_troskovi) || 0),
      0,
    );

    // Status summary
    const statusSummary = {};
    contracts.forEach((c) => {
      const s = c.status || "nepoznato";
      statusSummary[s] = (statusSummary[s] || 0) + 1;
    });

    // Revenue by property
    const revenueByProp = {};
    activeContracts.forEach((c) => {
      const prop = nekretnine?.find((n) => n.id === c.nekretnina_id);
      const key = prop?.naziv || "Nepoznato";
      revenueByProp[key] =
        (revenueByProp[key] || 0) + (Number(c.osnovna_zakupnina) || 0);
    });

    return (
      <div
        ref={ref}
        className="bg-white text-black"
        style={{
          width: "297mm",
          minHeight: "210mm",
          fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
        }}
      >
        <style type="text/css" media="print">
          {`
            @page { size: A4 landscape; margin: 10mm; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            tr { page-break-inside: avoid; }
          `}
        </style>

        {/* Header band */}
        <div
          style={{
            backgroundColor: "#1e293b",
            color: "#fff",
            padding: "24px 40px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
            }}
          >
            <div>
              <p
                style={{
                  fontSize: "10px",
                  textTransform: "uppercase",
                  letterSpacing: "0.2em",
                  color: "#94a3b8",
                  marginBottom: "4px",
                }}
              >
                Riforma
              </p>
              <h1
                style={{
                  fontSize: "22px",
                  fontWeight: 700,
                  letterSpacing: "-0.01em",
                  margin: 0,
                }}
              >
                Izvještaj o ugovorima o zakupu
              </h1>
            </div>
            <div
              style={{ textAlign: "right", fontSize: "13px", color: "#94a3b8" }}
            >
              <p style={{ margin: 0 }}>Datum izvještaja</p>
              <p style={{ margin: 0, color: "#fff", fontWeight: 600 }}>
                {reportDate}
              </p>
            </div>
          </div>
        </div>

        <div style={{ padding: "32px 40px" }}>
          {/* KPI row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(6, 1fr)",
              gap: "12px",
              marginBottom: "28px",
            }}
          >
            {[
              {
                label: "Ukupno ugovora",
                value: contracts.length,
                color: "#0f172a",
              },
              {
                label: "Aktivnih",
                value: activeContracts.length,
                color: "#15803d",
              },
              {
                label: "Na isteku",
                value: expiringContracts.length,
                color: "#b45309",
              },
              {
                label: "Mjesečni prihod",
                value: formatCurrency(totalMonthly),
                color: "#0f172a",
              },
              {
                label: "Godišnji prihod",
                value: formatCurrency(totalMonthly * 12),
                color: "#0f172a",
              },
              {
                label: "CAM ukupno",
                value: formatCurrency(totalCam),
                color: "#0f172a",
              },
            ].map((kpi, i) => (
              <div
                key={i}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: "6px",
                  padding: "12px",
                }}
              >
                <p
                  style={{
                    fontSize: "10px",
                    color: "#64748b",
                    textTransform: "uppercase",
                    fontWeight: 600,
                    letterSpacing: "0.05em",
                    margin: 0,
                  }}
                >
                  {kpi.label}
                </p>
                <p
                  style={{
                    fontSize: "18px",
                    fontWeight: 700,
                    color: kpi.color,
                    marginTop: "4px",
                    margin: "4px 0 0 0",
                  }}
                >
                  {kpi.value}
                </p>
              </div>
            ))}
          </div>

          {/* Two-column: Status + Revenue */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "32px",
              marginBottom: "28px",
            }}
          >
            {/* Status breakdown */}
            <div>
              <h3
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#64748b",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: "12px",
                  paddingBottom: "4px",
                  borderBottom: "1px solid #e2e8f0",
                }}
              >
                Raspodjela po statusu
              </h3>
              <div
                style={{ display: "flex", flexDirection: "column", gap: "8px" }}
              >
                {Object.entries(statusSummary).map(([status, count]) => {
                  const pct =
                    contracts.length > 0
                      ? Math.round((count / contracts.length) * 100)
                      : 0;
                  return (
                    <div
                      key={status}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        fontSize: "12px",
                      }}
                    >
                      <span
                        style={{
                          display: "inline-block",
                          width: "10px",
                          height: "10px",
                          borderRadius: "50%",
                          backgroundColor: STATUS_DOT[status] || "#94a3b8",
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ width: "80px" }}>
                        {STATUS_LABELS[status] || status}
                      </span>
                      <div
                        style={{
                          flex: 1,
                          height: "8px",
                          backgroundColor: "#f1f5f9",
                          borderRadius: "999px",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${pct}%`,
                            borderRadius: "999px",
                            backgroundColor: STATUS_DOT[status] || "#94a3b8",
                          }}
                        />
                      </div>
                      <span
                        style={{
                          fontWeight: 600,
                          width: "32px",
                          textAlign: "right",
                        }}
                      >
                        {count}
                      </span>
                      <span
                        style={{
                          color: "#94a3b8",
                          width: "40px",
                          textAlign: "right",
                        }}
                      >
                        {pct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Revenue by property */}
            <div>
              <h3
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#64748b",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: "12px",
                  paddingBottom: "4px",
                  borderBottom: "1px solid #e2e8f0",
                }}
              >
                Prihod po nekretnini (mjesečno)
              </h3>
              <div
                style={{ display: "flex", flexDirection: "column", gap: "6px" }}
              >
                {Object.entries(revenueByProp)
                  .sort(([, a], [, b]) => b - a)
                  .map(([name, revenue]) => {
                    const pct =
                      totalMonthly > 0
                        ? Math.round((revenue / totalMonthly) * 100)
                        : 0;
                    return (
                      <div
                        key={name}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          fontSize: "12px",
                        }}
                      >
                        <span
                          style={{
                            flex: 1,
                            minWidth: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {name}
                        </span>
                        <span style={{ fontWeight: 600, flexShrink: 0 }}>
                          {formatCurrency(revenue)}
                        </span>
                        <span
                          style={{
                            color: "#94a3b8",
                            width: "40px",
                            textAlign: "right",
                            flexShrink: 0,
                          }}
                        >
                          {pct}%
                        </span>
                      </div>
                    );
                  })}
                {Object.keys(revenueByProp).length === 0 && (
                  <p style={{ fontSize: "12px", color: "#94a3b8" }}>
                    Nema aktivnih ugovora
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Main table */}
          <h3
            style={{
              fontSize: "11px",
              fontWeight: 700,
              color: "#64748b",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: "8px",
              paddingBottom: "4px",
              borderBottom: "1px solid #e2e8f0",
            }}
          >
            Detaljan pregled ugovora
          </h3>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "11px",
            }}
          >
            <thead>
              <tr style={{ backgroundColor: "#1e293b", color: "#fff" }}>
                <th
                  style={{
                    textAlign: "left",
                    padding: "8px",
                    fontWeight: 600,
                  }}
                >
                  Br. ugovora
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "8px",
                    fontWeight: 600,
                  }}
                >
                  Zakupnik
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "8px",
                    fontWeight: 600,
                  }}
                >
                  Nekretnina
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "8px",
                    fontWeight: 600,
                  }}
                >
                  Početak
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "8px",
                    fontWeight: 600,
                  }}
                >
                  Završetak
                </th>
                <th
                  style={{
                    textAlign: "right",
                    padding: "8px",
                    fontWeight: 600,
                  }}
                >
                  Zakupnina
                </th>
                <th
                  style={{
                    textAlign: "right",
                    padding: "8px",
                    fontWeight: 600,
                  }}
                >
                  CAM
                </th>
                <th
                  style={{
                    textAlign: "center",
                    padding: "8px",
                    fontWeight: 600,
                  }}
                >
                  Indeks.
                </th>
                <th
                  style={{
                    textAlign: "center",
                    padding: "8px",
                    fontWeight: 600,
                  }}
                >
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((c, i) => {
                const propertyName =
                  nekretnine?.find((n) => n.id === c.nekretnina_id)?.naziv ||
                  "—";
                const zakupnik = zakupnici?.find((z) => z.id === c.zakupnik_id);
                const contactInfo = zakupnik?.oib || zakupnik?.kontakt_email || "";

                return (
                  <tr
                    key={c.id}
                    style={{
                      borderBottom: "1px solid #f1f5f9",
                      backgroundColor: i % 2 === 0 ? "#fff" : "#f8fafc",
                      pageBreakInside: "avoid",
                    }}
                  >
                    <td
                      style={{
                        padding: "6px 8px",
                        fontFamily: "monospace",
                        fontWeight: 500,
                        color: "#475569",
                      }}
                    >
                      {c.interna_oznaka || "—"}
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      <div style={{ fontWeight: 500 }}>
                        {c.zakupnik_naziv || "—"}
                      </div>
                      {contactInfo && (
                        <div
                          style={{
                            fontSize: "9px",
                            color: "#94a3b8",
                          }}
                        >
                          {contactInfo}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "6px 8px" }}>{propertyName}</td>
                    <td style={{ padding: "6px 8px", color: "#475569" }}>
                      {formatDate(c.datum_pocetka)}
                    </td>
                    <td style={{ padding: "6px 8px", color: "#475569" }}>
                      {formatDate(c.datum_zavrsetka)}
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        textAlign: "right",
                        fontWeight: 600,
                      }}
                    >
                      {formatCurrency(c.osnovna_zakupnina)}
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        textAlign: "right",
                        color: "#64748b",
                      }}
                    >
                      {c.cam_troskovi ? formatCurrency(c.cam_troskovi) : "—"}
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        textAlign: "center",
                      }}
                    >
                      {c.indeksacija ? c.indeks || "Da" : "Ne"}
                    </td>
                    <td style={{ padding: "6px 8px", textAlign: "center" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <span
                          style={{
                            display: "inline-block",
                            width: "8px",
                            height: "8px",
                            borderRadius: "50%",
                            backgroundColor: STATUS_DOT[c.status] || "#94a3b8",
                          }}
                        />
                        <span style={{ fontSize: "10px", fontWeight: 500 }}>
                          {STATUS_LABELS[c.status] || c.status}
                        </span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr
                style={{
                  backgroundColor: "#1e293b",
                  color: "#fff",
                  fontWeight: 600,
                }}
              >
                <td colSpan={5} style={{ padding: "8px", textAlign: "right" }}>
                  UKUPNO (aktivni):
                </td>
                <td style={{ padding: "8px", textAlign: "right" }}>
                  {formatCurrency(totalMonthly)}
                </td>
                <td style={{ padding: "8px", textAlign: "right" }}>
                  {formatCurrency(totalCam)}
                </td>
                <td colSpan={2} style={{ padding: "8px" }} />
              </tr>
            </tfoot>
          </table>

          {/* Footer */}
          <div
            style={{
              marginTop: "32px",
              paddingTop: "12px",
              borderTop: "1px solid #e2e8f0",
              display: "flex",
              justifyContent: "space-between",
              fontSize: "10px",
              color: "#94a3b8",
            }}
          >
            <span>Riforma — Sustav za upravljanje nekretninama</span>
            <span>
              Generirano: {new Date().toLocaleString("hr-HR")} • Ukupno ugovora:{" "}
              {contracts.length}
            </span>
          </div>
        </div>
      </div>
    );
  },
);

export default ContractPrintTemplate;
