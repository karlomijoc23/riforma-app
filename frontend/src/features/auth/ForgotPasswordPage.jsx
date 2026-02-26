import React, { useState } from "react";
import { Link } from "react-router-dom";
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
import { api, getErrorMessage } from "../../shared/api";
import logoMain from "../../assets/riforma-logo.png";

const ForgotPasswordPage = () => {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.forgotPassword({ email: email.trim() });
      setSubmitted(true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/20 px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <img src={logoMain} alt="Riforma" className="h-16 w-auto" />
          </div>
          <CardTitle className="text-2xl font-semibold tracking-tight text-primary">
            Zaboravljena lozinka
          </CardTitle>
          <CardDescription>
            Unesite svoju email adresu i poslat ćemo vam upute za resetiranje
            lozinke.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <div className="space-y-4">
              <Alert className="border-primary/40 bg-primary/5 text-primary">
                <AlertDescription className="text-sm">
                  Ako postoji račun s tom adresom, poslali smo upute za
                  resetiranje. Provjerite svoju email poštu.
                </AlertDescription>
              </Alert>
              <p className="text-center text-sm text-muted-foreground">
                <Link
                  to="/login"
                  className="text-primary hover:underline font-medium"
                >
                  Natrag na prijavu
                </Link>
              </p>
            </div>
          ) : (
            <>
              {error && (
                <Alert className="mb-4 border-destructive/40 bg-destructive/10 text-destructive">
                  <AlertDescription className="text-xs">
                    {error}
                  </AlertDescription>
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
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={submitting}
                    required
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={submitting || !email.trim()}
                >
                  {submitting ? "Slanje..." : "Pošalji upute"}
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
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ForgotPasswordPage;
