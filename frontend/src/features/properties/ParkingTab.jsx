import React, { useState, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../../components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Badge } from "../../components/ui/badge";
import { Loader2, Plus, Car, Trash2, Edit2 } from "lucide-react";
import { api } from "../../shared/api";
import { toast } from "../../components/ui/sonner";

const ParkingTab = ({ nekretninaId, zakupnici }) => {
  const [spaces, setSpaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSpace, setEditingSpace] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Delete Dialog State
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [spaceToDelete, setSpaceToDelete] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    floor: "",
    internal_id: "",
    tenant_id: "none",
    vehicle_plates: ["", ""], // Max 2 plates
    notes: "",
  });

  const fetchSpaces = async () => {
    setLoading(true);
    try {
      const res = await api.getParking(nekretninaId);
      setSpaces(res.data || []);
    } catch (error) {
      console.error("Error fetching parking spaces:", error);
      toast.error("Neuspješno učitavanje parkirnih mjesta.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (nekretninaId) {
      fetchSpaces();
    }
  }, [nekretninaId]);

  const handleOpenDialog = (space = null) => {
    if (space) {
      setEditingSpace(space);
      setFormData({
        floor: space.floor,
        internal_id: space.internal_id,
        tenant_id: space.tenant_id || "none",
        vehicle_plates: [
          space.vehicle_plates?.[0] || "",
          space.vehicle_plates?.[1] || "",
        ],
        notes: space.notes || "",
      });
    } else {
      setEditingSpace(null);
      setFormData({
        floor: "",
        internal_id: "",
        tenant_id: "none",
        vehicle_plates: ["", ""],
        notes: "",
      });
    }
    setIsDialogOpen(true);
  };

  const handlePlateChange = (index, value) => {
    const newPlates = [...formData.vehicle_plates];
    newPlates[index] = value.toUpperCase(); // Force uppercase
    setFormData({ ...formData, vehicle_plates: newPlates });
  };

  const handleSubmit = async () => {
    if (!formData.internal_id || !formData.floor) {
      toast.error("Molimo unesite kat i oznaku mjesta.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        nekretnina_id: nekretninaId,
        floor: formData.floor,
        internal_id: formData.internal_id,
        tenant_id: formData.tenant_id === "none" ? null : formData.tenant_id,
        vehicle_plates: formData.vehicle_plates.filter((p) => p.trim() !== ""),
        notes: formData.notes,
      };

      if (editingSpace) {
        const res = await api.updateParking(editingSpace.id, payload);
        setSpaces((prev) =>
          prev.map((s) => (s.id === editingSpace.id ? res.data : s)),
        );
        toast.success("Parkirno mjesto ažurirano.");
      } else {
        const res = await api.createParking(payload);
        setSpaces((prev) => [...prev, res.data]);
        toast.success("Parkirno mjesto kreirano.");
      }
      setIsDialogOpen(false);
      // fetchSpaces(); // No longer needed
    } catch (error) {
      console.error("Error saving parking space:", error);
      toast.error("Spremanje nije uspjelo.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteClick = (space) => {
    setSpaceToDelete(space);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!spaceToDelete) return;

    try {
      await api.deleteParking(spaceToDelete.id);
      toast.success("Parkirno mjesto obrisano.");
      setSpaceToDelete(null);
      setDeleteDialogOpen(false);
      fetchSpaces();
    } catch (error) {
      console.error("Error deleting:", error);
      toast.error("Brisanje nije uspjelo.");
    }
  };

  const getTenantName = (id) => {
    if (!id) return "—";
    const t = zakupnici.find((z) => z.id === id);
    return t ? t.naziv_firme || t.ime_prezime : "Nepoznat";
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">
          Garažna mjesta ({spaces.length})
        </h3>
        <Button onClick={() => handleOpenDialog()} variant="outline" size="sm">
          <Plus className="mr-2 h-4 w-4" /> Dodaj mjesto
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Oznaka</TableHead>
              <TableHead>Kat</TableHead>
              <TableHead>Zakupnik</TableHead>
              <TableHead>Registracije</TableHead>
              <TableHead className="text-right">Akcije</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {spaces.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-24 text-center text-muted-foreground"
                >
                  Nema unesenih parkirnih mjesta.
                </TableCell>
              </TableRow>
            ) : (
              spaces.map((space) => (
                <TableRow key={space.id}>
                  <TableCell className="font-medium">
                    {space.internal_id}
                  </TableCell>
                  <TableCell>{space.floor}</TableCell>
                  <TableCell>{getTenantName(space.tenant_id)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {space.vehicle_plates?.length > 0 ? (
                        space.vehicle_plates.map((plate, idx) => (
                          <Badge
                            key={idx}
                            variant="secondary"
                            className="font-mono text-xs"
                          >
                            {plate}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleOpenDialog(space)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDeleteClick(space)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingSpace ? "Uredi parkirno mjesto" : "Novo parkirno mjesto"}
            </DialogTitle>
            <DialogDescription>
              Unesite detalje o parkirnom mjestu i pridruženim vozilima.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Interna oznaka</Label>
                <Input
                  value={formData.internal_id}
                  onChange={(e) =>
                    setFormData({ ...formData, internal_id: e.target.value })
                  }
                  placeholder="npr. PM-12"
                />
              </div>
              <div className="space-y-2">
                <Label>Kat / Etaža</Label>
                <Input
                  value={formData.floor}
                  onChange={(e) =>
                    setFormData({ ...formData, floor: e.target.value })
                  }
                  placeholder="npr. -2"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Zakupnik</Label>
              <Select
                value={formData.tenant_id}
                onValueChange={(val) =>
                  setFormData({ ...formData, tenant_id: val })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Odaberi zakupnika" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nije dodijeljeno</SelectItem>
                  {zakupnici.map((z) => (
                    <SelectItem key={z.id} value={z.id}>
                      {z.naziv_firme || z.ime_prezime}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Registracijske oznake (Max 2)</Label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Car className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Vozilo 1"
                    value={formData.vehicle_plates[0]}
                    onChange={(e) => handlePlateChange(0, e.target.value)}
                  />
                </div>
                <div className="flex-1 relative">
                  <Car className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Vozilo 2"
                    value={formData.vehicle_plates[1]}
                    onChange={(e) => handlePlateChange(1, e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Napomena</Label>
              <Input
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Odustani
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Spremi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Jeste li sigurni?</AlertDialogTitle>
            <AlertDialogDescription>
              Ova radnja se ne može poništiti. Ovo će trajno obrisati parkirno
              mjesto{" "}
              <span className="font-medium text-foreground">
                {spaceToDelete?.internal_id}
              </span>
              .
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSpaceToDelete(null)}>
              Odustani
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Obriši
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ParkingTab;
