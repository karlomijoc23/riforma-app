import React, { Suspense, useEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Toaster } from "./components/ui/sonner";
import { toast } from "./components/ui/sonner";
import { Loader2 } from "lucide-react";
import "./App.css";
import { AuthProvider, useAuth } from "./shared/auth";
import { EntityStoreProvider } from "./shared/entityStore";
import ErrorBoundary from "./components/ErrorBoundary";
import PageTransition from "./components/PageTransition";
import LoginPage from "./features/auth/LoginPage";
import { Navigation } from "./components/Navigation";
import { AiAgentBubble } from "./components/AiAgent/AiAgentBubble";
import { SkipLink } from "./components/ui/responsive-table";
import { OnboardingWizard } from "./features/onboarding/OnboardingWizard";

const Dashboard = React.lazy(
  () => import("./features/dashboard/DashboardPage"),
);
const NekretninePage = React.lazy(
  () => import("./features/properties/NekretninePage"),
);
const KontaktiPage = React.lazy(
  () => import("./features/kontakti/KontaktiPage"),
);
const UgovoriPage = React.lazy(
  () => import("./features/contracts/UgovoriPage"),
);
const ContractReport = React.lazy(
  () => import("./features/contracts/ContractReport"),
);
const MaintenancePage = React.lazy(
  () => import("./features/maintenance/MaintenancePage"),
);
const ProjectsPage = React.lazy(
  () => import("./features/projects/ProjectsPage"),
);
const ProjectDetailsPage = React.lazy(
  () => import("./features/projects/ProjectDetailsPage"),
);
const ProjectReportPage = React.lazy(
  () => import("./features/projects/ProjectReportPage"),
);
const SettingsPage = React.lazy(
  () => import("./features/settings/SettingsPage"),
);
const MaintenanceReport = React.lazy(
  () => import("./features/maintenance/MaintenanceReport"),
);
const PropertyReport = React.lazy(
  () => import("./features/properties/PropertyReport"),
);
const NekretninaDetailPage = React.lazy(
  () => import("./features/properties/NekretninaDetailPage"),
);
const UgovorDetailPage = React.lazy(
  () => import("./features/contracts/UgovorDetailPage"),
);
const ZakupnikDetailPage = React.lazy(
  () => import("./features/tenants/ZakupnikDetailPage"),
);
const RacuniPage = React.lazy(() => import("./features/bills/RacuniPage"));
const MjesecniIzvjestajPage = React.lazy(
  () => import("./features/reports/MjesecniIzvjestajPage"),
);
const TenantStatementPage = React.lazy(
  () => import("./features/reports/TenantStatementPage"),
);
const HelpPage = React.lazy(() => import("./features/help/HelpPage"));
const OglasiPage = React.lazy(() => import("./features/listings/OglasiPage"));
const ForgotPasswordPage = React.lazy(
  () => import("./features/auth/ForgotPasswordPage"),
);
const ResetPasswordPage = React.lazy(
  () => import("./features/auth/ResetPasswordPage"),
);
const MaintenanceCostAnalytics = React.lazy(
  () => import("./features/maintenance/MaintenanceCostAnalytics"),
);
const FinancialReportPage = React.lazy(
  () => import("./features/reports/FinancialReportPage"),
);

