import type { Socket } from "bun";

const encoder = new TextEncoder();
const responseLineBreakPattern = /\r?\n/;
const responseHeaderSeparatorPattern = /\r?\n\r?\n/;

export const createResponse = (status: string, message: string) => {
  return new TextEncoder().encode(
    `HTTP/1.1 ${status}\r\nContent-Type: text/plain\r\n\r\n${message}`,
  );
};

type InstanceHostResult =
  | {
      kind: "ok";
      instanceId: string;
    }
  | {
      kind: "error";
      error: string;
    };

export const parseInstanceIdFromHost = (
  host: string,
  domain: string,
): InstanceHostResult => {
  const instancesSubdomain = `instances.${domain}`;
  if (host === instancesSubdomain) {
    return {
      kind: "error",
      error: "Host is empty",
    };
  }

  const instancesSubdomainSuffix = `.${instancesSubdomain}`;

  if (!host.endsWith(instancesSubdomainSuffix)) {
    return {
      kind: "error",
      error: "Host does not end with instances subdomain",
    };
  }

  const prefix = host.slice(0, -instancesSubdomainSuffix.length);

  if (prefix === "") {
    return {
      kind: "error",
      error: "Host is empty",
    };
  }

  const parts = prefix.split(".");
  const instanceId = parts[parts.length - 1];

  if (instanceId === undefined || instanceId === "") {
    return {
      kind: "error",
      error: "Instance ID is empty",
    };
  }

  return {
    kind: "ok",
    instanceId,
  };
};

export const getInstanceIDFromHost = (host: string): InstanceHostResult => {
  const domain = Bun.env.DOMAIN;

  if (domain === undefined || domain === "") {
    throw new Error("DOMAIN environment variable is not set");
  }

  return parseInstanceIdFromHost(host, domain);
};

export const respond = <T>(socket: Socket<T>, raw: Uint8Array) => {
  socket.write(raw);
  socket.end();
};

export const stripInternalHeaders = (
  rawRequest: string,
  headerNames: string[],
): string => {
  const lowerHeaders = headerNames.map((header) => `${header.toLowerCase()}:`);

  return rawRequest
    .split("\r\n")
    .filter((line) => {
      const lowerLine = line.toLowerCase();
      return !lowerHeaders.some((header) => lowerLine.startsWith(header));
    })
    .join("\r\n");
};

export const adjustContentLength = (raw: string): string => {
  const separatorMatch = responseHeaderSeparatorPattern.exec(raw);
  if (separatorMatch?.index === undefined) {
    return raw;
  }

  const headerBlock = raw.slice(0, separatorMatch.index);
  const body = raw.slice(separatorMatch.index + separatorMatch[0].length);
  const contentLengthHeader = `Content-Length: ${encoder.encode(body).length}`;
  const headerLines = headerBlock.split(responseLineBreakPattern);

  const nextHeaderLines = headerLines.some((line) =>
    line.toLowerCase().startsWith("content-length:"),
  )
    ? headerLines.map((line) =>
        line.toLowerCase().startsWith("content-length:")
          ? contentLengthHeader
          : line,
      )
    : [...headerLines, contentLengthHeader];

  return `${nextHeaderLines.join("\r\n")}\r\n\r\n${body}`;
};
