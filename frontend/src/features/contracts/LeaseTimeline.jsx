import React, { useMemo, useRef, useState } from "react";
import { formatContractDate } from "../../shared/formatters";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../components/ui/tooltip";
import { Badge } from "../../components/ui/badge";
import { Building, AlertCircle } from "lucide-react";

const STATUS_COLORS = {
  aktivno: {
    bg: "bg-emerald-500",
    border: "border-emerald-600",
    text: "text-emerald-700",
    label: "Aktivno",
  },
  na_isteku: {
    bg: "bg-amber-400",
    border: "border-amber-500",
    text: "text-amber-700",
    label: "Na isteku",
  },
  istekao: {
    bg: "bg-slate-300",
    border: "border-slate-400",
    text: "text-slate-600",
    label: "Istekao",
  },
  raskinuto: {
    bg: "bg-slate-200",
    border: "border-slate-300",
    text: "text-slate-500",
    label: "Raskinuto",
  },
  arhivirano: {
    bg: "bg-slate-200",
    border: "border-slate-300",
    text: "text-slate-500",
    label: "Arhivirano",
  },
};

const MONTH_NAMES_HR = [
  "Sij",
  "Velj",
  "Ozuj",
  "Tra",
  "Svi",
  "Lip",
  "Srp",
  "Kol",
  "Ruj",
  "Lis",
  "Stu",
  "Pro",
];

/**
 * LeaseTimeline - a horizontal bar timeline of contracts grouped by property.
 * Pure CSS/Tailwind implementation with no chart library.
 */
