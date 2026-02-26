import React, { useState } from "react";
import { useNavigate, Navigate, Link } from "react-router-dom";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { useAuth } from "../../shared/auth";
import { toast } from "../../components/ui/sonner";
import logoMain from "../../assets/riforma-logo.png";

const LoginPage = () => {
  const navigate = useNavigate();
  const { login, isAuthenticated, loading } = useAuth();
  const [formState, setFormState] = useState({ email: "", password: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormState((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login({
        email: formState.email.trim(),
        password: formState.password,
      });
      toast.success("Dobrodošli natrag!");
      navigate("/", { replace: true });
    } catch (err) {
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        setError("Neispravni pristupni podaci. Provjerite email i lozinku.");
      } else {
        setError("Prijava nije uspjela. Provjerite email i lozinku.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const isSubmitDisabled =
    submitting || !formState.email.trim() || !formState.password.trim();

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/20 px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <img src={logoMain} alt="Riforma" className="h-16 w-auto" />
          </div>
          <CardTitle className="text-2xl font-semibold tracking-tight text-primary">
            Prijavite se u riforma
          </CardTitle>
          <CardDescription>
            Koristite službene pristupne podatke koje vam je dodijelio
            administrator.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert
              role="alert"
              className="mb-4 border-destructive/40 bg-destructive/10 text-destructive"
            >
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          )}
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2 text-left">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="primjer@tvrtka.hr"
                value={formState.email}
                onChange={handleChange}
                disabled={submitting}
                required
              />
            </div>
            <div className="space-y-2 text-left">
              <Label htmlFor="password">Lozinka</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={formState.password}
                onChange={handleChange}
                disabled={submitting}
                required
              />
              <div className="text-right">
                <Link
                  to="/forgot-password"
                  className="text-xs text-primary hover:underline"
                >
                  Zaboravljena lozinka?
                </Link>
              </div>
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitDisabled || loading}
            >
              {submitting ? "Prijavljivanje..." : "Prijavi se"}
            </Button>
          </form>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Ako nemate korisnički račun, obratite se administratoru platforme
            kako bi vas pozvao u odgovarajući portfelj.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default LoginPage;
