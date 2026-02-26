import React, { useMemo } from "react";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent } from "../../components/ui/card";
import { Separator } from "../../components/ui/separator";
import {
  UNIT_STATUS_CONFIG,
  computeUnitsSummary,
  getUnitDisplayName,
} from "../../shared/units";
import { formatPercentage } from "../../shared/formatters";

const STATUS_FILTERS = [
  { id: "svi", label: "Svi" },
  { id: "iznajmljeno", label: "Iznajmljeni" },
  { id: "dostupno", label: "Dostupni" },
  { id: "u_odrzavanju", label: "Održavanje" },
];

const UnitStatusMap = ({ units = [], filter = "svi", onFilterChange }) => {
  const visibleUnits = useMemo(() => {
    if (filter === "svi") {
      return units;
    }
    return units.filter((unit) => unit.status === filter);
  }, [units, filter]);

  const summary = useMemo(
    () => computeUnitsSummary(visibleUnits),
    [visibleUnits],
  );

  const groupedByFloor = useMemo(() => {
    const groups = new Map();
    visibleUnits.forEach((unit) => {
      const key = unit.kat || "Nepoznat kat";
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(unit);
    });

    return Array.from(groups.entries())
      .map(([name, groupUnits]) => ({
        name,
        units: groupUnits.sort((a, b) =>
          (a.oznaka || "").localeCompare(b.oznaka || ""),
        ),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "hr"));
  }, [visibleUnits]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((status) => (
          <Button
            key={status.id}
            type="button"
            variant={filter === status.id ? "default" : "outline"}
            onClick={() => onFilterChange?.(status.id)}
            size="sm"
          >
            {status.label}
          </Button>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <SummaryCard
          label="Ukupno jedinica"
          value={summary.total}
          description={`${summary.leased} iznajmljeno`}
        />
        <SummaryCard
          label="Popunjenost"
          value={summary.total ? `${formatPercentage(summary.occupancy)}` : "—"}
          description={`${summary.available} dostupno`}
        />
        <SummaryCard
          label="U održavanju"
          value={summary.maintenance}
          description={`${summary.reserved} rezervirano`}
        />
      </div>

      <div className="space-y-4">
        {groupedByFloor.length === 0 ? (
          <p className="rounded-md border border-dashed border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
            Nema jedinica za odabrani filter.
          </p>
        ) : (
          groupedByFloor.map((group) => (
            <Card
              key={group.name}
              className="border border-border/60 shadow-sm"
            >
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-foreground">
                    {group.name}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge
                      variant="outline"
                      className="rounded-full border-border/60 bg-muted/40 text-muted-foreground"
                    >
                      {group.units.length} jedinica
                    </Badge>
                  </div>
                </div>
                <Separator className="bg-border/60" />
                <div className="flex flex-wrap gap-2">
                  {group.units.map((unit) => (
                    <span
                      key={unit.id}
                      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
                        UNIT_STATUS_CONFIG[unit.status]?.badge ||
                        "border-border bg-muted"
                      }`}
                      title={unit.status}
                    >
                      <span
                        className={`h-2 w-2 rounded-full ${UNIT_STATUS_CONFIG[unit.status]?.dot || "bg-muted-foreground"}`}
                      />
                      {getUnitDisplayName(unit)}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

const SummaryCard = ({ label, value, description }) => (
  <div className="rounded-lg border border-border/60 bg-white p-4 shadow-sm">
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">
      {label}
    </p>
    <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
    {description && (
      <p className="text-xs text-muted-foreground/80">{description}</p>
    )}
  </div>
);

export default UnitStatusMap;
