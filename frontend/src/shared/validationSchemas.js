import { z } from "zod";

// ---------------------------------------------------------------------------
// Global error map helper
// ---------------------------------------------------------------------------
export const getErrorMap = () => {
  z.setErrorMap((issue, ctx) => {
    if (issue.code === "invalid_type" && issue.received === "undefined") {
      return { message: "Ovo polje je obavezno" };
    }
    return { message: ctx.defaultError };
  });
};

// ---------------------------------------------------------------------------
// 1. UgovorForm – Contract
// ---------------------------------------------------------------------------
export const ugovorSchema = z
  .object({
    interna_oznaka: z.string().trim().min(1, "Interna oznaka je obavezna"),
    nekretnina_id: z.string().trim().min(1, "Nekretnina je obavezna"),
    zakupnik_id: z.string().trim().min(1, "Zakupnik je obavezan"),
    datum_pocetka: z.string().trim().min(1, "Datum početka je obavezan"),
    datum_zavrsetka: z.string().trim().min(1, "Datum završetka je obavezan"),
    osnovna_zakupnina: z.coerce
      .number({ required_error: "Zakupnina je obavezna" })
      .min(0, "Zakupnina ne može biti negativna"),
    status: z.string().trim().optional().default("aktivno"),
    property_unit_id: z.string().trim().optional().nullable(),
    datum_potpisivanja: z.string().trim().optional().nullable(),
    zakupnina_po_m2: z.coerce.number().min(0).optional().nullable(),
    cam_troskovi: z.coerce.number().min(0).optional().nullable(),
    polog_depozit: z.coerce.number().min(0).optional().nullable(),
    garancija: z.string().trim().optional().nullable(),
    rok_otkaza_dani: z.coerce.number().min(0).optional().nullable(),
    opcija_produljenja: z.boolean().optional().nullable(),
    uvjeti_produljenja: z.string().trim().optional().nullable(),
    indeksacija: z.boolean().optional().nullable(),
    indeks: z.string().trim().optional().nullable(),
    formula_indeksacije: z.string().trim().optional().nullable(),
    namjena_prostora: z.string().trim().optional().nullable(),
    obveze_odrzavanja: z.string().trim().optional().nullable(),
    rezije_brojila: z.string().trim().optional().nullable(),
    napomena: z.string().trim().optional().nullable(),
  })
  .refine((data) => data.datum_zavrsetka > data.datum_pocetka, {
    message: "Datum završetka mora biti nakon datuma početka",
    path: ["datum_zavrsetka"],
  });

// ---------------------------------------------------------------------------
// 2. ZakupnikForm – Tenant
// ---------------------------------------------------------------------------
export const zakupnikSchema = z
  .object({
    oib: z.string().trim().min(1, "OIB je obavezan"),
    kontakt_ime: z.string().trim().min(1, "Kontakt osoba je obavezna"),
    kontakt_email: z
      .string()
      .trim()
      .min(1, "Email je obavezan")
      .email("Neispravan email format"),
    kontakt_telefon: z.string().trim().min(1, "Telefon je obavezan"),
    naziv_firme: z.string().trim().optional().nullable(),
    ime_prezime: z.string().trim().optional().nullable(),
    tip: z.string().trim().optional().nullable(),
    status: z.string().trim().optional().nullable(),
    iban: z.string().trim().optional().nullable(),
    oznake_input: z.string().trim().optional().nullable(),
    primary_uloga: z.string().trim().optional().nullable(),
    primary_preferirani_kanal: z.string().trim().optional().nullable(),
    hitnost_odziva_sati: z.coerce.number().min(0).optional().nullable(),
    primary_napomena: z.string().trim().optional().nullable(),
    adresa_ulica: z.string().trim().optional().nullable(),
    kucni_broj: z.string().trim().optional().nullable(),
    postanski_broj: z.string().trim().optional().nullable(),
    grad: z.string().trim().optional().nullable(),
    drzava: z.string().trim().optional().nullable(),
    pdv_obveznik: z.boolean().optional().nullable(),
    pdv_id: z.string().trim().optional().nullable(),
    maticni_broj: z.string().trim().optional().nullable(),
    registracijski_broj: z.string().trim().optional().nullable(),
    fiskalizacija_napomena: z.string().trim().optional().nullable(),
    eracun_enabled: z.boolean().optional().nullable(),
    eracun_email: z.string().trim().optional().nullable(),
    eracun_format: z.string().trim().optional().nullable(),
    odgovorna_osoba: z.string().trim().optional().nullable(),
    radno_vrijeme: z.string().trim().optional().nullable(),
    biljeske: z.string().trim().optional().nullable(),
  })
  .refine(
    (data) =>
      (data.naziv_firme && data.naziv_firme.length > 0) ||
      (data.ime_prezime && data.ime_prezime.length > 0),
    {
      message: "Naziv firme ili ime i prezime je obavezno",
      path: ["naziv_firme"],
    },
  );

