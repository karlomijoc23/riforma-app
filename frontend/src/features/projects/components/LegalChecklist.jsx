import React from "react";
import { FileText, Upload, CheckCircle, AlertOctagon } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import { formatDate } from "../../../shared/formatters";

const DocStatusBadge = ({ status }) => {
  const map = {
    pending: "bg-gray-100 text-gray-600",
    submitted: "bg-blue-100 text-blue-700",
    approved: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
  };
  const labelMap = {
    pending: "Nedostaje",
    submitted: "Predano",
    approved: "Odobreno",
    rejected: "Odbijeno",
  };
  return (
    <Badge variant="secondary" className={map[status] || ""}>
      {labelMap[status] || status}
    </Badge>
  );
};

export default function LegalChecklist({ documents = [], onUpload }) {
  if (documents.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        Nema definiranih pravnih dokumenata.
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Dokument</TableHead>
            <TableHead>Tip</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Vrijedi do</TableHead>
            <TableHead className="text-right">Akcija</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.map((doc) => (
            <TableRow key={doc.id}>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  {doc.name}
                </div>
              </TableCell>
              <TableCell>{doc.type}</TableCell>
              <TableCell>
                <DocStatusBadge status={doc.status} />
              </TableCell>
              <TableCell>
                {doc.expiry_date ? formatDate(doc.expiry_date) : "—"}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onUpload && onUpload(doc)}
                >
                  <Upload className="mr-2 h-3 w-3" />
                  Upload
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
