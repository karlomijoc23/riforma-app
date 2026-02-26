import React, { forwardRef } from "react";
import {
  formatDate,
  formatCurrency,
  formatArea,
  parseSmartNumber,
} from "../../shared/formatters";
import { api } from "../../shared/api";

const STATUS_DOT = {
  aktivno: "#16a34a",
  na_isteku: "#d97706",
  istekao: "#dc2626",
  raskinuto: "#6b7280",
  arhivirano: "#94a3b8",
};

const STATUS_LABELS = {
  aktivno: "Aktivno",
  na_isteku: "Na isteku",
  istekao: "Istekao",
  raskinuto: "Raskinuto",
  arhivirano: "Arhivirano",
};

const PropertyPrintTemplate = forwardRef(
  ({ property, contracts, units = [] }, ref) => {
    if (!property) return null;

    const reportDate = new Date().toLocaleDateString("hr-HR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

    const getImageUrl = (path) => {
      if (!path) return null;
      if (path.startsWith("http")) return path;
      const baseUrl = api.getBackendUrl().replace(/\/$/, "");
      const cleanPath = path.startsWith("/") ? path.substring(1) : path;
      return `${baseUrl}/${cleanPath}`;
    };

    // Computed metrics
    const activeContracts = (contracts || []).filter(
      (c) => c.status === "aktivno" || c.status === "na_isteku",
    );
    const monthlyIncome = activeContracts.reduce(
      (sum, c) => sum + (parseFloat(c.osnovna_zakupnina) || 0),
      0,
    );

    // Occupancy — derive from both unit status AND active contracts
    const totalArea = units.reduce(
      (sum, u) => sum + (parseFloat(u.povrsina_m2) || 0),
      0,
    );
    const activeUnitIds = new Set(
      activeContracts.map((c) => c.property_unit_id).filter(Boolean),
    );
    const occupiedUnits = units.filter(
      (u) => u.status === "iznajmljeno" || activeUnitIds.has(u.id),
    );
    const occupiedArea = occupiedUnits.reduce(
      (sum, u) => sum + (parseFloat(u.povrsina_m2) || 0),
      0,
    );
    const occupancyPct =
      totalArea > 0 ? Math.round((occupiedArea / totalArea) * 100) : 0;

    // Reusable styles
    const sectionStyle = {
      fontSize: "12px",
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.04em",
      color: "#1e293b",
      marginBottom: "10px",
      paddingBottom: "4px",
      borderBottom: "2px solid #1e293b",
    };

    const detailRowStyle = {
      display: "flex",
      justifyContent: "space-between",
      borderBottom: "1px dotted #e2e8f0",
      padding: "4px 0",
      fontSize: "11px",
    };

    return (
      <div
        ref={ref}
        className="bg-white text-black"
        style={{
          width: "210mm",
          minHeight: "297mm",
          fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
        }}
      >
        <style type="text/css" media="print">
          {`
            @page { size: A4 portrait; margin: 15mm; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            tr { page-break-inside: avoid; }
          `}
        </style>

        {/* Header band */}
        <div
          style={{
            backgroundColor: "#1e293b",
            color: "#fff",
            padding: "24px 32px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
            }}
          >
            <div style={{ flex: 1 }}>
              <p
                style={{
                  fontSize: "10px",
                  textTransform: "uppercase",
                  letterSpacing: "0.2em",
                  color: "#94a3b8",
                  margin: "0 0 4px 0",
                }}
              >
                Riforma — Izvještaj nekretnine
              </p>
              <h1
                style={{
                  fontSize: "22px",
                  fontWeight: 700,
                  letterSpacing: "-0.01em",
                  margin: "0 0 4px 0",
                }}
              >
                {property.naziv}
              </h1>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginTop: "4px",
                }}
              >
                <span style={{ fontSize: "12px", color: "#cbd5e1" }}>
                  {property.adresa}
                </span>
                {property.vrsta && (
                  <span
                    style={{
                      fontSize: "9px",
                      padding: "2px 8px",
                      border: "1px solid #475569",
                      borderRadius: "999px",
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      color: "#94a3b8",
                    }}
                  >
                    {property.vrsta.replace(/_/g, " ")}
                  </span>
                )}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <p
                style={{
                  fontSize: "11px",
                  color: "#94a3b8",
                  margin: "0 0 2px 0",
                }}
              >
                Datum izvještaja
              </p>
              <p style={{ margin: 0, fontWeight: 600, fontSize: "13px" }}>
                {reportDate}
              </p>
            </div>
          </div>
        </div>

        <div style={{ padding: "28px 32px" }}>
          {/* KPI row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: "12px",
              marginBottom: "24px",
            }}
          >
            {[
              {
                label: "Površina",
                value: formatArea(property.povrsina),
                color: "#0f172a",
              },
              {
                label: "Vrijednost",
                value: formatCurrency(
                  property.trzisna_vrijednost || property.nabavna_cijena,
                ),
                color: "#0f172a",
              },
              {
                label: "Mjesečni prihod",
                value: formatCurrency(monthlyIncome),
                color: "#15803d",
                bg: "#f0fdf4",
                border: "#dcfce7",
              },
              {
                label: "Zakupljenost",
                value: units.length > 0 ? `${occupancyPct}%` : "—",
                color:
                  occupancyPct >= 75
                    ? "#15803d"
                    : occupancyPct >= 40
                      ? "#b45309"
                      : "#0f172a",
                sub:
                  units.length > 0
                    ? `${occupiedUnits.length}/${units.length} jedinica`
                    : null,
              },
              {
                label: "Godina",
                value: property.godina_izgradnje || "—",
                color: "#0f172a",
              },
            ].map((kpi, i) => (
              <div
                key={i}
                style={{
                  border: `1px solid ${kpi.border || "#e2e8f0"}`,
                  borderRadius: "6px",
                  padding: "12px",
                  textAlign: "center",
                  backgroundColor: kpi.bg || "transparent",
                }}
              >
                <p
                  style={{
                    fontSize: "10px",
                    color: "#64748b",
                    textTransform: "uppercase",
                    fontWeight: 600,
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
                    margin: "4px 0 0 0",
                  }}
                >
                  {kpi.value}
                </p>
                {kpi.sub && (
                  <p
                    style={{
                      fontSize: "9px",
                      color: "#94a3b8",
                      margin: "2px 0 0 0",
                    }}
                  >
                    {kpi.sub}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Occupancy bar */}
          {units.length > 0 && (
            <div style={{ marginBottom: "24px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "11px",
                  marginBottom: "4px",
                }}
              >
                <span style={{ color: "#64748b", fontWeight: 600 }}>
                  Zakupljenost prostora
                </span>
                <span style={{ fontWeight: 700 }}>
                  {occupancyPct}% ({formatArea(occupiedArea)} od{" "}
                  {formatArea(totalArea)})
                </span>
              </div>
              <div
                style={{
                  height: "10px",
                  backgroundColor: "#f1f5f9",
                  borderRadius: "999px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${occupancyPct}%`,
                    borderRadius: "999px",
                    backgroundColor:
                      occupancyPct >= 75
                        ? "#22c55e"
                        : occupancyPct >= 40
                          ? "#f59e0b"
                          : occupancyPct > 0
                            ? "#ef4444"
                            : "#e2e8f0",
                  }}
                />
              </div>
            </div>
          )}

          {/* Basic info */}
          <div style={{ marginBottom: "24px", pageBreakInside: "avoid" }}>
            <h2 style={sectionStyle}>Osnovne informacije</h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0 32px",
              }}
            >
              {[
                ["Katastarska općina", property.katastarska_opcina],
                ["Broj čestice", property.broj_kat_cestice],
                ["Vlasnik", property.vlasnik],
                ["Udio vlasništva", property.udio_vlasnistva],
                ["Energetski certifikat", property.energetski_certifikat],
                ["Godina izgradnje", property.godina_izgradnje],
              ].map(([label, value], i) => (
                <div key={i} style={detailRowStyle}>
                  <span style={{ color: "#64748b" }}>{label}</span>
                  <span style={{ fontWeight: 500 }}>{value || "—"}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Financial info */}
          <div style={{ marginBottom: "24px", pageBreakInside: "avoid" }}>
            <h2 style={sectionStyle}>Financijski i tehnički podaci</h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0 32px",
              }}
            >
              {[
                ["Nabavna cijena", formatCurrency(property.nabavna_cijena)],
                [
                  "Tržišna vrijednost",
                  formatCurrency(property.trzisna_vrijednost),
                ],
                ["Amortizacija", formatCurrency(property.amortizacija)],
                [
                  "Troškovi održavanja",
                  formatCurrency(property.troskovi_odrzavanja),
                ],
                ["Zadnja obnova", formatDate(property.zadnja_obnova) || "—"],
                ["Osiguranje", property.osiguranje || "—"],
              ].map(([label, value], i) => (
                <div key={i} style={detailRowStyle}>
                  <span style={{ color: "#64748b" }}>{label}</span>
                  <span style={{ fontWeight: 500 }}>{value}</span>
                </div>
              ))}
            </div>
            {property.potrebna_ulaganja && (
              <div
                style={{
                  marginTop: "8px",
                  padding: "8px 12px",
                  backgroundColor: "#fffbeb",
                  border: "1px solid #fde68a",
                  borderRadius: "4px",
                  fontSize: "11px",
                }}
              >
                <span
                  style={{
                    display: "block",
                    fontWeight: 700,
                    color: "#92400e",
                    marginBottom: "2px",
                  }}
                >
                  Potrebna ulaganja:
                </span>
                <span style={{ color: "#78350f" }}>
                  {property.potrebna_ulaganja}
                </span>
              </div>
            )}
          </div>

          {/* Notes & risks */}
          {(property.sudski_sporovi ||
            property.hipoteke ||
            property.napomene) && (
            <div style={{ marginBottom: "24px", pageBreakInside: "avoid" }}>
              <h2 style={sectionStyle}>Napomene i rizici</h2>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                {property.sudski_sporovi && (
                  <div
                    style={{
                      padding: "8px 12px",
                      backgroundColor: "#fef2f2",
                      border: "1px solid #fecaca",
                      borderRadius: "4px",
                      fontSize: "11px",
                    }}
                  >
                    <span
                      style={{
                        display: "block",
                        fontWeight: 700,
                        color: "#b91c1c",
                        marginBottom: "2px",
                      }}
                    >
                      Sudski sporovi
                    </span>
                    <span style={{ color: "#7f1d1d" }}>
                      {property.sudski_sporovi}
                    </span>
                  </div>
                )}
                {property.hipoteke && (
                  <div
                    style={{
                      padding: "8px 12px",
                      backgroundColor: "#fef2f2",
                      border: "1px solid #fecaca",
                      borderRadius: "4px",
                      fontSize: "11px",
                    }}
                  >
                    <span
                      style={{
                        display: "block",
                        fontWeight: 700,
                        color: "#b91c1c",
                        marginBottom: "2px",
                      }}
                    >
                      Hipoteke
                    </span>
                    <span style={{ color: "#7f1d1d" }}>
                      {property.hipoteke}
                    </span>
                  </div>
                )}
                {property.napomene && (
                  <div
                    style={{
                      padding: "8px 12px",
                      backgroundColor: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      borderRadius: "4px",
                      fontSize: "11px",
                    }}
                  >
                    <span
                      style={{
                        display: "block",
                        fontWeight: 700,
                        color: "#334155",
                        marginBottom: "2px",
                      }}
                    >
                      Napomene
                    </span>
                    <span style={{ color: "#475569" }}>
                      {property.napomene}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Financial history */}
          {property.financijska_povijest &&
            property.financijska_povijest.length > 0 && (
              <div style={{ marginBottom: "24px", pageBreakInside: "avoid" }}>
                <h2 style={sectionStyle}>Povijest financija</h2>
                <table
                  style={{
                    width: "100%",
                    fontSize: "11px",
                    borderCollapse: "collapse",
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
                        Godina
                      </th>
                      <th
                        style={{
                          textAlign: "right",
                          padding: "8px",
                          fontWeight: 600,
                        }}
                      >
                        Prihodi
                      </th>
                      <th
                        style={{
                          textAlign: "right",
                          padding: "8px",
                          fontWeight: 600,
                        }}
                      >
                        Rashodi
                      </th>
                      <th
                        style={{
                          textAlign: "right",
                          padding: "8px",
                          fontWeight: 600,
                        }}
                      >
                        Amortizacija
                      </th>
                      <th
                        style={{
                          textAlign: "right",
                          padding: "8px",
                          fontWeight: 600,
                        }}
                      >
                        Neto dobit
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {property.financijska_povijest.map((item, i) => {
                      const prihodi = parseSmartNumber(item.prihodi);
                      const rashodi = parseSmartNumber(item.rashodi);
                      const amortizacija = parseSmartNumber(item.amortizacija);
                      const neto = prihodi - rashodi + amortizacija;
                      return (
                        <tr
                          key={i}
                          style={{
                            borderBottom: "1px solid #f1f5f9",
                            backgroundColor: i % 2 === 0 ? "#fff" : "#f8fafc",
                          }}
                        >
                          <td style={{ padding: "6px 8px", fontWeight: 500 }}>
                            {item.godina}
                          </td>
                          <td
                            style={{
                              padding: "6px 8px",
                              textAlign: "right",
                            }}
                          >
                            {formatCurrency(prihodi)}
                          </td>
                          <td
                            style={{
                              padding: "6px 8px",
                              textAlign: "right",
                              color: "#dc2626",
                            }}
                          >
                            {formatCurrency(rashodi)}
                          </td>
                          <td
                            style={{
                              padding: "6px 8px",
                              textAlign: "right",
                              color: "#64748b",
                            }}
                          >
                            {formatCurrency(amortizacija)}
                          </td>
                          <td
                            style={{
                              padding: "6px 8px",
                              textAlign: "right",
                              fontWeight: 700,
                              color: neto >= 0 ? "#15803d" : "#b91c1c",
                            }}
                          >
                            {formatCurrency(neto)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

          {/* Active contracts */}
          {activeContracts.length > 0 && (
            <div style={{ marginBottom: "24px", pageBreakInside: "avoid" }}>
              <h2 style={sectionStyle}>
                Aktivni ugovori ({activeContracts.length})
              </h2>
              <table
                style={{
                  width: "100%",
                  fontSize: "11px",
                  borderCollapse: "collapse",
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
                      Trajanje
                    </th>
                    <th
                      style={{
                        textAlign: "right",
                        padding: "8px",
                        fontWeight: 600,
                      }}
                    >
                      Iznos
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
                  {activeContracts.map((c, i) => (
                    <tr
                      key={i}
                      style={{
                        borderBottom: "1px solid #f1f5f9",
                        backgroundColor: i % 2 === 0 ? "#fff" : "#f8fafc",
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
                      <td style={{ padding: "6px 8px", fontWeight: 500 }}>
                        {c.zakupnik_naziv || "—"}
                      </td>
                      <td style={{ padding: "6px 8px", color: "#475569" }}>
                        {formatDate(c.datum_pocetka)} –{" "}
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
                              backgroundColor:
                                STATUS_DOT[c.status] || "#94a3b8",
                            }}
                          />
                          <span style={{ fontSize: "10px", fontWeight: 500 }}>
                            {STATUS_LABELS[c.status] || c.status}
                          </span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr
                    style={{
                      backgroundColor: "#1e293b",
                      color: "#fff",
                      fontWeight: 600,
                    }}
                  >
                    <td
                      colSpan={3}
                      style={{ padding: "8px", textAlign: "right" }}
                    >
                      UKUPNO MJESEČNO:
                    </td>
                    <td style={{ padding: "8px", textAlign: "right" }}>
                      {formatCurrency(monthlyIncome)}
                    </td>
                    <td style={{ padding: "8px" }} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

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
            <span>Generirano: {new Date().toLocaleString("hr-HR")}</span>
          </div>
        </div>
      </div>
    );
  },
);

export default PropertyPrintTemplate;
