import { useCallback } from "react";
import { toast } from "../../components/ui/sonner";
import { getDocumentRequirements } from "../../shared/documents";

export default function useDocumentSubmit({
  formData,
  onSubmit,
  onResetState,
  setActiveStep,
}) {
  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      const requirements = getDocumentRequirements(formData.tip);

      if (!formData.file && !formData.id) {
        toast.error("PDF dokument je obavezan. Učitajte PDF prije spremanja.");
        return;
      }
      if (requirements.requireProperty && !formData.nekretnina_id) {
        toast.error("Za ovaj tip dokumenta odaberite pripadajuću nekretninu.");
        setActiveStep(2);
        return;
      }
      if (
        requirements.requireTenant &&
        requirements.allowTenant &&
        !formData.zakupnik_id
      ) {
        toast.error("Za ovaj tip dokumenta povežite zakupnika.");
        setActiveStep(2);
        return;
      }
      if (
        requirements.requireContract &&
        requirements.allowContract &&
        !formData.ugovor_id
      ) {
        toast.error("Za ovaj tip dokumenta povežite ugovor.");
        setActiveStep(2);
        return;
      }
      const missingMeta = requirements.metaFields.find((field) => {
        if (!field.required) return false;
        const value = formData.metadata?.[field.id];
        return !String(value ?? "").trim();
      });
      if (missingMeta) {
        toast.error(`Popunite polje "${missingMeta.label}".`);
        setActiveStep(1);
        return;
      }
      try {
        const metadataPayload = {};
        for (const field of requirements.metaFields) {
          const raw = formData.metadata?.[field.id];
          if (raw === undefined || raw === null) continue;
          if (typeof raw === "string") {
            const trimmed = raw.trim();
            if (!trimmed) continue;
            if (field.type === "number") {
              const numeric = Number(trimmed);
              if (!Number.isNaN(numeric)) {
                metadataPayload[field.id] = numeric;
              }
            } else {
              metadataPayload[field.id] = trimmed;
            }
          } else {
            metadataPayload[field.id] = raw;
          }
        }
        await onSubmit({
          ...formData,
          nekretnina_id: formData.nekretnina_id || null,
          zakupnik_id: requirements.allowTenant
            ? formData.zakupnik_id || null
            : null,
          ugovor_id: requirements.allowContract
            ? formData.ugovor_id || null
            : null,
          property_unit_id: requirements.allowPropertyUnit
            ? formData.property_unit_id || null
            : null,
          metadata: metadataPayload,
        });
        onResetState();
      } catch (error) {
        console.error("Greška pri spremanju dokumenta:", error);
      }
    },
    [formData, onResetState, onSubmit, setActiveStep],
  );

  return { handleSubmit };
}