const AppContent = () => {
  const { loading, isAuthenticated } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Listen for NO_TENANT errors and redirect to profile creation
  useEffect(() => {
    const handler = (e) => {
      toast.error("Kreirajte portfelj u Postavkama prije dodavanja podataka.", {
        action: {
          label: "Postavke",
          onClick: () => navigate("/postavke"),
        },
        duration: 6000,
      });
    };
    window.addEventListener("tenant:required", handler);
    return () => window.removeEventListener("tenant:required", handler);
  }, [navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-muted/10">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">
          Provjeravam korisničku sesiju…
        </span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
        <Toaster />
      </>
    );
  }

  return (
    <EntityStoreProvider>
      <SkipLink />
      <div
        id="aria-live-region"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />
      <OnboardingWizard />
      <div className="App">
        <Navigation />
        <AiAgentBubble />
        <main id="main-content">
          <AnimatePresence mode="wait">
            <Routes location={location} key={location.pathname}>
              <Route
                path="/"
                element={
                  <PageTransition>
                    <Dashboard />
                  </PageTransition>
                }
              />
              <Route
                path="/nekretnine"
                element={
                  <PageTransition>
                    <NekretninePage />
                  </PageTransition>
                }
              />
              <Route
                path="/nekretnine/:id"
                element={
                  <PageTransition>
                    <NekretninaDetailPage />
                  </PageTransition>
                }
              />
              <Route
                path="/kontakti"
                element={
                  <PageTransition>
                    <KontaktiPage />
                  </PageTransition>
                }
              />
              <Route
                path="/zakupnici/:id"
                element={
                  <PageTransition>
                    <ZakupnikDetailPage />
                  </PageTransition>
                }
              />
              <Route
                path="/ugovori"
                element={
                  <PageTransition>
                    <UgovoriPage />
                  </PageTransition>
                }
              />
              <Route
                path="/ugovori/:id"
                element={
                  <PageTransition>
                    <UgovorDetailPage />
                  </PageTransition>
                }
              />
              <Route
                path="/ugovori/report"
                element={
                  <PageTransition>
                    <ContractReport />
                  </PageTransition>
                }
              />
              <Route
                path="/projekti"
                element={
                  <PageTransition>
                    <ProjectsPage />
                  </PageTransition>
                }
              />
              <Route
                path="/projekti/:id"
                element={
                  <PageTransition>
                    <ProjectDetailsPage />
                  </PageTransition>
                }
              />
              <Route
                path="/projekti/:id/report"
                element={
                  <PageTransition>
                    <ProjectReportPage />
                  </PageTransition>
                }
              />
              <Route
                path="/racuni"
                element={
                  <PageTransition>
                    <RacuniPage />
                  </PageTransition>
                }
              />
              <Route
                path="/izvjestaji/mjesecni"
                element={
                  <PageTransition>
                    <MjesecniIzvjestajPage />
                  </PageTransition>
                }
              />
              <Route
                path="/izvjestaji/izvod-zakupnika"
                element={
                  <PageTransition>
                    <TenantStatementPage />
                  </PageTransition>
                }
              />
              <Route
                path="/izvjestaji/financijski"
                element={
                  <PageTransition>
                    <FinancialReportPage />
                  </PageTransition>
                }
              />
              <Route
                path="/pomoc"
                element={
                  <PageTransition>
                    <HelpPage />
                  </PageTransition>
                }
              />
              <Route
                path="/profili"
                element={<Navigate to="/postavke" replace />}
              />
              <Route
                path="/postavke"
                element={
                  <PageTransition>
                    <SettingsPage />
                  </PageTransition>
                }
              />
              <Route
                path="/odrzavanje/report"
                element={
                  <PageTransition>
                    <MaintenanceReport />
                  </PageTransition>
                }
              />
              <Route
                path="/nekretnine/report"
                element={
                  <PageTransition>
                    <PropertyReport />
                  </PageTransition>
                }
              />
              <Route
                path="/odrzavanje"
                element={
                  <PageTransition>
                    <MaintenancePage />
                  </PageTransition>
                }
              />
              <Route
                path="/odrzavanje/analitika"
                element={
                  <PageTransition>
                    <MaintenanceCostAnalytics />
                  </PageTransition>
                }
              />
              <Route
                path="/oglasi"
                element={
                  <PageTransition>
                    <OglasiPage />
                  </PageTransition>
                }
              />
              <Route path="/zakupnici" element={<Navigate to="/kontakti" replace />} />
              <Route path="/dobavljaci" element={<Navigate to="/kontakti?tab=dobavljaci" replace />} />
              <Route path="/login" element={<Navigate to="/" replace />} />
              <Route
                path="*"
                element={
                  <PageTransition>
                    <div className="mx-auto max-w-7xl px-4 py-20 text-center">
                      <h1 className="text-6xl font-bold text-muted-foreground/30">
                        404
                      </h1>
                      <p className="mt-4 text-lg text-muted-foreground">
                        Stranica nije pronađena
                      </p>
                      <p className="mt-6">
                        <a
                          href="/"
                          className="text-sm text-primary hover:underline"
                        >
                          Natrag na početnu
                        </a>
                      </p>
                    </div>
                  </PageTransition>
                }
              />
            </Routes>
          </AnimatePresence>
        </main>
      </div>
      <Toaster />
    </EntityStoreProvider>
  );
};

// Main App Component
function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Suspense
            fallback={
              <div className="flex min-h-screen items-center justify-center">
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
              </div>
            }
          >
            <AppContent />
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
