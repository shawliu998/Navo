import { request as requestHttp, type IncomingHttpHeaders } from "node:http";
import { request as requestHttps } from "node:https";
import type { LookupAddress, LookupOptions } from "node:dns";
import type { LookupFunction } from "node:net";
import type { WebsiteResearchError, WebsiteResearchErrorCode } from "./schemas";
import type { ValidatedTarget } from "./policy";

export type RawWebsiteResponse = {
  status: number;
  headers: IncomingHttpHeaders;
  body: Uint8Array;
};

export type RawWebsiteRequest = (target: ValidatedTarget, options: RawRequestOptions) => Promise<RawWebsiteResponse>;

export type RawRequestOptions = {
  signal: AbortSignal;
  connectTimeoutMs: number;
  deadline: number;
  maxResponseBytes: number;
};

export class WebsiteResearchRequestError extends Error {
  constructor(public readonly detail: WebsiteResearchError) {
    super(detail.message);
    this.name = "WebsiteResearchRequestError";
  }
}

const requestError = (code: WebsiteResearchErrorCode, message: string, url: string): WebsiteResearchRequestError =>
  new WebsiteResearchRequestError({ code, message, url });

const isRedirect = (status: number) => [301, 302, 303, 307, 308].includes(status);

export const nodeHttpRequest: RawWebsiteRequest = (target, options) => new Promise((resolve, reject) => {
  if (options.signal.aborted || Date.now() >= options.deadline) {
    reject(requestError("TIMEOUT", "Website research timed out", target.url.toString()));
    return;
  }

  const pinned = target.addresses[0];
  if (!pinned) {
    reject(requestError("DNS_FAILED", "No validated destination address is available", target.url.toString()));
    return;
  }

  let settled = false;
  let connected = false;
  let connectTimer: ReturnType<typeof setTimeout> | undefined;
  const finish = (action: () => void) => {
    if (settled) return;
    settled = true;
    if (connectTimer) clearTimeout(connectTimer);
    clearTimeout(deadlineTimer);
    options.signal.removeEventListener("abort", onAbort);
    action();
  };
  const lookup = ((_hostname: string, lookupOptions: LookupOptions, callback: unknown) => {
    if (lookupOptions.all) {
      (callback as (error: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void)(null, [pinned]);
    } else {
      (callback as (error: NodeJS.ErrnoException | null, address: string, family: number) => void)(null, pinned.address, pinned.family);
    }
  }) as LookupFunction;
  const requester = target.url.protocol === "https:" ? requestHttps : requestHttp;
  const request = requester(target.url, {
    method: "GET",
    agent: false,
    lookup,
    headers: {
      Accept: "text/html,application/xhtml+xml;q=0.9",
      "Accept-Encoding": "identity",
      "User-Agent": "NavoWebsiteResearch/0.1",
    },
  });
  const onAbort = () => {
    const failure = requestError("TIMEOUT", "Website research timed out", target.url.toString());
    finish(() => {
      request.destroy(failure);
      reject(failure);
    });
  };
  const deadlineTimer = setTimeout(onAbort, Math.max(1, options.deadline - Date.now()));
  options.signal.addEventListener("abort", onAbort, { once: true });

  request.once("socket", (socket) => {
    connectTimer = setTimeout(() => {
      if (!connected) onAbort();
    }, options.connectTimeoutMs);
    const markConnected = () => {
      connected = true;
      if (connectTimer) clearTimeout(connectTimer);
    };
    socket.once(target.url.protocol === "https:" ? "secureConnect" : "connect", markConnected);
  });

  request.once("response", (response) => {
    const status = response.statusCode ?? 0;
    if (isRedirect(status)) {
      response.destroy();
      finish(() => resolve({ status, headers: response.headers, body: new Uint8Array() }));
      return;
    }
    const contentLengthValue = Array.isArray(response.headers["content-length"])
      ? response.headers["content-length"][0]
      : response.headers["content-length"];
    const contentLength = contentLengthValue ? Number(contentLengthValue) : undefined;
    if (contentLength !== undefined && Number.isFinite(contentLength) && contentLength > options.maxResponseBytes) {
      const failure = requestError("RESPONSE_TOO_LARGE", "Website response exceeds the byte limit", target.url.toString());
      finish(() => {
        response.destroy(failure);
        reject(failure);
      });
      return;
    }

    const chunks: Uint8Array[] = [];
    let size = 0;
    response.on("data", (chunk: Buffer) => {
      size += chunk.byteLength;
      if (size > options.maxResponseBytes) {
        const failure = requestError("RESPONSE_TOO_LARGE", "Website response exceeds the byte limit", target.url.toString());
        finish(() => {
          response.destroy(failure);
          reject(failure);
        });
        return;
      }
      chunks.push(chunk);
    });
    response.once("end", () => finish(() => resolve({ status, headers: response.headers, body: Buffer.concat(chunks) })));
    response.once("error", (cause) => {
      if (settled) return;
      const failure = cause instanceof WebsiteResearchRequestError
        ? cause
        : requestError("FETCH_FAILED", "Failed while reading website response", target.url.toString());
      finish(() => reject(failure));
    });
  });

  request.once("error", (cause) => {
    if (settled) return;
    const failure = cause instanceof WebsiteResearchRequestError
      ? cause
      : requestError("FETCH_FAILED", "Website request failed", target.url.toString());
    finish(() => reject(failure));
  });
  request.end();
});
