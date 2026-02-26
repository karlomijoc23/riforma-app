import React, { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { api } from "../../../shared/api";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Textarea } from "../../../components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { Checkbox } from "../../../components/ui/checkbox";
import { toast } from "sonner";

const EMPTY_FORM = {
  nekretnina_id: "",
  property_unit_id: "",
  tip_ponude: "iznajmljivanje",
  vrsta: "stan",
  naslov: "",
  opis: "",
  cijena: "",
  cijena_valuta: "EUR",
  cijena_po_m2: "",
  povrsina_m2: "",
  broj_soba: "",
  kat: "",
  adresa: "",
  grad: "",
  opcina: "",
  zip_code: "",
  drzava: "HR",
  namjesteno: false,
  parking_ukljucen: false,
  dostupno_od: "",
  kontakt_ime: "",
  kontakt_telefon: "",
  kontakt_email: "",
  slike: "",
  objavi_na_njuskalo: false,
  objavi_na_index: false,
  status: "nacrt",
};

function formToPayload(form) {
  const payload = {
    nekretnina_id: form.nekretnina_id,
    tip_ponude: form.tip_ponude,
    vrsta: form.vrsta,
    naslov: form.naslov,
    opis: form.opis || null,
    cijena: parseFloat(form.cijena) || 0,
    cijena_valuta: form.cijena_valuta,
    cijena_po_m2: form.cijena_po_m2 ? parseFloat(form.cijena_po_m2) : null,
    povrsina_m2: form.povrsina_m2 ? parseFloat(form.povrsina_m2) : null,
    broj_soba: form.broj_soba ? parseFloat(form.broj_soba) : null,
    kat: form.kat || null,
    adresa: form.adresa || null,
    grad: form.grad || null,
    opcina: form.opcina || null,
    zip_code: form.zip_code || null,
    drzava: form.drzava || "HR",
    namjesteno: form.namjesteno,
    parking_ukljucen: form.parking_ukljucen,
    dostupno_od: form.dostupno_od || null,
    kontakt_ime: form.kontakt_ime || null,
    kontakt_telefon: form.kontakt_telefon || null,
    kontakt_email: form.kontakt_email || null,
    status: form.status,
  };

  // property_unit_id — optional
  if (form.property_unit_id) payload.property_unit_id = form.property_unit_id;

  // Slike — jedna po liniji
  const slike = form.slike
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  payload.slike = slike.length > 0 ? slike : null;

  // Portali
  const portali = [];
  if (form.objavi_na_njuskalo) portali.push("njuskalo");
  if (form.objavi_na_index) portali.push("index");
  payload.objavi_na = portali.length > 0 ? portali : null;

  return payload;
}

function oglasToForm(oglas) {
  return {
    nekretnina_id: oglas.nekretnina_id || "",
    property_unit_id: oglas.property_unit_id || "",
    tip_ponude: oglas.tip_ponude || "iznajmljivanje",
    vrsta: oglas.vrsta || "stan",
    naslov: oglas.naslov || "",
    opis: oglas.opis || "",
    cijena: oglas.cijena != null ? String(oglas.cijena) : "",
    cijena_valuta: oglas.cijena_valuta || "EUR",
    cijena_po_m2: oglas.cijena_po_m2 != null ? String(oglas.cijena_po_m2) : "",
    povrsina_m2: oglas.povrsina_m2 != null ? String(oglas.povrsina_m2) : "",
    broj_soba: oglas.broj_soba != null ? String(oglas.broj_soba) : "",
    kat: oglas.kat || "",
    adresa: oglas.adresa || "",
    grad: oglas.grad || "",
    opcina: oglas.opcina || "",
    zip_code: oglas.zip_code || "",
    drzava: oglas.drzava || "HR",
    namjesteno: oglas.namjesteno || false,
    parking_ukljucen: oglas.parking_ukljucen || false,
    dostupno_od: oglas.dostupno_od ? oglas.dostupno_od.slice(0, 10) : "",
    kontakt_ime: oglas.kontakt_ime || "",
    kontakt_telefon: oglas.kontakt_telefon || "",
    kontakt_email: oglas.kontakt_email || "",
    slike: (oglas.slike || []).join("\n"),
    objavi_na_njuskalo: (oglas.objavi_na || []).includes("njuskalo"),
    objavi_na_index: (oglas.objavi_na || []).includes("index"),
    status: oglas.status || "nacrt",
  };
}

