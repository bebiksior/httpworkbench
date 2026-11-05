<script setup lang="ts">
import Button from "primevue/button";
import { useConfirm } from "primevue/useconfirm";
import { useMediaQuery } from "@vueuse/core";
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { NotFoundError } from "@/api/errors";
import { useNotify } from "@/composables";
import {
  useClearMessages,
  useDeleteMailbox,
  useExtendMailbox,
  useMailboxes,
  usePrefetchMailMessage,
} from "@/queries/domains/useMailboxes";
import { ComposeDialog } from "./components/ComposeDialog";
import { EditDialog } from "./components/EditDialog";
import { MessageList } from "./components/MessageList";
import { MessageView } from "./components/MessageView";
import { Toolbar } from "./components/Toolbar";
import { emptyDraft, type ComposeDraft } from "./mail";
import { useMailboxPage } from "./useMailboxPage";

const route = useRoute();
const router = useRouter();
const notify = useNotify();
const confirm = useConfirm();
const mailboxId = computed(() => route.params.id as string);

const {
  folder,
  selectedId,
  mailbox,
  mailboxError,
  messages,
  isLoadingMessages,
  hasMoreMessages,
  isLoadingMore,
  loadMoreMessages,
  selectMessage,
  setFolder,
} = useMailboxPage(mailboxId);

const { data: mailboxes } = useMailboxes();
const prefetchMessage = usePrefetchMailMessage(mailboxId);
const unreadCount = computed(
  () =>
    mailboxes.value?.find((entry) => entry.id === mailboxId.value)
      ?.unreadCount ?? 0,
);

const isWide = useMediaQuery("(min-width: 1024px)");

const goBack = () => {
  if (selectedId.value !== undefined && !isWide.value) {
    selectMessage(undefined);
    return;
  }
  void router.push("/mail");
};

const isNotFound = computed(() => mailboxError.value instanceof NotFoundError);

const composeVisible = ref(false);
const composeDraft = ref<ComposeDraft>(emptyDraft());
const editVisible = ref(false);

const openCompose = (draft: ComposeDraft = emptyDraft()) => {
  composeDraft.value = draft;
  composeVisible.value = true;
};

const extendMutation = useExtendMailbox();
const deleteMutation = useDeleteMailbox();
const clearMutation = useClearMessages(mailboxId);

const extend = () =>
  extendMutation.mutate(mailboxId.value, {
    onSuccess: () => notify.success("Mailbox extended"),
    onError: (err) => notify.error("Failed to extend mailbox", err),
  });

const clearFolder = () => {
  const target = folder.value;
  confirm.require({
    header: target === "sent" ? "Clear sent" : "Clear inbox",
    message: `Delete every message in ${target === "sent" ? "Sent" : "the inbox"}?`,
    rejectProps: { label: "Cancel", severity: "secondary", outlined: true },
    acceptProps: { label: "Clear", severity: "danger" },
    accept: () =>
      clearMutation.mutate(target, {
        onSuccess: () => selectMessage(undefined),
        onError: (err) => notify.error("Failed to clear messages", err),
      }),
  });
};

const deleteMailbox = () =>
  confirm.require({
    header: "Delete mailbox",
    message:
      "Delete this mailbox and all of its messages? This cannot be undone.",
    rejectProps: { label: "Cancel", severity: "secondary", outlined: true },
    acceptProps: { label: "Delete", severity: "danger" },
    accept: () =>
      deleteMutation.mutate(mailboxId.value, {
        onSuccess: () => router.push("/mail"),
        onError: (err) => notify.error("Failed to delete mailbox", err),
      }),
  });
</script>

<template>
  <div
    v-if="isNotFound"
    class="flex h-full flex-col items-center justify-center gap-3 bg-surface-50 px-6 text-center dark:bg-surface-900"
  >
    <p class="font-medium text-surface-800 dark:text-surface-100">
      Mailbox not found
    </p>
    <p class="text-sm text-surface-500">It may have expired or been deleted.</p>
    <Button
      label="All mailboxes"
      severity="secondary"
      outlined
      size="small"
      @click="router.push('/mail')"
    />
  </div>

  <div
    v-else-if="mailbox"
    class="flex h-full min-h-0 flex-col bg-surface-50 dark:bg-surface-900"
  >
    <Toolbar
      :mailbox="mailbox"
      :folder="folder"
      @back="goBack"
      @compose="openCompose()"
      @edit="editVisible = true"
      @extend="extend"
      @clear="clearFolder"
      @delete="deleteMailbox"
    />
    <div class="flex min-h-0 flex-1">
      <aside
        class="w-full min-w-0 flex-col border-r border-surface-200 bg-white lg:flex lg:w-[22rem] lg:shrink-0 xl:w-[26rem] dark:border-surface-700 dark:bg-surface-800"
        :class="selectedId ? 'hidden' : 'flex'"
      >
        <MessageList
          :messages="messages"
          :folder="folder"
          :selected-id="selectedId"
          :address="mailbox.address"
          :unread-count="unreadCount"
          :is-loading="isLoadingMessages"
          :has-more="hasMoreMessages"
          :is-loading-more="isLoadingMore"
          @select="selectMessage"
          @prefetch="prefetchMessage"
          @update:folder="setFolder"
          @load-more="loadMoreMessages"
        />
      </aside>
      <section
        class="min-w-0 flex-1 lg:block"
        :class="selectedId ? 'block' : 'hidden'"
      >
        <MessageView
          v-if="selectedId"
          :mailbox-id="mailboxId"
          :message-id="selectedId"
          @back="selectMessage(undefined)"
          @reply="openCompose"
          @deleted="selectMessage(undefined)"
        />
        <div
          v-else
          class="flex h-full items-center justify-center text-sm text-surface-400"
        >
          Select a message
        </div>
      </section>
    </div>

    <ComposeDialog
      v-model:visible="composeVisible"
      :mailbox-id="mailboxId"
      :from="mailbox.address"
      :draft="composeDraft"
    />
    <EditDialog v-model:visible="editVisible" :mailbox="mailbox" />
  </div>
</template>
