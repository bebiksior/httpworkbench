import { quotedPrintableBytes } from "./quotedPrintable";
import { splitSmtpLog } from "./smtpLogMessage";

const maxDepth = 8;
const encodedWordPattern = /=\?([^?\s]+)\?([QqBb])\?([^?\s]*)\?=/g;
const adjacentEncodedWordGap =
  /(=\?[^?\s]+\?[QqBb]\?[^?\s]*\?=)\s+(?==\?[^?\s]+\?[QqBb]\?)/g;

const decodeBytes = (bytes: Uint8Array, charset = "utf-8"): string => {
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
};

const base64Bytes = (value: string): Uint8Array | undefined => {
  try {
    return Uint8Array.from(atob(value.replace(/\s/g, "")), (character) =>
      character.charCodeAt(0),
    );
  } catch {
    return undefined;
  }
};

const decodeEncodedWords = (headerBlock: string): string =>
  headerBlock
    .replace(adjacentEncodedWordGap, "$1")
    .replace(
      encodedWordPattern,
      (word, charset: string, encoding: string, text: string) => {
        const bytes =
          encoding.toUpperCase() === "B"
            ? base64Bytes(text)
            : quotedPrintableBytes(text.replace(/_/g, " "));
        return bytes === undefined ? word : decodeBytes(bytes, charset);
      },
    );

const parseHeaders = (block: string): Map<string, string> => {
  const headers = new Map<string, string>();
  for (const line of block.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/)) {
    const colon = line.indexOf(":");
    const name = line.slice(0, colon).trim().toLowerCase();
    if (colon > 0 && !headers.has(name)) {
      headers.set(name, line.slice(colon + 1).trim());
    }
  }
  return headers;
};

const headerParam = (value: string, name: string): string | undefined => {
  const match = new RegExp(
    `;\\s*${name}\\s*=\\s*(?:"([^"]*)"|([^;\\s]+))`,
    "i",
  ).exec(value);
  return match?.[1] ?? match?.[2];
};

const decodeMultipart = (
  body: string,
  boundary: string,
  depth: number,
): string => {
  const delimiter = `--${boundary}`;
  let output = "";
  let current = "";
  let inPart = false;
  let closed = false;

  for (const line of body.split(/(?<=\n)/)) {
    const content = line.trimEnd();
    if (!closed && (content === delimiter || content === `${delimiter}--`)) {
      output += inPart ? decodeEntity(current, depth) : current;
      output += line;
      current = "";
      inPart = content === delimiter;
      closed = !inPart;
      continue;
    }
    current += line;
  }

  return output + (inPart ? decodeEntity(current, depth) : current);
};

const decodeBody = (
  body: string,
  headers: Map<string, string>,
  depth: number,
): string => {
  const contentType = headers.get("content-type") ?? "text/plain";
  const mediaType = (contentType.split(";")[0] ?? "").trim().toLowerCase();
  const encoding = headers.get("content-transfer-encoding")?.toLowerCase();
  const charset = headerParam(contentType, "charset");

  if (depth < maxDepth) {
    const boundary = mediaType.startsWith("multipart/")
      ? headerParam(contentType, "boundary")
      : undefined;
    if (boundary !== undefined && boundary !== "") {
      return decodeMultipart(body, boundary, depth + 1);
    }
    if (mediaType === "message/rfc822" && encoding !== "base64") {
      return decodeEntity(body, depth + 1);
    }
  }

  if (encoding === "quoted-printable") {
    return decodeBytes(quotedPrintableBytes(body), charset);
  }

  if (encoding === "base64" && mediaType.startsWith("text/")) {
    const bytes = base64Bytes(body);
    const lineEnd = /\r?\n$/.exec(body)?.[0] ?? "";
    return bytes === undefined ? body : decodeBytes(bytes, charset) + lineEnd;
  }

  return body;
};

const decodeEntity = (entity: string, depth: number): string => {
  const separator = /^\r?\n/.exec(entity) ?? /\r?\n\r?\n/.exec(entity);
  if (separator === null) {
    return decodeEncodedWords(entity);
  }

  const headerBlock = entity.slice(0, separator.index);
  const body = entity.slice(separator.index + separator[0].length);
  return `${decodeEncodedWords(headerBlock)}${separator[0]}${decodeBody(body, parseHeaders(headerBlock), depth)}`;
};

export const decodeSmtpLog = (raw: string): string => {
  const { envelope, message } = splitSmtpLog(raw);
  return `${envelope}${decodeEntity(message, 0)}`;
};
