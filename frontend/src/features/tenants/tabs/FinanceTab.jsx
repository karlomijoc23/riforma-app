import React from "react";
import { DollarSign } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { formatCurrency } from "../../../shared/formatters";

const FinanceTab = ({ tenant, activeContracts, totalMonthlyRent }) => (
  <>
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-primary" />
          Financijski podaci
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border divide-y">
          <div className="flex justify-between p-3 text-sm">
            <span className="text-muted-foreground">PDV obveznik</span>
            <span className="font-medium">
              {tenant.pdv_obveznik ? "Da" : "Ne"}
            </span>
          </div>
          {tenant.pdv_id && (
            <div className="flex justify-between p-3 text-sm">
              <span className="text-muted-foreground">PDV ID</span>
              <span className="font-medium font-mono">{tenant.pdv_id}</span>
            </div>
          )}
          {tenant.maticni_broj && (
            <div className="flex justify-between p-3 text-sm">
              <span className="text-muted-foreground">Matični broj</span>
              <span className="font-medium font-mono">
                {tenant.maticni_broj}
              </span>
            </div>
          )}
          {tenant.registracijski_broj && (
            <div className="flex justify-between p-3 text-sm">
              <span className="text-muted-foreground">Registracijski broj</span>
              <span className="font-medium font-mono">
                {tenant.registracijski_broj}
              </span>
            </div>
          )}
          {tenant.iban && (
            <div className="flex justify-between p-3 text-sm">
              <span className="text-muted-foreground">IBAN</span>
              <span className="font-medium font-mono">{tenant.iban}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>

    {(tenant.eracun_email || tenant.eracun_posrednik) && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">eRačun postavke</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border divide-y">
            {tenant.eracun_email && (
              <div className="flex justify-between p-3 text-sm">
                <span className="text-muted-foreground">eRačun email</span>
                <span className="font-medium">{tenant.eracun_email}</span>
              </div>
            )}
            {tenant.eracun_posrednik && (
              <div className="flex justify-between p-3 text-sm">
                <span className="text-muted-foreground">Posrednik</span>
                <span className="font-medium">{tenant.eracun_posrednik}</span>
              </div>
            )}
            {tenant.eracun_dostava_kanal && (
              <div className="flex justify-between p-3 text-sm">
                <span className="text-muted-foreground">Kanal dostave</span>
                <span className="font-medium">
                  {tenant.eracun_dostava_kanal}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    )}

    {activeContracts.length > 0 && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Pregled prihoda od zakupnika
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border divide-y">
            <div className="flex justify-between p-3 text-sm">
              <span className="text-muted-foreground">Mjesečni prihod</span>
              <span className="font-medium text-primary">
                {formatCurrency(totalMonthlyRent)}
              </span>
            </div>
            <div className="flex justify-between p-3 text-sm">
              <span className="text-muted-foreground">Godišnji prihod</span>
              <span className="font-medium">
                {formatCurrency(totalMonthlyRent * 12)}
              </span>
            </div>
            <div className="flex justify-between p-3 text-sm">
              <span className="text-muted-foreground">Ukupni depoziti</span>
              <span className="font-medium">
                {formatCurrency(
                  activeContracts.reduce(
                    (sum, c) => sum + (Number(c.polog_depozit) || 0),
                    0,
                  ),
                )}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    )}
  </>
);

export default FinanceTab;
