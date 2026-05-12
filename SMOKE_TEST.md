# Smoke test — post-deploy checklist

20 koraka koje prolaziš u produkciji nakon deploya. Svaki korak ima **očekivani rezultat**. Ako nešto ne štima, javi mi točno koji broj koraka + screenshot / poruka greške.

Trajanje: ~15 minuta.

Preduvjeti:
- Backend je pokrenut (`curl https://riforma.com/health` → `{"status":"ok"}`)
- Frontend je buildan i deployan
- Login podaci spremni

---

## Dio 1 — Basic health (2 min)

### 1. Health probe
```
GET https://riforma.com/health
```
**Očekivano:** HTTP 200, `{"status":"ok"}`

### 2. Ready probe + pool stats
```
GET https://riforma.com/ready
```
**Očekivano:** HTTP 200, JSON sadrži `"database":"connected"` i `"pool"` polje.

### 3. Login kao admin
Otvori `/login`, unesi podatke, submit.
**Očekivano:** preusmjerenje na `/dashboard`. Ne pojavljuje se 403 ili "CSRF neuspješna".

---

## Dio 2 — CRUD happy path (5 min)

### 4. Kreiraj novu nekretninu
`/nekretnine` → "Nova nekretnina" → popuni obavezna polja → Spremi.
**Očekivano:** Nekretnina se pojavi u listi, HTTP 201, toast "Nekretnina spremljena".

### 5. Dodaj jedinicu (podprostor)
Otvori detail nekretnine → "Dodaj jedinicu" → unesi oznaku, površinu → Spremi.
**Očekivano:** Jedinica se pojavi u tabu "Jedinice", status "dostupno".

### 6. Kreiraj zakupnika
`/zakupnici` → "Novi zakupnik" → unesi naziv, OIB (valjani!), email → Spremi.
**Očekivano:** Zakupnik se pojavi u listi. Invalidan OIB mora dati 422 grešku.

### 7. Kreiraj ugovor S PRILOŽENIM PDF-om
`/ugovori` → "Novi ugovor" → odaberi nekretninu (**combobox pretraga radi**), zakupnika, jedinicu → priloži test PDF → Spremi.
**Očekivano:** 
- Ugovor u listi.
- **Document badge se odmah pojavi na redu ugovora** (ovo je bug koji smo ispravili).
- Toast "Dokument ugovora spremljen".

---

## Dio 3 — Business logic guardrails (4 min)

### 8. Self-approve blokada (B1)
Na ugovoru koji si TI kreirao → klik "Odobri".
**Očekivano:** HTTP 422, poruka "Ne možete odobriti ugovor koji ste sami kreirali".

### 9. Approval kroz drugi račun
Odjavi se → loginiraj kao drugi korisnik s `leases:approve` scope → odobri taj ugovor.
**Očekivano:** Uspjeh, status postane "odobren". Jedinica postaje "iznajmljeno" (ako je ugovor duži od 30 dana).

### 10. Back-to-back ugovor na istoj jedinici (B2)
Prvi ugovor: 1.6.2026 → 30.6.2026. Drugi ugovor: 30.6.2026 → 31.12.2026 na istoj jedinici.
**Očekivano:** Drugi ugovor prolazi (nije overlap). Prije bi padao.

### 11. Terminal status tranzicija (B3)
Otvori ugovor → "Raskini" → zatim pokušaj vratiti na "aktivno".
**Očekivano:** HTTP 422 "Nije moguća promjena statusa". Vraćanje je blokirano.

### 12. Rent validation (B5)
Novi ugovor → postavi oba polja `osnovna_zakupnina=500` i `zakupnina_po_m2=10` → Spremi.
**Očekivano:** HTTP 422, poruka "Postavite samo jedno: osnovna_zakupnina ILI zakupnina_po_m2".

---

## Dio 4 — PDF + uploads (2 min)

### 13. Ispis ugovor PDF
Otvori bilo koji ugovor → klik "Ispis PDF".
**Očekivano:** Preuzima se `ugovor-XXX.pdf`. Hrvatski znakovi (č, ć, ž, š, đ) vidljivi. Logo, brand naziv Riforma na headeru. Datum i iznos formatirani hrvatski (npr. `1.500,00 €`).

**Ako vidiš loš izgled** (pixelirano, drugačiji font) → WeasyPrint nije instaliran, ali fallback radi. Javi mi.

### 14. Upload dokument na nekretninu
Detail nekretnine → tab Dokumenti → upload PDF-a.
**Očekivano:** 201, dokument u listi. Refresha se odmah.

### 15. Upload — neispravan tip (npr. .exe)
Pokušaj upload `.exe` datoteke.
**Očekivano:** HTTP 422 "Nedozvoljeni tip datoteke".

### 16. Upload — prevelika datoteka
Pokušaj upload >50MB.
**Očekivano:** HTTP 422 "Datoteka je prevelika".

---

## Dio 5 — UI/UX (2 min)

### 17. Breadcrumbs
Idi na `/ugovori/{bilo-koji-id}`.
**Očekivano:** gore lijevo vidiš "Ugovori > [oznaka]" kao klikabilne mrvice. Isto na `/nekretnine/{id}`, `/zakupnici/{id}`, `/projekti/{id}`.

### 18. Mobile check
Otvori app na mobitelu ili Chrome DevTools u mobile view (375px).
**Očekivano:** Navigacija se collapsea, tablice su čitljive (ili se pretvore u card stack), dugmad su dovoljno velika za prst (~44px).

### 19. Form loading state
U bilo kojoj formi klikni Spremi, brzo pokušaj ponovno kliknuti.
**Očekivano:** Dugme disabled tokom submit-a, spinner vidljiv. Double-submit nemoguć.

---

## Dio 6 — AI Agent (1 min)

### 20. AI Agent scope check
Login kao user s minimalnim ovlastima (npr. `viewer`).
Otvori AI Agent → upitaj "kreiraj novog zakupnika Test d.o.o.".
**Očekivano:** AI odgovori da ne može kreirati (tool nije u listi za viewera) ili ponudi samo read operacije. 

Login natrag kao admin, isti upit.
**Očekivano:** AI ponudi confirmation za create_zakupnik. Potvrdi → zakupnik kreiran.

---

## Kad sve prođe

Ako svih 20 koraka prolazi — deploy je uspješan. Javi mi 👍 i krećemo na multi-unit feature (Deploy #2).

## Kad nešto ne prođe

Javi mi:
1. Broj koraka (npr. "korak 7")
2. Što si napravio
3. Što se dogodilo (poruka greške, screenshot)
4. HTTP status ako ga vidiš (DevTools → Network)

Ja ću dijagnosticirati i popraviti u sljedećem batchu prije multi-unit feature-a.
