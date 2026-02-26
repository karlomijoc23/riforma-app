import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { Loader2, Link as LinkIcon, Building } from "lucide-react";
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
import { Label } from "../../../components/ui/label";
import { api } from "../../../shared/api";
import { toast } from "../../../components/ui/sonner";

export function LinkPropertyDialog({ project, onProjectUpdated }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [properties, setProperties] = useState([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState(
    project?.linked_property_id || "",
  );

  useEffect(() => {
    if (open) {
      loadProperties();
      setSelectedPropertyId(project?.linked_property_id || "");
    }
  }, [open, project]);

  const loadProperties = async () => {
    try {
      const res = await api.getNekretnine();
      setProperties(res.data);
    } catch (error) {
      console.error("Failed to load properties", error);
      toast.error("Greška pri učitavanju nekretnina");
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const payload = {
        linked_property_id: selectedPropertyId,
      };

      // We use updateProject which hits PUT /projekti/{id} and supports linked_property_id
      const res = await api.updateProject(project.id, payload);
      toast.success("Nekretnina uspješno povezana");
      setOpen(false);
      if (onProjectUpdated) {
        onProjectUpdated(res.data);
      }
    } catch (error) {
      console.error(error);
      toast.error("Greška pri povezivanju nekretnine");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <LinkIcon className="mr-2 h-4 w-4" />
          {project.linked_property_id
            ? "Promijeni Nekretninu"
            : "Poveži Nekretninu"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Poveži Nekretninu</DialogTitle>
          <DialogDescription>
            Odaberite nekretninu iz inventara koja se gradi ili razvija u sklopu
            ovog projekta.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div className="space-y-2">
            <Label>Nekretnina</Label>
            <Select
              value={selectedPropertyId}
              onValueChange={setSelectedPropertyId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Odaberite nekretninu" />
              </SelectTrigger>
              <SelectContent>
                {properties.map((property) => (
                  <SelectItem key={property.id} value={property.id}>
                    {property.naziv} ({property.adresa})
                  </SelectItem>
                ))}
                {properties.length === 0 && (
                  <div className="p-2 text-sm text-muted-foreground text-center">
                    Nema dostupnih nekretnina.
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>
          {selectedPropertyId && (
            <div className="bg-muted p-3 rounded-md flex items-center gap-3 text-sm">
              <Building className="h-4 w-4 text-primary" />
              <span>
                Odabrana nekretnina bit će prikazana u tabu "Inventar".
              </span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            onClick={handleSave}
            disabled={loading || !selectedPropertyId}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Spremi Poveznicu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
