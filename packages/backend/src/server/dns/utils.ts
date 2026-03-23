import * as dnsPacket from "dns-packet";
import type { Answer, Packet, Question } from "dns-packet";
import {
  normalizeHostname,
  resolveInstanceName,
  type InstanceNameResolution,
} from "../nameResolution";

const DNS_RESPONSE_CODES = {
  NOERROR: 0,
  FORMERR: 1,
  SERVFAIL: 2,
  NXDOMAIN: 3,
  NOTIMP: 4,
  REFUSED: 5,
} as const;

const defaultDnsRefreshSeconds = 3600;
const defaultDnsRetrySeconds = 600;
const defaultDnsExpireSeconds = 86400;
const defaultDnsMinimumSeconds = 60;

export type DnsRuntimeConfig = {
  instancesDomain: string;
  dnsPort: number;
  dnsNameservers: string[];
  publicIp: string;
};

type DnsResponseOptions = {
  request: Packet;
  code: (typeof DNS_RESPONSE_CODES)[keyof typeof DNS_RESPONSE_CODES];
  answers?: Answer[];
  authorities?: Answer[];
};

export type DnsQuestion = Question;

export type DnsNameResolution = InstanceNameResolution;

export const normalizeDnsName = (value: string): string => {
  return normalizeHostname(value);
};

export const parseInstanceIdFromDnsName = (
  name: string,
  instancesDomain: string,
): DnsNameResolution => {
  return resolveInstanceName(name, instancesDomain);
};

export const formatDnsLogSummary = (params: {
  question: DnsQuestion;
  transport: "udp" | "tcp";
  instancesDomain: string;
}): string => {
  const recordClass = params.question.class ?? "IN";

  return [
    `QNAME: ${normalizeDnsName(params.question.name)}`,
    `QTYPE: ${params.question.type}`,
    `QCLASS: ${recordClass}`,
    `TRANSPORT: ${params.transport.toUpperCase()}`,
    `ZONE: ${normalizeDnsName(params.instancesDomain)}`,
  ].join("\n");
};

export const buildDnsZoneAnswers = (
  question: DnsQuestion,
  config: DnsRuntimeConfig,
): {
  answers: Answer[];
} => {
  const normalizedZone = normalizeDnsName(config.instancesDomain);
  const normalizedNameservers = config.dnsNameservers.map(normalizeDnsName);
  const ttl = defaultDnsMinimumSeconds;

  switch (question.type) {
    case "NS":
      return {
        answers: normalizedNameservers.map((nameserver) => ({
          type: "NS" as const,
          name: normalizedZone,
          ttl,
          data: nameserver,
        })),
      };
    case "SOA":
      return {
        answers: [
          {
            type: "SOA" as const,
            name: normalizedZone,
            ttl,
            data: {
              mname: normalizedNameservers[0] ?? `ns1.${normalizedZone}`,
              rname: `hostmaster.${normalizedZone}`,
              serial: 1,
              refresh: defaultDnsRefreshSeconds,
              retry: defaultDnsRetrySeconds,
              expire: defaultDnsExpireSeconds,
              minimum: defaultDnsMinimumSeconds,
            },
          },
        ],
      };
    default:
      return {
        answers: [],
      };
  }
};

export const buildDnsInstanceAnswers = (
  question: DnsQuestion,
  config: DnsRuntimeConfig,
): {
  answers: Answer[];
} => {
  if (question.type !== "A") {
    return {
      answers: [],
    };
  }

  return {
    answers: [
      {
        type: "A" as const,
        name: normalizeDnsName(question.name),
        ttl: defaultDnsMinimumSeconds,
        data: config.publicIp,
      },
    ],
  };
};

export const buildDnsResponse = ({
  request,
  code,
  answers = [],
  authorities = [],
}: DnsResponseOptions): Packet => {
  const rdFlag = request.flags ?? 0;

  return {
    type: "response",
    id: request.id,
    flags:
      dnsPacket.AUTHORITATIVE_ANSWER |
      (rdFlag & dnsPacket.RECURSION_DESIRED) |
      code,
    questions: request.questions ?? [],
    answers,
    authorities,
    additionals: [],
  };
};

export const encodeUdpResponse = (response: Packet): Buffer => {
  return dnsPacket.encode(response);
};

export const encodeTcpResponse = (response: Packet): Buffer => {
  return dnsPacket.streamEncode(response);
};

export const decodeUdpQuery = (payload: Uint8Array): Packet => {
  return dnsPacket.decode(Buffer.from(payload));
};

export const decodeTcpQuery = (payload: Uint8Array): Packet => {
  return dnsPacket.streamDecode(Buffer.from(payload));
};

export const DNS_RCODE = DNS_RESPONSE_CODES;
