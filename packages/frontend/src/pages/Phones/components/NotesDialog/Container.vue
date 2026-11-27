<script setup lang="ts">
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import { PHONE_NOTES_MAX_LENGTH, type Phone } from "shared";
import { ref } from "vue";
import { useNotify } from "@/composables";
import { useUpdatePhoneNotes } from "@/queries/domains/usePhones";
import { formatPhoneNumber } from "../../phone";

const props = defineProps<{ phone: Phone }>();

const visible = defineModel<boolean>("visible", { required: true });

const notify = useNotify();
const updateMutation = useUpdatePhoneNotes();
const notes = ref(props.phone.notes ?? "");

const save = () =>
  updateMutation.mutate(
    { id: props.phone.id, notes: notes.value.trim() },
    {
      onSuccess: () => {
        visible.value = false;
      },
      onError: (err) => notify.error("Failed to update notes", err),
    },
  );
</script>

<template>
  <Dialog
    v-model:visible="visible"
    :header="`Notes for ${formatPhoneNumber(phone.number)}`"
    modal
    dismissable-mask
    :draggable="false"
    :style="{ width: 'min(480px, calc(100vw - 2rem))' }"
  >
    <form class="flex flex-col gap-5" @submit.prevent="save">
      <label class="flex flex-col gap-1.5">
        <span class="text-sm font-medium text-surface-700 dark:text-surface-200"
          >Notes</span
        >
        <InputText
          v-model="notes"
          :maxlength="PHONE_NOTES_MAX_LENGTH"
          placeholder="Site and account that use this number"
          autofocus
        />
        <span class="text-xs text-surface-500 dark:text-surface-400"
          >Saved with the provider.</span
        >
      </label>
      <div class="flex justify-end gap-2">
        <Button
          label="Cancel"
          severity="secondary"
          text
          @click="visible = false"
        />
        <Button
          type="submit"
          label="Save"
          :loading="updateMutation.isPending.value"
        />
      </div>
    </form>
  </Dialog>
</template>
