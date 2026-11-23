import PostalMime from "postal-mime";

export type SmtpLogParts = { envelope: string; message: string };

export type SmtpLogPreview = { html?: string; text?: string };

const findMessageSeparator = (raw: string) =>
  ["\r\n\r\n", "\n\n"]
    .map((separator) => ({ index: raw.indexOf(separator), separator }))
    .filter((entry) => entry.index !== -1)
    .sort((left, right) => left.index - right.index)[0];

export const splitSmtpLog = (raw: string): SmtpLogParts => {
  const separator = findMessageSeparator(raw);
  if (separator === undefined) {
    return { envelope: "", message: raw };
  }
  const messageStart = separator.index + separator.separator.length;
  return {
    envelope: raw.slice(0, messageStart),
    message: raw.slice(messageStart),
  };
};

export const parseSmtpLogPreview = async (
  raw: string,
): Promise<SmtpLogPreview> => {
  const email = await PostalMime.parse(splitSmtpLog(raw).message, {
    attachmentEncoding: "arraybuffer",
  });
  const nonEmpty = (value: string | undefined) =>
    value?.trim() === "" ? undefined : value;
  return { html: nonEmpty(email.html), text: nonEmpty(email.text) };
};
