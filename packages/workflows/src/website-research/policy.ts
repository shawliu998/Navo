import { lookup } from "node:dns/promises";
import { isIP, isIPv4, isIPv6 } from "node:net";
import type { WebsiteResearchError } from "./schemas";

export type ResolvedAddress = { address: string; family: 4 | 6 };
export type ResolveHostname = (hostname: string) => Promise<ResolvedAddress[]>;
export type ValidatedTarget = { url: URL; hostname: string; addresses: ResolvedAddress[] };

export type PolicyResult =
  | { ok: true; target: ValidatedTarget }
  | { ok: false; error: WebsiteResearchError };

const blockedMetadataHosts = new Set([
  "instance-data",
  "instance-data.ec2.internal",
  "metadata.aws.internal",
  "metadata.azure.internal",
  "metadata.google.internal",
]);

const ipv4Ranges: ReadonlyArray<readonly [number, number, string]> = [
  [0x00000000, 0xff000000, "this-network"],
  [0x0a000000, 0xff000000, "private"],
  [0x64400000, 0xffc00000, "shared-address-space"],
  [0x7f000000, 0xff000000, "loopback"],
  [0xa83f8110, 0xffffffff, "cloud-platform-virtual-address"],
  [0xa9fe0000, 0xffff0000, "link-local/cloud-metadata"],
  [0xac100000, 0xfff00000, "private"],
  [0xc0000000, 0xffffff00, "reserved"],
  [0xc0000200, 0xffffff00, "documentation"],
  [0xc0586300, 0xffffff00, "reserved"],
  [0xc0a80000, 0xffff0000, "private"],
  [0xc6120000, 0xfffe0000, "benchmark"],
  [0xc6336400, 0xffffff00, "documentation"],
  [0xcb007100, 0xffffff00, "documentation"],
  [0xe0000000, 0xf0000000, "multicast"],
  [0xf0000000, 0xf0000000, "reserved"],
];

const error = (code: WebsiteResearchError["code"], message: string, url?: string): PolicyResult => ({
  ok: false,
  error: { code, message, ...(url ? { url } : {}) },
});

function ipv4Number(address: string): number {
  return address.split(".").reduce((value, octet) => ((value << 8) | Number(octet)) >>> 0, 0);
}

function expandIPv6(address: string): number[] | null {
  if (!isIPv6(address) || address.includes("%")) return null;
  let input = address.toLowerCase();
  let ipv4Tail: number[] = [];
  const lastColon = input.lastIndexOf(":");
  const possibleIpv4 = input.slice(lastColon + 1);
  if (possibleIpv4.includes(".")) {
    if (!isIPv4(possibleIpv4)) return null;
    const value = ipv4Number(possibleIpv4);
    ipv4Tail = [(value >>> 16) & 0xffff, value & 0xffff];
    input = input.slice(0, lastColon);
  }

  const halves = input.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const explicitCount = left.length + right.length + ipv4Tail.length;
  if ((halves.length === 1 && explicitCount !== 8) || (halves.length === 2 && explicitCount > 7)) return null;
  const parseGroups = (groups: string[]) => groups.map((group) => Number.parseInt(group, 16));
  const expanded = [
    ...parseGroups(left),
    ...Array.from({ length: 8 - explicitCount }, () => 0),
    ...parseGroups(right),
    ...ipv4Tail,
  ];
  return expanded.length === 8 && expanded.every((group) => Number.isInteger(group) && group >= 0 && group <= 0xffff)
    ? expanded
    : null;
}