const LeaseTimeline = ({ ugovori, nekretnine }) => {
  const scrollRef = useRef(null);
  const [hoveredContract, setHoveredContract] = useState(null);

  // Only show contracts with valid date ranges
  const validContracts = useMemo(
    () =>
      ugovori.filter(
        (u) =>
          u.datum_pocetka &&
          u.datum_zavrsetka &&
          u.status !== "arhivirano" &&
          u.status !== "raskinuto",
      ),
    [ugovori],
  );

  // Group contracts by nekretnina_id
  const grouped = useMemo(() => {
    const map = {};
    validContracts.forEach((u) => {
      const key = u.nekretnina_id || "_none";
      if (!map[key]) map[key] = [];
      map[key].push(u);
    });
    // Sort contracts within each group by start date
    Object.values(map).forEach((arr) =>
      arr.sort((a, b) => new Date(a.datum_pocetka) - new Date(b.datum_pocetka)),
    );
    return map;
  }, [validContracts]);

  // Calculate the global time range
  const { timelineStart, timelineEnd, totalMonths, monthHeaders } =
    useMemo(() => {
      if (validContracts.length === 0) {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 12, 1);
        return {
          timelineStart: start,
          timelineEnd: end,
          totalMonths: 12,
          monthHeaders: [],
        };
      }

      let earliest = Infinity;
      let latest = -Infinity;
      validContracts.forEach((u) => {
        const s = new Date(u.datum_pocetka).getTime();
        const e = new Date(u.datum_zavrsetka).getTime();
        if (s < earliest) earliest = s;
        if (e > latest) latest = e;
      });

      // Start from first day of earliest month, end 3 months after latest
      const startDate = new Date(earliest);
      const start = new Date(startDate.getFullYear(), startDate.getMonth(), 1);

      const endDate = new Date(latest);
      const end = new Date(endDate.getFullYear(), endDate.getMonth() + 4, 1);

      // Calculate total months
      const months =
        (end.getFullYear() - start.getFullYear()) * 12 +
        (end.getMonth() - start.getMonth());

      // Generate month headers
      const headers = [];
      const cursor = new Date(start);
      for (let i = 0; i < months; i++) {
        headers.push({
          year: cursor.getFullYear(),
          month: cursor.getMonth(),
          label: MONTH_NAMES_HR[cursor.getMonth()],
          isJanuary: cursor.getMonth() === 0,
        });
        cursor.setMonth(cursor.getMonth() + 1);
      }

      return {
        timelineStart: start,
        timelineEnd: end,
        totalMonths: months,
        monthHeaders: headers,
      };
    }, [validContracts]);

  // Helper: convert a date to a percentage position within the timeline
  const dateToPercent = (dateStr) => {
    const date = new Date(dateStr);
    const totalMs = timelineEnd.getTime() - timelineStart.getTime();
    if (totalMs === 0) return 0;
    const elapsed = date.getTime() - timelineStart.getTime();
    return Math.max(0, Math.min(100, (elapsed / totalMs) * 100));
  };

  // Find gaps between contracts for a given property
  const findGaps = (contracts) => {
    if (contracts.length === 0) return [];
    const gaps = [];
    const sorted = [...contracts].sort(
      (a, b) => new Date(a.datum_pocetka) - new Date(b.datum_pocetka),
    );

    for (let i = 0; i < sorted.length - 1; i++) {
      const currentEnd = new Date(sorted[i].datum_zavrsetka);
      const nextStart = new Date(sorted[i + 1].datum_pocetka);
      // Gap if next starts after current ends (with 1 day tolerance)
      const diffDays = (nextStart - currentEnd) / (1000 * 60 * 60 * 24);
      if (diffDays > 1) {
        gaps.push({
          start: sorted[i].datum_zavrsetka,
          end: sorted[i + 1].datum_pocetka,
          days: Math.round(diffDays),
        });
      }
    }
    return gaps;
  };

  // Width per month in pixels (for scrollable timeline)
  const MONTH_WIDTH = 80;
  const timelineWidth = totalMonths * MONTH_WIDTH;

  // Sort properties by name
  const sortedPropertyIds = useMemo(() => {
    return Object.keys(grouped).sort((a, b) => {
      const nameA =
        nekretnine.find((n) => n.id === a)?.naziv || "Nepoznata nekretnina";
      const nameB =
        nekretnine.find((n) => n.id === b)?.naziv || "Nepoznata nekretnina";
      return nameA.localeCompare(nameB, "hr");
    });
  }, [grouped, nekretnine]);

  if (validContracts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed rounded-xl bg-muted/30">
        <AlertCircle className="h-8 w-8 text-muted-foreground/50 mb-2" />
        <p className="text-sm text-muted-foreground">
          Nema ugovora s valjanim datumima za prikaz na vremenskoj crti.
        </p>
      </div>
    );
  }

  // Today marker position
  const todayPercent = dateToPercent(new Date().toISOString());

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-6 rounded-sm bg-emerald-500" />
            <span>Aktivno</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-6 rounded-sm bg-amber-400" />
            <span>Na isteku</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-6 rounded-sm bg-slate-300" />
            <span>Istekao</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-6 rounded-sm border-2 border-dashed border-red-400 bg-red-50" />
            <span>Praznina</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-6 w-px bg-blue-500" />
            <span>Danas</span>
          </div>
        </div>

        {/* Timeline container */}
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="flex">
            {/* Property names column (fixed) */}
            <div className="shrink-0 w-48 border-r bg-muted/30 z-10">
              {/* Header spacer */}
              <div className="h-10 border-b px-3 flex items-center">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Nekretnina
                </span>
              </div>
              {/* Property labels */}
              {sortedPropertyIds.map((propId) => {
                const property = nekretnine.find((n) => n.id === propId);
                const contractCount = grouped[propId].length;
                return (
                  <div
                    key={propId}
                    className="h-14 border-b px-3 flex flex-col justify-center"
                  >
                    <div className="flex items-center gap-1.5">
                      <Building className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium truncate">
                        {property?.naziv || "Nepoznata"}
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground ml-5">
                      {contractCount}{" "}
                      {contractCount === 1 ? "ugovor" : "ugovora"}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Scrollable timeline area */}
            <div className="flex-1 overflow-x-auto" ref={scrollRef}>
              <div style={{ minWidth: `${timelineWidth}px` }}>
                {/* Month/year header */}
                <div className="h-10 border-b flex relative">
                  {monthHeaders.map((header, idx) => (
                    <div
                      key={idx}
                      className={`shrink-0 flex flex-col justify-center px-1 text-center border-r border-border/40 ${
                        header.isJanuary
                          ? "bg-muted/50 border-l border-l-border"
                          : ""
                      }`}
                      style={{ width: `${MONTH_WIDTH}px` }}
                    >
                      {header.isJanuary && (
                        <span className="text-[10px] font-bold text-foreground leading-none">
                          {header.year}
                        </span>
                      )}
                      <span
                        className={`text-[10px] leading-none ${header.isJanuary ? "text-foreground font-medium" : "text-muted-foreground"}`}
                      >
                        {header.label}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Timeline rows */}
                {sortedPropertyIds.map((propId) => {
                  const contracts = grouped[propId];
                  const gaps = findGaps(contracts);

                  return (
                    <div
                      key={propId}
                      className="h-14 border-b relative group/row"
                    >
                      {/* Month grid lines */}
                      <div className="absolute inset-0 flex pointer-events-none">
                        {monthHeaders.map((header, idx) => (
                          <div
                            key={idx}
                            className={`shrink-0 border-r ${
                              header.isJanuary
                                ? "border-border/60"
                                : "border-border/20"
                            }`}
                            style={{ width: `${MONTH_WIDTH}px` }}
                          />
                        ))}
                      </div>

                      {/* Today marker */}
                      <div
                        className="absolute top-0 bottom-0 w-px bg-blue-500/60 z-20 pointer-events-none"
                        style={{ left: `${todayPercent}%` }}
                      />

                      {/* Gap indicators */}
                      {gaps.map((gap, idx) => {
                        const left = dateToPercent(gap.start);
                        const right = dateToPercent(gap.end);
                        const width = right - left;
                        if (width < 0.2) return null;
                        return (
                          <Tooltip key={`gap-${idx}`}>
                            <TooltipTrigger asChild>
                              <div
                                className="absolute top-2 bottom-2 border-2 border-dashed border-red-400/60 bg-red-50/40 rounded-sm z-10 cursor-default"
                                style={{
                                  left: `${left}%`,
                                  width: `${width}%`,
                                }}
                              />
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="text-center">
                                <p className="font-semibold text-red-200">
                                  Praznina: {gap.days} dana
                                </p>
                                <p className="text-[10px] opacity-80">
                                  {formatContractDate(gap.start)} -{" "}
                                  {formatContractDate(gap.end)}
                                </p>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}

                      {/* Contract bars */}
                      {contracts.map((contract) => {
                        const left = dateToPercent(contract.datum_pocetka);
                        const right = dateToPercent(contract.datum_zavrsetka);
                        const width = right - left;
                        const colors =
                          STATUS_COLORS[contract.status] ||
                          STATUS_COLORS.istekao;
                        const isHovered = hoveredContract === contract.id;

                        return (
                          <Tooltip key={contract.id}>
                            <TooltipTrigger asChild>
                              <div
                                className={`absolute top-3 bottom-3 rounded-md border cursor-pointer transition-all ${colors.bg} ${colors.border} ${
                                  isHovered
                                    ? "ring-2 ring-primary/40 shadow-md scale-y-110 z-30"
                                    : "z-10 hover:ring-2 hover:ring-primary/30 hover:shadow-sm"
                                }`}
                                style={{
                                  left: `${left}%`,
                                  width: `${Math.max(width, 0.4)}%`,
                                }}
                                onMouseEnter={() =>
                                  setHoveredContract(contract.id)
                                }
                                onMouseLeave={() => setHoveredContract(null)}
                              >
                                {/* Show label if bar is wide enough */}
                                {width > 5 && (
                                  <div className="absolute inset-0 flex items-center px-1.5 overflow-hidden">
                                    <span className="text-[10px] font-medium text-white truncate drop-shadow-sm">
                                      {contract.zakupnik_naziv ||
                                        contract.interna_oznaka ||
                                        ""}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <div className="space-y-1">
                                <p className="font-semibold">
                                  {contract.interna_oznaka || "Bez oznake"}
                                </p>
                                {contract.zakupnik_naziv && (
                                  <p className="text-[11px] opacity-90">
                                    {contract.zakupnik_naziv}
                                  </p>
                                )}
                                <div className="flex items-center gap-2 text-[10px] opacity-80">
                                  <span>
                                    {formatContractDate(contract.datum_pocetka)}
                                  </span>
                                  <span>-</span>
                                  <span>
                                    {formatContractDate(
                                      contract.datum_zavrsetka,
                                    )}
                                  </span>
                                </div>
                                <Badge
                                  variant="outline"
                                  className="text-[10px] h-4 bg-white/20 border-white/30 text-white"
                                >
                                  {colors.label}
                                </Badge>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default LeaseTimeline;
