import React, { useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
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
import { toast } from "../../components/ui/sonner";
import { api, getErrorMessage } from "../../shared/api";
import logoMain from "../../assets/riforma-logo.png";

const ResetPasswordPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [formState, setFormState] = useState({
    new_password: "",
    confirm_password: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormState((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);

    if (formState.new_password !== formState.confirm_password) {
      setError("Lozinke se ne podudaraju.");
      return;
    }

    if (formState.new_password.length < 8) {
      setError("Lozinka mora imati najmanje 8 znakova.");
      return;
    }

    setSubmitting(true);
    try {
      await api.resetPassword({
        token,
        new_password: formState.new_password,
      });
      toast.success("Lozinka uspješno promijenjena. Prijavite se.");
      navigate("/login", { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const isSubmitDisabled =
    submitting ||
    !formState.new_password.trim() ||
    !formState.confirm_password.trim();

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/20 px-4 py-12">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1 text-center">
            <div className="flex justify-center mb-4">
              <img src={logoMain} alt="Riforma" className="h-16 w-auto" />
            </div>
            <CardTitle className="text-2xl font-semibold tracking-tight text-primary">
              Nevažeća poveznica
            </CardTitle>
            <CardDescription>
              Poveznica za resetiranje lozinke nije valjana ili je istekla.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-center text-sm text-muted-foreground">
              <Link
                to="/forgot-password"
                className="text-primary hover:underline font-medium"
              >
                Zatražite novu poveznicu
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/20 px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <img src={logoMain} alt="Riforma" className="h-16 w-auto" />
          </div>
          <CardTitle className="text-2xl font-semibold tracking-tight text-primary">
            Resetirajte lozinku
          </CardTitle>
          <CardDescription>Unesite novu lozinku za svoj račun.</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert className="mb-4 border-destructive/40 bg-destructive/10 text-destructive">
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          )}
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2 text-left">
              <Label htmlFor="new_password">Nova lozinka</Label>
              <Input
                id="new_password"
                name="new_password"
                type="password"
                autoComplete="new-password"
                placeholder="Najmanje 8 znakova"
                value={formState.new_password}
                onChange={handleChange}
                disabled={submitting}
                required
              />
            </div>
            <div className="space-y-2 text-left">
              <Label htmlFor="confirm_password">Potvrdite lozinku</Label>
              <Input
                id="confirm_password"
                name="confirm_password"
                type="password"
                autoComplete="new-password"
                placeholder="Ponovite novu lozinku"
                value={formState.confirm_password}
                onChange={handleChange}
                disabled={submitting}
                required
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitDisabled}
            >
              {submitting ? "Spremanje..." : "Postavi novu lozinku"}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            <Link
              to="/login"
              className="text-primary hover:underline font-medium"
            >
              Natrag na prijavu
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPasswordPage;
