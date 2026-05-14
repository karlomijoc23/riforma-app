// Shared report UI primitives — vizualno se podudaraju s PDF templatima u
// brand/. Riforma paleta (#0F5E4D primary, #00C08B accent), gradijent
// header, KPI kartice, rank kartice, "vs portfelj" oznake.
//
// Cilj: kad korisnik vidi report preview, zna kako će PDF izgledati —
// jedan dizajn jezik, dva renderera (React preview + WeasyPrint PDF).

import React from "react";
import { Loader2, Download, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";

const RIFORMA_PRIMARY = "#0F5E4D";
const RIFORMA_PRIMARY_DARK = "#0B4237";
const RIFORMA_ACCENT = "#00C08B";

/**
 * Gradijent header s eyebrow / title / subtitle / desnim meta blokom i
 * accent linijom dolje. Identičan PDF report-head iz `_base_styles.html`.
 */
export const ReportHeader = ({
  eyebrow,
  title,
  subtitle,
  metaLabel,
  metaValue,
  backTo,
}) => {
  const navigate = useNavigate();
  return (
    <div
      className="relative overflow-hidden rounded-lg text-white"
      style={{
        background: `linear-gradient(135deg, ${RIFORMA_PRIMARY} 0%, ${RIFORMA_PRIMARY_DARK} 65%, #082b24 100%)`,
      }}
    >
      <div
        className="absolute pointer-events-none"
        style={{
          right: "-12rem",
          top: "-6rem",
          width: "22rem",
          height: "22rem",
          background:
            "radial-gradient(circle, rgba(0,192,139,0.35) 0%, rgba(0,192,139,0) 70%)",
        }}
      />
      <div className="relative p-6 md:p-8">
        {backTo && (
          <button
            type="button"
            onClick={() => navigate(backTo)}
            className="inline-flex items-center gap-1 text-xs font-medium opacity-80 hover:opacity-100 mb-3"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Natrag
          </button>
        )}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {eyebrow && (
              <p className="text-[10px] tracking-[0.28em] uppercase opacity-70 mb-1">
                {eyebrow}
              </p>
            )}
            <h1 className="text-2xl md:text-3xl font-semibold leading-tight">
              {title}
            </h1>
            {subtitle && (
              <p className="text-sm md:text-base opacity-80 mt-1">{subtitle}</p>
            )}
          </div>
          {(metaLabel || metaValue) && (
            <div className="text-right text-xs opacity-75 shrink-0">
              {metaLabel && <div>{metaLabel}</div>}
              {metaValue && (
                <div className="text-white text-base font-semibold mt-1">
                  {metaValue}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="h-[3px]" style={{ background: RIFORMA_ACCENT }} />
    </div>
  );
};

/** Naslov sekcije — uppercase, primary boja, donji border (kao PDF). */
export const SectionTitle = ({ children, hint }) => (
  <div className="mt-6 mb-3 pb-2 border-b border-[#0F5E4D]/20">
    <h2 className="text-xs font-bold tracking-[0.18em] uppercase text-[#0F5E4D]">
      {children}
      {hint && (
        <span className="ml-2 font-medium tracking-normal normal-case text-muted-foreground text-[11px]">
          · {hint}
        </span>
      )}
    </h2>
  </div>
);

/**
 * KPI grid — 4 kartice u jednom redu na md+. Svaka kartica je `<KpiCard>`.
 * variant: "default" | "accent" (primary fill) | "positive" | "info"
 */
export const KpiGrid = ({ children }) => (
  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{children}</div>
);

export const KpiCard = ({ label, value, sub, variant = "default" }) => {
  const styles = {
    default: "bg-white border-[#0F5E4D]/20",
    accent: "text-white border-transparent",
    positive: "bg-[#e6f7ee] border-[#b9e3c9]",
    info: "bg-[#e8f1ee] border-[#c0d8d1]",
  };
  return (
    <div
      className={`rounded-md border p-4 ${styles[variant] || styles.default}`}
      style={
        variant === "accent"
          ? { background: RIFORMA_PRIMARY }
          : undefined
      }
    >
      <p
        className={`text-[10px] font-bold tracking-[0.14em] uppercase ${
          variant === "accent" ? "text-white/70" : "text-muted-foreground"
        }`}
      >
        {label}
      </p>
      <div
        className={`text-2xl font-semibold leading-tight mt-1 ${
          variant === "accent" ? "text-white" : "text-foreground"
        }`}
      >
        {value}
      </div>
      {sub && (
        <p
          className={`text-[11px] mt-1 ${
            variant === "accent" ? "text-white/70" : "text-muted-foreground"
          }`}
        >
          {sub}
        </p>
      )}
    </div>
  );
};

/**
 * Top/bottom rank kartica s nasloncem, sub-naslov, redak po stavku.
 * tone: "top" → zelena, "bottom" → narančasta.
 *
 * children: nizovi <RankRow /> elemenata.
 */
export const RankCard = ({ title, sub, tone = "top", children }) => {
  const palette =
    tone === "top"
      ? { bg: "#ecfdf5", border: "#b9e3c9", fg: "#0f6a44" }
      : { bg: "#fff4e6", border: "#f5c891", fg: "#b45309" };
  return (
    <div
      className="rounded-lg border p-4"
      style={{ background: palette.bg, borderColor: palette.border }}
    >
      <div className="flex items-baseline justify-between pb-2 mb-2 border-b border-black/5">
        <span
          className="text-[10px] font-bold tracking-[0.14em] uppercase"
          style={{ color: palette.fg }}
        >
          {title}
        </span>
        {sub && (
          <span className="text-[10px] text-muted-foreground">{sub}</span>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
};

export const RankRow = ({ rank, primary, secondary, value, unit, tone = "top" }) => {
  const palette =
    tone === "top"
      ? { fg: "#0f6a44", border: "#b9e3c9" }
      : { fg: "#b45309", border: "#f5c891" };
  return (
    <div className="flex items-center gap-2 py-1.5 border-b last:border-b-0 border-black/5">
      <div
        className="w-6 h-6 rounded-full text-center text-[10px] font-bold flex-shrink-0 grid place-items-center"
        style={{
          background: "rgba(255,255,255,0.85)",
          color: palette.fg,
          border: `1px solid ${palette.border}`,
        }}
      >
        {rank}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-semibold leading-tight truncate">{primary}</div>
        {secondary && (
          <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
            {secondary}
          </div>
        )}
      </div>
      <div
        className="text-[14px] font-bold tabular-nums whitespace-nowrap"
        style={{ color: palette.fg }}
      >
        {value}
        {unit && (
          <span className="text-[9px] font-medium text-muted-foreground ml-0.5">
            {unit}
          </span>
        )}
      </div>
    </div>
  );
};

/**
 * Generička rank lista (Top 5 prihoda, Top 5 zakupnika) — kartica s
 * brojevima, nazivom, mini bar-om za relativni udio, vrijednost desno.
 *
 * items: [{ name, value, hint?, barWidth (0-100) }]
 * valueFormatter: (n) => string
 */
export const RankList = ({ items, valueFormatter, overflow }) => (
  <div className="rounded-lg border border-[#0F5E4D]/20 bg-white p-3">
    {items.map((item, idx) => (
      <div
        key={item.id || idx}
        className="flex items-center gap-3 py-2 border-b last:border-b-0 border-[#0F5E4D]/10"
      >
        <div
          className="w-6 h-6 rounded-full bg-[#0F5E4D]/10 text-[#0F5E4D] text-[11px] font-bold grid place-items-center flex-shrink-0"
        >
          {idx + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold leading-snug break-words">
            {item.name}
          </div>
          {item.hint && (
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {item.hint}
            </div>
          )}
          <div className="h-1.5 mt-1.5 rounded-sm bg-[#0F5E4D]/10 overflow-hidden">
            <div
              className="h-full"
              style={{
                width: `${item.barWidth || 0}%`,
                background: `linear-gradient(90deg, ${RIFORMA_PRIMARY}, ${RIFORMA_ACCENT})`,
              }}
            />
          </div>
        </div>
        <div className="text-sm font-bold text-[#0F5E4D] tabular-nums whitespace-nowrap">
          {valueFormatter ? valueFormatter(item.value) : item.value}
        </div>
      </div>
    ))}
    {overflow > 0 && (
      <div className="pt-2 mt-2 border-t border-dashed border-[#0F5E4D]/20 flex justify-between text-[10px] italic text-muted-foreground">
        <span>… i još {overflow}</span>
        <span>vidi detaljan pregled</span>
      </div>
    )}
  </div>
);

/** Pre-stilizirana data tablica (kao PDF .data-table). */
export const DataTable = ({ children, className = "" }) => (
  <div className={`overflow-x-auto rounded-md border border-[#0F5E4D]/15 ${className}`}>
    <table className="w-full text-sm">
      {children}
    </table>
  </div>
);

export const DataTableHead = ({ children }) => (
  <thead className="bg-[#0F5E4D]/5 text-[#0F5E4D] uppercase text-[10px] tracking-[0.1em] font-bold">
    {children}
  </thead>
);

/** Status pill / badge (varijante: positive / info / warn / danger / neutral). */
export const StatusPill = ({ children, tone = "neutral" }) => {
  const palette = {
    positive: "bg-[#e6f7ee] text-[#0f6a44] border-[#b9e3c9]",
    info: "bg-[#e8f1ee] text-[#0f5e4d] border-[#c0d8d1]",
    warn: "bg-[#fef3c7] text-[#8a5a00] border-[#f6dba0]",
    danger: "bg-[#fde8e8] text-[#b42318] border-[#f3b5b0]",
    neutral: "bg-[#0F5E4D]/5 text-[#4a5660] border-[#0F5E4D]/15",
  };
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-semibold tracking-[0.08em] uppercase border whitespace-nowrap ${palette[tone] || palette.neutral}`}
    >
      {children}
    </span>
  );
};

/** "vs portfelj" + ili - postotak, obojen zeleno (iznad) / narančasto (ispod). */
export const VsPortfolio = ({ pct }) => {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return "—";
  const positive = pct >= 0;
  return (
    <span
      className={`font-semibold ${positive ? "text-[#0f6a44]" : "text-[#b45309]"}`}
    >
      {positive ? "+" : ""}
      {pct.toFixed(1)} %
    </span>
  );
};

/** Status linija (jedna linija teksta, suptilni panel — kao u PDF-u). */
export const StatusLine = ({ items }) => (
  <div className="rounded-md bg-[#0F5E4D]/5 px-4 py-2 my-3 text-sm">
    <span className="font-bold text-[#0F5E4D] uppercase tracking-[0.1em] text-[10px] mr-2">
      Status:
    </span>
    {items.map((it, i) => (
      <React.Fragment key={it.label}>
        <span>
          {it.label} {it.count} ({it.pct} %)
        </span>
        {i < items.length - 1 && (
          <span className="text-muted-foreground mx-1.5">·</span>
        )}
      </React.Fragment>
    ))}
  </div>
);

/** Standard "preuzmi PDF" button — uniformiran across izvještaja. */
export const DownloadPdfButton = ({ onClick, downloading, label = "Preuzmi PDF" }) => (
  <Button
    onClick={onClick}
    disabled={downloading}
    className="bg-[#0F5E4D] hover:bg-[#0B4237] text-white"
  >
    {downloading ? (
      <Loader2 className="h-4 w-4 animate-spin mr-2" />
    ) : (
      <Download className="h-4 w-4 mr-2" />
    )}
    {label}
  </Button>
);

export const REPORT_COLORS = {
  primary: RIFORMA_PRIMARY,
  primaryDark: RIFORMA_PRIMARY_DARK,
  accent: RIFORMA_ACCENT,
};
