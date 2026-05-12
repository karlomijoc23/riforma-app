import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../shared/api";
import { useAuth } from "../../shared/auth";
import { toast } from "../../components/ui/sonner";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Loader2, KeyRound } from "lucide-react";

/**
 * Self-service password change. Shown:
 *   - automatically when `user.must_change_password === true` (admin
 *     issued a temp password; we intercept all routes until rotation)
 *   - manually from a profile page when the user wants to rotate
 *
 * `currentPassword` is required when NOT forced — the temp-password
 * case skips it since the just-typed-on-login temp password is the
 * implicit proof of identity.
 */
const ChangePasswordPage = ({ forced = false }) => {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const isForced = forced || user?.must_change_password;

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error("Nova lozinka mora imati najmanje 8 znakova.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Nova lozinka i potvrda se ne poklapaju.");
      return;
    }
    if (!isForced && !currentPassword) {
      toast.error("Unesite trenutnu lozinku.");
      return;
    }
    setSubmitting(true);
    try {
      await api.changeMyPassword({
        current_password: isForced ? null : currentPassword,
        new_password: newPassword,
      });
      toast.success("Lozinka uspješno promijenjena.");
      // Refresh the user object so `must_change_password` flips to false
      // and the route interceptor lets the user through.
      if (refreshUser) await refreshUser();
      navigate("/", { replace: true });
    } catch (err) {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Promjena nije uspjela.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-12 md:py-20">
      <Card className="border-2">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 rounded-full bg-primary/10 p-3 w-fit">
            <KeyRound className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-xl">
            {isForced ? "Postavite novu lozinku" : "Promjena lozinke"}
          </CardTitle>
          <CardDescription className="text-sm">
            {isForced
              ? "Vaš trenutni račun koristi privremenu lozinku. Postavite vlastitu prije nego nastavite."
              : "Unesite trenutnu lozinku, zatim novu."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isForced && (
              <div>
                <Label htmlFor="current">Trenutna lozinka</Label>
                <Input
                  id="current"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </div>
            )}
            <div>
              <Label htmlFor="new">Nova lozinka</Label>
              <Input
                id="new"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Najmanje 8 znakova.
              </p>
            </div>
            <div>
              <Label htmlFor="confirm">Potvrdite novu lozinku</Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isForced ? "Postavi lozinku" : "Spremi"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ChangePasswordPage;
