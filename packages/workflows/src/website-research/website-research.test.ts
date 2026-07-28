import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { extractWebsiteHtml, selectPreferredWebsiteLinks } from "./extract";
import { loadLocalWebsiteResearchFixture } from "./fixture";
import { blockedAddressReason, validateWebsiteTarget, type ResolveHostname, type ValidatedTarget } from "./policy";
import { fetchWebsiteResearch, type WebsiteResearchDependencies } from "./index";
import { nodeHttpRequest, WebsiteResearchRequestError, type RawWebsiteRequest } from "./transport";

const publicAddress = { address: "93.184.216.34", family: 4 as const };
const fixedNow = () => new Date("2026-07-17T08:00:00.000Z");
const htmlHeaders = { "content-type": "text/html; charset=utf-8" };
const encode = (body: string) => new TextEncoder().encode(body);
const atlasHome = await readFile(new URL("./fixtures/atlas-industrial.html", import.meta.url), "utf8");
const atlasAbout = await readFile(new URL("./fixtures/atlas-about.html", import.meta.url), "utf8");

const publicResolver: ResolveHostname = async () => [publicAddress];
const htmlResponse = (body: string, status = 200) => ({ status, headers: htmlHeaders, body: encode(body) });
const dependencies = (request: RawWebsiteRequest, overrides: Partial<WebsiteResearchDependencies> = {}): WebsiteResearchDependencies => ({
  resolveHostname: publicResolver,
  request,
  now: fixedNow,
  ...overrides,
});

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(async (server) => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }));
});

describe("local website fixture", () => {
  it("renders the selected synthetic account identity into every fixture page", async () => {
    const result = await loadLocalWebsiteResearchFixture("acct-1", "https://rheinwerk-demo.example", fixedNow(), { accountName: "Rheinwerk Automation GmbH" });
    const content = result.pages.map((page) => `${page.title}\n${page.text}`).join("\n");
    expect(content).toContain("Rheinwerk Automation GmbH");
    expect(content).not.toContain("Atlas Industrial Systems");
  });
});

describe("website target policy", () => {
  it.each([
    ["file:///etc/passwd", "UNSUPPORTED_PROTOCOL"],
    ["ftp://example.test/file", "UNSUPPORTED_PROTOCOL"],
    ["data:text/html,hello", "UNSUPPORTED_PROTOCOL"],
    ["http://user:secret@example.test", "CREDENTIALS_NOT_ALLOWED"],
    ["http://localhost", "BLOCKED_HOSTNAME"],
    ["http://api.localhost", "BLOCKED_HOSTNAME"],
    ["not a url", "INVALID_URL"],
  ])("rejects %s", async (url, code) => {
    const result = await validateWebsiteTarget(url, publicResolver);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(code);
  });

  it.each([
    "http://127.0.0.1",
    "http://2130706433",
    "http://0x7f000001",
    "http://0177.0.0.1",
    "http://127.1",
    "http://10.2.3.4",
    "http://172.31.0.1",
    "http://192.168.1.1",
    "http://169.254.169.254/latest/meta-data",
    "http://224.0.0.1",
    "http://[::1]",
    "http://[fc00::1]",
    "http://[fe80::1]",
    "http://[ff02::1]",
    "http://[::ffff:8.8.8.8]",
    "http://[::ffff:127.0.0.1]",
    "http://[64:ff9b:1::808:808]",
    "http://[fec0::1]",
  ])("rejects prohibited or mapped address %s", async (url) => {
    const result = await validateWebsiteTarget(url, publicResolver);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("BLOCKED_ADDRESS");
  });

  it("rejects a DNS answer set when any answer is private", async () => {
    const result = await validateWebsiteTarget("https://mixed.example", async () => [
      publicAddress,
      { address: "10.0.0.5", family: 4 },
    ]);
    expect(result).toMatchObject({ ok: false, error: { code: "BLOCKED_ADDRESS" } });
  });

  it("allows synthetic benchmark DNS only through the explicit local proxy option", async () => {
    const resolver = async () => [{ address: "198.18.25.141", family: 4 as const }];
    await expect(validateWebsiteTarget("https://public.example", resolver)).resolves.toMatchObject({ ok: false, error: { code: "BLOCKED_ADDRESS" } });
    await expect(validateWebsiteTarget("https://public.example", resolver, { allowBenchmarkDns: true })).resolves.toMatchObject({ ok: true });
    await expect(validateWebsiteTarget("https://198.18.25.141", resolver, { allowBenchmarkDns: true })).resolves.toMatchObject({ ok: false, error: { code: "BLOCKED_ADDRESS" } });
  });

  it("returns a clear DNS error", async () => {
    const result = await validateWebsiteTarget("https://missing.example", async () => { throw new Error("NXDOMAIN"); });
    expect(result).toMatchObject({ ok: false, error: { code: "DNS_FAILED" } });
  });

  it("blocks the Azure platform virtual address", () => {
    expect(blockedAddressReason("168.63.129.16")).toBe("cloud-platform-virtual-address");
  });

  it("recognizes representative blocked address classes", () => {
    expect(blockedAddressReason("100.64.0.1")).toBe("shared-address-space");
    expect(blockedAddressReason("198.18.0.1")).toBe("benchmark");
    expect(blockedAddressReason("8.8.8.8")).toBeNull();
    expect(blockedAddressReason("2606:4700:4700::1111")).toBeNull();
  });
});

