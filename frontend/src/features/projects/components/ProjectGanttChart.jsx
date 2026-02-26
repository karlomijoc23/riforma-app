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
} from "date-fns";
import { hr } from "date-fns/locale";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../../components/ui/tooltip";

const ProjectGanttChart = ({ phases = [] }) => {
  // 1. Process phases and determine timeline range
  const { processedPhases, startDate, endDate, totalDays, months } =
    useMemo(() => {
      if (!phases || phases.length === 0) {
        return {
          processedPhases: [],
          startDate: new Date(),
          endDate: new Date(),
          totalDays: 0,
          months: [],
        };
      }

      // Filter valid phases and sort
      const validPhases = phases
        .filter((p) => p.start_date && p.end_date)
        .map((p) => ({
          ...p,
          start: parseISO(p.start_date),
          end: parseISO(p.end_date),
        }))
        .sort((a, b) => a.start - b.start); // Sort by start date

      if (validPhases.length === 0) {
        return {
          processedPhases: [],
          startDate: new Date(),
          endDate: new Date(),
          totalDays: 0,
          months: [],
        };
      }

      // Find min start and max end
      let minStart = validPhases[0].start;
      let maxEnd = validPhases[0].end;

      validPhases.forEach((p) => {
        if (p.start < minStart) minStart = p.start;
        if (p.end > maxEnd) maxEnd = p.end;
      });

      // Add padding (1 month before, 1 month after)
      const timelineStart = startOfMonth(addMonths(minStart, -1));
      const timelineEnd = endOfMonth(addMonths(maxEnd, 1));
      const days = differenceInDays(timelineEnd, timelineStart) + 1;

      // Generate months for header
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
      };
    }, [phases]);

  if (processedPhases.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex h-64 items-center justify-center rounded-lg border border-dashed p-8 text-muted-foreground">
          <div className="text-center">
            <p>Nema definiranih faza s valjanim datumima.</p>
            <p className="text-sm">
              Dodajte faze s datumom početka i završetka za prikaz Gantt
              grafikona.
            </p>
          </div>
        </div>
        {phases.length > 0 && (
          <div className="rounded-md border p-4 bg-yellow-50">
            <h4 className="font-semibold text-yellow-800 mb-2">
              Pronađene faze s neispravnim podacima (nevidljive na grafu):
            </h4>
            <ul className="list-disc pl-5 space-y-1">
              {phases
                .filter((p) => !p.start_date || !p.end_date)
                .map((p) => (
                  <li key={p.id} className="text-sm text-yellow-700">
                    {p.name} (Status: {p.status}) - Nedostaju datumi:
                    {!p.start_date && " Početak"} {!p.end_date && " Završetak"}
                    <span className="ml-2 text-xs font-mono text-gray-500">
                      {JSON.stringify(p)}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  // Helper to calculate position and width
  const getPositionStyle = (start, end) => {
    const startOffset = differenceInDays(start, startDate);
    const duration = differenceInDays(end, start) + 1;

    const left = (startOffset / totalDays) * 100;
    const width = (duration / totalDays) * 100;

    return {
      left: `${left}%`,
      width: `${width}%`,
    };
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "completed":
        return "bg-emerald-500 hover:bg-emerald-600";
      case "in_progress":
        return "bg-blue-500 hover:bg-blue-600";
      case "delayed":
        return "bg-red-500 hover:bg-red-600";
      default:
        return "bg-slate-400 hover:bg-slate-500"; // pending
    }
  };

  return (
    <div className="w-full border rounded-lg bg-white shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-[800px]">
          {/* Header: Months */}
          <div className="flex border-b bg-muted/30">
            <div className="w-48 flex-shrink-0 border-r p-3 font-semibold text-sm bg-white sticky left-0 z-10">
              Faza
            </div>
            <div className="flex-1 relative h-10">
              {months.map((month, idx) => {
                const mStart = startOfMonth(month);
                const mEnd = endOfMonth(month);
                // Constrain to timeline
                const effectiveStart = mStart < startDate ? startDate : mStart;
                const effectiveEnd = mEnd > endDate ? endDate : mEnd;

                const style = getPositionStyle(effectiveStart, effectiveEnd);

                return (
                  <div
                    key={idx}
                    className="absolute top-0 bottom-0 border-l px-2 py-2 text-xs font-medium text-muted-foreground truncate"
                    style={{ ...style, height: "100%" }}
                  >
                    {format(month, "MMMM yyyy", { locale: hr })}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Body: Phases */}
          <div className="relative">
            {/* Vertical Grid Lines (Background) */}
            <div className="absolute inset-0 flex pointer-events-none">
              <div className="w-48 flex-shrink-0 border-r bg-white sticky left-0 z-10" />
              <div className="flex-1 relative">
                {months.map((month, idx) => {
                  const mStart = startOfMonth(month);
                  const mEnd = endOfMonth(month);
                  const effectiveStart =
                    mStart < startDate ? startDate : mStart;
                  const effectiveEnd = mEnd > endDate ? endDate : mEnd;
                  const style = getPositionStyle(effectiveStart, effectiveEnd);
                  return (
                    <div
                      key={idx}
                      className="absolute top-0 bottom-0 border-l border-dashed border-gray-100"
                      style={{ left: style.left }}
                    />
                  );
                })}
              </div>
            </div>

            {processedPhases.map((phase, idx) => (
              <div
                key={phase.id}
                className="flex border-b items-center hover:bg-slate-50 relative z-0 group h-12"
              >
                {/* Phase Name Column */}
                <div className="w-48 flex-shrink-0 border-r p-3 text-sm font-medium truncate bg-white sticky left-0 z-20 group-hover:bg-slate-50">
                  {phase.name}
                </div>

                {/* Timeline Bar */}
                <div className="flex-1 relative h-full">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className={`absolute top-3 h-6 rounded-md shadow-sm transition-all cursor-pointer ${getStatusColor(phase.status)}`}
                          style={getPositionStyle(phase.start, phase.end)}
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="text-xs">
                          <p className="font-semibold">{phase.name}</p>
                          <p>
                            {format(phase.start, "dd.MM.yyyy")} -{" "}
                            {format(phase.end, "dd.MM.yyyy")}
                          </p>
                          <p className="capitalize text-muted-foreground">
                            {phase.status}
                          </p>
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

      {/* Legend */}
      <div className="flex gap-4 p-3 text-xs border-t bg-muted/10">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-slate-400"></div> Na čekanju
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-blue-500"></div> U tijeku
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-emerald-500"></div> Završeno
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500"></div> Kasni
        </div>
      </div>
    </div>
  );
};

export default ProjectGanttChart;
