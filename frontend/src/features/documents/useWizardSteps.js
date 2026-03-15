import { useState, useMemo, useCallback } from "react";
import { getDocumentRequirements } from "../../shared/documents";

const STEPS = [
  { id: "upload", title: "Učitaj dokument" },
  { id: "meta", title: "Detalji" },
  { id: "linking", title: "Povezivanje" },
];

export default function useWizardSteps({ formData, uploadedFile }) {
  const [activeStep, setActiveStep] = useState(0);

  const activeRequirements = useMemo(
    () => getDocumentRequirements(formData.tip),
    [formData.tip],
  );

  const canProceedToNextStep = useMemo(() => {
    if (activeStep === 0) {
      return Boolean(uploadedFile || formData.file || formData.id);
    }
    if (activeStep === 1) {
      const metaFieldsValid = activeRequirements.metaFields.every((field) => {
        if (!field.required) return true;
        const value = formData.metadata?.[field.id];
        return Boolean(String(value ?? "").trim());
      });
      return Boolean(formData.naziv.trim() && formData.tip && metaFieldsValid);
    }
    return true;
  }, [
    activeRequirements,
    activeStep,
    formData.file,
    formData.id,
    formData.metadata,
    formData.naziv,
    formData.tip,
    uploadedFile,
  ]);

  const handleNext = useCallback(() => {
    if (activeStep < STEPS.length - 1) {
      setActiveStep((prev) => prev + 1);
    }
  }, [activeStep]);

  const handlePrev = useCallback(() => {
    if (activeStep > 0) {
      setActiveStep((prev) => prev - 1);
    }
  }, [activeStep]);

  const resetStep = useCallback(() => setActiveStep(0), []);

  return {
    steps: STEPS,
    activeStep,
    setActiveStep,
    canProceedToNextStep,
    handleNext,
    handlePrev,
    resetStep,
    isFirstStep: activeStep === 0,
    isLastStep: activeStep === STEPS.length - 1,
  };
}
