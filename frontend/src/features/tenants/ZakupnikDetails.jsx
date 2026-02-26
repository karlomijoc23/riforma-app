import React from "react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Mail,
  Phone,
  MapPin,
  Building2,
  CreditCard,
  FileText,
  User,
  Clock,
  StickyNote,
  Edit,
  Printer,
  Users,
} from "lucide-react";
import { ScrollArea } from "../../components/ui/scroll-area";
import { Separator } from "../../components/ui/separator";

const ZakupnikDetails = ({ zakupnik, onEdit, onPrint }) => {
  if (!zakupnik) return null;

  const isPartner = zakupnik.tip === "partner";
  const primaryContact = zakupnik.kontakt_osobe?.[0];
  const otherContacts = zakupnik.kontakt_osobe?.slice(1) || [];

  const InfoRow = ({ icon: Icon, label, value, className = "" }) => {
    if (!value) return null;
    return (
      <div className={`flex items-start gap-3 ${className}`}>
        {Icon && <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />}
        <div className="grid gap-0.5 w-full min-w-0">
          <span className="text-xs font-medium text-muted-foreground">
            {label}
          </span>
          <span className="text-sm text-foreground break-all">{value}</span>
        </div>
      </div>
    );
  };

  const Section = ({ title, children, icon: Icon }) => (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-primary" />}
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <div className="grid gap-4 rounded-lg border bg-card p-4 text-sm">
        {children}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight">
              {zakupnik.naziv_firme || zakupnik.ime_prezime}
            </h2>
            <Badge
              variant={zakupnik.status === "aktivan" ? "default" : "secondary"}
            >
              {zakupnik.status || "Aktivan"}
            </Badge>
            <Badge variant="outline" className="capitalize">
              {zakupnik.tip}
            </Badge>
          </div>
          {(zakupnik.adresa_grad || zakupnik.sjediste) && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              <span>{zakupnik.adresa_grad || zakupnik.sjediste}</span>
            </div>
          )}
        </div>
        <div className="flex gap-2 w-full sm:w-auto mt-2 sm:mt-0">
          {onPrint && (
            <Button
              variant="outline"
              size="sm"
              onClick={onPrint}
              className="flex-1 sm:flex-none"
            >
              <Printer className="mr-2 h-4 w-4" /> Ispiši
            </Button>
          )}
          {onEdit && (
            <Button onClick={onEdit} size="sm" className="flex-1 sm:flex-none">
              <Edit className="mr-2 h-4 w-4" /> Uredi
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Basic & Contact Info */}
        <div className="space-y-6">
          <Section title="Osnovni podaci" icon={Building2}>
            <div className="grid gap-4 sm:grid-cols-2">
              <InfoRow
                label={isPartner ? "Naziv partnera" : "Naziv firme"}
                value={zakupnik.naziv_firme}
              />
              <InfoRow label="Ime i prezime" value={zakupnik.ime_prezime} />
              <InfoRow label="OIB / VAT ID" value={zakupnik.oib} />
              <InfoRow label="IBAN" value={zakupnik.iban} icon={CreditCard} />
            </div>
            {zakupnik.oznake && zakupnik.oznake.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2">
                {zakupnik.oznake.map((tag, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </Section>

          <Section title="Primarni kontakt" icon={User}>
            <div className="grid gap-4">
              <InfoRow
                icon={User}
                label="Ime i prezime"
                value={zakupnik.kontakt_ime || primaryContact?.ime}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <InfoRow
                  icon={Mail}
                  label="Email"
                  value={zakupnik.kontakt_email || primaryContact?.email}
                />
                <InfoRow
                  icon={Phone}
                  label="Telefon"
                  value={zakupnik.kontakt_telefon || primaryContact?.telefon}
                />
              </div>
              {(zakupnik.hitnost_odziva_sati ||
                primaryContact?.hitnost_odziva_sati) && (
                <InfoRow
                  icon={Clock}
                  label="Hitnost odziva"
                  value={`${zakupnik.hitnost_odziva_sati || primaryContact?.hitnost_odziva_sati}h`}
                />
              )}
            </div>
          </Section>
        </div>

        {/* Financial & Additional Info */}
        <div className="space-y-6">
          <Section title="Financijski podaci" icon={FileText}>
            <div className="grid gap-4 sm:grid-cols-2">
              <InfoRow
                label="PDV Obveznik"
                value={zakupnik.pdv_obveznik ? "DA" : "NE"}
              />
              <InfoRow label="PDV ID" value={zakupnik.pdv_id} />
              <InfoRow label="Matični broj" value={zakupnik.maticni_broj} />
              <InfoRow
                label="Registracijski broj"
                value={zakupnik.registracijski_broj}
              />
            </div>
            {(zakupnik.eracun_email || zakupnik.eracun_posrednik) && (
              <>
                <Separator className="my-2" />
                <div className="grid gap-4 sm:grid-cols-2">
                  <InfoRow label="eRačun Email" value={zakupnik.eracun_email} />
                  <InfoRow
                    label="eRačun Posrednik"
                    value={zakupnik.eracun_posrednik}
                  />
                </div>
              </>
            )}
          </Section>

          {(zakupnik.biljeske ||
            zakupnik.opis_usluge ||
            zakupnik.radno_vrijeme) && (
            <Section title="Dodatne informacije" icon={StickyNote}>
              <InfoRow
                label="Radno vrijeme"
                value={zakupnik.radno_vrijeme}
                icon={Clock}
              />
              <InfoRow label="Opis usluge" value={zakupnik.opis_usluge} />
              <InfoRow label="Bilješke" value={zakupnik.biljeske} />
            </Section>
          )}
        </div>
      </div>

      {/* Other Contacts */}
      {otherContacts.length > 0 && (
        <Section
          title={`Ostali kontakti (${otherContacts.length})`}
          icon={Users}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {otherContacts.map((contact, index) => (
              <div
                key={contact.id || index}
                className="rounded-md border bg-muted/30 p-3 text-sm"
              >
                <div className="font-medium">{contact.ime}</div>
                {contact.uloga && (
                  <div className="text-xs text-muted-foreground mb-2">
                    {contact.uloga}
                  </div>
                )}
                <div className="space-y-1 text-xs text-muted-foreground">
                  {contact.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-3 w-3" /> {contact.email}
                    </div>
                  )}
                  {contact.telefon && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-3 w-3" /> {contact.telefon}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
};

export default ZakupnikDetails;
