export {
  createDnsServer,
  handleDnsRequest,
  type RunningDnsServer,
} from "./server";
export {
  buildDnsResponse,
  buildDnsZoneAnswers,
  DNS_RCODE,
  formatDnsLogSummary,
  normalizeDnsName,
  parseInstanceIdFromDnsName,
} from "./utils";
