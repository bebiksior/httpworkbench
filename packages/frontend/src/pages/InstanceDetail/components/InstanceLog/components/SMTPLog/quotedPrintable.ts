const quotedPrintableHexPattern = /^[0-9a-fA-F]{2}$/;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: false });

const appendTextBytes = (bytes: number[], value: string): void => {
  bytes.push(...textEncoder.encode(value));
};

export const quotedPrintableBytes = (value: string): Uint8Array => {
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

  return new Uint8Array(bytes);
};

export const decodeQuotedPrintable = (value: string): string =>
  textDecoder.decode(quotedPrintableBytes(value));
