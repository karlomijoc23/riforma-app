import React from "react";
import { buildDocumentUrl } from "../../../shared/api";

const DocumentViewer = ({ dokument, heightClass = "h-[60vh] md:h-[72vh]" }) => {
  if (!dokument || !dokument.putanja_datoteke) {
    return (
      <div
        className={`flex ${heightClass} items-center justify-center rounded-xl border border-dashed border-border/50 bg-muted/20 text-sm text-muted-foreground/80`}
      >
        PDF nije dostupan. Preuzmite datoteku putem opcije ispod.
      </div>
    );
  }

  const viewerUrl = `${buildDocumentUrl(dokument)}`;
  const downloadUrl = `${buildDocumentUrl(dokument)}?download=true`;

  return (
    <div className="flex flex-col gap-2">
      <div
        data-document-preview
        className={`w-full overflow-hidden rounded-xl border border-border/60 bg-white shadow-inner ${heightClass}`}
      >
        <object
          data={`${viewerUrl}#toolbar=0&view=FitH`}
          type="application/pdf"
          className="h-full w-full"
          style={{ border: "none" }}
        >
          <iframe
            src={`${viewerUrl}#toolbar=0&view=FitH`}
            title={`Pregled: ${dokument.naziv}`}
            className="h-full w-full"
            loading="lazy"
            style={{ border: "none" }}
          />
          <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-sm text-muted-foreground/80">
            <p>Pregled nije podržan u ovom pregledniku.</p>
            <a
              href={downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
            >
              Preuzmi dokument
            </a>
          </div>
        </object>
      </div>
      <div className="flex justify-end">
        <a
          href={downloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          download
          className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3"
        >
          Preuzmi PDF
        </a>
      </div>
    </div>
  );
};

export default DocumentViewer;
