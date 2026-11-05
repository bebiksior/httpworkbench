import PostalMime, {
  type Address,
  type Attachment,
  type Email,
} from "postal-mime";
import type { EmailAddress, MailAttachment } from "shared";

const previewLength = 200;

export const parseEmail = (raw: string): Promise<Email> =>
  PostalMime.parse(raw, { attachmentEncoding: "arraybuffer" });

export const flattenAddresses = (
  addresses: Address[] | Address | undefined,
): EmailAddress[] => {
  if (addresses === undefined) {
    return [];
  }
  const list = Array.isArray(addresses) ? addresses : [addresses];
  return list.flatMap((entry) =>
    entry.group === undefined
      ? [{ name: entry.name, address: entry.address }]
      : entry.group.map(({ name, address }) => ({ name, address })),
  );
};

export const htmlToText = (html: string) =>
  html
    .replace(/<(style|script|head)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export const buildPreview = (email: Pick<Email, "text" | "html">): string => {
  const source =
    email.text ?? (email.html === undefined ? "" : htmlToText(email.html));
  return source.replace(/\s+/g, " ").trim().slice(0, previewLength);
};

const attachmentSize = (attachment: Attachment) =>
  typeof attachment.content === "string"
    ? attachment.content.length
    : attachment.content.byteLength;

export const listAttachments = (email: Email): MailAttachment[] =>
  email.attachments.map((attachment, index) => ({
    index,
    filename: attachment.filename ?? undefined,
    mimeType: attachment.mimeType,
    sizeBytes: attachmentSize(attachment),
  }));

export const summarizeEmail = (email: Email) => {
  const [from] = flattenAddresses(email.from);
  return {
    from,
    to: flattenAddresses(email.to).map(({ address }) => address),
    subject: email.subject ?? "",
    preview: buildPreview(email),
    attachmentCount: email.attachments.length,
    messageId: email.messageId,
  };
};

export const extractLinks = (email: Pick<Email, "text" | "html">) => {
  const links = new Set<string>();
  for (const match of `${email.text ?? ""}\n${email.html ?? ""}`.matchAll(
    /https?:\/\/[^\s"'<>()]+/gi,
  )) {
    links.add(match[0].replace(/[.,;:!?]+$/, "").replace(/&amp;/g, "&"));
  }
  return [...links];
};

const contentIdKey = (value: string) =>
  value.replace(/^<|>$/g, "").trim().toLowerCase();

const decodeContentId = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const maxInlinedImageBytes = 5 * 1024 * 1024;

export const inlineImages = (email: Email): string | undefined => {
  const images = new Map(
    email.attachments.flatMap((attachment) =>
      attachment.contentId !== undefined &&
      attachment.mimeType.startsWith("image/")
        ? [[contentIdKey(attachment.contentId), attachment] as const]
        : [],
    ),
  );
  if (email.html === undefined || images.size === 0) {
    return email.html;
  }
  const encoded = new Map<string, string>();
  let inlinedBytes = 0;
  return email.html.replace(/cid:([^"'\s)>]+)/gi, (match, id: string) => {
    const key = contentIdKey(decodeContentId(id));
    const image = images.get(key);
    if (image === undefined) {
      return match;
    }
    let dataUrl = encoded.get(key);
    if (dataUrl === undefined) {
      const content =
        image.content instanceof ArrayBuffer
          ? new Uint8Array(image.content)
          : image.content;
      dataUrl = `data:${image.mimeType};base64,${Buffer.from(content).toString("base64")}`;
      encoded.set(key, dataUrl);
    }
    if (inlinedBytes + dataUrl.length > maxInlinedImageBytes) {
      return match;
    }
    inlinedBytes += dataUrl.length;
    return dataUrl;
  });
};