// ---------------------------------------------------------------------------
// 3. NekretninarForm – Property
// ---------------------------------------------------------------------------
export const nekretninarSchema = z.object({
  naziv: z.string().trim().min(1, "Naziv je obavezan"),
  vrsta: z.string().trim().min(1, "Vrsta je obavezna"),
  adresa: z.string().trim().min(1, "Adresa je obavezna"),
  katastarska_opcina: z
    .string()
    .trim()
    .min(1, "Katastarska općina je obavezna"),
  broj_kat_cestice: z
    .string()
    .trim()
    .min(1, "Broj katastarske čestice je obavezan"),
  povrsina: z.coerce
    .number({ required_error: "Površina je obavezna" })
    .min(0, "Površina ne može biti negativna"),
  vlasnik: z.string().trim().min(1, "Vlasnik je obavezan"),
  udio_vlasnistva: z.string().trim().min(1, "Udio vlasništva je obavezan"),
  // Finance fields
  porezna_vrijednost: z.coerce.number().min(0).optional().nullable(),
  trzisna_vrijednost: z.coerce.number().min(0).optional().nullable(),
  godisnji_porez: z.coerce.number().min(0).optional().nullable(),
  osiguranje_godisnje: z.coerce.number().min(0).optional().nullable(),
  // Maintenance fields
  zadnje_renoviranje: z.string().trim().optional().nullable(),
  planirano_renoviranje: z.string().trim().optional().nullable(),
  energetski_certifikat: z.string().trim().optional().nullable(),
  // Risk fields
  rizik_poplava: z.string().trim().optional().nullable(),
  rizik_potresa: z.string().trim().optional().nullable(),
  napomena: z.string().trim().optional().nullable(),
});

// ---------------------------------------------------------------------------
// 4. RacunForm – Bill
// ---------------------------------------------------------------------------
export const racunSchema = z.object({
  tip_utroska: z.string().trim().min(1, "Tip utroška je obavezan"),
  iznos: z.coerce
    .number({ required_error: "Iznos je obavezan" })
    .min(0, "Iznos ne može biti negativan"),
  nekretnina_id: z.string().trim().min(1, "Nekretnina je obavezna"),
  dobavljac: z.string().trim().optional().nullable(),
  broj_racuna: z.string().trim().optional().nullable(),
  datum_racuna: z.string().trim().optional().nullable(),
  datum_dospijeca: z.string().trim().optional().nullable(),
  valuta: z.string().trim().optional().nullable(),
  zakupnik_id: z.string().trim().optional().nullable(),
  property_unit_id: z.string().trim().optional().nullable(),
  status_placanja: z.string().trim().optional().nullable(),
  preknjizavanje_status: z.string().trim().optional().nullable(),
  preknjizavanje_napomena: z.string().trim().optional().nullable(),
  napomena: z.string().trim().optional().nullable(),
  period_od: z.string().trim().optional().nullable(),
  period_do: z.string().trim().optional().nullable(),
  potrosnja_kwh: z.coerce.number().min(0).optional().nullable(),
  potrosnja_m3: z.coerce.number().min(0).optional().nullable(),
});

// ---------------------------------------------------------------------------
// 5. LoginForm
// ---------------------------------------------------------------------------
export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email je obavezan")
    .email("Neispravan email format"),
  password: z.string().min(1, "Lozinka je obavezna"),
});

// ---------------------------------------------------------------------------
// 6. MaintenanceTaskForm
// ---------------------------------------------------------------------------
export const maintenanceTaskSchema = z.object({
  title: z.string().trim().min(1, "Naziv zadatka je obavezan"),
  priority: z.string().trim().min(1).default("medium"),
  status: z.string().trim().min(1).default("open"),
  nekretnina_id: z.string().trim().min(1, "Nekretnina je obavezna"),
  description: z.string().trim().optional().nullable(),
  assigned_to: z.string().trim().optional().nullable(),
  due_date: z.string().trim().optional().nullable(),
  property_unit_id: z.string().trim().optional().nullable(),
  estimated_cost: z.coerce.number().min(0).optional().nullable(),
  actual_cost: z.coerce.number().min(0).optional().nullable(),
});

// ---------------------------------------------------------------------------
// 7. ProjectForm
// ---------------------------------------------------------------------------
export const projectSchema = z.object({
  name: z.string().trim().min(1, "Naziv projekta je obavezan"),
  description: z.string().trim().optional().nullable(),
  budget: z.coerce
    .number()
    .min(0, "Budžet ne može biti negativan")
    .optional()
    .nullable(),
  end_date: z.string().trim().optional().nullable(),
});

// ---------------------------------------------------------------------------
// 8. HandoverProtocolForm
// ---------------------------------------------------------------------------
export const handoverProtocolSchema = z.object({
  type: z.enum(["entry", "exit"], {
    required_error: "Tip primopredaje je obavezan",
    invalid_type_error: "Tip mora biti 'entry' ili 'exit'",
  }),
  date: z.string().trim().min(1, "Datum je obavezan"),
  keys_handed_over: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});
