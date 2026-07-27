import type { IncomingHttpHeaders } from "node:http";
import { isIP } from "node:net";
import { extractWebsiteHtml, selectPreferredWebsiteLinks } from "./extract";
import { isSameWebsiteDomain, systemResolveHostname, validateWebsiteTarget, type ResolveHostname } from "./policy";
import {
  WebsiteResearchRequestError,
  nodeHttpRequest,
  type RawWebsiteRequest,
  type RawWebsiteResponse,
} from "./transport";
import {
  websiteResearchInputSchema,
  type WebsiteResearchError,
  type WebsiteResearchInput,
  type WebsiteResearchOutput,
  type WebsiteResearchPage,
} from "./schemas";

export * from "./schemas";

export type WebsiteResearchLimits = {
  connectTimeoutMs: number;
  totalTimeoutMs: number;
  maxRedirects: number;
  maxPages: number;
  maxResponseBytes: number;
  maxPageTextLength: number;
  maxTotalTextLength: number;
};

export type WebsiteResearchDependencies = {
  resolveHostname?: ResolveHostname;
  request?: RawWebsiteRequest;
  now?: () => Date;
  limits?: Partial<WebsiteResearchLimits>;
  allowBenchmarkDns?: boolean;
};

export const defaultWebsiteResearchLimits: Readonly<WebsiteResearchLimits> = Object.freeze({
  connectTimeoutMs: 5_000,
  totalTimeoutMs: 15_000,
  maxRedirects: 5,
  maxPages: 3,
  maxResponseBytes: 1_000_000,
  maxPageTextLength: 20_000,
  maxTotalTextLength: 50_000,
});

type PageFetch = { page: WebsiteResearchPage; links: ReturnType<typeof extractWebsiteHtml>["links"] };

const failure = (error: WebsiteResearchError): WebsiteResearchOutput => ({ ok: false, error });
const header = (headers: IncomingHttpHeaders, name: string): string | undefined => {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
};
const isRedirect = (status: number) => [301, 302, 303, 307, 308].includes(status);

function waitForAbort(signal: AbortSignal, url: string): Promise<never> {
  return new Promise((_, reject) => {
    const rejectTimeout = () => reject(new WebsiteResearchRequestError({ code: "TIMEOUT", message: "Website research timed out", url }));
    if (signal.aborted) rejectTimeout();
    else signal.addEventListener("abort", rejectTimeout, { once: true });
  });
}

function normalizeLimits(overrides: Partial<WebsiteResearchLimits> | undefined): WebsiteResearchLimits {
  const merged = { ...defaultWebsiteResearchLimits, ...overrides };
  return {
    connectTimeoutMs: Math.max(1, Math.min(30_000, Math.floor(merged.connectTimeoutMs))),
    totalTimeoutMs: Math.max(1, Math.min(120_000, Math.floor(merged.totalTimeoutMs))),
    maxRedirects: Math.max(0, Math.min(10, Math.floor(merged.maxRedirects))),
    maxPages: Math.max(1, Math.min(5, Math.floor(merged.maxPages))),
    maxResponseBytes: Math.max(1, Math.min(5_000_000, Math.floor(merged.maxResponseBytes))),
    maxPageTextLength: Math.max(1, Math.min(100_000, Math.floor(merged.maxPageTextLength))),
    maxTotalTextLength: Math.max(1, Math.min(200_000, Math.floor(merged.maxTotalTextLength))),
  };
}

function responseError(response: RawWebsiteResponse, url: string): WebsiteResearchError | null {
  if (response.status < 200 || response.status > 299) {
    return { code: "HTTP_ERROR", message: `Website returned HTTP ${response.status}`, url, status: response.status };
  }
  const contentType = header(response.headers, "content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "text/html" && contentType !== "application/xhtml+xml") {
    return { code: "UNSUPPORTED_CONTENT_TYPE", message: "Website response is not HTML", url, status: response.status };
  }
  return null;
}

