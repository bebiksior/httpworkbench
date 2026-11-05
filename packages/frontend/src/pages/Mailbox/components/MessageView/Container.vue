<script setup lang="ts">
import Button from "primevue/button";
import Skeleton from "primevue/skeleton";
import dayjs from "dayjs";
import { computed, ref, watch } from "vue";
import { apiPaths } from "@/api/paths";
import { HttpEditor } from "@/components/HttpEditor";
import { useNotify } from "@/composables";
import { config } from "@/config";
import {
  useDeleteMessage,
  useMailMessage,
  useMessageSource,
} from "@/queries/domains/useMailboxes";
import { EmailFrame } from "../EmailFrame";
import { sanitizeEmailHtml } from "../../sanitizeEmail";
import {
  addressLabel,
  formatSize,
  hasRemoteContent,
  linkifyText,
  replyDraft,
  type ComposeDraft,
} from "../../mail";

type ViewMode = "html" | "text" | "source";

const props = defineProps<{
  mailboxId: string;
  messageId: string;
}>();

const emit = defineEmits<{
  back: [];
  reply: [draft: ComposeDraft];
  deleted: [];
}>();

const notify = useNotify();
const {
  data: message,
  isLoading,
  error,
} = useMailMessage(
  () => props.mailboxId,
  () => props.messageId,
);
const deleteMutation = useDeleteMessage(() => props.mailboxId);

const mode = ref<ViewMode>("html");
const allowRemote = ref(false);

const modes = computed(() => {
  const available: { id: ViewMode; label: string }[] = [];
  if (message.value?.html !== undefined)
    available.push({ id: "html", label: "HTML" });
  if (message.value?.text !== undefined)
    available.push({ id: "text", label: "Text" });
  available.push({ id: "source", label: "Source" });
  return available;
});

watch(
  () => message.value?.id,
  (id) => {
    if (id !== undefined) {
      allowRemote.value = false;
      mode.value = modes.value[0]?.id ?? "source";
    }
  },
  { immediate: true },
);

const { data: source, isLoading: isLoadingSource } = useMessageSource(
  () => props.mailboxId,
  () => props.messageId,
  () => mode.value === "source" && message.value?.id === props.messageId,
);

const sanitizedHtml = computed(() =>
  message.value?.html === undefined
    ? undefined
    : sanitizeEmailHtml(message.value.html),
);

const showRemoteNotice = computed(
  () =>
    mode.value === "html" &&
    !allowRemote.value &&
    sanitizedHtml.value !== undefined &&
    hasRemoteContent(`${sanitizedHtml.value.head}${sanitizedHtml.value.body}`),
);

const textSegments = computed(() => linkifyText(message.value?.text ?? ""));

const sender = computed(() => message.value?.from);
const date = computed(() =>
  message.value === undefined
    ? ""
    : dayjs(message.value.timestamp).format("MMM D, YYYY HH:mm"),
);

const attachmentHref = (index: number) =>
  apiPaths.mailboxMessageAttachment(props.mailboxId, props.messageId, index);

const reply = () => {
  if (message.value !== undefined) {
    emit("reply", replyDraft(message.value));
  }
};

const remove = () => {
  deleteMutation.mutate(props.messageId, {
    onSuccess: () => emit("deleted"),
    onError: (err) => notify.error("Failed to delete message", err),
  });
};
</script>

