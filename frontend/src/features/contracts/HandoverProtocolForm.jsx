import React, { useState, useEffect } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Card, CardContent } from "../../components/ui/card";
import { Plus, Trash2 } from "lucide-react";

const HandoverProtocolForm = ({
  onSubmit,
  onCancel,
  initialData,
  isSubmitting,
}) => {
  const [formData, setFormData] = useState({
    type: "entry",
    date: new Date().toISOString().split("T")[0],
    meter_readings: {
      struja: "",
      voda: "",
      plin: "",
    },
    keys_handed_over: "",
    notes: "",
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        type: initialData.type || "entry",
        date: initialData.date
          ? new Date(initialData.date).toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0],
        meter_readings: initialData.meter_readings || {
          struja: "",
          voda: "",
          plin: "",
        },
        keys_handed_over: initialData.keys_handed_over || "",
        notes: initialData.notes || "",
      });
    }
  }, [initialData]);

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleMeterChange = (key, value) => {
    setFormData((prev) => ({
      ...prev,
      meter_readings: {
        ...prev.meter_readings,
        [key]: value,
      },
    }));
  };

  const addMeter = () => {
    const newKey = prompt("Unesite naziv novog brojila (npr. Grijanje):");
    if (newKey && !formData.meter_readings[newKey]) {
      handleMeterChange(newKey, "");
    }
  };

  const removeMeter = (key) => {
    setFormData((prev) => {
      const newReadings = { ...prev.meter_readings };
      delete newReadings[key];
      return { ...prev, meter_readings: newReadings };
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="protocol-type">Tip zapisnika</Label>
          <Select
            value={formData.type}
            onValueChange={(value) => handleChange("type", value)}
          >
            <SelectTrigger id="protocol-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="entry">
                Ulazni (Primopredaja u posjed)
              </SelectItem>
              <SelectItem value="exit">Izlazni (Povrat u posjed)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="protocol-date">Datum</Label>
          <Input
            id="protocol-date"
            type="date"
            value={formData.date}
            onChange={(e) => handleChange("date", e.target.value)}
            required
          />
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label>Stanja brojila</Label>
          <Button type="button" variant="outline" size="sm" onClick={addMeter}>
            <Plus className="h-4 w-4 mr-1" /> Dodaj brojilo
          </Button>
        </div>
        <Card>
          <CardContent className="p-4 space-y-3">
            {Object.entries(formData.meter_readings).map(([key, value]) => (
              <div key={key} className="flex items-center gap-3">
                <Label className="w-24 capitalize">{key}:</Label>
                <Input
                  value={value}
                  onChange={(e) => handleMeterChange(key, e.target.value)}
                  placeholder="Stanje..."
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeMeter(key)}
                  className="text-destructive hover:text-destructive/90"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {Object.keys(formData.meter_readings).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-2">
                Nema unesenih brojila.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2">
        <Label htmlFor="keys">Ključevi</Label>
        <Textarea
          id="keys"
          value={formData.keys_handed_over}
          onChange={(e) => handleChange("keys_handed_over", e.target.value)}
          placeholder="Popis predanih ključeva (npr. 2x ulazna vrata, 1x poštanski sandučić)..."
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Napomene</Label>
        <Textarea
          id="notes"
          value={formData.notes}
          onChange={(e) => handleChange("notes", e.target.value)}
          placeholder="Zatečeno stanje, oštećenja ili druge važne napomene..."
          rows={3}
        />
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Odustani
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Spremam..." : "Spremi zapisnik"}
        </Button>
      </div>
    </form>
  );
};

export default HandoverProtocolForm;
