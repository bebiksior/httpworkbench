<script setup lang="ts">
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import ToggleSwitch from "primevue/toggleswitch";
import { computed, nextTick, reactive, ref, watch } from "vue";
import {
  MAIL_CONTENT_TYPE_PATTERN,
  MAX_MAIL_ATTACHMENTS,
  type MailAttachmentInput,
} from "shared";
import { useNotify } from "@/composables";
import { useSendMail } from "@/queries/domains/useMailboxes";
import {
  MAX_ATTACHMENT_BYTES,
  addAttachments,
  emptyDraft,
  formatSize,
  parseRecipients,
  type ComposeDraft,
} from "../../mail";

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
const fileInput = ref<HTMLInputElement>();
const files = ref<File[]>([]);
const preparing = ref(false);

watch(visible, async (isVisible) => {
  if (!isVisible) {
    return;
  }
  Object.assign(form, emptyDraft(), props.draft);
  files.value = [];
  await nextTick();
  bodyInput.value?.setSelectionRange(0, 0);
});

const recipients = computed(() => parseRecipients(form.to));
const canSend = computed(
  () =>
    recipients.value.length > 0 &&
    !preparing.value &&
    !sendMutation.isPending.value,
);

const attach = (event: Event) => {
  const input = event.target as HTMLInputElement;
  const { files: next, skipped } = addAttachments(files.value, [
    ...(input.files ?? []),
  ]);
  files.value = next;
  input.value = "";
  if (skipped > 0) {
    notify.warn(
      "Too many attachments",
      `Up to ${MAX_MAIL_ATTACHMENTS} files, ${formatSize(MAX_ATTACHMENT_BYTES)} in total`,
    );
  }
};

const removeFile = (index: number) => files.value.splice(index, 1);

const readBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      resolve(url.slice(url.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const toAttachment = async (file: File): Promise<MailAttachmentInput> => ({
  filename: file.name,
  contentType: MAIL_CONTENT_TYPE_PATTERN.test(file.type)
    ? file.type
    : undefined,
  content: await readBase64(file),
});

const send = async () => {
  if (!canSend.value) {
    return;
  }
  preparing.value = true;
  const attachments = await Promise.all(files.value.map(toAttachment))
    .catch((err: unknown) => {
      notify.error("Failed to read attachment", err);
      return undefined;
    })
    .finally(() => (preparing.value = false));
  if (attachments === undefined) {
    return;
  }
  sendMutation.mutate(
    {
      to: recipients.value,
      subject: form.subject,
      text: form.html ? "" : form.body,
      html: form.html ? form.body : undefined,
      inReplyTo: form.inReplyTo,
      attachments: attachments.length > 0 ? attachments : undefined,
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
      <ul v-if="files.length > 0" class="flex flex-wrap gap-2 pb-3">
        <li
          v-for="(file, index) in files"
          :key="`${file.name}-${index}`"
          class="inline-flex max-w-64 items-center gap-2 rounded-md border border-surface-200 py-1 pr-1 pl-2.5 text-xs text-surface-700 dark:border-surface-700 dark:text-surface-200"
        >
          <span class="truncate">{{ file.name }}</span>
          <span class="shrink-0 text-surface-400 tabular-nums">{{
            formatSize(file.size)
          }}</span>
          <button
            type="button"
            class="flex size-5 shrink-0 items-center justify-center rounded text-surface-400 transition-colors duration-150 hover:bg-surface-100 hover:text-surface-700 dark:hover:bg-surface-700 dark:hover:text-surface-100"
            :aria-label="`Remove ${file.name}`"
            @click="removeFile(index)"
          >
            <i class="pi pi-times text-[10px]" aria-hidden="true" />
          </button>
        </li>
      </ul>
      <div
        class="flex items-center justify-between gap-3 border-t border-surface-200 pt-4 dark:border-surface-700"
      >
        <div class="flex items-center gap-4">
          <label
            class="flex cursor-pointer items-center gap-2 text-sm text-surface-600 dark:text-surface-300"
          >
            <ToggleSwitch v-model="form.html" />
            HTML
          </label>
          <Button
            type="button"
            icon="pi pi-paperclip"
            severity="secondary"
            text
            rounded
            aria-label="Attach files"
            v-tooltip.top="'Attach files'"
            @click="fileInput?.click()"
          />
          <input
            ref="fileInput"
            type="file"
            multiple
            class="hidden"
            @change="attach"
          />
        </div>
        <div class="flex items-center gap-3">
          <kbd class="hidden font-sans text-xs text-surface-400 sm:inline"
            >⌘ Enter</kbd
          >
          <Button
            type="submit"
            label="Send"
            icon="pi pi-send"
            icon-pos="right"
            :loading="preparing || sendMutation.isPending.value"
            :disabled="!canSend"
          />
        </div>
      </div>
    </form>
  </Dialog>
</template>
