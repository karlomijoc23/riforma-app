import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import { api, buildDocumentUrl } from "../../shared/api";
import { toast } from "../../components/ui/sonner";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";

/**
 * Photo gallery scoped to a single property_unit_id.
 *
 * Uses the existing /dokumenti endpoints — uploads create a document with
 * tip="slika_jedinice" + property_unit_id. The backend auto-generates
 * thumb / medium variants on upload and stores their relative URLs in
 * `metadata_json.variants`. We render thumbnails and open the medium
 * variant in a lightbox modal on click.
 */

const variantUrl = (doc, label) => {
  const rel = doc?.metadata_json?.variants?.[label];
  if (!rel) return null;
  const path = rel.replace(/^\/+/, "");
  const backend = process.env.REACT_APP_BACKEND_URL || "";
  return backend ? `${backend}/${path}` : `/${path}`;
};

const photoSrc = (doc, label) =>
  variantUrl(doc, label) || buildDocumentUrl(doc);

const UnitPhotosGallery = ({
  unitId,
  nekretninaId,
  readOnly = false,
  maxThumbs = 4,
}) => {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const fileInputRef = useRef(null);

  const load = useCallback(async () => {
    if (!unitId) return;
    setLoading(true);
    try {
      const res = await api.getDokumentiPropertyUnit(unitId);
      // Only photo documents — other docs (contracts etc.) skip.
      const onlyPhotos = (res.data || []).filter(
        (d) => d.tip === "slika_jedinice" || d.content_type?.startsWith("image/"),
      );
      setPhotos(onlyPhotos);
    } catch (err) {
      console.error("Failed to load unit photos", err);
    } finally {
      setLoading(false);
    }
  }, [unitId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    e.target.value = "";
    setUploading(true);
    let okCount = 0;
    try {
      for (const file of files) {
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`${file.name}: prevelika (max 10 MB).`);
          continue;
        }
        try {
          await api.createDokument({
            file,
            naziv: file.name,
            tip: "slika_jedinice",
            nekretnina_id: nekretninaId,
            property_unit_id: unitId,
          });
          okCount += 1;
        } catch (err) {
          const detail = err?.response?.data?.detail;
          toast.error(
            typeof detail === "string"
              ? `${file.name}: ${detail}`
              : `${file.name}: upload nije uspio.`,
          );
        }
      }
      if (okCount > 0) {
        toast.success(`Učitano ${okCount} slika.`);
        await load();
      }
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (doc) => {
    if (!window.confirm(`Obrisati sliku "${doc.naziv}"?`)) return;
    try {
      await api.deleteDokument(doc.id);
      toast.success("Slika obrisana.");
      await load();
    } catch (err) {
      toast.error("Brisanje nije uspjelo.");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Učitavam slike…
      </div>
    );
  }

  const visible = photos.slice(0, maxThumbs);
  const overflow = photos.length - visible.length;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 items-center">
        {visible.map((doc, idx) => (
          <button
            type="button"
            key={doc.id}
            className="group relative h-16 w-20 rounded-md overflow-hidden border bg-muted/30 hover:ring-2 hover:ring-primary/40 transition"
            onClick={() => setLightboxIndex(idx)}
            title={doc.naziv}
          >
            <img
              src={photoSrc(doc, "thumb")}
              alt={doc.naziv}
              loading="lazy"
              className="h-full w-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          </button>
        ))}
        {overflow > 0 && (
          <button
            type="button"
            onClick={() => setLightboxIndex(maxThumbs)}
            className="h-16 w-20 rounded-md border border-dashed text-xs text-muted-foreground hover:bg-muted/40"
          >
            +{overflow}
          </button>
        )}
        {!readOnly && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="h-16 w-20 flex-col gap-1"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  <span className="text-[10px]">Slika</span>
                </>
              )}
            </Button>
          </>
        )}
        {photos.length === 0 && readOnly && (
          <p className="text-xs text-muted-foreground">Bez slika.</p>
        )}
      </div>

      <Dialog
        open={lightboxIndex !== null}
        onOpenChange={(open) => !open && setLightboxIndex(null)}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="pr-8">
              {photos[lightboxIndex]?.naziv || "Slika"}
              <span className="text-xs text-muted-foreground font-normal ml-2">
                {lightboxIndex + 1}/{photos.length}
              </span>
            </DialogTitle>
          </DialogHeader>
          {photos[lightboxIndex] && (
            <div className="space-y-3">
              <div className="bg-black/5 rounded-md overflow-hidden flex items-center justify-center">
                <img
                  src={photoSrc(photos[lightboxIndex], "medium")}
                  alt={photos[lightboxIndex].naziv}
                  className="max-h-[60vh] w-auto"
                />
              </div>
              <div className="flex flex-wrap gap-2 justify-between items-center">
                <div className="flex gap-2 flex-wrap">
                  {photos.map((p, i) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`h-10 w-12 rounded overflow-hidden border ${
                        i === lightboxIndex
                          ? "ring-2 ring-primary"
                          : "opacity-70 hover:opacity-100"
                      }`}
                      onClick={() => setLightboxIndex(i)}
                    >
                      <img
                        src={photoSrc(p, "thumb")}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
                {!readOnly && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      const doc = photos[lightboxIndex];
                      handleDelete(doc).then(() => {
                        setLightboxIndex((curr) =>
                          curr !== null && curr >= photos.length - 1
                            ? Math.max(0, photos.length - 2)
                            : curr,
                        );
                      });
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-2" /> Obriši
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UnitPhotosGallery;
