import type { IncomingMessage } from "node:http";

// Enough for 240 URL-encoded joined emoji while bounding malicious uploads.
export const MAX_FORM_BYTES = 64 * 1024;
const BODY_TIMEOUT_MS = 10_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readVisitorCookie(header: string | undefined): string | undefined {
  for (const part of header?.split(";") ?? []) {
    const equals = part.indexOf("=");
    if (equals < 0 || part.slice(0, equals).trim() !== "visitor") continue;
    try {
      const value = decodeURIComponent(part.slice(equals + 1).trim());
      return UUID.test(value) ? value : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export class RequestBodyError extends Error {
  readonly status: 408 | 413 | 415;

  constructor(status: 408 | 413 | 415, message: string) {
    super(message);
    this.name = "RequestBodyError";
    this.status = status;
  }
}

// On rejection, respond with Connection: close so unread bytes cannot keep the
// connection alive. Do not destroy req before sending that error response.
export function readFormBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      clearTimeout(timer);
      req.removeListener("data", onData);
      req.removeListener("end", onEnd);
      req.removeListener("aborted", onAborted);
      req.removeListener("error", onError);
      req.removeListener("close", onClose);
    };
    const fail = (error: RequestBodyError, alreadyClosed = false) => {
      if (settled) return;
      settled = true;
      cleanup();
      chunks.length = 0;
      req.pause();
      // An aborted stream can emit error after aborted. Keep a passive handler
      // until close, even after the promise has rejected, then release it.
      if (!alreadyClosed) {
        const ignoreError = () => {};
        const release = () => req.removeListener("error", ignoreError);
        req.on("error", ignoreError);
        // closed can be true just before Node emits its final error/close.
        if (req.closed) setImmediate(release);
        else req.once("close", release);
      }
      reject(error);
    };
    const onData = (chunk: Buffer | string) => {
      if (settled) return;
      const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      bytes += buffer.length;
      if (bytes > MAX_FORM_BYTES) {
        fail(new RequestBodyError(413, "The form is too large. Please shorten it and try again."));
        return;
      }
      chunks.push(buffer);
    };
    const onEnd = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(Buffer.concat(chunks, bytes).toString("utf8"));
      chunks.length = 0;
    };
    const onAborted = () => fail(new RequestBodyError(408, "The request was interrupted. Please try again."));
    const onError = () => fail(new RequestBodyError(408, "The request could not be read. Please try again."));
    const onClose = () => {
      if (!req.complete) fail(new RequestBodyError(408, "The request was interrupted. Please try again."), true);
    };

    req.on("data", onData);
    req.once("end", onEnd);
    req.once("aborted", onAborted);
    req.once("error", onError);
    req.once("close", onClose);

    const mediaType = req.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase();
    if (mediaType !== "application/x-www-form-urlencoded") {
      fail(new RequestBodyError(415, "Please submit using the message form."));
      return;
    }
    const length = req.headers["content-length"];
    if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > MAX_FORM_BYTES)) {
      fail(new RequestBodyError(413, "The form is too large. Please shorten it and try again."));
      return;
    }
    if (req.aborted || req.destroyed) {
      onAborted();
      return;
    }
    timer = setTimeout(() => fail(new RequestBodyError(408, "The request timed out. Please try again.")), BODY_TIMEOUT_MS);
    timer.unref();
  });
}
