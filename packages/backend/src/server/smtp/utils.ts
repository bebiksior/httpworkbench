import {
  normalizeHostname,
  resolveInstanceName,
  type InstanceNameResolution,
} from "../nameResolution";

export const maxSmtpDataBytes = 1024 * 1024;

export type SmtpRuntimeConfig = {
  instancesDomain: string;
  smtpPort: number;
};

export const parseSmtpCommand = (
  line: string,
): { verb: string; rest: string } => {
  const spaceIndex = line.indexOf(" ");
  if (spaceIndex === -1) {
    return { verb: line.toUpperCase(), rest: "" };
  }

  return {
    verb: line.slice(0, spaceIndex).toUpperCase(),
    rest: line.slice(spaceIndex + 1),
  };
};

export const unstuffDataDot = (line: string): string => {
  return line.startsWith(".") ? line.slice(1) : line;
};

export const parsePathAddress = (
  rest: string,
  keyword: "FROM" | "TO",
): string | undefined => {
  const prefix = `${keyword}:`;
  if (!rest.toUpperCase().startsWith(prefix)) {
    return undefined;
  }

  const afterColon = rest.slice(prefix.length).trimStart();
  const angle = afterColon.match(/^<([^>]*)>/);
  if (angle !== null) {
    return angle[1] ?? "";
  }

  const bare = afterColon.split(/\s/)[0];
  return bare ?? "";
};

export const parseSizeParam = (rest: string): number | undefined => {
  const match = rest.match(/\bSIZE=(\d+)/i);
  if (match === null) {
    return undefined;
  }

  const value = Number.parseInt(match[1] ?? "", 10);
  return Number.isNaN(value) ? undefined : value;
};

export const resolveRcptInstance = (
  address: string,
  instancesDomain: string,
): InstanceNameResolution => {
  const at = address.lastIndexOf("@");
  if (at === -1) {
    return { kind: "out_of_zone" };
  }

  const host = address.slice(at + 1);
  if (host === "") {
    return { kind: "out_of_zone" };
  }

  return resolveInstanceName(host, instancesDomain);
};

export const formatSmtpLogRaw = (params: {
  clientAddress: string;
  ehloName: string | undefined;
  mailFrom: string;
  rcptTo: string;
  sizeBytes: number;
  truncated: boolean;
  instancesDomain: string;
  message: string;
}): string => {
  const envelope = [
    `CLIENT: ${params.clientAddress}`,
    `EHLO: ${params.ehloName ?? ""}`,
    `MAIL FROM: <${params.mailFrom}>`,
    `RCPT TO: <${params.rcptTo}>`,
    `SIZE: ${params.sizeBytes} bytes`,
    `ZONE: ${normalizeHostname(params.instancesDomain)}`,
  ].join("\n");

  const message = params.truncated
    ? `${params.message}\n[truncated: message exceeded ${maxSmtpDataBytes} bytes]`
    : params.message;

  return `${envelope}\n\n${message}`;
};
