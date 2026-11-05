const encoder = new TextEncoder();
const maxEncodedWordBytes = 45;

const isAscii = (value: string) => /^[\x20-\x7e]*$/.test(value);

const singleLine = (value: string) => value.replace(/[\r\n]+/g, " ");

export const encodeHeaderValue = (value: string): string => {
  const line = singleLine(value);
  if (isAscii(line)) {
    return line;
  }
  const words: string[] = [];
  let chunk = "";
  for (const character of line) {
    if (encoder.encode(chunk + character).length > maxEncodedWordBytes) {
      words.push(chunk);
      chunk = "";
    }
    chunk += character;
  }
  if (chunk !== "") {
    words.push(chunk);
  }
  return words
    .map((word) => `=?UTF-8?B?${Buffer.from(word).toString("base64")}?=`)
    .join("\r\n ");
};

const wrapBase64 = (value: string) =>
  (value.match(/.{1,76}/g) ?? []).join("\r\n");

const encodeBody = (value: string) =>
  wrapBase64(Buffer.from(value.replace(/\r?\n/g, "\r\n")).toString("base64"));

const textPart = (contentType: string, body: string) =>
  [
    `Content-Type: ${contentType}; charset=utf-8`,
    "Content-Transfer-Encoding: base64",
    "",
    encodeBody(body),
  ].join("\r\n");

const quoted = (value: string) =>
  `"${singleLine(value).replace(/[\\"]/g, "\\$&")}"`;

const extendedValue = (value: string) =>
  `UTF-8''${encodeURIComponent(singleLine(value)).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  )}`;

const filenameParameters = (filename: string) =>
  isAscii(singleLine(filename))
    ? {
        name: `name=${quoted(filename)}`,
        filename: `filename=${quoted(filename)}`,
      }
    : {
        name: `name="${encodeHeaderValue(filename).replace(/\r\n /g, " ")}"`,
        filename: `filename*=${extendedValue(filename)}`,
      };

type ComposeAttachment = {
  filename: string;
  contentType?: string;
  content: string;
};

const attachmentPart = (attachment: ComposeAttachment) => {
  const { name, filename } = filenameParameters(attachment.filename);
  return [
    `Content-Type: ${attachment.contentType ?? "application/octet-stream"}; ${name}`,
    `Content-Disposition: attachment; ${filename}`,
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(attachment.content),
  ].join("\r\n");
};

const multipart = (subtype: string, parts: string[]) => {
  const boundary = `hwb-${crypto.randomUUID()}`;
  return [
    `Content-Type: multipart/${subtype}; boundary="${boundary}"`,
    "",
    ...parts.flatMap((part) => [`--${boundary}`, part]),
    `--${boundary}--`,
    "",
  ].join("\r\n");
};

export type ComposeInput = {
  from: string;
  to: string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: ComposeAttachment[];
  messageId: string;
  date: Date;
  inReplyTo?: string;
  references?: string;
};

export const composeMessage = (input: ComposeInput): string => {
  const headers = [
    `From: ${input.from}`,
    `To: ${input.to.join(", ")}`,
    `Subject: ${encodeHeaderValue(input.subject)}`,
    `Date: ${input.date.toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: ${input.messageId}`,
    ...(input.inReplyTo === undefined
      ? []
      : [`In-Reply-To: ${singleLine(input.inReplyTo)}`]),
    ...(input.references === undefined
      ? []
      : [`References: ${singleLine(input.references)}`]),
    "MIME-Version: 1.0",
  ];

  const body =
    input.html === undefined
      ? textPart("text/plain", input.text)
      : multipart("alternative", [
          textPart("text/plain", input.text),
          textPart("text/html", input.html),
        ]);
  const attachments = input.attachments ?? [];
  const content =
    attachments.length === 0
      ? body
      : multipart("mixed", [body, ...attachments.map(attachmentPart)]);
  return [...headers, content].join("\r\n");
};
