import React from "react";
import { Link } from "react-router-dom";
import {
  Building2,
  User,
  Mail,
  Phone,
  Clock,
  CreditCard,
  MapPin,
  Building,
  ExternalLink,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { Badge } from "../../../components/ui/badge";
import InfoRow from "./InfoRow";

const OverviewTab = ({ tenant, primaryContact, tenantProperties }) => (
  <>
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            Osnovni podaci
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <InfoRow label="Naziv firme" value={tenant.naziv_firme} />
          <InfoRow label="Ime i prezime" value={tenant.ime_prezime} />
          <InfoRow label="OIB / VAT ID" value={tenant.oib} icon={CreditCard} />
          <InfoRow label="IBAN" value={tenant.iban} icon={CreditCard} />
          {tenant.oznake && tenant.oznake.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {tenant.oznake.map((tag, i) => (
                <Badge key={i} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4 text-primary" />
            Primarni kontakt
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <InfoRow
            icon={User}
            label="Kontakt osoba"
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
          {(tenant.hitnost_odziva_sati ||
            primaryContact?.hitnost_odziva_sati) && (
            <InfoRow
              icon={Clock}
              label="Hitnost odziva"
              value={`${tenant.hitnost_odziva_sati || primaryContact?.hitnost_odziva_sati}h`}
            />
          )}
        </CardContent>
      </Card>
    </div>

    {(tenant.adresa_ulica || tenant.adresa_grad || tenant.sjediste) && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            Adresa
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            {tenant.adresa_ulica && (
              <div>
                <span className="text-muted-foreground block mb-1">Ulica</span>
                <span className="font-medium">
                  {tenant.adresa_ulica} {tenant.adresa_kucni_broj}
                </span>
              </div>
            )}
            {tenant.adresa_postanski_broj && (
              <div>
                <span className="text-muted-foreground block mb-1">
                  Poštanski broj
                </span>
                <span className="font-medium">
                  {tenant.adresa_postanski_broj}
                </span>
              </div>
            )}
            {tenant.adresa_grad && (
              <div>
                <span className="text-muted-foreground block mb-1">Grad</span>
                <span className="font-medium">{tenant.adresa_grad}</span>
              </div>
            )}
            {tenant.adresa_drzava && (
              <div>
                <span className="text-muted-foreground block mb-1">Država</span>
                <span className="font-medium">{tenant.adresa_drzava}</span>
              </div>
            )}
            {tenant.sjediste &&
              !tenant.adresa_ulica &&
              !tenant.adresa_grad && (
                <div className="col-span-full">
                  <span className="text-muted-foreground block mb-1">
                    Sjedište
                  </span>
                  <span className="font-medium">{tenant.sjediste}</span>
                </div>
              )}
          </div>
        </CardContent>
      </Card>
    )}

    {tenantProperties.length > 0 && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building className="h-4 w-4 text-primary" />
            Iznajmljene nekretnine
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {tenantProperties.map((prop) => (
            <Link
              key={prop.id}
              to={`/nekretnine/${prop.id}`}
              className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/30 transition-colors"
            >
              <Building className="h-5 w-5 text-primary" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{prop.naziv}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {prop.adresa}
                  {prop.grad ? `, ${prop.grad}` : ""}
                </p>
              </div>
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
            </Link>
          ))}
        </CardContent>
      </Card>
    )}
  </>
);

export default OverviewTab;
