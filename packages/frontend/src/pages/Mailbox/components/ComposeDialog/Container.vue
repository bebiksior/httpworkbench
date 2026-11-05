<script setup lang="ts">
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import ToggleSwitch from "primevue/toggleswitch";
import { computed, nextTick, reactive, ref, watch } from "vue";
import { useNotify } from "@/composables";
import { useSendMail } from "@/queries/domains/useMailboxes";
import { emptyDraft, parseRecipients, type ComposeDraft } from "../../mail";

const props = defineProps<{
  mailboxId: string;
  from: string;
  draft: ComposeDraft;
}>();

const visible = defineModel<boolean>("visible", { required: true });

const notify = useNotify();
const sendMutation = useSendMail(() => props.mailboxId);
const form = reactive<ComposeDraft>(emptyDraft());
const bodyInput = ref<HTMLTextAreaElement>();

watch(visible, async (isVisible) => {
  if (!isVisible) {
    return;
  }
  Object.assign(form, emptyDraft(), props.draft);
  await nextTick();
  bodyInput.value?.setSelectionRange(0, 0);
});

const recipients = computed(() => parseRecipients(form.to));
const canSend = computed(
  () => recipients.value.length > 0 && !sendMutation.isPending.value,
);

const send = () => {
  if (!canSend.value) {
    return;
  }
  sendMutation.mutate(
    {
      to: recipients.value,
      subject: form.subject,
      text: form.html ? "" : form.body,
      html: form.html ? form.body : undefined,
      inReplyTo: form.inReplyTo,
    },
    {
      onSuccess: ({ rejected }) => {
        visible.value = false;
        if (rejected.length > 0) {
          notify.warn(
            `Not delivered to ${rejected.length === 1 ? rejected[0]?.address : `${rejected.length} recipients`}`,
            rejected.map(({ error }) => error).join("\n"),
          );
        } else {
          notify.success("Sent");
        }
      },
      onError: (err) => notify.error("Failed to send", err),
    },
  );
};
</script>

<template>
  <Dialog
    v-model:visible="visible"
    :header="draft.inReplyTo ? 'Reply' : 'New message'"
    modal
    :draggable="false"
    :style="{ width: 'min(640px, calc(100vw - 2rem))' }"
    :pt="{ content: { class: '!pb-4' } }"
  >
    <form
      class="flex flex-col"
      @submit.prevent="send"
      @keydown.meta.enter.prevent="send"
      @keydown.ctrl.enter.prevent="send"
    >
      <div
        class="flex h-11 items-center gap-3 border-b border-surface-200 dark:border-surface-700"
      >
        <span
          class="w-14 shrink-0 text-sm text-surface-500 dark:text-surface-400"
          >From</span
        >
        <span
          class="truncate font-mono text-[13px] text-surface-600 dark:text-surface-300"
          >{{ from }}</span
        >
      </div>
      <label
        class="flex h-11 items-center gap-3 border-b border-surface-200 dark:border-surface-700"
      >
        <span
          class="w-14 shrink-0 text-sm text-surface-500 dark:text-surface-400"
          >To</span
        >
        <input
          v-model="form.to"
          :autofocus="draft.to === ''"
          type="text"
          inputmode="email"
          autocomplete="off"
          spellcheck="false"
          placeholder="name@example.com"
          class="min-w-0 flex-1 bg-transparent text-sm text-surface-900 outline-none placeholder:text-surface-400 dark:text-surface-0"
        />
      </label>
      <label
        class="flex h-11 items-center gap-3 border-b border-surface-200 dark:border-surface-700"
      >
        <span
          class="w-14 shrink-0 text-sm text-surface-500 dark:text-surface-400"
          >Subject</span
        >
        <input
          v-model="form.subject"
          type="text"
          class="min-w-0 flex-1 bg-transparent text-sm text-surface-900 outline-none placeholder:text-surface-400 dark:text-surface-0"
        />
      </label>
      <textarea
        ref="bodyInput"
        v-model="form.body"
        :autofocus="draft.to !== ''"
        :placeholder="form.html ? '<p>Hello</p>' : 'Write a message'"
        :spellcheck="!form.html"
        class="min-h-56 resize-y bg-transparent py-3 text-sm leading-relaxed text-surface-900 outline-none placeholder:text-surface-400 dark:text-surface-0"
        :class="{ 'font-mono text-[13px]': form.html }"
        aria-label="Message"
      />
      <div
        class="flex items-center justify-between gap-3 border-t border-surface-200 pt-4 dark:border-surface-700"
      >
        <label
          class="flex cursor-pointer items-center gap-2 text-sm text-surface-600 dark:text-surface-300"
        >
          <ToggleSwitch v-model="form.html" />
          HTML
        </label>
        <div class="flex items-center gap-3">
          <kbd class="hidden font-sans text-xs text-surface-400 sm:inline"
            >⌘ Enter</kbd
          >
          <Button
            type="submit"
            label="Send"
            icon="pi pi-send"
            icon-pos="right"
            :loading="sendMutation.isPending.value"
            :disabled="!canSend"
          />
        </div>
      </div>
    </form>
  </Dialog>
</template>
