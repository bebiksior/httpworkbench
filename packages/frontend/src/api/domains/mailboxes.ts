import type {
  CreateMailboxInput,
  Mailbox,
  MailboxSummary,
  MailFolder,
  MailMessage,
  MailMessagesPage,
  SendMailInput,
  SendMailResponse,
  UpdateMailboxInput,
} from "shared";
import {
  MailboxesResponseSchema,
  MailboxSchema,
  MailMessageSchema,
  MailMessagesPageSchema,
  SendMailResponseSchema,
} from "shared";
import { apiClient } from "../client";
import { parseResponse } from "../parseResponse";
import { apiPaths } from "../paths";

export const mailboxesApi = {
  getAll: async (): Promise<MailboxSummary[]> =>
    parseResponse(
      MailboxesResponseSchema,
      await apiClient.get<unknown>(apiPaths.mailboxes),
      "mailboxes",
    ),

  getById: async (id: string): Promise<Mailbox> =>
    parseResponse(
      MailboxSchema,
      await apiClient.get<unknown>(apiPaths.mailbox(id)),
      "mailbox",
    ),

  create: async (input: CreateMailboxInput = {}): Promise<Mailbox> =>
    parseResponse(
      MailboxSchema,
      await apiClient.post<unknown>(apiPaths.mailboxes, input),
      "create mailbox",
    ),

  update: async (id: string, input: UpdateMailboxInput): Promise<Mailbox> =>
    parseResponse(
      MailboxSchema,
      await apiClient.patch<unknown>(apiPaths.mailbox(id), input),
      "update mailbox",
    ),

  extend: async (id: string): Promise<Mailbox> =>
    parseResponse(
      MailboxSchema,
      await apiClient.post<unknown>(apiPaths.mailboxExtend(id), {}),
      "extend mailbox",
    ),

  delete: async (id: string): Promise<void> => {
    await apiClient.delete<void>(apiPaths.mailbox(id));
  },

  getMessages: async (
    id: string,
    folder: MailFolder,
    cursor?: string,
  ): Promise<MailMessagesPage> => {
    const query = new URLSearchParams({ folder });
    if (cursor !== undefined) {
      query.set("cursor", cursor);
    }
    return parseResponse(
      MailMessagesPageSchema,
      await apiClient.get<unknown>(
        `${apiPaths.mailboxMessages(id)}?${query.toString()}`,
      ),
      "messages",
    );
  },

  clearMessages: async (id: string, folder: MailFolder): Promise<void> => {
    await apiClient.delete<void>(
      `${apiPaths.mailboxMessages(id)}?${new URLSearchParams({ folder }).toString()}`,
    );
  },

  getMessage: async (id: string, messageId: string): Promise<MailMessage> =>
    parseResponse(
      MailMessageSchema,
      await apiClient.get<unknown>(apiPaths.mailboxMessage(id, messageId)),
      "message",
    ),

  getMessageSource: (id: string, messageId: string): Promise<string> =>
    apiClient.getText(apiPaths.mailboxMessageSource(id, messageId)),

  setRead: async (id: string, messageId: string, read: boolean) => {
    await apiClient.patch<unknown>(apiPaths.mailboxMessage(id, messageId), {
      read,
    });
  },

  deleteMessage: async (id: string, messageId: string): Promise<void> => {
    await apiClient.delete<void>(apiPaths.mailboxMessage(id, messageId));
  },

  send: async (id: string, input: SendMailInput): Promise<SendMailResponse> =>
    parseResponse(
      SendMailResponseSchema,
      await apiClient.post<unknown>(apiPaths.mailboxSend(id), input),
      "send mail",
    ),
};
