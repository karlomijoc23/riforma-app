import React, { useCallback, useEffect, useState } from "react";
import { Loader2, Activity } from "lucide-react";
import { api } from "../../shared/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { Button } from "../../components/ui/button";

const PAGE_SIZE = 50;

const formatTimestamp = (value) => {
  if (!value) return "\u2014";
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    return d.toLocaleString("hr-HR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return value;
  }
};

const statusColor = (code) => {
  if (!code) return "";
  if (code >= 500) return "text-red-600";
  if (code >= 400) return "text-amber-600";
  return "text-emerald-600";
};

const methodBadge = (method) => {
  const colors = {
    GET: "bg-blue-100 text-blue-700",
    POST: "bg-green-100 text-green-700",
    PUT: "bg-amber-100 text-amber-700",
    PATCH: "bg-purple-100 text-purple-700",
    DELETE: "bg-red-100 text-red-700",
  };
  return colors[method] || "bg-gray-100 text-gray-700";
};

export default function ActivityLogPage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchLogs = useCallback(async (offset) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getActivityLogs({ skip: offset, limit: PAGE_SIZE });
      setItems(res.data.items || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      setError("Greska pri ucitavanju dnevnika aktivnosti.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs(skip);
  }, [skip, fetchLogs]);

  const currentPage = Math.floor(skip / PAGE_SIZE) + 1;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasPrev = skip > 0;
  const hasNext = skip + PAGE_SIZE < total;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6">
      <Card>
        <CardHeader className="flex flex-row items-center gap-3">
          <Activity className="h-5 w-5 text-primary" />
          <div>
            <CardTitle className="text-lg">Dnevnik aktivnosti</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Pregled svih radnji korisnika na platformi
            </p>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="ml-2 text-sm text-muted-foreground">
                Ucitavanje...
              </span>
            </div>
          ) : error ? (
            <div className="text-center py-16 text-sm text-red-600">
              {error}
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-16 text-sm text-muted-foreground">
              Nema zabilježenih aktivnosti.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Korisnik</TableHead>
                      <TableHead>Akcija</TableHead>
                      <TableHead>Putanja</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-right">Trajanje</TableHead>
                      <TableHead className="text-right">Vrijeme</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id || item.request_id}>
                        <TableCell className="font-medium whitespace-nowrap">
                          {item.user || "\u2014"}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${methodBadge(item.method)}`}
                          >
                            {item.method || "\u2014"}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-[300px] truncate text-muted-foreground text-xs font-mono">
                          {item.path || "\u2014"}
                        </TableCell>
                        <TableCell className="text-center">
                          <span
                            className={`text-xs font-semibold ${statusColor(item.status_code)}`}
                          >
                            {item.status_code ?? "\u2014"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                          {item.duration_ms != null
                            ? `${item.duration_ms} ms`
                            : "\u2014"}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                          {formatTimestamp(item.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between pt-4 border-t mt-4">
                <p className="text-xs text-muted-foreground">
                  Ukupno {total} zapisa &middot; Stranica {currentPage} od{" "}
                  {totalPages || 1}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!hasPrev}
                    onClick={() => setSkip((s) => Math.max(0, s - PAGE_SIZE))}
                  >
                    Prethodno
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!hasNext}
                    onClick={() => setSkip((s) => s + PAGE_SIZE)}
                  >
                    Sljedece
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