export function blockedAddressReason(address: string): string | null {
  if (isIPv4(address)) {
    const value = ipv4Number(address);
    for (const [base, mask, reason] of ipv4Ranges) {
      if (((value & mask) >>> 0) === (base >>> 0)) return reason;
    }
    return null;
  }
  if (!isIPv6(address)) return "invalid-address";
  const groups = expandIPv6(address);
  if (!groups) return "invalid-address";
  const [g0 = 0, g1 = 0, g2 = 0, g3 = 0, g4 = 0, g5 = 0, g6 = 0, g7 = 0] = groups;
  if (groups.every((group) => group === 0)) return "unspecified";
  if (groups.slice(0, 7).every((group) => group === 0) && g7 === 1) return "loopback";
  if ([g0, g1, g2, g3, g4].every((group) => group === 0) && g5 === 0xffff) return "ipv4-mapped-ipv6";
  if ([g0, g1, g2, g3].every((group) => group === 0) && g4 === 0xffff && g5 === 0) return "ipv4-translated-ipv6";
  if ([g0, g1, g2, g3, g4, g5].every((group) => group === 0)) return "ipv4-compatible-ipv6";
  if (g0 === 0x0064 && g1 === 0xff9b && [g2, g3, g4, g5].every((group) => group === 0)) return "nat64";
  if (g0 === 0x0064 && g1 === 0xff9b && g2 === 1) return "local-use-nat64";
  if (g0 === 0x0100 && [g1, g2, g3].every((group) => group === 0)) return "discard-only";
  if ((g0 & 0xfe00) === 0xfc00) return "private";
  if ((g0 & 0xffc0) === 0xfe80) return "link-local";
  if ((g0 & 0xffc0) === 0xfec0) return "deprecated-site-local";
  if ((g0 & 0xff00) === 0xff00) return "multicast";
  if (g0 === 0x2001 && g1 === 0x0000) return "teredo";
  if (g0 === 0x2001 && g1 === 0x0002) return "benchmark";
  if (g0 === 0x2001 && ((g1 & 0xfff0) === 0x0010 || (g1 & 0xfff0) === 0x0020)) return "orchid";
  if (g0 === 0x2001 && g1 === 0x0db8) return "documentation";
  if (g0 === 0x2002) return "6to4";
  if (g0 === 0xfd00 && g1 === 0x00ec && g7 === 0x0254) return "cloud-metadata";
  return null;
}

export const systemResolveHostname: ResolveHostname = async (hostname) => {
  const results = await lookup(hostname, { all: true, verbatim: true });
  return results.map(({ address, family }) => ({ address, family } as ResolvedAddress));
};

export async function validateWebsiteTarget(rawUrl: string, resolveHostname: ResolveHostname = systemResolveHostname): Promise<PolicyResult> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return error("INVALID_URL", "Website URL is malformed", rawUrl);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return error("UNSUPPORTED_PROTOCOL", "Only http: and https: URLs are allowed", rawUrl);
  }
  if (url.username || url.password) {
    return error("CREDENTIALS_NOT_ALLOWED", "URL credentials are not allowed", url.toString());
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (!hostname || hostname.includes("%")) return error("BLOCKED_HOSTNAME", "Hostname is not allowed", url.toString());
  if (hostname === "localhost" || hostname.endsWith(".localhost") || blockedMetadataHosts.has(hostname)) {
    return error("BLOCKED_HOSTNAME", "Localhost and metadata hostnames are not allowed", url.toString());
  }

  if (isIP(hostname)) {
    const reason = blockedAddressReason(hostname);
    if (reason) return error("BLOCKED_ADDRESS", `Destination address is not allowed (${reason})`, url.toString());
    return { ok: true, target: { url, hostname, addresses: [{ address: hostname, family: isIPv4(hostname) ? 4 : 6 }] } };
  }

  let addresses: ResolvedAddress[];
  try {
    addresses = await resolveHostname(hostname);
  } catch {
    return error("DNS_FAILED", `DNS resolution failed for ${hostname}`, url.toString());
  }
  const unique = [...new Map(addresses.map((entry) => [entry.address, entry])).values()];
  if (unique.length === 0 || unique.some((entry) => isIP(entry.address) === 0 || entry.family !== isIP(entry.address))) {
    return error("DNS_FAILED", `DNS resolution returned no valid addresses for ${hostname}`, url.toString());
  }
  for (const entry of unique) {
    const reason = blockedAddressReason(entry.address);
    if (reason) return error("BLOCKED_ADDRESS", `DNS resolved ${hostname} to a disallowed address (${reason})`, url.toString());
  }
  return { ok: true, target: { url, hostname, addresses: unique } };
}

const normalizedSiteHost = (url: URL) => url.hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");

export function isSameWebsiteDomain(base: URL, candidate: URL): boolean {
  if (!(["http:", "https:"] as string[]).includes(candidate.protocol) || candidate.username || candidate.password) return false;
  const baseHost = normalizedSiteHost(base);
  const candidateHost = normalizedSiteHost(candidate);
  if (isIP(baseHost) || isIP(candidateHost)) return baseHost === candidateHost;
  return baseHost === candidateHost;
}
