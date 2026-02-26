import React, { useMemo } from "react";
import {
  format,
  differenceInDays,
  addMonths,
  startOfMonth,
  endOfMonth,
  isWithinInterval,
  addDays,
  getMonth,
  getYear,
  isValid,
  parseISO,
  isSameDay,
} from "date-fns";
import { hr } from "date-fns/locale";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../../components/ui/tooltip";
import { Card } from "../../../components/ui/card";
import { Badge } from "../../../components/ui/badge";
import { AlertCircle } from "lucide-react";

/**
 * GANTT POWER ENGINE
 * A robust, defensive, and visual Gantt chart component.
 */
const ProjectGanttEngine = ({ phases = [] }) => {
  // 1. Defensive Data Processing
  // - Filter duplicates by ID
  // - Filter invalid dates
  // - Sort by start date
  const {
    processedPhases,
    startDate,
    endDate,
    totalDays,
    months,
    isEmpty,
    invalidCount,
  } = useMemo(() => {
    if (!phases || !Array.isArray(phases)) {
      return {
        processedPhases: [],
        startDate: new Date(),
        endDate: new Date(),
        totalDays: 0,
        months: [],
        isEmpty: true,
        invalidCount: 0,
      };
    }

    const seenIds = new Set();
    const validPhases = [];
    let invalid = 0;

    // Process provided phases
    phases.forEach((p) => {
      // Deduplicate
      if (seenIds.has(p.id)) return;
      seenIds.add(p.id);

      // Validation
      if (!p.start_date || !p.end_date) {
        invalid++;
        return;
      }

      // Parse Dates
      let start, end;
      try {
        // Ensure date string or object
        start =
          typeof p.start_date === "string"
            ? parseISO(p.start_date)
            : p.start_date;
        end =
          typeof p.end_date === "string" ? parseISO(p.end_date) : p.end_date;

        if (!isValid(start) || !isValid(end)) {
          invalid++;
          return;
        }
      } catch (e) {
        invalid++;
        return;
      }

      validPhases.push({
        ...p,
        _validStart: start,
        _validEnd: end,
      });
    });

    if (validPhases.length === 0) {
      return {
        processedPhases: [],
        startDate: new Date(),
        endDate: new Date(),
        totalDays: 0,
        months: [],
        isEmpty: true,
        invalidCount: invalid,
      };
    }

    // Sort chronologically
    validPhases.sort((a, b) => a._validStart - b._validStart);

    // Calculate Timeline Range with padding
    let minStart = validPhases[0]._validStart;
    let maxEnd = validPhases[0]._validEnd;

    validPhases.forEach((p) => {
      if (p._validStart < minStart) minStart = p._validStart;
      if (p._validEnd > maxEnd) maxEnd = p._validEnd;
    });

    const timelineStart = startOfMonth(addMonths(minStart, -1));
    const timelineEnd = endOfMonth(addMonths(maxEnd, 1));
    const days = differenceInDays(timelineEnd, timelineStart) + 1;

    // Generate Month Headers
    const monthHeaders = [];
    let current = timelineStart;
    while (current <= timelineEnd) {
      monthHeaders.push(current);
      current = addMonths(current, 1);
    }

    return {
      processedPhases: validPhases,
      startDate: timelineStart,
      endDate: timelineEnd,
      totalDays: days,
      months: monthHeaders,
      isEmpty: false,
      invalidCount: invalid,
    };
  }, [phases]);

  // Helpers
  const getPositionStyle = (start, end) => {
    const startOffset = differenceInDays(start, startDate);
    const duration = differenceInDays(end, start) + 1;
    const left = (startOffset / totalDays) * 100;
    const width = (duration / totalDays) * 100;
    return { left: `${left}%`, width: `${width}%` };
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "completed":
        return "bg-gradient-to-r from-emerald-500 to-emerald-400 border-emerald-600 shadow-emerald-200/50";
      case "in_progress":
        return "bg-gradient-to-r from-blue-500 to-blue-400 border-blue-600 shadow-blue-200/50";
      case "delayed":
        return "bg-gradient-to-r from-red-500 to-red-400 border-red-600 shadow-red-200/50";
      default:
        return "bg-gradient-to-r from-slate-400 to-slate-300 border-slate-500 shadow-slate-200/50"; // pending
    }
  };

  // Render Empty State
  if (isEmpty) {
    return (
      <div className="space-y-4">
        <div className="flex h-64 flex-col items-center justify-center rounded-xl border-2 border-dashed bg-slate-50/50 p-8 text-center text-muted-foreground animate-in fade-in-50">
          <div className="bg-white p-3 rounded-full mb-4 shadow-sm">
            <AlertCircle className="h-8 w-8 text-slate-400" />
          </div>
          <h3 className="font-semibold text-lg text-slate-900">
            Nema podataka za prikaz
          </h3>
          <p className="text-sm max-w-sm mt-1">
            Gantt dijagram zahtijeva faze s **validnim datumima početka i
            završetka**.
          </p>
          {phases.length > 0 && invalidCount > 0 && (
            <Badge variant="destructive" className="mt-4">
              {invalidCount} faza/e preskočeno (nedostaju datumi)
            </Badge>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Disclaimer for hidden items */}
      {invalidCount > 0 && (
        <div className="bg-amber-50 text-amber-900 px-4 py-2 rounded-md text-sm flex items-center gap-2 border border-amber-200">
          <AlertCircle className="h-4 w-4" />
          <span>
            Postoji {invalidCount} faza koje nisu prikazane jer nemaju
            definirane datume.
          </span>
        </div>
      )}

      {/* Main Gantt Area */}
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <div className="min-w-[800px] inline-block w-full">
            {/* Header Row */}
            <div className="flex border-b h-12 bg-slate-50/80 sticky top-0 z-20 backdrop-blur-sm">
              <div className="w-56 flex-shrink-0 border-r p-3 px-4 font-semibold text-sm text-slate-700 flex items-center bg-slate-50/80 sticky left-0 z-30">
                Faza Projekta
              </div>
              <div className="flex-1 relative">
                {months.map((month, idx) => {
                  // Logic to clamp headers to timeline is complex, so simpler visual:
                  // Render full month headers in flow? No, timeline is absolute percentage based.
                  // We render monthly blocks based on percentage position.
                  const mStart = startOfMonth(month);
                  const mEnd = endOfMonth(month);
                  // Clamp to global timeline
                  const effectiveStart =
                    mStart < startDate ? startDate : mStart;
                  const effectiveEnd = mEnd > endDate ? endDate : mEnd;

                  if (effectiveStart > effectiveEnd) return null;

                  const style = getPositionStyle(effectiveStart, effectiveEnd);

                  return (
                    <div
                      key={idx}
                      className="absolute top-0 bottom-0 border-l border-slate-200 px-2 py-3 text-xs font-bold text-slate-500 truncate uppercase tracking-wider"
                      style={{ ...style, height: "100%" }}
                    >
                      {format(month, "MMMM yyyy", { locale: hr })}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Grid & Rows */}
            <div className="relative">
              {/* Background Grid Lines */}
              <div className="absolute inset-0 flex pointer-events-none z-0">
                <div className="w-56 flex-shrink-0 border-r bg-transparent" />
                <div className="flex-1 relative h-full">
                  {months.map((month, idx) => {
                    const mStart = startOfMonth(month);
                    const mEnd = endOfMonth(month);
                    const effectiveStart =
                      mStart < startDate ? startDate : mStart;
                    const effectiveEnd = mEnd > endDate ? endDate : mEnd;
                    if (effectiveStart > effectiveEnd) return null;
                    const style = getPositionStyle(
                      effectiveStart,
                      effectiveEnd,
                    );

                    return (
                      <div
                        key={`grid-${idx}`}
                        className="absolute top-0 bottom-0 border-l border-slate-100"
                        style={{ left: style.left }}
                      />
                    );
                  })}

                  {/* Current Day Line (if visible) */}
                  {isWithinInterval(new Date(), {
                    start: startDate,
                    end: endDate,
                  }) && (
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-red-400 z-10"
                      style={{
                        left: getPositionStyle(new Date(), new Date()).left,
                      }}
                      title="Danas"
                    />
                  )}
                </div>
              </div>

              {/* Phase Rows */}
              {processedPhases.map((phase, idx) => (
                <div
                  key={phase.id}
                  className="flex border-b last:border-0 hover:bg-slate-50/50 transition-colors h-14 relative z-10 group"
                >
                  {/* Label */}
                  <div className="w-56 flex-shrink-0 border-r p-3 px-4 flex flex-col justify-center bg-white sticky left-0 z-20 group-hover:bg-slate-50/50 border-r-slate-200">
                    <div
                      className="font-medium text-sm text-slate-900 truncate"
                      title={phase.name}
                    >
                      {phase.name}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">
                      {format(phase._validStart, "dd.MM")} -{" "}
                      {format(phase._validEnd, "dd.MM")}
                    </div>
                  </div>

                  {/* Bar Container */}
                  <div className="flex-1 relative h-full my-auto">
                    <TooltipProvider>
                      <Tooltip delayDuration={0}>
                        <TooltipTrigger asChild>
                          <div
                            className={`absolute top-1/2 -translate-y-1/2 h-6 rounded-full border shadow-sm cursor-pointer transition-all hover:scale-y-110 hover:shadow-md ${getStatusColor(phase.status)}`}
                            style={getPositionStyle(
                              phase._validStart,
                              phase._validEnd,
                            )}
                          />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="p-3">
                          <div className="space-y-1">
                            <p className="font-bold text-sm">{phase.name}</p>
                            <div className="text-xs text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-1">
                              <span>Početak:</span>
                              <span className="text-right text-foreground">
                                {format(phase._validStart, "dd.MM.yyyy")}
                              </span>
                              <span>Završetak:</span>
                              <span className="text-right text-foreground">
                                {format(phase._validEnd, "dd.MM.yyyy")}
                              </span>
                              <span>Trajanje:</span>
                              <span className="text-right text-foreground">
                                {differenceInDays(
                                  phase._validEnd,
                                  phase._validStart,
                                ) + 1}{" "}
                                dana
                              </span>
                            </div>
                            <Badge
                              variant="outline"
                              className="mt-2 text-[10px] w-full justify-center capitalize"
                            >
                              {phase.status}
                            </Badge>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Legend Footer */}
      <div className="flex flex-wrap gap-6 text-xs text-slate-600 px-2 justify-end">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-slate-400 border border-slate-500"></span>
          <span>Na čekanju</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-blue-500 border border-blue-600"></span>
          <span>U tijeku</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-emerald-500 border border-emerald-600"></span>
          <span>Završeno</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-500 border border-red-600"></span>
          <span>Kasni</span>
        </div>
        <div className="flex items-center gap-2 ml-4">
          <div className="w-0.5 h-4 bg-red-400"></div>
          <span>Danas</span>
        </div>
      </div>
    </div>
  );
};

export default ProjectGanttEngine;