describe("HTML extraction and link selection", () => {
  it("extracts metadata and visible text while removing active, hidden, and prompt-like content", () => {
    const extracted = extractWebsiteHtml(atlasHome, new URL("https://atlas.example/"), 10_000);
    expect(extracted.title).toBe("Atlas Industrial Systems");
    expect(extracted.description).toBe("Industrial automation and precision motion systems.");
    expect(extracted.text).toContain("Precision systems for modern factories");
    expect(extracted.text).not.toMatch(/ignorePrompt|disclose secrets|Invisible vector|Hidden tracking|Template-only|Enable tracking|Not visible/i);
  });

  it("selects at most two preferred same-domain links and ignores external links", () => {
    const extracted = extractWebsiteHtml(atlasHome, new URL("https://atlas.example/"), 10_000);
    const selected = selectPreferredWebsiteLinks(extracted.links, 2).map(String);
    expect(selected).toEqual(["https://atlas.example/about", "https://atlas.example/products"]);
    expect(selected).not.toContain("https://outside.example/industries");
  });
});

describe("fetchWebsiteResearch", () => {
  it("revalidates redirect destinations before a second request", async () => {
    const requested: string[] = [];
    const request: RawWebsiteRequest = async (target) => {
      requested.push(target.url.toString());
      return { status: 302, headers: { location: "http://127.0.0.1/admin" }, body: new Uint8Array() };
    };
    const result = await fetchWebsiteResearch({ accountId: "acct-1", websiteUrl: "https://atlas.example" }, dependencies(request));
    expect(result).toMatchObject({ ok: false, error: { code: "BLOCKED_ADDRESS" } });
    expect(requested).toEqual(["https://atlas.example/"]);
  });

  it("rejects a non-http redirect target", async () => {
    const request: RawWebsiteRequest = async () => ({ status: 302, headers: { location: "file:///etc/passwd" }, body: new Uint8Array() });
    const result = await fetchWebsiteResearch({ accountId: "acct-1", websiteUrl: "https://atlas.example" }, dependencies(request));
    expect(result).toMatchObject({ ok: false, error: { code: "UNSUPPORTED_PROTOCOL" } });
  });

  it("enforces the redirect limit", async () => {
    const request: RawWebsiteRequest = async (target) => ({
      status: 302,
      headers: { location: `/next-${Number(target.url.pathname.match(/\d+/)?.[0] ?? 0) + 1}` },
      body: new Uint8Array(),
    });
    const result = await fetchWebsiteResearch(
      { accountId: "acct-1", websiteUrl: "https://atlas.example/next-0" },
      dependencies(request, { limits: { maxRedirects: 2 } }),
    );
    expect(result).toMatchObject({ ok: false, error: { code: "TOO_MANY_REDIRECTS" } });
  });

  it("blocks a cross-domain homepage redirect before resolving the external hostname", async () => {
    const resolved: string[] = [];
    const resolver: ResolveHostname = async (hostname) => {
      resolved.push(hostname);
      return [publicAddress];
    };
    const request: RawWebsiteRequest = async () => ({ status: 302, headers: { location: "https://external.example/landing" }, body: new Uint8Array() });
    const result = await fetchWebsiteResearch(
      { accountId: "acct-1", websiteUrl: "https://atlas.example" },
      dependencies(request, { resolveHostname: resolver }),
    );
    expect(result).toMatchObject({ ok: false, error: { code: "EXTERNAL_REDIRECT" } });
    expect(resolved).toEqual(["atlas.example"]);
  });

  it("fetches the homepage and two preferred pages without contacting external links", async () => {
    const requested: string[] = [];
    const pages = new Map([
      ["https://atlas.example/", atlasHome],
      ["https://atlas.example/about", atlasAbout],
      ["https://atlas.example/products", "<html><head><title>Products</title></head><body>Servo drives and controls.</body></html>"],
    ]);
    const request: RawWebsiteRequest = async (target) => {
      requested.push(target.url.toString());
      const page = pages.get(target.url.toString());
      if (!page) throw new Error("Unexpected request");
      return htmlResponse(page);
    };
    const result = await fetchWebsiteResearch({ accountId: "acct-1", websiteUrl: "https://atlas.example" }, dependencies(request));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.finalUrl).toBe("https://atlas.example/");
      expect(result.data.fetchedAt).toBe("2026-07-17T08:00:00.000Z");
      expect(result.data.pages).toHaveLength(3);
      expect(result.data.pages.every((page) => page.contentTrust === "untrusted")).toBe(true);
    }
    expect(requested).toEqual([...pages.keys()]);
  });

  it("uses contact focus to follow a nested leadership page", async () => {
    const requested: string[] = [];
    const pages = new Map([
      ["https://atlas.example/", '<html><body><a href="/products">Products</a><a href="/about">About company</a></body></html>'],
      ["https://atlas.example/about", '<html><body><a href="/about/leadership">Leadership team</a></body></html>'],
      ["https://atlas.example/about/leadership", "<html><body>Alex Morgan leads quality engineering.</body></html>"],
    ]);
    const request: RawWebsiteRequest = async (target) => {
      requested.push(target.url.toString());
      const page = pages.get(target.url.toString());
      if (!page) throw new Error("Unexpected request");
      return htmlResponse(page);
    };
    const result = await fetchWebsiteResearch({ accountId: "acct-1", websiteUrl: "https://atlas.example", focus: "CONTACTS" }, dependencies(request));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.pages.at(-1)?.text).toContain("Alex Morgan");
    expect(requested).toEqual([...pages.keys()]);
  });

  it("does not allow a secondary page redirect to another public domain", async () => {
    const request: RawWebsiteRequest = async (target) => {
      if (target.url.pathname === "/") return htmlResponse('<html><body><a href="/about">About company</a></body></html>');
      return { status: 302, headers: { location: "https://other.example/about" }, body: new Uint8Array() };
    };
    const result = await fetchWebsiteResearch({ accountId: "acct-1", websiteUrl: "https://atlas.example" }, dependencies(request));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.pages).toHaveLength(1);
  });

  it("reports non-HTML and HTTP failures clearly", async () => {
    const nonHtml: RawWebsiteRequest = async () => ({ status: 200, headers: { "content-type": "application/pdf" }, body: encode("pdf") });
    const nonHtmlResult = await fetchWebsiteResearch({ accountId: "acct-1", websiteUrl: "https://atlas.example" }, dependencies(nonHtml));
    expect(nonHtmlResult).toMatchObject({ ok: false, error: { code: "UNSUPPORTED_CONTENT_TYPE" } });

    const serverError: RawWebsiteRequest = async () => ({ status: 503, headers: htmlHeaders, body: encode("down") });
    const serverErrorResult = await fetchWebsiteResearch({ accountId: "acct-1", websiteUrl: "https://atlas.example" }, dependencies(serverError));
    expect(serverErrorResult).toMatchObject({ ok: false, error: { code: "HTTP_ERROR", status: 503 } });
  });

  it("preserves a streamed response-size error from the transport", async () => {
    const request: RawWebsiteRequest = async (target) => {
      throw new WebsiteResearchRequestError({ code: "RESPONSE_TOO_LARGE", message: "too large", url: target.url.toString() });
    };
    const result = await fetchWebsiteResearch({ accountId: "acct-1", websiteUrl: "https://atlas.example" }, dependencies(request));
    expect(result).toMatchObject({ ok: false, error: { code: "RESPONSE_TOO_LARGE" } });
  });

  it("enforces a whole-operation timeout with an injected transport", async () => {
    const request: RawWebsiteRequest = async (_target, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });
    const result = await fetchWebsiteResearch(
      { accountId: "acct-1", websiteUrl: "https://atlas.example" },
      dependencies(request, { limits: { totalTimeoutMs: 15 } }),
    );
    expect(result).toMatchObject({ ok: false, error: { code: "TIMEOUT" } });
  });

  it("caps total retained text across pages", async () => {
    const request: RawWebsiteRequest = async (target) => target.url.pathname === "/"
      ? htmlResponse('<html><body>1234567890<a href="/about">About company</a></body></html>')
      : htmlResponse("<html><body>abcdefghij</body></html>");
    const result = await fetchWebsiteResearch(
      { accountId: "acct-1", websiteUrl: "https://atlas.example" },
      dependencies(request, { limits: { maxTotalTextLength: 12 } }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.pages.reduce((sum, page) => sum + page.text.length, 0)).toBe(12);
  });
});

