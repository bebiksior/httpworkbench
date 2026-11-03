import { useEventListener } from "@vueuse/core";
import type { ConfirmationOptions } from "primevue/confirmationoptions";
import { useConfirm } from "primevue/useconfirm";
import type { Ref } from "vue";
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRouter } from "vue-router";
import { createLeaveGuard } from "@/pages/PoCBuilder/exitBuilder";

export const unsavedResponsesDialog = (
  accept: () => void,
): ConfirmationOptions => ({
  message: "You have unsaved response changes. Leave without saving?",
  header: "Unsaved Changes",
  icon: "pi pi-exclamation-triangle",
  rejectProps: { label: "Cancel", severity: "secondary", outlined: true },
  acceptProps: { label: "Leave", severity: "danger" },
  accept,
});

const isSaveShortcut = (event: KeyboardEvent) =>
  !event.defaultPrevented &&
  (event.metaKey || event.ctrlKey) &&
  !event.altKey &&
  !event.shiftKey &&
  event.key.toLowerCase() === "s";

export const useUnsavedChanges = (options: {
  isDirty: Ref<boolean>;
  discard: () => void;
  save: () => unknown;
}) => {
  const router = useRouter();
  const confirm = useConfirm();

  useEventListener(window, "keydown", (event: KeyboardEvent) => {
    if (!isSaveShortcut(event)) return;
    event.preventDefault();
    void options.save();
  });

  useEventListener(window, "beforeunload", (event: BeforeUnloadEvent) => {
    if (options.isDirty.value) {
      event.preventDefault();
    }
  });

  const leaveGuard = createLeaveGuard({
    isDirty: () => options.isDirty.value,
    markClean: options.discard,
    confirmLeave: (accept) => confirm.require(unsavedResponsesDialog(accept)),
    navigate: (target) => {
      void router.push(target);
    },
  });

  onBeforeRouteLeave((to, _from, next) => leaveGuard(to, next));
  onBeforeRouteUpdate((to, from, next) =>
    to.params.id === from.params.id ? next() : leaveGuard(to, next),
  );
};
