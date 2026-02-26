import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import {
  Building,
  Users,
  FileText,
  Wrench,
  ArrowRight,
  ArrowLeft,
  Rocket,
} from "lucide-react";

const STORAGE_KEY = "riforma:onboardingComplete";

const FEATURES = [
  {
    icon: Building,
    color: "text-blue-600 bg-blue-100",
    title: "Nekretnine",
    desc: "Evidencija i praćenje svih nekretnina i jedinica u portfelju.",
  },
  {
    icon: Users,
    color: "text-violet-600 bg-violet-100",
    title: "Zakupnici",
    desc: "Upravljanje zakupnicima, kontaktima i dokumentacijom.",
  },
  {
    icon: FileText,
    color: "text-green-600 bg-green-100",
    title: "Ugovori",
    desc: "Kreiranje, praćenje i odobravanje ugovora o zakupu.",
  },
  {
    icon: Wrench,
    color: "text-orange-600 bg-orange-100",
    title: "Održavanje",
    desc: "Kanban ploča za praćenje zadataka održavanja i popravaka.",
  },
];

export const OnboardingWizard = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const done = localStorage.getItem(STORAGE_KEY);
    if (!done) setOpen(true);
  }, []);

  const handleComplete = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setOpen(false);
  };

  const handleSkip = () => {
    handleComplete();
  };

  const handleGoToProperties = () => {
    handleComplete();
    navigate("/nekretnine");
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(val) => !val && handleSkip()}>
      <DialogContent className="sm:max-w-lg">
        {step === 0 && (
          <>
            <DialogHeader>
              <DialogTitle className="text-xl">
                Dobrodošli u Riforma
              </DialogTitle>
              <DialogDescription>
                Platforma za upravljanje nekretninama koja vam pomaže
                organizirati portfelj, pratiti ugovore i održavanje — sve na
                jednom mjestu.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center justify-center py-6">
              <div className="rounded-2xl bg-primary/10 p-6">
                <Rocket className="h-12 w-12 text-primary" />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:justify-between">
              <Button variant="ghost" size="sm" onClick={handleSkip}>
                Preskoči
              </Button>
              <Button onClick={() => setStep(1)}>
                Započni upoznavanje
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 1 && (
          <>
            <DialogHeader>
              <DialogTitle>Što možete raditi?</DialogTitle>
              <DialogDescription>
                Četiri ključna modula za upravljanje vašim portfeljem.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3 py-4">
              {FEATURES.map((f) => (
                <div
                  key={f.title}
                  className="rounded-lg border p-3 space-y-1.5"
                >
                  <div className={`inline-flex rounded-lg p-2 ${f.color}`}>
                    <f.icon className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-semibold">{f.title}</p>
                  <p className="text-xs text-muted-foreground">{f.desc}</p>
                </div>
              ))}
            </div>
            <DialogFooter className="gap-2 sm:justify-between">
              <Button variant="ghost" size="sm" onClick={() => setStep(0)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Natrag
              </Button>
              <Button onClick={() => setStep(2)}>
                Dalje
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 2 && (
          <>
            <DialogHeader>
              <DialogTitle>Prvi korak</DialogTitle>
              <DialogDescription>
                Dodajte svoju prvu nekretninu da biste počeli koristiti
                platformu ili krenite na kontrolnu ploču.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="rounded-2xl bg-blue-50 p-5">
                <Building className="h-10 w-10 text-blue-600" />
              </div>
              <p className="text-center text-sm text-muted-foreground max-w-sm">
                Nekretnina je temelj svega — nakon što je dodate, možete
                kreirati jedinice, dodati zakupnike i ugovore.
              </p>
            </div>
            <DialogFooter className="gap-2 sm:justify-between">
              <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Natrag
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleComplete}>
                  Idi na Dashboard
                </Button>
                <Button onClick={handleGoToProperties}>
                  <Building className="mr-2 h-4 w-4" />
                  Dodaj nekretninu
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export const resetOnboarding = () => {
  localStorage.removeItem(STORAGE_KEY);
};

export default OnboardingWizard;
