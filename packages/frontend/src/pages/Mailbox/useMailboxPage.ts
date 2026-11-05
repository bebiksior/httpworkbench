import { MailFolderSchema, type MailFolder } from "shared";
import { computed, watch, type Ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  useMailbox,
  useMailMessages,
  useMarkMessageRead,
} from "@/queries/domains/useMailboxes";

const readQuery = (value: unknown) =>
  typeof value === "string" && value !== "" ? value : undefined;

export const useMailboxPage = (mailboxId: Ref<string>) => {
  const route = useRoute();
  const router = useRouter();

  const folder = computed<MailFolder>(
    () => MailFolderSchema.safeParse(route.query.folder).data ?? "inbox",
  );
  const selectedId = computed(() => readQuery(route.query.message));

  const mailboxQuery = useMailbox(mailboxId);
  const messagesQuery = useMailMessages(mailboxId, folder);
  const markRead = useMarkMessageRead(mailboxId);

  const messages = computed(
    () =>
      messagesQuery.data.value?.pages.flatMap((page) => page.messages) ?? [],
  );

  const navigate = (query: { folder?: MailFolder; message?: string }) =>
    router.replace({
      query: {
        ...(query.folder === undefined || query.folder === "inbox"
          ? {}
          : { folder: query.folder }),
        ...(query.message === undefined ? {} : { message: query.message }),
      },
    });

  const selectMessage = (id: string | undefined) =>
    navigate({ folder: folder.value, message: id });

  const setFolder = (next: MailFolder) => navigate({ folder: next });

  watch(
    () => messages.value.find((message) => message.id === selectedId.value),
    (message) => {
      if (message !== undefined && !message.read) {
        markRead.mutate(message.id);
      }
    },
    { immediate: true },
  );

  return {
    folder,
    selectedId,
    mailbox: mailboxQuery.data,
    mailboxError: mailboxQuery.error,
    isLoadingMailbox: mailboxQuery.isLoading,
    messages,
    isLoadingMessages: messagesQuery.isLoading,
    hasMoreMessages: computed(() => messagesQuery.hasNextPage.value),
    isLoadingMore: computed(() => messagesQuery.isFetchingNextPage.value),
    loadMoreMessages: () => messagesQuery.fetchNextPage(),
    selectMessage,
    setFolder,
  };
};
