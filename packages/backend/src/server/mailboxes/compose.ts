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

const encodeBody = (value: string) =>
  (
    Buffer.from(value.replace(/\r?\n/g, "\r\n"))
      .toString("base64")
      .match(/.{1,76}/g) ?? []
  ).join("\r\n");

const textPart = (contentType: string, body: string) =>
  [
    `Content-Type: ${contentType}; charset=utf-8`,
    "Content-Transfer-Encoding: base64",
    "",
    encodeBody(body),
  ].join("\r\n");

export type ComposeInput = {
  from: string;
  to: string[];
  subject: string;
  text: string;
  html?: string;
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

  if (input.html === undefined) {
    return [...headers, textPart("text/plain", input.text)].join("\r\n");
  }

  const boundary = `hwb-${crypto.randomUUID()}`;
  return [
    ...headers,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    textPart("text/plain", input.text),
    `--${boundary}`,
    textPart("text/html", input.html),
    `--${boundary}--`,
    "",
  ].join("\r\n");
};
