import React, { useCallback, useMemo, useState, useEffect } from "react";
import { Label } from "../../components/ui/label";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../../components/ui/accordion";
import { Trash2, Plus } from "lucide-react";
import { Checkbox } from "../../components/ui/checkbox";
import { toast } from "../../components/ui/sonner";

const ZakupnikForm = ({
  zakupnik,
  onSubmit,
  onCancel,
  submitting = false,
  defaultTip = "zakupnik",
}) => {
  const makeLocalId = useCallback(() => {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `kontakt-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  }, []);

  const initialState = useMemo(() => {
    const tip = zakupnik?.tip || defaultTip || "zakupnik";
    const primaryContact = zakupnik?.kontakt_osobe?.[0] || null;

    const form = {
      tip,
      naziv_firme: zakupnik?.naziv_firme || "",
      ime_prezime: zakupnik?.ime_prezime || "",
      oib: zakupnik?.oib || "",
      sjediste: zakupnik?.sjediste || "",
      adresa_ulica: zakupnik?.adresa_ulica || "",
      adresa_kucni_broj: zakupnik?.adresa_kucni_broj || "",
      adresa_postanski_broj: zakupnik?.adresa_postanski_broj || "",
      adresa_grad: zakupnik?.adresa_grad || "",
      adresa_drzava: zakupnik?.adresa_drzava || "",
      kontakt_ime: primaryContact?.ime || zakupnik?.kontakt_ime || "",
      kontakt_email: primaryContact?.email || zakupnik?.kontakt_email || "",
      kontakt_telefon:
        primaryContact?.telefon || zakupnik?.kontakt_telefon || "",
      iban: zakupnik?.iban || "",
      pdv_obveznik: Boolean(zakupnik?.pdv_obveznik),
      pdv_id: zakupnik?.pdv_id || "",
      maticni_broj: zakupnik?.maticni_broj || "",
      registracijski_broj: zakupnik?.registracijski_broj || "",
      eracun_dostava_kanal: zakupnik?.eracun_dostava_kanal || "",
      eracun_identifikator: zakupnik?.eracun_identifikator || "",
      eracun_email: zakupnik?.eracun_email || "",
      eracun_posrednik: zakupnik?.eracun_posrednik || "",
      fiskalizacija_napomena: zakupnik?.fiskalizacija_napomena || "",
      odgovorna_osoba: zakupnik?.odgovorna_osoba || "",
      status: zakupnik?.status || "aktivan",
      primary_uloga: primaryContact?.uloga || "",
      primary_preferirani_kanal: primaryContact?.preferirani_kanal || "",
      primary_napomena: primaryContact?.napomena || "",
      hitnost_odziva_sati:
        primaryContact?.hitnost_odziva_sati != null
          ? String(primaryContact.hitnost_odziva_sati)
          : zakupnik?.hitnost_odziva_sati != null
            ? String(zakupnik.hitnost_odziva_sati)
            : "",
      oznake_input: Array.isArray(zakupnik?.oznake)
        ? zakupnik.oznake.join(", ")
        : "",
      opis_usluge: zakupnik?.opis_usluge || "",
      radno_vrijeme: zakupnik?.radno_vrijeme || "",
      biljeske: zakupnik?.biljeske || "",
    };

    const contacts = (zakupnik?.kontakt_osobe || [])
      .slice(1)
      .map((kontakt) => ({
        localId: kontakt.id || makeLocalId(),
        id: kontakt.id || null,
        ime: kontakt.ime || "",
        uloga: kontakt.uloga || "",
        email: kontakt.email || "",
        telefon: kontakt.telefon || "",
        napomena: kontakt.napomena || "",
        preferirani_kanal: kontakt.preferirani_kanal || "",
        hitnost_odziva_sati:
          kontakt.hitnost_odziva_sati != null
            ? String(kontakt.hitnost_odziva_sati)
            : "",
      }));

    return { form, contacts };
  }, [zakupnik, defaultTip, makeLocalId]);

  const [formData, setFormData] = useState(initialState.form);
  const [extraContacts, setExtraContacts] = useState(initialState.contacts);

  useEffect(() => {
    setFormData(initialState.form);
    setExtraContacts(initialState.contacts);
  }, [initialState]);

  const resolvedTags = useMemo(
    () =>
      formData.oznake_input
        .split(/[\n,]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
    [formData.oznake_input],
  );

  const updateForm = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const createEmptyContact = useCallback(
    () => ({
      localId: makeLocalId(),
      id: null,
      ime: "",
      uloga: "",
      email: "",
      telefon: "",
      napomena: "",
      preferirani_kanal: "",
      hitnost_odziva_sati: "",
    }),
    [makeLocalId],
  );

  const handleAddContact = () => {
    setExtraContacts((prev) => [...prev, createEmptyContact()]);
  };

  const handleContactChange = (localId, field, value) => {
    setExtraContacts((prev) =>
      prev.map((kontakt) =>
        kontakt.localId === localId ? { ...kontakt, [field]: value } : kontakt,
      ),
    );
  };

  const handleRemoveContact = (localId) => {
    setExtraContacts((prev) =>
      prev.filter((kontakt) => kontakt.localId !== localId),
    );
  };

  const trimString = (value) => {
    if (value === null || value === undefined) {
      return "";
    }
    if (typeof value === "string") {
      return value.trim();
    }
    return String(value).trim();
  };
  const parseOptionalInt = (value) => {
    if (value === "" || value === null || value === undefined) {
      return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) {
      return;
    }

    if (!formData.naziv_firme?.trim()) {
      toast.error("Naziv firme je obavezan");
      return;
    }

    if (formData.oib && !/^\d{11}$/.test(formData.oib.trim())) {
      toast.error("OIB mora sadržavati točno 11 znamenki");
      return;
    }

    const primaryContactId = zakupnik?.kontakt_osobe?.[0]?.id || makeLocalId();

    const primaryContactPayload = {
      id: primaryContactId,
      ime: trimString(formData.kontakt_ime) || "Kontakt",
      uloga: trimString(formData.primary_uloga) || null,
      email: trimString(formData.kontakt_email) || null,
      telefon: trimString(formData.kontakt_telefon) || null,
      napomena: trimString(formData.primary_napomena) || null,
      preferirani_kanal: trimString(formData.primary_preferirani_kanal) || null,
      hitnost_odziva_sati: parseOptionalInt(formData.hitnost_odziva_sati),
    };

    const normalisedExtraContacts = extraContacts
      .map((kontakt) => {
        const name = trimString(kontakt.ime);
        const fallbackName =
          name || trimString(kontakt.email) || trimString(kontakt.telefon);
        if (!fallbackName) {
          return null;
        }
        return {
          id: kontakt.id || kontakt.localId || makeLocalId(),
          ime: fallbackName,
          uloga: trimString(kontakt.uloga) || null,
          email: trimString(kontakt.email) || null,
          telefon: trimString(kontakt.telefon) || null,
          napomena: trimString(kontakt.napomena) || null,
          preferirani_kanal: trimString(kontakt.preferirani_kanal) || null,
          hitnost_odziva_sati: parseOptionalInt(kontakt.hitnost_odziva_sati),
        };
      })
      .filter(Boolean);

    const kontakt_osobe = [primaryContactPayload, ...normalisedExtraContacts];

    const composedAddress = [
      trimString(formData.adresa_ulica),
      trimString(formData.adresa_kucni_broj),
      trimString(formData.adresa_postanski_broj),
      trimString(formData.adresa_grad),
      trimString(formData.adresa_drzava),
    ]
      .filter(Boolean)
      .join(" ");

    const payload = {
      tip: formData.tip,
      naziv_firme: trimString(formData.naziv_firme) || null,
      ime_prezime: trimString(formData.ime_prezime) || null,
      oib: trimString(formData.oib),
      sjediste: composedAddress || trimString(formData.sjediste),
      adresa_ulica: trimString(formData.adresa_ulica) || null,
      adresa_kucni_broj: trimString(formData.adresa_kucni_broj) || null,
      adresa_postanski_broj: trimString(formData.adresa_postanski_broj) || null,
      adresa_grad: trimString(formData.adresa_grad) || null,
      adresa_drzava: trimString(formData.adresa_drzava) || null,
      kontakt_ime: trimString(formData.kontakt_ime),
      kontakt_email: trimString(formData.kontakt_email),
      kontakt_telefon: trimString(formData.kontakt_telefon),
      iban: trimString(formData.iban) || null,
      pdv_obveznik: Boolean(formData.pdv_obveznik),
      pdv_id: trimString(formData.pdv_id) || null,
      maticni_broj: trimString(formData.maticni_broj) || null,
      registracijski_broj: trimString(formData.registracijski_broj) || null,
      eracun_dostava_kanal: trimString(formData.eracun_dostava_kanal) || null,
      eracun_identifikator: trimString(formData.eracun_identifikator) || null,
      eracun_email: trimString(formData.eracun_email) || null,
      eracun_posrednik: trimString(formData.eracun_posrednik) || null,
      fiskalizacija_napomena:
        trimString(formData.fiskalizacija_napomena) || null,
      odgovorna_osoba: trimString(formData.odgovorna_osoba) || null,
      status: formData.status || "aktivan",
      oznake: resolvedTags,
      opis_usluge: trimString(formData.opis_usluge) || null,
      radno_vrijeme: trimString(formData.radno_vrijeme) || null,
      biljeske: trimString(formData.biljeske) || null,
      hitnost_odziva_sati: parseOptionalInt(formData.hitnost_odziva_sati),
      kontakt_osobe,
    };

    await onSubmit(payload);
  };

  const isPartner = formData.tip === "partner";

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5"
      data-testid="zakupnik-form"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="tip">Tip kontakta *</Label>
          <Select
            value={formData.tip}
            onValueChange={(value) => updateForm("tip", value)}
          >
            <SelectTrigger
              id="tip"
              className="mt-1"
              data-testid="zakupnik-tip-select"
            >
              <SelectValue placeholder="Odaberite tip" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="zakupnik">Zakupnik</SelectItem>
              <SelectItem value="partner">Partner</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="status">Status</Label>
          <Select
            value={formData.status}
            onValueChange={(value) => updateForm("status", value)}
          >
            <SelectTrigger data-testid="zakupnik-status-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="aktivan">Aktivan</SelectItem>
              <SelectItem value="arhiviran">Arhiviran</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="naziv_firme">
            {isPartner ? "Naziv partnera" : "Naziv firme"}
          </Label>
          <Input
            id="naziv_firme"
            value={formData.naziv_firme}
            onChange={(event) => updateForm("naziv_firme", event.target.value)}
            data-testid="zakupnik-naziv-input"
          />
        </div>
        <div>
          <Label htmlFor="ime_prezime">Ime i prezime</Label>
          <Input
            id="ime_prezime"
            value={formData.ime_prezime}
            onChange={(event) => updateForm("ime_prezime", event.target.value)}
            data-testid="zakupnik-ime-input"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="oib">OIB / VAT ID *</Label>
          <Input
            id="oib"
            value={formData.oib}
            onChange={(event) => updateForm("oib", event.target.value)}
            data-testid="zakupnik-oib-input"
            required
          />
        </div>
        <div>
          <Label htmlFor="iban">IBAN</Label>
          <Input
            id="iban"
            value={formData.iban}
            onChange={(event) => updateForm("iban", event.target.value)}
            data-testid="zakupnik-iban-input"
          />
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-border/60 bg-muted/10 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Primarni kontakt
            </h3>
            <p className="text-xs text-muted-foreground">
              Koristi se za brzu komunikaciju, generiranje dokumenata i
              podsjetnike.
            </p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <Label htmlFor="kontakt_ime">Kontakt osoba *</Label>
            <Input
              id="kontakt_ime"
              value={formData.kontakt_ime}
              onChange={(event) =>
                updateForm("kontakt_ime", event.target.value)
              }
              data-testid="zakupnik-kontakt-input"
              required
            />
          </div>
          <div>
            <Label htmlFor="kontakt_email">Email *</Label>
            <Input
              id="kontakt_email"
              type="email"
              value={formData.kontakt_email}
              onChange={(event) =>
                updateForm("kontakt_email", event.target.value)
              }
              data-testid="zakupnik-email-input"
              required
            />
          </div>
          <div>
            <Label htmlFor="kontakt_telefon">Telefon *</Label>
            <Input
              id="kontakt_telefon"
              value={formData.kontakt_telefon}
              onChange={(event) =>
                updateForm("kontakt_telefon", event.target.value)
              }
              data-testid="zakupnik-telefon-input"
              required
            />
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <Label htmlFor="primary_uloga">Uloga</Label>
            <Input
              id="primary_uloga"
              value={formData.primary_uloga}
              onChange={(event) =>
                updateForm("primary_uloga", event.target.value)
              }
            />
          </div>
          <div>
            <Label htmlFor="primary_preferirani_kanal">Preferirani kanal</Label>
            <Input
              id="primary_preferirani_kanal"
              value={formData.primary_preferirani_kanal}
              onChange={(event) =>
                updateForm("primary_preferirani_kanal", event.target.value)
              }
              placeholder="npr. Email, Telefon"
            />
          </div>
          <div>
            <Label htmlFor="hitnost_odziva_sati">Odziv (h)</Label>
            <Input
              id="hitnost_odziva_sati"
              type="number"
              min="0"
              value={formData.hitnost_odziva_sati}
              onChange={(event) =>
                updateForm("hitnost_odziva_sati", event.target.value)
              }
              placeholder="npr. 4"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="primary_napomena">Napomena</Label>
          <Textarea
            id="primary_napomena"
            value={formData.primary_napomena}
            onChange={(event) =>
              updateForm("primary_napomena", event.target.value)
            }
            rows={2}
            placeholder="Posebne upute, raspoloživost ili SLA dogovori"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="oznake">Oznake</Label>
        <Input
          id="oznake"
          value={formData.oznake_input}
          onChange={(event) => updateForm("oznake_input", event.target.value)}
          placeholder="npr. Električar, 24/7, SLA A"
        />
        <p className="text-xs text-muted-foreground">
          Razdvojite oznake zarezom ili novim redom.
        </p>
        {resolvedTags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {resolvedTags.map((tag) => (
              <Badge
                key={`tag-preview-${tag}`}
                variant="outline"
                className="rounded-full bg-white text-[11px]"
              >
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {isPartner && (
        <div>
          <Label htmlFor="opis_usluge">Opis suradnje</Label>
          <Textarea
            id="opis_usluge"
            value={formData.opis_usluge}
            onChange={(event) => updateForm("opis_usluge", event.target.value)}
            rows={3}
            placeholder="Koje poslove partner pokriva, područje odgovornosti, SLA..."
          />
        </div>
      )}

      <Accordion
        type="multiple"
        defaultValue={["address"]}
        className="overflow-hidden rounded-xl border border-border/60 bg-white/70"
      >
        <AccordionItem
          value="address"
          className="border-border/60 last:border-b-0"
        >
          <AccordionTrigger className="px-4 text-sm font-semibold text-foreground">
            Adresni podaci
          </AccordionTrigger>
          <AccordionContent className="space-y-3 px-4">
            <p className="text-xs text-muted-foreground">
              Adresa se koristi za fiskalizaciju i generiranje ugovora.
            </p>
            {formData.sjediste &&
              !formData.adresa_ulica &&
              !formData.adresa_kucni_broj &&
              !formData.adresa_postanski_broj &&
              !formData.adresa_grad && (
                <p className="rounded-md border border-border/40 bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
                  Trenutno sjedište: {formData.sjediste}
                </p>
              )}
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label htmlFor="adresa_ulica">Ulica</Label>
                <Input
                  id="adresa_ulica"
                  value={formData.adresa_ulica}
                  onChange={(event) =>
                    updateForm("adresa_ulica", event.target.value)
                  }
                  placeholder="npr. Ulica Ivana Gorana Kovačića"
                />
              </div>
              <div>
                <Label htmlFor="adresa_kucni_broj">Kućni broj</Label>
                <Input
                  id="adresa_kucni_broj"
                  value={formData.adresa_kucni_broj}
                  onChange={(event) =>
                    updateForm("adresa_kucni_broj", event.target.value)
                  }
                  placeholder="npr. 12A"
                />
              </div>
              <div>
                <Label htmlFor="adresa_postanski_broj">Poštanski broj</Label>
                <Input
                  id="adresa_postanski_broj"
                  value={formData.adresa_postanski_broj}
                  onChange={(event) =>
                    updateForm("adresa_postanski_broj", event.target.value)
                  }
                  placeholder="npr. 10000"
                />
              </div>
              <div>
                <Label htmlFor="adresa_grad">Grad / mjesto</Label>
                <Input
                  id="adresa_grad"
                  value={formData.adresa_grad}
                  onChange={(event) =>
                    updateForm("adresa_grad", event.target.value)
                  }
                  placeholder="npr. Zagreb"
                />
              </div>
              <div>
                <Label htmlFor="adresa_drzava">Država</Label>
                <Input
                  id="adresa_drzava"
                  value={formData.adresa_drzava}
                  onChange={(event) =>
                    updateForm("adresa_drzava", event.target.value)
                  }
                  placeholder="npr. Hrvatska"
                />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem
          value="finance"
          className="border-border/60 last:border-b-0"
        >
          <AccordionTrigger className="px-4 text-sm font-semibold text-foreground">
            Financijski podaci
          </AccordionTrigger>
          <AccordionContent className="space-y-3 px-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="pdv_obveznik"
                checked={formData.pdv_obveznik}
                onCheckedChange={(checked) =>
                  updateForm("pdv_obveznik", checked)
                }
              />
              <Label htmlFor="pdv_obveznik">Obveznik PDV-a</Label>
            </div>
            {formData.pdv_obveznik && (
              <div>
                <Label htmlFor="pdv_id">PDV ID</Label>
                <Input
                  id="pdv_id"
                  value={formData.pdv_id}
                  onChange={(event) => updateForm("pdv_id", event.target.value)}
                  placeholder="npr. HR12345678901"
                />
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label htmlFor="maticni_broj">Matični broj (MB)</Label>
                <Input
                  id="maticni_broj"
                  value={formData.maticni_broj}
                  onChange={(event) =>
                    updateForm("maticni_broj", event.target.value)
                  }
                />
              </div>
              <div>
                <Label htmlFor="registracijski_broj">Registracijski broj</Label>
                <Input
                  id="registracijski_broj"
                  value={formData.registracijski_broj}
                  onChange={(event) =>
                    updateForm("registracijski_broj", event.target.value)
                  }
                />
              </div>
            </div>
            <div>
              <Label htmlFor="fiskalizacija_napomena">
                Napomena za fiskalizaciju
              </Label>
              <Input
                id="fiskalizacija_napomena"
                value={formData.fiskalizacija_napomena}
                onChange={(event) =>
                  updateForm("fiskalizacija_napomena", event.target.value)
                }
                placeholder="npr. Oslobođeno PDV-a po članku..."
              />
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem
          value="eracun"
          className="border-border/60 last:border-b-0"
        >
          <AccordionTrigger className="px-4 text-sm font-semibold text-foreground">
            eRačun postavke
          </AccordionTrigger>
          <AccordionContent className="space-y-3 px-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label htmlFor="eracun_dostava_kanal">Kanal dostave</Label>
                <Input
                  id="eracun_dostava_kanal"
                  value={formData.eracun_dostava_kanal}
                  onChange={(event) =>
                    updateForm("eracun_dostava_kanal", event.target.value)
                  }
                  placeholder="npr. FINA, Moj-eRačun"
                />
              </div>
              <div>
                <Label htmlFor="eracun_identifikator">
                  Identifikator primatelja
                </Label>
                <Input
                  id="eracun_identifikator"
                  value={formData.eracun_identifikator}
                  onChange={(event) =>
                    updateForm("eracun_identifikator", event.target.value)
                  }
                  placeholder="OIB ili GLN"
                />
              </div>
              <div>
                <Label htmlFor="eracun_email">Email za eRačun</Label>
                <Input
                  id="eracun_email"
                  type="email"
                  value={formData.eracun_email}
                  onChange={(event) =>
                    updateForm("eracun_email", event.target.value)
                  }
                />
              </div>
              <div>
                <Label htmlFor="eracun_posrednik">Posrednik</Label>
                <Input
                  id="eracun_posrednik"
                  value={formData.eracun_posrednik}
                  onChange={(event) =>
                    updateForm("eracun_posrednik", event.target.value)
                  }
                />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem
          value="additional"
          className="border-border/60 last:border-b-0"
        >
          <AccordionTrigger className="px-4 text-sm font-semibold text-foreground">
            Dodatne informacije
          </AccordionTrigger>
          <AccordionContent className="space-y-3 px-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label htmlFor="odgovorna_osoba">Odgovorna osoba</Label>
                <Input
                  id="odgovorna_osoba"
                  value={formData.odgovorna_osoba}
                  onChange={(event) =>
                    updateForm("odgovorna_osoba", event.target.value)
                  }
                  placeholder="Ime i prezime direktora/vlasnika"
                />
              </div>
              <div>
                <Label htmlFor="radno_vrijeme">Radno vrijeme</Label>
                <Input
                  id="radno_vrijeme"
                  value={formData.radno_vrijeme}
                  onChange={(event) =>
                    updateForm("radno_vrijeme", event.target.value)
                  }
                  placeholder="npr. Pon-Pet 08-16h"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="biljeske">Interne bilješke</Label>
              <Textarea
                id="biljeske"
                value={formData.biljeske}
                onChange={(event) => updateForm("biljeske", event.target.value)}
                rows={3}
                placeholder="Bilješke vidljive samo administratorima"
              />
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem
          value="contacts"
          className="border-border/60 last:border-b-0"
        >
          <AccordionTrigger className="px-4 text-sm font-semibold text-foreground">
            Dodatni kontakti ({extraContacts.length})
          </AccordionTrigger>
          <AccordionContent className="space-y-3 px-4">
            {extraContacts.map((kontakt, index) => (
              <div
                key={kontakt.localId}
                className="relative rounded-lg border border-border/50 bg-muted/20 p-3"
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-2 h-6 w-6 text-muted-foreground hover:text-destructive"
                  onClick={() => handleRemoveContact(kontakt.localId)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
                <div className="mb-2 text-xs font-medium text-muted-foreground">
                  Kontakt #{index + 1}
                </div>
                <div className="grid gap-2 md:grid-cols-3">
                  <div>
                    <Label className="text-xs">Ime *</Label>
                    <Input
                      className="h-8 text-sm"
                      value={kontakt.ime}
                      onChange={(e) =>
                        handleContactChange(
                          kontakt.localId,
                          "ime",
                          e.target.value,
                        )
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Email</Label>
                    <Input
                      className="h-8 text-sm"
                      type="email"
                      value={kontakt.email}
                      onChange={(e) =>
                        handleContactChange(
                          kontakt.localId,
                          "email",
                          e.target.value,
                        )
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Telefon</Label>
                    <Input
                      className="h-8 text-sm"
                      value={kontakt.telefon}
                      onChange={(e) =>
                        handleContactChange(
                          kontakt.localId,
                          "telefon",
                          e.target.value,
                        )
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Uloga</Label>
                    <Input
                      className="h-8 text-sm"
                      value={kontakt.uloga}
                      onChange={(e) =>
                        handleContactChange(
                          kontakt.localId,
                          "uloga",
                          e.target.value,
                        )
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Pref. kanal</Label>
                    <Input
                      className="h-8 text-sm"
                      value={kontakt.preferirani_kanal}
                      onChange={(e) =>
                        handleContactChange(
                          kontakt.localId,
                          "preferirani_kanal",
                          e.target.value,
                        )
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Odziv (h)</Label>
                    <Input
                      className="h-8 text-sm"
                      type="number"
                      value={kontakt.hitnost_odziva_sati}
                      onChange={(e) =>
                        handleContactChange(
                          kontakt.localId,
                          "hitnost_odziva_sati",
                          e.target.value,
                        )
                      }
                    />
                  </div>
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddContact}
              className="w-full"
            >
              <Plus className="mr-2 h-3 w-3" /> Dodaj kontakt
            </Button>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="flex space-x-2 pt-4">
        <Button
          type="submit"
          data-testid="potvrdi-zakupnika-form"
          disabled={submitting}
        >
          {submitting ? "Spremam..." : zakupnik ? "Ažuriraj" : "Kreiraj"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          data-testid="odustani-zakupnika-form"
          disabled={submitting}
        >
          Odustani
        </Button>
      </div>
    </form>
  );
};

export default ZakupnikForm;
