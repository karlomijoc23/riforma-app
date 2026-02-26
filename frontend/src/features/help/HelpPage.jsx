import React from "react";
import { useNavigate } from "react-router-dom";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import {
  FileText,
  CheckCircle,
  XCircle,
  HelpCircle,
  ArrowRight,
  Shield,
  Users,
  FileSignature,
  Undo2,
  Eye,
  Archive,
  Clock,
  RotateCcw,
} from "lucide-react";
import { resetOnboarding } from "../onboarding/OnboardingWizard";

const HelpPage = () => {
  const navigate = useNavigate();

  const handleRestartOnboarding = () => {
    resetOnboarding();
    navigate("/");
    window.location.reload();
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
            <HelpCircle className="h-8 w-8 text-primary" />
            Kako koristiti platformu
          </h1>
          <p className="mt-2 text-muted-foreground">
            Vodič kroz značajke i tijek rada
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRestartOnboarding}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Pokreni vodič
        </Button>
      </div>

      {/* Section 1: Approval Workflow */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileSignature className="h-5 w-5 text-primary" />
            Tijek odobravanja
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Visual flow: approved path */}
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="secondary">Čeka odobrenje</Badge>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <Badge variant="default">Odobreno</Badge>
          </div>

          {/* Visual flow: rejected path */}
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="secondary">Čeka odobrenje</Badge>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <Badge variant="destructive">Odbijeno</Badge>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground italic">
              uredi i ponovo pošalji
            </span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <Badge variant="secondary">Čeka odobrenje</Badge>
          </div>

          {/* Explanation */}
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>
              Svaki novi ugovor ili račun automatski dobiva status &lsquo;Čeka
              odobrenje&rsquo;.
            </li>
            <li>
              Ovjeravatelj može odobriti ili odbiti dokument s komentarom.
            </li>
            <li>
              Odbijeni dokumenti mogu se urediti i ponovo poslati na odobrenje.
            </li>
            <li>
              Kreator može povući dokument natrag u nacrt dok čeka odobrenje.
            </li>
            <li>
              Na stranici ugovora, žuti banner prikazuje sve ugovore koji čekaju
              odobrenje s brzim gumbima za odobrenje/odbijanje.
            </li>
          </ul>
        </CardContent>
      </Card>

      {/* Section 2: Roles and Permissions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-5 w-5 text-primary" />
            Uloge i ovlasti
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-3 pr-4 text-left font-semibold">Uloga</th>
                  <th className="px-3 py-3 text-center font-semibold">
                    Nekretnine
                  </th>
                  <th className="px-3 py-3 text-center font-semibold">
                    Ugovori
                  </th>
                  <th className="px-3 py-3 text-center font-semibold">
                    Računi
                  </th>
                  <th className="px-3 py-3 text-center font-semibold">
                    Održavanje
                  </th>
                  <th className="px-3 py-3 text-center font-semibold">
                    Dokumenti
                  </th>
                  <th className="px-3 py-3 text-center font-semibold">
                    Odobravanje
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/50">
                  <td className="py-3 pr-4 font-medium">Vlasnik</td>
                  <td className="px-3 py-3 text-center">&#x2705;</td>
                  <td className="px-3 py-3 text-center">&#x2705;</td>
                  <td className="px-3 py-3 text-center">&#x2705;</td>
                  <td className="px-3 py-3 text-center">&#x2705;</td>
                  <td className="px-3 py-3 text-center">&#x2705;</td>
                  <td className="px-3 py-3 text-center">&#x2705;</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-3 pr-4 font-medium">Admin</td>
                  <td className="px-3 py-3 text-center">&#x2705;</td>
                  <td className="px-3 py-3 text-center">&#x2705;</td>
                  <td className="px-3 py-3 text-center">&#x2705;</td>
                  <td className="px-3 py-3 text-center">&#x2705;</td>
                  <td className="px-3 py-3 text-center">&#x2705;</td>
                  <td className="px-3 py-3 text-center">&#x2705;</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-3 pr-4 font-medium">Upravitelj</td>
                  <td className="px-3 py-3 text-center">&#x2705;</td>
                  <td className="px-3 py-3 text-center">&#x2705;</td>
                  <td className="px-3 py-3 text-center">
                    <span title="Samo čitanje">&#x1F441;</span>
                  </td>
                  <td className="px-3 py-3 text-center">&#x2705;</td>
                  <td className="px-3 py-3 text-center">&#x2705;</td>
                  <td className="px-3 py-3 text-center">
                    <span className="text-xs">ugovori</span>
                  </td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-3 pr-4 font-medium">Računovodstvo</td>
                  <td className="px-3 py-3 text-center">
                    <span title="Samo čitanje">&#x1F441;</span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span title="Samo čitanje">&#x1F441;</span>
                  </td>
                  <td className="px-3 py-3 text-center">&#x2705;</td>
                  <td className="px-3 py-3 text-center">&#x274C;</td>
                  <td className="px-3 py-3 text-center">
                    <span title="Samo čitanje">&#x1F441;</span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className="text-xs">računi</span>
                  </td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-3 pr-4 font-medium">Unositelj</td>
                  <td className="px-3 py-3 text-center">
                    <span title="Samo čitanje">&#x1F441;</span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span title="Samo čitanje">&#x1F441;</span>
                  </td>
                  <td className="px-3 py-3 text-center">&#x274C;</td>
                  <td className="px-3 py-3 text-center">
                    <span title="Čitanje i kreiranje">&#x1F441;+&#x270F;</span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span title="Čitanje i kreiranje">&#x1F441;+&#x270F;</span>
                  </td>
                  <td className="px-3 py-3 text-center">&#x274C;</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-3 pr-4 font-medium">Promatrač</td>
                  <td className="px-3 py-3 text-center">
                    <span title="Samo čitanje">&#x1F441;</span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span title="Samo čitanje">&#x1F441;</span>
                  </td>
                  <td className="px-3 py-3 text-center">&#x274C;</td>
                  <td className="px-3 py-3 text-center">
                    <span title="Samo čitanje">&#x1F441;</span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span title="Samo čitanje">&#x1F441;</span>
                  </td>
                  <td className="px-3 py-3 text-center">&#x274C;</td>
                </tr>
                <tr>
                  <td className="py-3 pr-4 font-medium">Dobavljač</td>
                  <td className="px-3 py-3 text-center">&#x274C;</td>
                  <td className="px-3 py-3 text-center">&#x274C;</td>
                  <td className="px-3 py-3 text-center">&#x274C;</td>
                  <td className="px-3 py-3 text-center">
                    <span className="text-xs">dodijeljeno</span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span title="Samo kreiranje">&#x270F;</span>
                  </td>
                  <td className="px-3 py-3 text-center">&#x274C;</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            &#x2705; = potpuni pristup &nbsp; &#x1F441; = samo čitanje &nbsp;
            &#x270F; = kreiranje &nbsp; &#x274C; = bez pristupa
          </p>
        </CardContent>
      </Card>

      {/* Section 3: Step by Step */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5 text-primary" />
            Korak po korak
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-6">
            <li className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold">1. Kreiranje dokumenta</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Kreirajte novi ugovor ili račun. Dokument automatski dobiva
                  status &lsquo;Čeka odobrenje&rsquo;.
                </p>
              </div>
            </li>
            <li className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Clock className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold">2. Praćenje na banneru</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Na stranici ugovora, žuti banner prikazuje sve dokumente koji
                  čekaju odobrenje. Ovjeravatelj može odobriti ili odbiti
                  direktno s bannera.
                </p>
              </div>
            </li>
            <li className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <CheckCircle className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold">3. Odobrenje</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Ovjeravatelj pregledava dokument i odobrava ga. Odobreni
                  ugovori postaju aktivni u sustavu.
                </p>
              </div>
            </li>
            <li className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <XCircle className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold">4. Odbijanje</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Ako je dokument odbijen, kreator može urediti dokument i
                  ponovo ga poslati na odobrenje.
                </p>
              </div>
            </li>
            <li className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Undo2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold">5. Povlačenje</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Kreator može povući dokument koji čeka odobrenje natrag u
                  nacrt kako bi ga dodatno uredio.
                </p>
              </div>
            </li>
            <li className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Archive className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold">6. Arhiviranje isteklih</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Istekli ugovori se mogu brzo arhivirati: prelaskom miša preko
                  retka pojavljuje se gumb &lsquo;Arhiviraj&rsquo;, ili
                  koristite &lsquo;Arhiviraj sve&rsquo; za bulk akciju.
                </p>
              </div>
            </li>
          </ol>
        </CardContent>
      </Card>

      {/* Section 4: Useful Tips */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Eye className="h-5 w-5 text-primary" />
            Korisni savjeti
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              Filtrirajte ugovore i račune po statusu odobrenja koristeći
              dropdown filter
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              Žuti banner na vrhu stranice ugovora omogućuje brzo
              odobrenje/odbijanje bez otvaranja svakog ugovora
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              Za istekle ugovore, koristite hover gumb &lsquo;Arhiviraj&rsquo; u
              tablici ili &lsquo;Arhiviraj sve&rsquo; u sivom banneru
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              Koristite prekidač &lsquo;Arhiva&rsquo; za pregled arhiviranih i
              raskinutih ugovora
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              Na nadzornoj ploči možete vidjeti broj dokumenata koji čekaju
              odobrenje
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};

export default HelpPage;
