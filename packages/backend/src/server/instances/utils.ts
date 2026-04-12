import type { Socket } from "bun";
import { dnsConfig } from "../../config";
import { resolveInstanceName } from "../nameResolution";

const encoder = new TextEncoder();
const requestLineBreakPattern = /\r?\n/;
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
  instancesDomain: string,
): InstanceHostResult => {
  const resolution = resolveInstanceName(host, instancesDomain);
  switch (resolution.kind) {
    case "zone":
    case "missing_instance":
      return {
        kind: "error",
        error: "Host is empty",
      };
    case "out_of_zone":
      return {
        kind: "error",
        error: "Host does not end with instances domain",
      };
    case "instance":
      return {
        kind: "ok",
        instanceId: resolution.instanceId,
      };
  }
};

export const getInstanceIDFromHost = (host: string): InstanceHostResult => {
  return parseInstanceIdFromHost(host, dnsConfig.instancesDomain);
};

export const respond = <T>(socket: Socket<T>, raw: Uint8Array) => {
  socket.write(raw);
  socket.end();
};

export const getHeaderValue = (
  rawRequest: string,
  headerName: string,
): string | undefined => {
  const lowerHeaderName = `${headerName.toLowerCase()}:`;

  for (const line of rawRequest.split(requestLineBreakPattern)) {
    if (line === "") {
      break;
    }

    if (line.toLowerCase().startsWith(lowerHeaderName)) {
      return line.slice(line.indexOf(":") + 1).trim();
    }
  }

  return undefined;
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
