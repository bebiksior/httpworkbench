const quotedPrintableHexPattern = /^[0-9a-fA-F]{2}$/;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: false });

const appendTextBytes = (bytes: number[], value: string): void => {
  bytes.push(...textEncoder.encode(value));
};

export const decodeQuotedPrintable = (value: string): string => {
  const bytes: number[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];

    if (character !== "=") {
      const codePoint = value.codePointAt(index);
      if (codePoint === undefined) {
        continue;
      }

      appendTextBytes(bytes, String.fromCodePoint(codePoint));
      if (codePoint > 0xffff) {
        index += 1;
      }
      continue;
    }

    const next = value[index + 1];
    const afterNext = value[index + 2];

    if (next === "\r" && afterNext === "\n") {
      index += 2;
      continue;
    }

    if (next === "\n") {
      index += 1;
      continue;
    }

    const encodedByte = value.slice(index + 1, index + 3);
    if (
      encodedByte.length === 2 &&
      quotedPrintableHexPattern.test(encodedByte)
    ) {
      bytes.push(Number.parseInt(encodedByte, 16));
      index += 2;
      continue;
    }

    appendTextBytes(bytes, character);
  }

  return textDecoder.decode(new Uint8Array(bytes));
};

const findMessageSeparator = (raw: string) => {
  const separators = ["\r\n\r\n", "\n\n"]
    .map((separator) => ({
      index: raw.indexOf(separator),
      separator,
    }))
    .filter((entry) => entry.index !== -1)
    .sort((left, right) => left.index - right.index);

  return separators[0];
};

export const decodeSmtpLogQuotedPrintable = (raw: string): string => {
  const messageSeparator = findMessageSeparator(raw);
  if (messageSeparator === undefined) {
    return decodeQuotedPrintable(raw);
  }

  const messageStart =
    messageSeparator.index + messageSeparator.separator.length;
  const envelope = raw.slice(0, messageStart);
  const message = raw.slice(messageStart);

  return `${envelope}${decodeQuotedPrintable(message)}`;
};
