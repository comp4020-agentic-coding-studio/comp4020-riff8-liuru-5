import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { marked } from "marked";
import { addTrace, isKind, recentTraces } from "./db.ts";
import { renderReadme, renderWall } from "./templates.ts";
import { characterCount, MAX_TRACE_LENGTH } from "./validation.ts";
import { readFormBody, readVisitorCookie, RequestBodyError } from "./request.ts";

const PORT = Number(process.env.PORT ?? 8080);
const VISITOR_COOKIE = "visitor";
const FIVE_YEARS = 60 * 60 * 24 * 365 * 5;

function visitorCookie(id: string): string {
  // Persistent identity, not a login: this is what lets a returning stranger
  // find their own trace again without an account.
  return `${VISITOR_COOKIE}=${id}; Max-Age=${FIVE_YEARS}; Path=/; HttpOnly; SameSite=Lax`;
}

const server = createServer(async (req, res) => {
  try {
    let url: URL;
    try {
      // Routing needs only the path; do not trust Host as a URL parsing base.
      url = new URL(req.url ?? "/", "http://localhost");
    } catch {
      res.writeHead(400, { "content-type": "text/plain; charset=utf-8", connection: "close" });
      res.end("invalid request URL");
      return;
    }
    const existingVisitor = readVisitorCookie(req.headers.cookie);
    const visitorId = existingVisitor ?? randomUUID();
    const setCookie = existingVisitor ? undefined : visitorCookie(visitorId);
    // The wall contains a browser-specific 'yours' marker and may include drafts.
    res.setHeader("cache-control", "no-store");

    if (url.pathname === "/" && req.method === "GET") {
      const html = renderWall(recentTraces(), visitorId, { posted: url.searchParams.get("posted") === "1" });
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        ...(setCookie ? { "set-cookie": setCookie } : {}),
      });
      res.end(html);
      return;
    }

    if (url.pathname === "/trace" && req.method === "POST") {
      const raw = await readFormBody(req);
      const params = new URLSearchParams(raw);
      const kind = params.get("kind") ?? "";
      const draft = params.get("text") ?? "";
      const text = draft.trim();
      const length = characterCount(text);
      const error = !isKind(kind)
        ? "Please choose one of the six kinds. Your draft is still here."
        : length === 0
          ? "Please leave a thought before letting it go."
          : length > MAX_TRACE_LENGTH
            ? `Please keep your thought to ${MAX_TRACE_LENGTH} characters. Your draft is still here.`
            : undefined;
      if (error || !isKind(kind)) {
        res.writeHead(422, {
          "content-type": "text/html; charset=utf-8",
          ...(setCookie ? { "set-cookie": setCookie } : {}),
        });
        res.end(renderWall(recentTraces(), visitorId, {
          text: draft, kind, error, errorField: !isKind(kind) ? "kind" : "text",
        }));
        return;
      }
      addTrace(visitorId, kind, text);
      res.writeHead(303, {
        location: "/?posted=1",
        ...(setCookie ? { "set-cookie": setCookie } : {}),
      });
      res.end();
      return;
    }

    if (url.pathname === "/readme/" && req.method === "GET") {
      const md = readFileSync("README.md", "utf8");
      const html = renderReadme(await marked.parse(md));
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("not found");
  } catch (err) {
    if (res.destroyed || res.writableEnded) return;
    if (res.headersSent) { res.destroy(); return; }
    if (err instanceof RequestBodyError) {
      // Close only after the error is sent; the body reader has stopped buffering.
      res.writeHead(err.status, {
        "content-type": "text/plain; charset=utf-8",
        connection: "close",
      });
      res.end(err.message);
    } else {
      console.error(err);
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8", connection: "close" });
      res.end("internal error");
    }
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`listening on ${PORT}`);
});
