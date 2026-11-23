<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  EmailFrame,
  hasRemoteContent,
  sanitizeEmailHtml,
} from "@/components/EmailFrame";
import { HttpEditor } from "@/components/HttpEditor";
import { parseSmtpLogPreview, type SmtpLogPreview } from "./smtpLogMessage";
import type { SmtpLogDisplayMode } from "./useSmtpLogDisplay";

const props = defineProps<{
  raw: string;
  displayedRaw: string;
  mode: SmtpLogDisplayMode;
}>();

const preview = ref<SmtpLogPreview>();
const previewFailed = ref(false);
const allowRemote = ref(false);

watch(
  () => (props.mode === "html" ? props.raw : undefined),
  async (raw, _, onCleanup) => {
    if (raw === undefined) {
      return;
    }
    let cancelled = false;
    onCleanup(() => {
      cancelled = true;
    });
    try {
      const parsed = await parseSmtpLogPreview(raw);
      if (!cancelled) {
        preview.value = parsed;
        previewFailed.value = false;
      }
    } catch {
      if (!cancelled) {
        previewFailed.value = true;
      }
    }
  },
  { immediate: true },
);

const sanitizedHtml = computed(() =>
  preview.value?.html === undefined
    ? undefined
    : sanitizeEmailHtml(preview.value.html),
);

const showRemoteNotice = computed(
  () =>
    !allowRemote.value &&
    sanitizedHtml.value !== undefined &&
    hasRemoteContent(`${sanitizedHtml.value.head}${sanitizedHtml.value.body}`),
);
</script>

<template>
  <template v-if="mode === 'html'">
    <div
      v-if="showRemoteNotice"
      class="flex items-center justify-between gap-3 border-b border-surface-200 bg-surface-50 px-4 py-1.5 text-xs text-surface-600 dark:border-surface-700 dark:bg-surface-900/40 dark:text-surface-300"
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
    <div v-if="sanitizedHtml" class="h-[600px]">
      <EmailFrame :email="sanitizedHtml" :allow-remote="allowRemote" />
    </div>
    <pre
      v-else-if="preview?.text"
      class="max-h-[600px] overflow-auto px-4 py-3 font-sans text-sm leading-relaxed break-words whitespace-pre-wrap text-surface-800 dark:text-surface-100"
      >{{ preview.text }}</pre>
    <p
      v-else-if="preview || previewFailed"
      class="px-4 py-3 text-sm text-surface-500 dark:text-surface-400"
    >
      {{
        previewFailed
          ? "Could not parse this message"
          : "This message has no body to render"
      }}
    </p>
    <div v-else class="h-[50px]" />
  </template>
  <HttpEditor
    v-else
    :model-value="displayedRaw"
    syntax="smtp"
    readonly
    auto-height
  />
</template>
