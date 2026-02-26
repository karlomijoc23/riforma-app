import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { Loader2, Plus, Euro } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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

export function AddTransactionDialog({ projectId, onTransactionAdded }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, reset, setValue } = useForm({
    defaultValues: {
      date: new Date().toISOString().split("T")[0],
      type: "expense",
      category: "other",
    },
  });

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      const payload = {
        ...data,
        amount: parseFloat(data.amount),
      };
      const res = await api.addProjectTransaction(projectId, payload);
      toast.success("Transakcija zabilježena");
      reset();
      onTransactionAdded(res.data);
      setOpen(false);
    } catch (error) {
      console.error("Failed to add transaction", error);
      toast.error("Neuspjeh pri dodavanju transakcije");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="mr-2 h-4 w-4" />
          Nova Transakcija
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Dodaj Transakciju</DialogTitle>
          <DialogDescription>
            Evidentiraj trošak ili uplatu vezanu uz projekt.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">Datum</Label>
              <Input
                id="date"
                type="date"
                {...register("date", { required: true })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Tip</Label>
              <Select
                onValueChange={(val) => setValue("type", val)}
                defaultValue="expense"
              >
                <SelectTrigger>
                  <SelectValue placeholder="Odaberi tip" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">Trošak</SelectItem>
                  <SelectItem value="income">Prihod</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Kategorija</Label>
            <Select
              onValueChange={(val) => setValue("category", val)}
              defaultValue="other"
            >
              <SelectTrigger>
                <SelectValue placeholder="Kategorija" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="construction">Građevinski radovi</SelectItem>
                <SelectItem value="permits">Dozvole</SelectItem>
                <SelectItem value="planning">Projektiranje</SelectItem>
                <SelectItem value="utilities">Komunalije</SelectItem>
                <SelectItem value="marketing">Marketing</SelectItem>
                <SelectItem value="other">Ostalo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Iznos (€)</Label>
            <div className="relative">
              <Euro className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="amount"
                type="number"
                step="0.01"
                className="pl-9"
                {...register("amount", { required: true })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="paid_to">Plaćeno kome / Od koga</Label>
            <Input
              id="paid_to"
              {...register("paid_to")}
              placeholder="npr. Izvođač d.o.o."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Opis</Label>
            <Textarea
              id="description"
              {...register("description")}
              placeholder="Detalji transakcije..."
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Odustani
            </Button>
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
