import { randomUUID } from "node:crypto";
import { request as httpRequest, type ClientRequest, type IncomingHttpHeaders, type OutgoingHttpHeaders } from "node:http";
import { request as httpsRequest } from "node:https";
import { JSDOM } from "jsdom";
import { expect, inject, it } from "vitest";

// Like trace.test.ts, run against a throwaway DATA_DIR: valid traces persist.
const baseUrl = inject("baseUrl");
const traceUrl = new URL("/trace", baseUrl);
const request = traceUrl.protocol === "https:" ? httpsRequest : httpRequest;
const FORM_TYPE = "application/x-www-form-urlencoded; charset=UTF-8";
const MAX_FORM_BYTES = 64 * 1024;
const UUID_COOKIE = /^visitor=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12};/i;

async function healthy(): Promise<void> {
  const response = await fetch(new URL("/", baseUrl));
  expect(response.status).toBe(200);
  await response.text();
}

function rawRequest(
  headers: OutgoingHttpHeaders,
  send: (req: ClientRequest) => void,
  options: { timeoutMs?: number; method?: string; path?: string } = {},
): Promise<{ status: number | undefined; headers: IncomingHttpHeaders; elapsed: number }> {
  const start = performance.now();
  const timeoutMs = options.timeoutMs ?? 4_000;
  return new Promise((resolve, reject) => {
    const req = request(traceUrl, {
      method: options.method ?? "POST",
      path: options.path ?? traceUrl.pathname,
      agent: false,
      headers: { "content-type": FORM_TYPE, ...headers },
    }, (response) => {
      response.resume();
      response.on("error", reject);
      response.on("end", () => {
        clearTimeout(timer);
        resolve({ status: response.statusCode, headers: response.headers, elapsed: performance.now() - start });
        req.destroy();
      });
    });
    const timer = setTimeout(() => req.destroy(new Error("The upload did not receive a response in time")), timeoutMs);
    req.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    req.on("close", () => clearTimeout(timer));
    try {
      send(req);
    } catch (error) {
      clearTimeout(timer);
      req.destroy();
      reject(error);
    }
  });
}

it.each(["visitor=%", "visitor=not-a-uuid"])("replaces an invalid visitor cookie %s without crashing", async (cookie) => {
  const response = await fetch(new URL("/", baseUrl), { headers: { cookie } });
  expect(response.status).toBe(200);
  expect(response.headers.get("set-cookie")).toMatch(UUID_COOKIE);
  await response.text();
  await healthy();
});

