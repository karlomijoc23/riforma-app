import React from "react";
import { Badge } from "./ui/badge";
import { formatDateTime } from "../shared/formatters";

export const AuditTimelinePanel = ({
  title = "Povijest aktivnosti",
  logs = [],
  loading = false,
  error = null,
  emptyMessage = "Nema dostupnih audit zapisa.",
  className = "",
}) => {
  const classes = ["space-y-3"];
  if (className) {
    classes.push(className);
  }

  const entries = Array.isArray(logs) ? logs : [];

  return (
    <div className={classes.join(" ")}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {loading && (
          <span className="text-xs text-muted-foreground">Učitavam…</span>
        )}
      </div>
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : loading ? (
        <p className="text-xs text-muted-foreground">Molimo pričekajte…</p>
      ) : entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyMessage}</p>
      ) : (
        <ul className="space-y-2">
          {entries.map((log) => {
            const key =
              log.id || log.request_id || `${log.path}-${log.timestamp}`;
            return (
              <li
                key={key}
                className="rounded-lg border border-border/60 bg-background/80 p-3 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className="border-border/70 text-muted-foreground uppercase"
                    >
                      {log.method}
                    </Badge>
                    <span className="font-medium text-foreground">
                      {log.user || "Nepoznati korisnik"}
                    </span>
                    {log.role && (
                      <span className="text-muted-foreground">{log.role}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    {typeof log.duration_ms === "number" && (
                      <span className="text-[11px]">{`${Math.round(log.duration_ms)} ms`}</span>
                    )}
                    <span className="text-[11px]">
                      {formatDateTime(log.timestamp)}
                    </span>
                  </div>
                </div>
                <div className="mt-1 break-words text-muted-foreground/80">
                  <span className="font-medium text-foreground">Ruta:</span>{" "}
                  {log.path}
                </div>
                {Array.isArray(log.scopes) && log.scopes.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-muted-foreground/80">
                    {log.scopes.slice(0, 4).map((scope) => (
                      <Badge
                        key={scope}
                        variant="outline"
                        className="border-dashed border-border/70 text-muted-foreground"
                      >
                        {scope}
                      </Badge>
                    ))}
                    {log.scopes.length > 4 && (
                      <span className="text-muted-foreground/60">
                        +{log.scopes.length - 4}
                      </span>
                    )}
                  </div>
                )}
                {log.changes && (
                  <details className="mt-2 rounded border border-border/40 bg-white/80 p-2">
                    <summary className="cursor-pointer text-[11px] font-semibold text-foreground">
                      Promjene
                    </summary>
                    <pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-[11px] leading-snug text-muted-foreground">
                      {JSON.stringify(log.changes, null, 2)}
                    </pre>
                  </details>
                )}
                {log.request_payload && (
                  <details className="mt-2 rounded border border-border/40 bg-white/80 p-2">
                    <summary className="cursor-pointer text-[11px] font-semibold text-foreground">
                      Payload
                    </summary>
                    <pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-[11px] leading-snug text-muted-foreground">
                      {JSON.stringify(log.request_payload, null, 2)}
                    </pre>
                  </details>
                )}
                {log.message && (
                  <p className="mt-2 text-[11px] text-destructive">
                    {log.message}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