export default function OglasDialog({ open, onOpenChange, oglas, onSaved }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [nekretnine, setNekretnine] = useState([]);
  const [units, setUnits] = useState([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const isEditing = !!oglas;

  // Load nekretnine on open
  useEffect(() => {
    if (!open) return;
    api
      .getNekretnine()
      .then((r) => setNekretnine(r.data?.items || r.data || []))
      .catch(() => {});
  }, [open]);

  // Reset form when dialog opens / oglas changes
  useEffect(() => {
    if (!open) return;
    if (oglas) {
      setForm(oglasToForm(oglas));
    } else {
      setForm(EMPTY_FORM);
    }
    setErrors({});
  }, [open, oglas]);

  // Load units when nekretnina changes
  useEffect(() => {
    if (!form.nekretnina_id) {
      setUnits([]);
      return;
    }
    api
      .getUnitsForProperty(form.nekretnina_id)
      .then((r) => setUnits(r.data || []))
      .catch(() => setUnits([]));
  }, [form.nekretnina_id]);

  const handleChange = (key, value) => {
    setForm((prev) => {
      const updated = { ...prev, [key]: value };
      // Reset unit when nekretnina changes
      if (key === "nekretnina_id") updated.property_unit_id = "";
      return updated;
    });
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: null }));
  };

  const validate = () => {
    const errs = {};
    if (!form.nekretnina_id) errs.nekretnina_id = "Obavezno polje";
    if (!form.naslov.trim()) errs.naslov = "Obavezno polje";
    if (!form.cijena || isNaN(parseFloat(form.cijena)))
      errs.cijena = "Unesite ispravnu cijenu";
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setSaving(true);
    try {
      const payload = formToPayload(form);
      if (isEditing) {
        await api.updateOglas(oglas.id, payload);
        toast.success("Oglas ažuriran");
      } else {
        await api.createOglas(payload);
        toast.success("Oglas kreiran");
      }
      window.dispatchEvent(
        new CustomEvent("entity:invalidate", {
          detail: { resource: "oglasi" },
        }),
      );
      onSaved();
    } catch (err) {
      const msg = err?.response?.data?.detail || "Greška pri spremanju oglasa";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Uredi oglas" : "Novi oglas"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* ── Nekretnina + jedinica ── */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Nekretnina
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>
                  Nekretnina <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={form.nekretnina_id}
                  onValueChange={(v) => handleChange("nekretnina_id", v)}
                >
                  <SelectTrigger
                    className={errors.nekretnina_id ? "border-destructive" : ""}
                  >
                    <SelectValue placeholder="Odaberite nekretninu" />
                  </SelectTrigger>
                  <SelectContent>
                    {nekretnine.map((n) => (
                      <SelectItem key={n.id} value={n.id}>
                        {n.naziv}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.nekretnina_id && (
                  <p className="text-xs text-destructive">
                    {errors.nekretnina_id}
                  </p>
                )}
              </div>

              {units.length > 0 && (
                <div className="space-y-1">
                  <Label>Jedinica / stan</Label>
                  <Select
                    value={form.property_unit_id || "_none"}
                    onValueChange={(v) =>
                      handleChange("property_unit_id", v === "_none" ? "" : v)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Nije odabrano" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Nije odabrano</SelectItem>
                      {units.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.naziv || u.oznaka}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </section>

          {/* ── Osnovni podaci ── */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Oglas
            </h3>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Tip ponude</Label>
                <Select
                  value={form.tip_ponude}
                  onValueChange={(v) => handleChange("tip_ponude", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="iznajmljivanje">
                      Iznajmljivanje
                    </SelectItem>
                    <SelectItem value="prodaja">Prodaja</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Vrsta nekretnine</Label>
                <Select
                  value={form.vrsta}
                  onValueChange={(v) => handleChange("vrsta", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stan">Stan</SelectItem>
                    <SelectItem value="kuca">Kuća</SelectItem>
                    <SelectItem value="poslovni_prostor">
                      Poslovni prostor
                    </SelectItem>
                    <SelectItem value="garaža">Garaža</SelectItem>
                    <SelectItem value="parking">Parking</SelectItem>
                    <SelectItem value="zemljiste">Zemljište</SelectItem>
                    <SelectItem value="ostalo">Ostalo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label>
                Naslov <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.naslov}
                onChange={(e) => handleChange("naslov", e.target.value)}
                placeholder="npr. Lijepi stan u centru Zagreba, 2 sobe"
                className={errors.naslov ? "border-destructive" : ""}
              />
              {errors.naslov && (
                <p className="text-xs text-destructive">{errors.naslov}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label>Opis</Label>
              <Textarea
                value={form.opis}
                onChange={(e) => handleChange("opis", e.target.value)}
                rows={4}
                placeholder="Detaljan opis nekretnine..."
              />
            </div>
          </section>

          {/* ── Cijena ── */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Cijena
            </h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label>
                  Cijena <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={form.cijena}
                  onChange={(e) => handleChange("cijena", e.target.value)}
                  placeholder="0"
                  className={errors.cijena ? "border-destructive" : ""}
                />
                {errors.cijena && (
                  <p className="text-xs text-destructive">{errors.cijena}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Valuta</Label>
                <Select
                  value={form.cijena_valuta}
                  onValueChange={(v) => handleChange("cijena_valuta", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="HRK">HRK</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Cijena/m²</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.cijena_po_m2}
                  onChange={(e) => handleChange("cijena_po_m2", e.target.value)}
                  placeholder="Auto"
                />
              </div>
            </div>
          </section>

          {/* ── Površina i detalji ── */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Detalji
            </h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label>Površina (m²)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  value={form.povrsina_m2}
                  onChange={(e) => handleChange("povrsina_m2", e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1">
                <Label>Broj soba</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  value={form.broj_soba}
                  onChange={(e) => handleChange("broj_soba", e.target.value)}
                  placeholder="npr. 2.5"
                />
              </div>
              <div className="space-y-1">
                <Label>Kat</Label>
                <Input
                  value={form.kat}
                  onChange={(e) => handleChange("kat", e.target.value)}
                  placeholder="npr. 3/5"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-6 pt-1">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={form.namjesteno}
                  onCheckedChange={(v) => handleChange("namjesteno", !!v)}
                />
                Namješteno
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={form.parking_ukljucen}
                  onCheckedChange={(v) => handleChange("parking_ukljucen", !!v)}
                />
                Parking uključen
              </label>
            </div>

            <div className="space-y-1">
              <Label>Dostupno od</Label>
              <Input
                type="date"
                value={form.dostupno_od}
                onChange={(e) => handleChange("dostupno_od", e.target.value)}
              />
            </div>
          </section>

          {/* ── Lokacija ── */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Lokacija
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Adresa</Label>
                <Input
                  value={form.adresa}
                  onChange={(e) => handleChange("adresa", e.target.value)}
                  placeholder="Ulica i broj"
                />
              </div>
              <div className="space-y-1">
                <Label>Grad</Label>
                <Input
                  value={form.grad}
                  onChange={(e) => handleChange("grad", e.target.value)}
                  placeholder="Zagreb"
                />
              </div>
              <div className="space-y-1">
                <Label>Općina / Četvrt</Label>
                <Input
                  value={form.opcina}
                  onChange={(e) => handleChange("opcina", e.target.value)}
                  placeholder="Gornji grad"
                />
              </div>
              <div className="space-y-1">
                <Label>Poštanski broj</Label>
                <Input
                  value={form.zip_code}
                  onChange={(e) => handleChange("zip_code", e.target.value)}
                  placeholder="10000"
                />
              </div>
            </div>
          </section>

          {/* ── Kontakt ── */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Kontakt
            </h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label>Ime</Label>
                <Input
                  value={form.kontakt_ime}
                  onChange={(e) => handleChange("kontakt_ime", e.target.value)}
                  placeholder="Ime kontakta"
                />
              </div>
              <div className="space-y-1">
                <Label>Telefon</Label>
                <Input
                  value={form.kontakt_telefon}
                  onChange={(e) =>
                    handleChange("kontakt_telefon", e.target.value)
                  }
                  placeholder="+385 1 234 5678"
                />
              </div>
              <div className="space-y-1">
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={form.kontakt_email}
                  onChange={(e) =>
                    handleChange("kontakt_email", e.target.value)
                  }
                  placeholder="kontakt@firma.hr"
                />
              </div>
            </div>
          </section>

          {/* ── Slike ── */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Slike
            </h3>
            <div className="space-y-1">
              <Label>URL-ovi slika (jedan po retku, max. 20)</Label>
              <Textarea
                value={form.slike}
                onChange={(e) => handleChange("slike", e.target.value)}
                rows={3}
                placeholder={
                  "/uploads/nekretnine/slika1.jpg\n/uploads/nekretnine/slika2.jpg"
                }
                className="font-mono text-xs"
              />
            </div>
          </section>

          {/* ── Portali i status ── */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Objava i status
            </h3>
            <div className="flex flex-wrap gap-6">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={form.objavi_na_njuskalo}
                  onCheckedChange={(v) =>
                    handleChange("objavi_na_njuskalo", !!v)
                  }
                />
                Njuškalo
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={form.objavi_na_index}
                  onCheckedChange={(v) => handleChange("objavi_na_index", !!v)}
                />
                Index oglasi
              </label>
            </div>
            <div className="space-y-1">
              <Label>Status oglasa</Label>
              <Select
                value={form.status}
                onValueChange={(v) => handleChange("status", v)}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nacrt">Nacrt</SelectItem>
                  <SelectItem value="aktivan">Aktivan</SelectItem>
                  <SelectItem value="pauziran">Pauziran</SelectItem>
                  <SelectItem value="arhiviran">Arhiviran</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </section>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Odustani
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? "Spremi promjene" : "Kreiraj oglas"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