async function fetchPage(
  initialUrl: string,
  allowedDomain: URL | undefined,
  dependencies: Required<Pick<WebsiteResearchDependencies, "resolveHostname" | "request" | "now" | "allowBenchmarkDns">>,
  limits: WebsiteResearchLimits,
  signal: AbortSignal,
  deadline: number,
  focus: "COMPANY" | "CONTACTS",
): Promise<PageFetch | WebsiteResearchError> {
  let currentUrl = initialUrl;
  let redirectDomain = allowedDomain;
  for (let redirects = 0; ; redirects += 1) {
    if (signal.aborted || Date.now() >= deadline) return { code: "TIMEOUT", message: "Website research timed out", url: currentUrl };
    if (redirectDomain) {
      try {
        const parsedCurrent = new URL(currentUrl);
        const candidateHostname = parsedCurrent.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
        const mustRunAddressPolicyFirst = isIP(candidateHostname) !== 0 || candidateHostname === "localhost" || candidateHostname.endsWith(".localhost");
        if ((parsedCurrent.protocol === "http:" || parsedCurrent.protocol === "https:") && !mustRunAddressPolicyFirst && !isSameWebsiteDomain(redirectDomain, parsedCurrent)) {
          return { code: "EXTERNAL_REDIRECT", message: "A page redirected outside the website domain", url: currentUrl };
        }
      } catch {
        // The full URL policy below returns the precise malformed-URL error.
      }
    }
    let validation;
    try {
      validation = await Promise.race([
        validateWebsiteTarget(currentUrl, dependencies.resolveHostname, { allowBenchmarkDns: dependencies.allowBenchmarkDns }),
        waitForAbort(signal, currentUrl),
      ]);
    } catch (cause) {
      if (cause instanceof WebsiteResearchRequestError) return cause.detail;
      return { code: "FETCH_FAILED", message: "Website target validation failed", url: currentUrl };
    }
    if (!validation.ok) return validation.error;
    if (allowedDomain && !isSameWebsiteDomain(allowedDomain, validation.target.url)) {
      return { code: "EXTERNAL_REDIRECT", message: "A secondary page redirected outside the website domain", url: currentUrl };
    }
    redirectDomain ??= validation.target.url;

    let response: RawWebsiteResponse;
    try {
      response = await dependencies.request(validation.target, {
        signal,
        connectTimeoutMs: limits.connectTimeoutMs,
        deadline,
        maxResponseBytes: limits.maxResponseBytes,
      });
    } catch (cause) {
      if (cause instanceof WebsiteResearchRequestError) return cause.detail;
      return signal.aborted
        ? { code: "TIMEOUT", message: "Website research timed out", url: currentUrl }
        : { code: "FETCH_FAILED", message: "Website request failed", url: currentUrl };
    }

    if (isRedirect(response.status)) {
      if (redirects >= limits.maxRedirects) {
        return { code: "TOO_MANY_REDIRECTS", message: "Website exceeded the redirect limit", url: currentUrl };
      }
      const location = header(response.headers, "location");
      if (!location) return { code: "HTTP_ERROR", message: "Redirect response did not include a Location header", url: currentUrl, status: response.status };
      try {
        currentUrl = new URL(location, validation.target.url).toString();
      } catch {
        return { code: "INVALID_URL", message: "Website returned an invalid redirect URL", url: currentUrl };
      }
      continue;
    }

    const badResponse = responseError(response, validation.target.url.toString());
    if (badResponse) return badResponse;
    const extracted = extractWebsiteHtml(new TextDecoder("utf-8", { fatal: false }).decode(response.body), validation.target.url, limits.maxPageTextLength, focus);
    const fetchedAt = dependencies.now().toISOString();
    return {
      page: {
        url: validation.target.url.toString(),
        title: extracted.title,
        description: extracted.description,
        text: extracted.text,
        fetchedAt,
        contentTrust: "untrusted",
      },
      links: extracted.links,
    };
  }
}

export async function fetchWebsiteResearch(
  input: WebsiteResearchInput,
  injected: WebsiteResearchDependencies = {},
): Promise<WebsiteResearchOutput> {
  const parsed = websiteResearchInputSchema.safeParse(input);
  if (!parsed.success) return failure({ code: "INVALID_INPUT", message: "Website research input is invalid" });
  const limits = normalizeLimits({
    ...injected.limits,
    maxPages: injected.limits?.maxPages ?? (parsed.data.focus === "CONTACTS" ? 5 : defaultWebsiteResearchLimits.maxPages),
    totalTimeoutMs: injected.limits?.totalTimeoutMs ?? (parsed.data.focus === "CONTACTS" ? 30_000 : defaultWebsiteResearchLimits.totalTimeoutMs),
  });
  const dependencies = {
    resolveHostname: injected.resolveHostname ?? systemResolveHostname,
    request: injected.request ?? nodeHttpRequest,
    now: injected.now ?? (() => new Date()),
    allowBenchmarkDns: injected.allowBenchmarkDns ?? process.env.WEBSITE_RESEARCH_ALLOW_BENCHMARK_DNS === "true",
  };
  const controller = new AbortController();
  const deadline = Date.now() + limits.totalTimeoutMs;
  const timeout = setTimeout(() => controller.abort(), limits.totalTimeoutMs);
  try {
    const homepage = await fetchPage(parsed.data.websiteUrl, undefined, dependencies, limits, controller.signal, deadline, parsed.data.focus);
    if (!("page" in homepage)) return failure(homepage);

    const pages = [homepage.page];
    const homepageUrl = new URL(homepage.page.url);
    const pending = [...homepage.links];
    const visited = new Set([homepage.page.url]);
    while (pages.length < limits.maxPages) {
      const candidate = selectPreferredWebsiteLinks(pending, pending.length).find((url) => !visited.has(url.toString()));
      if (!candidate) break;
      visited.add(candidate.toString());
      const page = await fetchPage(candidate.toString(), homepageUrl, dependencies, limits, controller.signal, deadline, parsed.data.focus);
      if (!("page" in page)) {
        if (page.code === "TIMEOUT") return failure(page);
        continue;
      }
      pages.push(page.page);
      pending.push(...page.links);
    }

    let remaining = limits.maxTotalTextLength;
    for (const page of pages) {
      page.text = page.text.slice(0, remaining);
      remaining -= page.text.length;
    }
    return {
      ok: true,
      data: {
        accountId: parsed.data.accountId,
        inputUrl: parsed.data.websiteUrl,
        finalUrl: homepage.page.url,
        fetchedAt: homepage.page.fetchedAt,
        pages,
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}
