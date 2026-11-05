<script setup lang="ts">
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import InputGroup from "primevue/inputgroup";
import InputGroupAddon from "primevue/inputgroupaddon";
import InputText from "primevue/inputtext";
import { MailboxLocalPartSchema, type Mailbox } from "shared";
import { computed, ref, watch } from "vue";
import { useNotify } from "@/composables";
import { useUpdateMailbox } from "@/queries/domains/useMailboxes";

const props = defineProps<{ mailbox: Mailbox }>();

const visible = defineModel<boolean>("visible", { required: true });

const notify = useNotify();
const updateMutation = useUpdateMailbox();
const localPart = ref("");
const label = ref("");

watch(visible, (isVisible) => {
  if (isVisible) {
    localPart.value = props.mailbox.localPart;
    label.value = props.mailbox.label ?? "";
  }
});

const host = computed(() => props.mailbox.address.split("@")[1] ?? "");
const localPartError = computed(
  () =>
    MailboxLocalPartSchema.safeParse(localPart.value).error?.issues[0]?.message,
);

const save = () => {
  if (localPartError.value !== undefined) {
    return;
  }
  updateMutation.mutate(
    {
      id: props.mailbox.id,
      input: { localPart: localPart.value, label: label.value },
    },
    {
      onSuccess: () => {
        visible.value = false;
      },
      onError: (err) => notify.error("Failed to update mailbox", err),
    },
  );
};
</script>

<template>
  <Dialog
    v-model:visible="visible"
    header="Edit mailbox"
    modal
    dismissable-mask
    :draggable="false"
    :style="{ width: 'min(480px, calc(100vw - 2rem))' }"
  >
    <form class="flex flex-col gap-5" @submit.prevent="save">
      <label class="flex flex-col gap-1.5">
        <span class="text-sm font-medium text-surface-700 dark:text-surface-200"
          >Label</span
        >
        <InputText v-model="label" maxlength="100" placeholder="Optional" />
      </label>
      <label class="flex flex-col gap-1.5">
        <span class="text-sm font-medium text-surface-700 dark:text-surface-200"
          >Sending address</span
        >
        <InputGroup>
          <InputText
            v-model="localPart"
            class="font-mono text-sm"
            spellcheck="false"
            autocomplete="off"
            :invalid="localPartError !== undefined"
          />
          <InputGroupAddon class="max-w-[55%] font-mono text-xs">
            <span class="truncate">@{{ host }}</span>
          </InputGroupAddon>
        </InputGroup>
        <span
          v-if="localPartError"
          class="text-xs text-red-500 dark:text-red-400"
          >{{ localPartError }}</span
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
          :disabled="localPartError !== undefined"
        />
      </div>
    </form>
  </Dialog>
</template>
