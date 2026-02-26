import React, { useState, useCallback, useRef } from "react";
import { api, getErrorMessage } from "../shared/api";
import { toast } from "./ui/sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";

const PREVIEW_ROWS = 5;

const ImportDialog = ({ open, onOpenChange, endpoint, title, onSuccess }) => {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const reset = useCallback(() => {
    setFile(null);
    setPreview(null);
    setImporting(false);
    setResult(null);
    setDragOver(false);
  }, []);

  const handleOpenChange = useCallback(
    (nextOpen) => {
      if (!nextOpen) {
        reset();
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange, reset],
  );

  const parsePreview = useCallback((csvFile) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length === 0) {
        setPreview(null);
        return;
      }
      // Simple CSV parse (handles quoted fields)
      const parseLine = (line) => {
        const result = [];
        let current = "";
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') {
            inQuotes = !inQuotes;
          } else if (ch === "," && !inQuotes) {
            result.push(current.trim());
            current = "";
          } else {
            current += ch;
          }
        }
        result.push(current.trim());
        return result;
      };

      const headers = parseLine(lines[0]);
      const rows = lines
        .slice(1, 1 + PREVIEW_ROWS)
        .map((line) => parseLine(line));
      setPreview({ headers, rows, totalRows: lines.length - 1 });
    };
    reader.readAsText(csvFile);
  }, []);

  const handleFile = useCallback(
    (selectedFile) => {
      if (!selectedFile) return;
      if (!selectedFile.name.endsWith(".csv")) {
        toast.error("Samo CSV datoteke su dozvoljene");
        return;
      }
      setFile(selectedFile);
      setResult(null);
      parsePreview(selectedFile);
    },
    [parsePreview],
  );

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragOver(false);
      const droppedFile = e.dataTransfer?.files?.[0];
      if (droppedFile) handleFile(droppedFile);
    },
    [handleFile],
  );

  const handleImport = useCallback(async () => {
    if (!file || !endpoint) return;
    setImporting(true);
    try {
      const response = await api.importCsv(endpoint, file);
      const data = response.data;
      setResult(data);
      if (data.imported > 0) {
        toast.success(data.message);
        if (onSuccess) onSuccess();
      } else {
        toast.warning("Nijedan zapis nije uvezen");
      }
    } catch (error) {
      const msg = getErrorMessage(error);
      toast.error(msg);
      setResult({ imported: 0, errors: [msg] });
    } finally {
      setImporting(false);
    }
  }, [file, endpoint, onSuccess]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title || "Uvoz podataka"}</DialogTitle>
          <DialogDescription>
            Odaberite CSV datoteku za uvoz. Datoteka mora sadržavati zaglavlje s
            imenima kolona.
          </DialogDescription>
        </DialogHeader>

        {/* Result view */}
        {result ? (
          <div className="space-y-4">
            <div
              className={`flex items-center gap-3 p-4 rounded-lg border ${
                result.imported > 0
                  ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800"
                  : "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800"
              }`}
            >
              {result.imported > 0 ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
              )}
              <span className="font-medium">
                {result.message || `Uvezeno ${result.imported} zapisa`}
              </span>
            </div>

            {result.errors && result.errors.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-medium text-destructive">
                  Greske ({result.errors.length}):
                </p>
                <div className="max-h-40 overflow-y-auto rounded border bg-muted/30 p-3 text-sm space-y-1">
                  {result.errors.map((err, idx) => (
                    <p key={idx} className="text-muted-foreground">
                      {err}
                    </p>
                  ))}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Zatvori
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setResult(null);
                  setFile(null);
                  setPreview(null);
                }}
              >
                Uvezi drugu datoteku
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            {/* Drop zone */}
            <div
              className={`relative flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 transition-colors cursor-pointer ${
                dragOver
                  ? "border-primary bg-primary/5"
                  : file
                    ? "border-emerald-300 bg-emerald-50/50 dark:border-emerald-700 dark:bg-emerald-950/20"
                    : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"
              }`}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
              {file ? (
                <>
                  <FileSpreadsheet className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
                  <div className="text-center">
                    <p className="font-medium">{file.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(file.size / 1024).toFixed(1)} KB
                      {preview ? ` \u2022 ${preview.totalRows} redova` : ""}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <Upload className="h-10 w-10 text-muted-foreground/50" />
                  <div className="text-center">
                    <p className="font-medium">Povucite CSV datoteku ovdje</p>
                    <p className="text-sm text-muted-foreground">
                      ili kliknite za odabir
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Preview table */}
            {preview && preview.rows.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">
                  Pregled (prvih {Math.min(preview.rows.length, PREVIEW_ROWS)}{" "}
                  od {preview.totalRows} redova):
                </p>
                <div className="overflow-x-auto rounded border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50">
                        {preview.headers.map((h, i) => (
                          <th
                            key={i}
                            className="whitespace-nowrap px-3 py-2 text-left font-medium"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((row, ri) => (
                        <tr key={ri} className="border-t">
                          {preview.headers.map((_, ci) => (
                            <td
                              key={ci}
                              className="whitespace-nowrap px-3 py-1.5 text-muted-foreground"
                            >
                              {row[ci] || ""}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Odustani
              </Button>
              <Button onClick={handleImport} disabled={!file || importing}>
                {importing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uvoz u tijeku...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Uvezi
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ImportDialog;
