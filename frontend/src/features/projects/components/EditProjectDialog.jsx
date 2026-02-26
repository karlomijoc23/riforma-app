import React, { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { Loader2, Edit, Plus, Trash2 } from "lucide-react";
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
import { Input } from "../../../components/ui/input";
import { Textarea } from "../../../components/ui/textarea";
import { Label } from "../../../components/ui/label";
import { api } from "../../../shared/api";
import { toast } from "../../../components/ui/sonner";
import { ScrollArea } from "../../../components/ui/scroll-area";

export function EditProjectDialog({ project, onProjectUpdated }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // We use a separate form structure for the array handling
  const { register, control, handleSubmit, reset, setValue, watch } = useForm({
    defaultValues: {
      name: "",
      description: "",
      budget: 0,
      projected_revenue: 0,
      start_date: "",
      end_date: "",
      breakdown_items: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "breakdown_items",
  });

  useEffect(() => {
    if (project && open) {
      setValue("name", project.name);
      setValue("description", project.description);
      setValue("budget", project.budget || 0);
      setValue("projected_revenue", project.projected_revenue || 0);
      setValue(
        "start_date",
        project.start_date ? project.start_date.split("T")[0] : "",
      );
      setValue(
        "end_date",
        project.end_date ? project.end_date.split("T")[0] : "",
      );

      // Convert dictionary to array for editing
      if (project.budget_breakdown) {
        const items = Object.entries(project.budget_breakdown).map(
          ([key, val]) => ({
            category: key,
            amount: val,
          }),
        );
        setValue("breakdown_items", items);
      } else {
        setValue("breakdown_items", []);
      }
    }
  }, [project, open, setValue]);

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      // Reconstruct dictionary from array
      const budget_breakdown = {};
      data.breakdown_items.forEach((item) => {
        if (item.category && item.amount) {
          budget_breakdown[item.category] = parseFloat(item.amount);
        }
      });

      // If sum of breakdown exceeds total budget, maybe warn? Or auto-update total budget?
      // For now, let's keep them independent but maybe we should default budget to sum?
      // User requested "functional", let's sum it up if budget is 0?
      // Better behavior: trust the user's inputs.

      const payload = {
        name: data.name,
        description: data.description,
        status: project.status, // preserve status
        budget: parseFloat(data.budget) || 0,
        projected_revenue: parseFloat(data.projected_revenue) || 0,
        start_date: data.start_date || null,
        end_date: data.end_date || null,
        budget_breakdown: budget_breakdown,
      };

      const res = await api.updateProject(project.id, payload);
      toast.success("Projekt ažuriran");
      setOpen(false);
      if (onProjectUpdated) {
        onProjectUpdated(res.data);
      }
    } catch (error) {
      console.error(error);
      toast.error("Greška pri ažuriranju projekta");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Edit className="mr-2 h-4 w-4" />
          Uredi
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Uredi Projekt</DialogTitle>
          <DialogDescription>
            Izmijenite detalje projekta i raspodjelu troškova.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <form
            id="edit-project-form"
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-6 py-4"
          >
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground border-b pb-2">
                Osnovne informacije
              </h3>
              <div className="space-y-2">
                <Label htmlFor="name">Naziv projekta</Label>
                <Input id="name" {...register("name", { required: true })} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Opis</Label>
                <Textarea id="description" {...register("description")} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start_date">Datum početka</Label>
                  <Input
                    id="start_date"
                    type="date"
                    {...register("start_date")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end_date">Datum završetka</Label>
                  <Input id="end_date" type="date" {...register("end_date")} />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground border-b pb-2">
                Financije
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="budget">Ukupni Budžet (€)</Label>
                  <Input
                    id="budget"
                    type="number"
                    step="0.01"
                    {...register("budget")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="projected_revenue">
                    Projicirani Prihod (€)
                  </Label>
                  <Input
                    id="projected_revenue"
                    type="number"
                    step="0.01"
                    {...register("projected_revenue")}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label>Stavke Budžeta (Kategorije)</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => append({ category: "", amount: 0 })}
                  >
                    <Plus className="h-3 w-3 mr-1" /> Dodaj
                  </Button>
                </div>

                {fields.length === 0 && (
                  <div className="text-xs text-muted-foreground text-center py-2 border border-dashed rounded-md">
                    Nema definiranih potkategorija.
                  </div>
                )}

                <div className="space-y-2">
                  {fields.map((field, index) => (
                    <div key={field.id} className="flex gap-2 items-center">
                      <Input
                        placeholder="Kategorija (npr. Gradnja)"
                        {...register(`breakdown_items.${index}.category`)}
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        placeholder="Iznos"
                        step="0.01"
                        {...register(`breakdown_items.${index}.amount`)}
                        className="w-32"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => remove(index)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </form>
        </ScrollArea>

        <DialogFooter>
          <Button type="submit" form="edit-project-form" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Spremi promjene
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