<template>
  <article class="flex h-full min-h-0 flex-col bg-white dark:bg-surface-800">
    <div
      v-if="error"
      class="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-surface-500"
    >
      {{ error.message }}
      <Button
        label="Back"
        severity="secondary"
        text
        size="small"
        @click="emit('back')"
      />
    </div>

    <template v-else>
      <header
        class="shrink-0 border-b border-surface-200 px-4 pt-3 pb-4 sm:px-6 sm:pt-4 dark:border-surface-700"
      >
        <div class="flex items-start gap-2">
          <h2
            class="min-w-0 flex-1 pt-1 text-lg leading-snug font-semibold break-words text-surface-900 dark:text-surface-0"
          >
            <Skeleton v-if="isLoading" width="60%" height="1.4rem" />
            <template v-else>{{ message?.subject || "(no subject)" }}</template>
          </h2>
          <div class="flex shrink-0 items-center gap-0.5">
            <Button
              v-if="
                config.smtpSendingEnabled && message?.direction === 'inbound'
              "
              icon="pi pi-reply"
              severity="secondary"
              text
              rounded
              size="small"
              aria-label="Reply"
              v-tooltip.bottom="'Reply'"
              @click="reply"
            />
            <Button
              icon="pi pi-trash"
              severity="secondary"
              text
              rounded
              size="small"
              aria-label="Delete message"
              v-tooltip.bottom="'Delete'"
              :loading="deleteMutation.isPending.value"
              @click="remove"
            />
          </div>
        </div>

        <div v-if="isLoading" class="mt-3 space-y-2">
          <Skeleton width="40%" height="0.85rem" />
          <Skeleton width="30%" height="0.75rem" />
        </div>
        <div
          v-else-if="message"
          class="mt-2 flex flex-wrap items-end justify-between gap-x-4 gap-y-2"
        >
          <div class="min-w-0 text-sm">
            <p class="truncate">
              <span class="font-medium text-surface-900 dark:text-surface-0">{{
                addressLabel(sender)
              }}</span>
              <span
                v-if="sender && sender.name.trim()"
                class="ml-1.5 text-surface-500 dark:text-surface-400"
                >{{ sender.address }}</span
              >
            </p>
            <p
              class="mt-0.5 truncate text-xs text-surface-500 dark:text-surface-400"
            >
              to
              {{ message.to.join(", ") || message.envelope.rcptTo.join(", ") }}
              <span class="mx-1.5 text-surface-300 dark:text-surface-600"
                >·</span
              >
              <span class="tabular-nums">{{ date }}</span>
            </p>
          </div>
          <div
            class="flex shrink-0 rounded-md bg-surface-100 p-0.5 dark:bg-surface-900/60"
            role="tablist"
            aria-label="View"
          >
            <button
              v-for="entry in modes"
              :key="entry.id"
              type="button"
              role="tab"
              :aria-selected="mode === entry.id"
              class="h-6 rounded px-2.5 text-xs font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-primary"
              :class="
                mode === entry.id
                  ? 'bg-white text-surface-900 shadow-sm dark:bg-surface-700 dark:text-surface-0'
                  : 'text-surface-500 hover:text-surface-900 dark:text-surface-400 dark:hover:text-surface-0'
              "
              @click="mode = entry.id"
            >
              {{ entry.label }}
            </button>
          </div>
        </div>
      </header>

      <div
        v-if="showRemoteNotice"
        class="flex shrink-0 items-center justify-between gap-3 border-b border-surface-200 bg-surface-50 px-4 py-1.5 text-xs text-surface-600 sm:px-6 dark:border-surface-700 dark:bg-surface-900/40 dark:text-surface-300"
      >
        Remote images are blocked
        <button
          type="button"
          class="rounded px-1.5 py-0.5 font-medium text-surface-900 transition-colors duration-150 hover:bg-surface-200 dark:text-surface-0 dark:hover:bg-surface-700"
          @click="allowRemote = true"
        >
          Load images
        </button>
      </div>

      <div class="relative min-h-0 flex-1 overflow-auto">
        <div v-if="isLoading" class="space-y-2 px-6 py-5">
          <Skeleton width="90%" height="0.8rem" />
          <Skeleton width="75%" height="0.8rem" />
          <Skeleton width="82%" height="0.8rem" />
        </div>
        <EmailFrame
          v-else-if="mode === 'html' && sanitizedHtml"
          :email="sanitizedHtml"
          :allow-remote="allowRemote"
        />
        <pre
          v-else-if="message && mode === 'text'"
          class="px-4 py-5 font-sans text-sm leading-relaxed break-words whitespace-pre-wrap text-surface-800 sm:px-6 dark:text-surface-100"
        ><template v-for="(segment, index) in textSegments" :key="index"><a v-if="segment.href" :href="segment.href" target="_blank" rel="noopener noreferrer" class="text-sky-600 underline decoration-sky-600/30 underline-offset-2 transition-colors hover:decoration-sky-600 dark:text-sky-400">{{ segment.text }}</a><template v-else>{{ segment.text }}</template></template></pre>
        <div v-else-if="message" class="p-2 sm:p-3">
          <Skeleton v-if="isLoadingSource" width="100%" height="12rem" />
          <HttpEditor
            v-else
            :model-value="source ?? ''"
            syntax="smtp"
            readonly
            auto-height
          />
        </div>
      </div>

      <footer
        v-if="message && message.attachments.length > 0"
        class="flex shrink-0 flex-wrap gap-2 border-t border-surface-200 px-4 py-3 sm:px-6 dark:border-surface-700"
      >
        <a
          v-for="attachment in message.attachments"
          :key="attachment.index"
          :href="attachmentHref(attachment.index)"
          download
          class="inline-flex max-w-64 items-center gap-2 rounded-md border border-surface-200 px-2.5 py-1.5 text-xs text-surface-700 transition-colors duration-150 hover:border-surface-400 hover:bg-surface-50 dark:border-surface-700 dark:text-surface-200 dark:hover:border-surface-500 dark:hover:bg-surface-700/40"
        >
          <i
            class="pi pi-paperclip text-[11px] text-surface-400"
            aria-hidden="true"
          />
          <span class="truncate">{{
            attachment.filename ?? attachment.mimeType
          }}</span>
          <span class="shrink-0 text-surface-400 tabular-nums">{{
            formatSize(attachment.sizeBytes)
          }}</span>
        </a>
      </footer>
    </template>
  </article>
</template>
