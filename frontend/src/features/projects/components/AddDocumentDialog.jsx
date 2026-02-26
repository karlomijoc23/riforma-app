import React from "react";
import { useForm } from "react-hook-form";
import { Button } from "../../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../../components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../../../components/ui/form";
import { Input } from "../../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { Textarea } from "../../../components/ui/textarea";
import { toast } from "../../../components/ui/sonner";
import { api } from "../../../shared/api";
import { Loader2, Plus } from "lucide-react";

export function AddDocumentDialog({ projectId, onDocumentAdded }) {
  const [open, setOpen] = React.useState(false);
  const [selectedFile, setSelectedFile] = React.useState(null);
  const form = useForm({
    defaultValues: {
      name: "",
      type: "other",
      status: "pending",
      notes: "",
    },
  });

  const onSubmit = async (data) => {
    try {
      const formData = new FormData();
      formData.append("name", data.name);
      formData.append("type", data.type);
      formData.append("status", data.status);
      if (data.notes) formData.append("notes", data.notes);
      if (selectedFile) {
        formData.append("file", selectedFile);
      }

      const res = await api.addProjectDocument(projectId, formData);
      toast.success("Dokument uspješno dodan");
      setOpen(false);
      form.reset();
      setSelectedFile(null);
      if (onDocumentAdded) onDocumentAdded(res.data);
    } catch (error) {
      console.error("Error adding document:", error);
      toast.error("Greška prilikom dodavanja dokumenta");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          Dodaj Dokument
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novi Dokument</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              rules={{ required: "Naziv je obavezan" }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Naziv Dokumenta</FormLabel>
                  <FormControl>
                    <Input placeholder="npr. Građevinska dozvola" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tip</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Odaberi tip" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="permit">Dozvola</SelectItem>
                        <SelectItem value="contract">Ugovor</SelectItem>
                        <SelectItem value="drawing">Nacrt</SelectItem>
                        <SelectItem value="report">Izvještaj</SelectItem>
                        <SelectItem value="certificate">Certifikat</SelectItem>
                        <SelectItem value="other">Ostalo</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Odaberi status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="pending">Na čekanju</SelectItem>
                        <SelectItem value="valid">Važeće</SelectItem>
                        <SelectItem value="expired">Isteklo</SelectItem>
                        <SelectItem value="missing">Nedostaje</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormItem>
              <FormLabel>Datoteka</FormLabel>
              <FormControl>
                <Input
                  type="file"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Napomena</FormLabel>
                  <FormControl>
                    <Textarea placeholder="" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              disabled={form.formState.isSubmitting}
              className="w-full"
            >
              {form.formState.isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Spremi Dokument
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
