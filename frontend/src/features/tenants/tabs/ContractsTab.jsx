import React from "react";
import { useNavigate } from "react-router-dom";
import { FileText } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import { Badge } from "../../../components/ui/badge";
import { formatCurrency } from "../../../shared/formatters";

const formatContractDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("hr-HR");
};

const ContractsTab = ({ tenantContracts, nekretnine }) => {
  const navigate = useNavigate();
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Ugovori zakupnika
          </CardTitle>
          <Badge variant="outline">{tenantContracts.length}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {tenantContracts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed rounded-xl bg-muted/30">
            <FileText className="h-8 w-8 text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">
              Nema ugovora za ovog zakupnika
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Broj ugovora</TableHead>
                <TableHead>Nekretnina</TableHead>
                <TableHead>Trajanje</TableHead>
                <TableHead className="text-right">Iznos</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenantContracts.map((c) => {
                const prop = nekretnine.find(
                  (n) => n.id === c.nekretnina_id,
                );
                const isExpiring = (() => {
                  if (!c.datum_zavrsetka) return false;
                  const diff = new Date(c.datum_zavrsetka) - new Date();
                  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
                  return days > 0 && days <= 90;
                })();
                const status =
                  c.status === "aktivno" && isExpiring
                    ? "Na isteku"
                    : c.status;
                return (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/ugovori/${c.id}`)}
                  >
                    <TableCell className="font-mono font-medium text-xs">
                      {c.interna_oznaka || "—"}
                    </TableCell>
                    <TableCell>{prop?.naziv || "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-col text-xs text-muted-foreground">
                        <span>{formatContractDate(c.datum_pocetka)}</span>
                        <span>{formatContractDate(c.datum_zavrsetka)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(c.osnovna_zakupnina)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={
                          status === "Na isteku"
                            ? "warning"
                            : status === "aktivno"
                              ? "default"
                              : "secondary"
                        }
                        className={`capitalize ${status === "Na isteku" ? "bg-amber-500" : ""}`}
                      >
                        {status?.replace("_", " ")}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};

export default ContractsTab;
