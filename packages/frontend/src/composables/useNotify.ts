import { useToast } from "primevue/usetoast";
import { getErrorMessage } from "@/utils/error";

export const useNotify = () => {
  const toast = useToast();

  return {
    success: (summary: string, detail?: string) => {
      toast.add({ severity: "success", summary, detail, life: 3000 });
    },
    error: (summary: string, error?: unknown) => {
      toast.add({
        severity: "error",
        summary,
        detail: error !== undefined ? getErrorMessage(error) : undefined,
        life: 5000,
      });
    },
    warn: (summary: string, detail?: string) => {
      toast.add({ severity: "warn", summary, detail, life: 5000 });
    },
    copied: () => {
      toast.add({
        severity: "success",
        summary: "Copied to clipboard",
        life: 3000,
      });
    },
  };
};
