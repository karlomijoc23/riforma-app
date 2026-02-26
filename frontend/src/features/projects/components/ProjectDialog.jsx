import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Textarea } from "../../../components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { api } from "../../../shared/api";
import { toast } from "../../../components/ui/sonner";

export default function ProjectDialog({ open, onOpenChange, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, reset } = useForm();

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      await api.createProject({
        ...data,
        budget: parseFloat(data.budget) || 0,
        status: "planning", // Default status
      });
      toast.success("Projekt uspješno kreiran");
      reset();
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to create project", error);
      toast.error("Greška prilikom kreiranja projekta");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Novi Projekt</DialogTitle>
          <DialogDescription>
            Kreirajte novi projekt razvoja nekretnine.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Naziv projekta</Label>
            <Input
              id="name"
              {...register("name", { required: true })}
              placeholder="npr. Renovacija Stanova Centar"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Opis</Label>
            <Textarea
              id="description"
              {...register("description")}
              placeholder="Kratki opis ciljeva projekta..."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="budget">Budžet (€)</Label>
              <Input
                id="budget"
                type="number"
                step="0.01"
                {...register("budget")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end_date">Rok završetka</Label>
              <Input id="end_date" type="date" {...register("end_date")} />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Odustani
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Kreiraj Projekt
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
