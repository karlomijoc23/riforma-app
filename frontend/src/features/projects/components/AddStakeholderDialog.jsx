import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { Loader2, UserPlus } from "lucide-react";
import { Button } from "../../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { Input } from "../../../components/ui/input";
import { Textarea } from "../../../components/ui/textarea";
import { Label } from "../../../components/ui/label";
import { api } from "../../../shared/api";
import { toast } from "../../../components/ui/sonner";

export function AddStakeholderDialog({ projectId, onStakeholderAdded }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm({
    defaultValues: {
      name: "",
      role: "Contractor",
      contact_info: "",
      notes: "",
    },
  });

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      const res = await api.addProjectStakeholder(projectId, data);
      toast.success("Član tima uspješno dodan");
      setOpen(false);
      reset();
      if (onStakeholderAdded) {
        onStakeholderAdded(res.data);
      }
    } catch (error) {
      console.error(error);
      toast.error("Greška pri dodavanju člana tima");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus className="mr-2 h-4 w-4" />
          Dodaj sudionika
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Dodaj sudionika na projekt</DialogTitle>
          <DialogDescription>
            Unesite podatke o arhitektu, izvođaču ili drugom partneru.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Ime / Naziv firme</Label>
            <Input
              id="name"
              {...register("name", { required: "Naziv je obavezan" })}
              placeholder="npr. Arhitektura d.o.o."
            />
            {errors.name && (
              <p className="text-red-500 text-xs">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Uloga</Label>
            <Select
              onValueChange={(val) => setValue("role", val)}
              defaultValue="Contractor"
            >
              <SelectTrigger>
                <SelectValue placeholder="Odaberite ulogu" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Architect">Arhitekt</SelectItem>
                <SelectItem value="Contractor">Izvođač radova</SelectItem>
                <SelectItem value="Surveyor">Geodet</SelectItem>
                <SelectItem value="Engineer">Inženjer/Nadzor</SelectItem>
                <SelectItem value="Investor">Investitor</SelectItem>
                <SelectItem value="Legal">Odvjetnik</SelectItem>
                <SelectItem value="Agent">Agent za nekretnine</SelectItem>
                <SelectItem value="Other">Ostalo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="contact_info">Kontakt podaci</Label>
            <Input
              id="contact_info"
              {...register("contact_info")}
              placeholder="Email ili telefon"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Napomena</Label>
            <Textarea
              id="notes"
              {...register("notes")}
              placeholder="Dodatne informacije..."
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Spremi
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