it("ignores malformed unrelated cookies and retains a valid visitor", async () => {
  const visitor = randomUUID();
  const response = await fetch(new URL("/", baseUrl), {
    headers: { cookie: `unrelated=%; visitor=${visitor}; another=%ZZ` },
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("set-cookie")).toBeNull();
  await response.text();
});

it("preserves the exact case of an existing uppercase UUID identity", async () => {
  const visitor = randomUUID().toUpperCase();
  const text = `spec-cookie-${randomUUID()}`;
  const response = await fetch(traceUrl, {
    method: "POST",
    headers: { cookie: `visitor=${visitor}` },
    body: new URLSearchParams({ kind: "dew", text }),
    redirect: "manual",
  });
  expect(response.status).toBe(303);
  expect(response.headers.get("set-cookie")).toBeNull();
  await response.text();

  for (const [cookieValue, isMine] of [[visitor, true], [visitor.toLowerCase(), false]] as const) {
    const page = await fetch(new URL("/", baseUrl), { headers: { cookie: `visitor=${cookieValue}` } });
    expect(page.status).toBe(200);
    expect(page.headers.get("set-cookie")).toBeNull();
    const dom = new JSDOM(await page.text());
    try {
      const trace = [...dom.window.document.querySelectorAll(".wall .trace")]
        .find((element) => element.querySelector(".text")?.textContent?.includes(text));
      expect(trace).toBeDefined();
      expect(trace?.classList.contains("mine")).toBe(isMine);
    } finally {
      dom.window.close();
    }
  }
});

it("rejects an oversized declared Content-Length before the client sends any body", async () => {
  const response = await rawRequest({ "content-length": MAX_FORM_BYTES + 1 }, (req) => req.flushHeaders());
  expect(response.status).toBe(413);
  expect(response.headers.connection).toBe("close");
  expect(response.elapsed).toBeLessThan(4_000);
  await healthy();
});

it("bounds chunked uploads even without a Content-Length header", async () => {
  const response = await rawRequest({ "transfer-encoding": "chunked" }, (req) => {
    req.write("a".repeat(MAX_FORM_BYTES / 2));
    req.write("b".repeat(MAX_FORM_BYTES / 2));
    req.end("c");
  });
  expect(response.status).toBe(413);
  expect(response.headers.connection).toBe("close");
  await healthy();
});

it("rejects an unsupported JSON request body", async () => {
  const response = await rawRequest({ "content-type": "application/json" }, (req) => {
    req.end(JSON.stringify({ kind: "dew", text: "not a form" }));
  });
  expect(response.status).toBe(415);
  expect(response.headers.connection).toBe("close");
  await healthy();
});

it("remains healthy when a client disconnects midway through its request body", async () => {
  await new Promise<void>((resolve, reject) => {
    let intentionallyAborted = false;
    const req = request(traceUrl, {
      method: "POST",
      agent: false,
      headers: { "content-type": FORM_TYPE, "content-length": 100, expect: "100-continue" },
    });
    const timer = setTimeout(() => req.destroy(new Error("The server did not accept the upload headers")), 4_000);
    req.once("continue", () => {
      req.write("kind=dew&text=partial", (error) => {
        if (error) {
          req.destroy(error);
          return;
        }
        intentionallyAborted = true;
        req.destroy();
      });
    });
    req.on("error", (error) => {
      if (!intentionallyAborted) reject(error);
    });
    req.once("close", () => {
      clearTimeout(timer);
      if (intentionallyAborted) resolve();
      else reject(new Error("The connection closed before the partial upload was sent"));
    });
    req.flushHeaders();
  });
  await healthy();
});

it("returns 408 after about ten seconds when an upload stalls, then serves another request", async () => {
  const response = await rawRequest({ "content-length": 100 }, (req) => {
    req.write("kind=dew&text=partial");
    // Deliberately leave the request open and await the server's error response.
  }, { timeoutMs: 17_000 });
  expect(response.status).toBe(408);
  expect(response.headers.connection).toBe("close");
  expect(response.elapsed).toBeGreaterThanOrEqual(9_000);
  expect(response.elapsed).toBeLessThan(17_000);
  await healthy();
}, 20_000);

it("serves the wall even when the Host header cannot form a URL", async () => {
  const response = await rawRequest({ host: "[" }, (req) => req.end(), { method: "GET", path: "/" });
  expect(response.status).toBe(200);
  await healthy();
});

it("returns 400 for a malformed absolute request target and remains healthy", async () => {
  const response = await rawRequest({}, (req) => req.end(), { method: "GET", path: "http://[" });
  expect(response.status).toBe(400);
  await healthy();
});

it("accepts and stores all 240 family emoji within the form byte limit", async () => {
  const text = "👨‍👩‍👧‍👦".repeat(240);
  const body = new URLSearchParams({ kind: "dew", text });
  expect(Buffer.byteLength(body.toString())).toBeGreaterThan(16 * 1024);
  expect(Buffer.byteLength(body.toString())).toBeLessThan(MAX_FORM_BYTES);
  const response = await fetch(traceUrl, { method: "POST", body, redirect: "manual" });
  expect(response.status).toBe(303);
  await response.text();
  const page = await fetch(new URL("/", baseUrl));
  expect(page.status).toBe(200);
  expect(await page.text()).toContain(text);
});
