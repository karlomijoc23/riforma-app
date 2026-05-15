import React from "react";
import { User, Mail, Phone, Users, StickyNote, Clock } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { Badge } from "../../../components/ui/badge";
import InfoRow from "./InfoRow";

const ContactsTab = ({ tenant, primaryContact, otherContacts }) => (
  <>
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <User className="h-4 w-4 text-primary" />
          Primarni kontakt
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2">
          <InfoRow
            icon={User}
            label="Ime i prezime"
            value={
              tenant.kontakt_ime ||
              primaryContact?.ime ||
              tenant.ime_prezime
            }
          />
          <InfoRow
            icon={Mail}
            label="Email"
            value={tenant.kontakt_email || primaryContact?.email}
          />
          <InfoRow
            icon={Phone}
            label="Telefon"
            value={tenant.kontakt_telefon || primaryContact?.telefon}
          />
          {primaryContact?.uloga && (
            <InfoRow label="Uloga" value={primaryContact.uloga} />
          )}
          {primaryContact?.preferirani_kanal && (
            <InfoRow
              label="Preferirani kanal"
              value={primaryContact.preferirani_kanal}
            />
          )}
        </div>
      </CardContent>
    </Card>

    {otherContacts.length > 0 && (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Ostali kontakti
            </CardTitle>
            <Badge variant="outline">{otherContacts.length}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {otherContacts.map((contact, index) => (
              <div
                key={contact.id || index}
                className="rounded-lg border bg-muted/30 p-4 text-sm space-y-2"
              >
                <div className="font-medium">{contact.ime}</div>
                {contact.uloga && (
                  <Badge variant="outline" className="text-xs">
                    {contact.uloga}
                  </Badge>
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
                {contact.napomena && (
                  <p className="text-xs text-muted-foreground italic pt-1 border-t">
                    {contact.napomena}
                  </p>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )}

    {(tenant.biljeske || tenant.opis_usluge || tenant.radno_vrijeme) && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <StickyNote className="h-4 w-4 text-primary" />
            Dodatne informacije
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {tenant.radno_vrijeme && (
            <InfoRow
              icon={Clock}
              label="Radno vrijeme"
              value={tenant.radno_vrijeme}
            />
          )}
          {tenant.opis_usluge && (
            <InfoRow label="Opis usluge" value={tenant.opis_usluge} />
          )}
          {tenant.biljeske && (
            <div className="bg-muted/30 p-4 rounded-lg border text-sm">
              <span className="font-semibold block mb-1 text-xs text-muted-foreground uppercase">
                Bilješke
              </span>
              <p className="whitespace-pre-wrap">{tenant.biljeske}</p>
            </div>
          )}
        </CardContent>
      </Card>
    )}
  </>
);

export default ContactsTab;
