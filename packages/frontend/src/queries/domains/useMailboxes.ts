import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/vue-query";
import { computed, toValue, type MaybeRefOrGetter } from "vue";
import type {
  MailFolder,
  MailMessagesPage,
  SendMailInput,
  UpdateMailboxInput,
} from "shared";
import { mailboxesApi } from "@/api/domains/mailboxes";
import { NotFoundError } from "@/api/errors";
import { queryKeys } from "../keys";

const MESSAGES_REFETCH_INTERVAL_MS = 4_000;
const MAILBOXES_REFETCH_INTERVAL_MS = 10_000;

const retryUnlessMissing = (failureCount: number, error: Error) =>
  !(error instanceof NotFoundError) && failureCount < 3;

export const useMailboxes = () =>
  useQuery({
    queryKey: queryKeys.mailboxes.all,
    queryFn: mailboxesApi.getAll,
    refetchInterval: MAILBOXES_REFETCH_INTERVAL_MS,
  });

export const useMailbox = (id: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => queryKeys.mailboxes.detail(toValue(id))),
    queryFn: () => mailboxesApi.getById(toValue(id)),
    retry: false,
  });

export const useMailMessages = (
  id: MaybeRefOrGetter<string>,
  folder: MaybeRefOrGetter<MailFolder>,
) =>
  useInfiniteQuery({
    queryKey: computed(() =>
      queryKeys.mailboxes.messages(toValue(id), toValue(folder)),
    ),
    queryFn: ({ pageParam }) =>
      mailboxesApi.getMessages(toValue(id), toValue(folder), pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor,
    refetchInterval: MESSAGES_REFETCH_INTERVAL_MS,
  });

export const useMailMessage = (
  id: MaybeRefOrGetter<string>,
  messageId: MaybeRefOrGetter<string | undefined>,
) =>
  useQuery({
    queryKey: computed(() =>
      queryKeys.mailboxes.message(toValue(id), toValue(messageId) ?? ""),
    ),
    queryFn: () =>
      mailboxesApi.getMessage(toValue(id), toValue(messageId) ?? ""),
    enabled: computed(() => toValue(messageId) !== undefined),
    staleTime: Number.POSITIVE_INFINITY,
    retry: retryUnlessMissing,
  });

export const usePrefetchMailMessage = (id: MaybeRefOrGetter<string>) => {
  const queryClient = useQueryClient();
  return (messageId: string) =>
    queryClient.prefetchQuery({
      queryKey: queryKeys.mailboxes.message(toValue(id), messageId),
      queryFn: () => mailboxesApi.getMessage(toValue(id), messageId),
      staleTime: Number.POSITIVE_INFINITY,
    });
};

export const useMessageSource = (
  id: MaybeRefOrGetter<string>,
  messageId: MaybeRefOrGetter<string | undefined>,
  enabled: MaybeRefOrGetter<boolean>,
) =>
  useQuery({
    queryKey: computed(() => [
      ...queryKeys.mailboxes.message(toValue(id), toValue(messageId) ?? ""),
      "source",
    ]),
    queryFn: () =>
      mailboxesApi.getMessageSource(toValue(id), toValue(messageId) ?? ""),
    enabled: computed(
      () => toValue(enabled) && toValue(messageId) !== undefined,
    ),
    staleTime: Number.POSITIVE_INFINITY,
    retry: retryUnlessMissing,
  });

const useInvalidateMailboxes = () => {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.mailboxes.all });
};

export const useCreateMailbox = () => {
  const invalidate = useInvalidateMailboxes();
  return useMutation({
    mutationFn: () => mailboxesApi.create(),
    onSuccess: invalidate,
  });
};

export const useUpdateMailbox = () => {
  const invalidate = useInvalidateMailboxes();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateMailboxInput }) =>
      mailboxesApi.update(id, input),
    onSuccess: invalidate,
  });
};

export const useExtendMailbox = () => {
  const invalidate = useInvalidateMailboxes();
  return useMutation({
    mutationFn: (id: string) => mailboxesApi.extend(id),
    onSuccess: invalidate,
  });
};

export const useDeleteMailbox = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mailboxesApi.delete(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: queryKeys.mailboxes.detail(id) });
      return queryClient.invalidateQueries({
        queryKey: queryKeys.mailboxes.all,
        exact: true,
      });
    },
  });
};

export const useSendMail = (id: MaybeRefOrGetter<string>) => {
  const invalidate = useInvalidateMailboxes();
  return useMutation({
    mutationFn: (input: SendMailInput) => mailboxesApi.send(toValue(id), input),
    onSuccess: invalidate,
  });
};

export const useMarkMessageRead = (id: MaybeRefOrGetter<string>) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) =>
      mailboxesApi.setRead(toValue(id), messageId, true),
    onMutate: (messageId) => {
      queryClient.setQueryData<InfiniteData<MailMessagesPage>>(
        queryKeys.mailboxes.messages(toValue(id), "inbox"),
        (data) =>
          data === undefined
            ? data
            : {
                ...data,
                pages: data.pages.map((page) => ({
                  ...page,
                  messages: page.messages.map((message) =>
                    message.id === messageId
                      ? { ...message, read: true }
                      : message,
                  ),
                })),
              },
      );
    },
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.mailboxes.all,
        exact: true,
      }),
  });
};

export const useDeleteMessage = (id: MaybeRefOrGetter<string>) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) =>
      mailboxesApi.deleteMessage(toValue(id), messageId),
    onSuccess: (_data, messageId) => {
      queryClient.removeQueries({
        queryKey: queryKeys.mailboxes.message(toValue(id), messageId),
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.mailboxes.all });
    },
  });
};

export const useClearMessages = (id: MaybeRefOrGetter<string>) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (folder: MailFolder) =>
      mailboxesApi.clearMessages(toValue(id), folder),
    onSuccess: () => {
      queryClient.removeQueries({
        queryKey: [...queryKeys.mailboxes.detail(toValue(id)), "message"],
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.mailboxes.all });
    },
  });
};