async function listen(server: Server): Promise<number> {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Local test server did not bind");
  return address.port;
}

const localTarget = (port: number): ValidatedTarget => ({
  url: new URL(`http://research.test:${port}/`),
  hostname: "research.test",
  addresses: [{ address: "127.0.0.1", family: 4 }],
});

describe("pinned Node transport", () => {
  it("connects to the pinned address while preserving the original Host header and enforces the streaming size cap", async () => {
    let observedHost: string | undefined;
    const server = createServer((request, response) => {
      observedHost = request.headers.host;
      response.writeHead(200, { "content-type": "text/html" });
      response.write("x".repeat(700));
      response.end("y".repeat(700));
    });
    const port = await listen(server);
    const controller = new AbortController();
    await expect(nodeHttpRequest(localTarget(port), {
      signal: controller.signal,
      connectTimeoutMs: 500,
      deadline: Date.now() + 1_000,
      maxResponseBytes: 1_000,
    })).rejects.toMatchObject({ detail: { code: "RESPONSE_TOO_LARGE" } });
    expect(observedHost).toBe(`research.test:${port}`);
  });

  it("returns a timeout when response headers never arrive", async () => {
    const server = createServer(() => { /* Intentionally leave the response open. */ });
    const port = await listen(server);
    const outcome = nodeHttpRequest(localTarget(port), {
      signal: new AbortController().signal,
      connectTimeoutMs: 500,
      deadline: Date.now() + 30,
      maxResponseBytes: 1_000,
    });
    await expect(outcome).rejects.toBeInstanceOf(WebsiteResearchRequestError);
    await expect(outcome).rejects.toMatchObject({ detail: { code: "TIMEOUT" } });
  });
});
